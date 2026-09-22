//! DJ 后端：本地记忆（dj_messages / dj_memory_facts）、LLM 配置（app_config）、
//! OpenAI 兼容 LLM 客户端、上下文组装与容错动作解析。
//! 纯逻辑（parse_actions / time_band / build_context）与 I/O 分离，便于单测。

use crate::AppState;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fmt;
use std::sync::OnceLock;
use tauri::State;

// ---------- 常量 ----------

/// 人格 prompt（plan Global Constraints 逐字，不得改动）。
pub const PERSONA_PROMPT: &str = "你是 Ome Radio 的私人电台 DJ——一位慵懒松弛、带港台腔的男播客主播，透着一点英伦绅士的调调。永远以简体中文口语短句为主，偶尔自然地夹一句英文（hey、alright、this one's for you 这类），像深夜播客里随手聊天：不刻意、不煽情、不堆形容词，不用表情符号。介绍歌曲不超过两句，常以一句轻松的英文点缀收尾。用户没说话时不要主动刷存在感。";

/// 输出格式约束（与人格一起构成 system prompt）。
const OUTPUT_FORMAT_PROMPT: &str = "输出格式（必须遵守）：只输出一个 JSON 对象，不要输出 JSON 以外的任何文字：{\"say\": string, \"actions\": [{\"type\": \"play|queue|search_and_play|mood|none\", \"query\": string 可选, \"mood\": string 可选}]}。";

const ACTION_TYPES: &[&str] = &["play", "queue", "search_and_play", "mood", "none"];

/// 进上下文的记忆条数上限。
const CONTEXT_FACT_LIMIT: usize = 8;
/// 进上下文的对话条数上限。
const CONTEXT_MESSAGE_LIMIT: i64 = 12;
const LLM_TIMEOUT_SECS: u64 = 20;
const LLM_TEMPERATURE: f64 = 0.8;
const LLM_MAX_TOKENS: u32 = 300;

pub fn system_prompt() -> String {
    format!("{PERSONA_PROMPT}\n{OUTPUT_FORMAT_PROMPT}")
}

// ---------- 数据结构 ----------

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DjAction {
    #[serde(rename = "type")]
    pub action_type: String,
    pub query: Option<String>,
    pub mood: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DjReply {
    pub say: String,
    pub actions: Vec<DjAction>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DjConfigDto {
    pub configured: bool,
    pub provider_name: String,
    pub base_url: String,
    pub model: String,
    pub masked_key: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DjSaveConfigPayload {
    pub provider_name: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GreetingDto {
    pub say: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IntroDto {
    pub say: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFactDto {
    pub id: String,
    pub kind: String,
    pub content: String,
    pub weight: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HourPreferenceDto {
    pub hour: i64,
    pub plays: i64,
    pub completions: i64,
    pub skips: i64,
}

#[derive(Debug, Clone, PartialEq)]
struct LlmConfig {
    provider_name: String,
    base_url: String,
    model: String,
    api_key: String,
}

/// 一条对话消息（内部表示，role: user/dj/system）。
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DjMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

/// build_context 的注入数据（全部由调用方查询，纯函数无 I/O）。
pub struct ContextInput {
    pub facts: Vec<MemoryFactDto>,
    pub recent: Vec<DjMessage>,
    pub hour_profile: Vec<HourPreferenceDto>,
    pub top_artists: Vec<String>,
    pub top_genres: Vec<String>,
}

// ---------- 纯逻辑：时段 / 动作解析 / 上下文 ----------

/// 时段词：5-11 清晨 / 11-14 午后 / 14-18 傍晚 / 18-23 夜晚 / 23-5 深夜（左闭右开）。
pub fn time_band(hour: u32) -> &'static str {
    match hour {
        5..=10 => "清晨",
        11..=13 => "午后",
        14..=17 => "傍晚",
        18..=22 => "夜晚",
        _ => "深夜",
    }
}

/// 容错动作解析：合法 JSON 且 say 为字符串 → 采用；actions 过滤到已知类型；
/// 其余情况（非法 JSON / 缺 say / 空串）→ 整段原文当作 say，动作清空，绝不报错。
pub fn parse_actions(raw: &str) -> DjReply {
    let Some(value) = parse_json_tolerant(raw) else {
        return DjReply {
            say: raw.to_string(),
            actions: Vec::new(),
        };
    };
    let Some(say) = value.get("say").and_then(Value::as_str) else {
        return DjReply {
            say: raw.to_string(),
            actions: Vec::new(),
        };
    };
    let actions = value
        .get("actions")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(parse_action).collect())
        .unwrap_or_default();
    DjReply {
        say: say.to_string(),
        actions,
    }
}

fn parse_action(item: &Value) -> Option<DjAction> {
    let object = item.as_object()?;
    let action_type = object.get("type").and_then(Value::as_str)?;
    if !ACTION_TYPES.contains(&action_type) {
        return None;
    }
    Some(DjAction {
        action_type: action_type.to_string(),
        query: object.get("query").and_then(Value::as_str).map(str::to_string),
        mood: object.get("mood").and_then(Value::as_str).map(str::to_string),
    })
}

/// LLM 偶尔会用 ```json 围栏包裹输出 → 先剥围栏再解析。
fn parse_json_tolerant(raw: &str) -> Option<Value> {
    let trimmed = raw.trim();
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return Some(value);
    }
    let unwrapped = trimmed
        .strip_prefix("```")
        .map(|rest| rest.strip_prefix("json").unwrap_or(rest).trim_start())
        .and_then(|rest| rest.strip_suffix("```"))
        .map(str::trim_end)?;
    serde_json::from_str::<Value>(unwrapped).ok()
}

/// 上下文组装（纯函数，数据全部注入）：时段 + 时段画像 + 口味 + 记忆前 8 + 最近 12 条对话。
pub fn build_context(hour: u32, input: &ContextInput) -> String {
    let band = time_band(hour);
    let mut plays = 0i64;
    let mut completions = 0i64;
    let mut skips = 0i64;
    for stat in &input.hour_profile {
        let stat_hour = stat.hour.clamp(0, 23) as u32;
        if time_band(stat_hour) == band {
            plays += stat.plays;
            completions += stat.completions;
            skips += stat.skips;
        }
    }
    let mut summary = format!("当前时段：{band}（{hour} 点）。");
    if plays + completions + skips > 0 {
        summary.push_str(&format!(
            "这个时段你通常播放 {plays} 次、完整听完 {completions} 次、跳过 {skips} 次。"
        ));
    }

    let mut lines = vec![summary];
    if !input.top_artists.is_empty() {
        lines.push(format!("最近常听艺人：{}。", input.top_artists.join("、")));
    }
    if !input.top_genres.is_empty() {
        lines.push(format!("最近常听风格：{}。", input.top_genres.join("、")));
    }

    let mut facts: Vec<&MemoryFactDto> = input.facts.iter().collect();
    facts.sort_by(|a, b| {
        b.weight
            .partial_cmp(&a.weight)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.updated_at.cmp(&a.updated_at))
    });
    facts.truncate(CONTEXT_FACT_LIMIT);
    if facts.is_empty() {
        lines.push("关于听众的长期记忆：暂无。".into());
    } else {
        lines.push("关于听众的长期记忆（重要在前）：".into());
        for fact in &facts {
            lines.push(format!("- [{}] {}（权重 {}）", fact.kind, fact.content, fact.weight));
        }
    }

    let recent: Vec<&DjMessage> = input
        .recent
        .iter()
        .rev()
        .take(CONTEXT_MESSAGE_LIMIT as usize)
        .rev()
        .collect();
    if recent.is_empty() {
        lines.push("近期对话：暂无。".into());
    } else {
        lines.push("近期对话（旧→新）：".into());
        for message in recent {
            let speaker = if message.role == "user" { "用户" } else { "DJ" };
            lines.push(format!("{speaker}：{}", message.content));
        }
    }
    lines.join("\n")
}

// ---------- 配置（app_config） ----------

fn config_get(conn: &Connection, key: &str) -> Result<Option<String>, rusqlite::Error> {
    conn.query_row(
        "SELECT value FROM app_config WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
}

fn load_llm_config(conn: &Connection) -> Result<LlmConfig, String> {
    let read = |key: &str| -> Result<String, String> {
        Ok(config_get(conn, key)
            .map_err(|error| error.to_string())?
            .unwrap_or_default())
    };
    Ok(LlmConfig {
        provider_name: read("provider_name")?,
        base_url: read("base_url")?,
        model: read("model")?,
        api_key: read("api_key")?,
    })
}

fn save_llm_config(conn: &Connection, payload: &DjSaveConfigPayload) -> Result<LlmConfig, String> {
    let mut next = LlmConfig {
        provider_name: payload.provider_name.trim().to_string(),
        base_url: payload.base_url.trim().to_string(),
        model: payload.model.trim().to_string(),
        api_key: payload.api_key.trim().to_string(),
    };
    // 空 apiKey 表示"不改密钥"（前端表单里只显示脱敏值）
    if next.api_key.is_empty() {
        next.api_key = config_get(conn, "api_key")
            .map_err(|error| error.to_string())?
            .unwrap_or_default();
    }
    for (key, value) in [
        ("provider_name", next.provider_name.as_str()),
        ("base_url", next.base_url.as_str()),
        ("model", next.model.as_str()),
        ("api_key", next.api_key.as_str()),
    ] {
        conn.execute(
            "INSERT INTO app_config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(next)
}

fn config_configured(config: &LlmConfig) -> bool {
    !config.base_url.is_empty() && !config.model.is_empty() && !config.api_key.is_empty()
}

/// "••••••" + 末 4 位；空 key 返回空串。
fn masked_key(api_key: &str) -> String {
    if api_key.is_empty() {
        return String::new();
    }
    let tail: String = api_key
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("••••••{tail}")
}

fn config_dto(config: &LlmConfig) -> DjConfigDto {
    DjConfigDto {
        configured: config_configured(config),
        provider_name: config.provider_name.clone(),
        base_url: config.base_url.clone(),
        model: config.model.clone(),
        masked_key: masked_key(&config.api_key),
    }
}

// ---------- 记忆（dj_messages / dj_memory_facts） ----------

fn new_id(seed: &str) -> String {
    let now = std::time::SystemTime::now();
    format!("{:x}", md5::compute(format!("{seed}{now:?}")))
}

pub fn append_message(conn: &Connection, role: &str, content: &str) -> Result<String, String> {
    let id = new_id(&format!("dj-message-{role}-{content}"));
    conn.execute(
        "INSERT INTO dj_messages (id, role, content) VALUES (?1, ?2, ?3)",
        params![id, role, content],
    )
    .map_err(|error| error.to_string())?;
    Ok(id)
}

/// 最近 limit 条对话，按旧→新排列（依赖 rowid 的插入序，秒级 created_at 无法区分同秒消息）。
pub fn recent_messages(conn: &Connection, limit: i64) -> Result<Vec<DjMessage>, String> {
    let mut stmt = conn
        .prepare("SELECT id, role, content, created_at FROM dj_messages ORDER BY rowid DESC LIMIT ?1")
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(DjMessage {
                id: row.get(0)?,
                role: row.get(1)?,
                content: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut messages: Vec<DjMessage> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    messages.reverse();
    Ok(messages)
}

/// 事实卡 upsert：同 content 合并 → weight+1，否则按权重 1.0 新建。
/// 写入入口由后续任务（对话摘要 / 喜好沉淀）接入，先随记忆层一并交付。
#[allow(dead_code)]
pub fn upsert_memory_fact(conn: &Connection, kind: &str, content: &str) -> Result<(), String> {
    let existing: Option<(String, f64)> = conn
        .query_row(
            "SELECT id, weight FROM dj_memory_facts WHERE content = ?1 LIMIT 1",
            params![content],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    match existing {
        Some((id, weight)) => {
            conn.execute(
                "UPDATE dj_memory_facts SET weight = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![id, weight + 1.0],
            )
            .map_err(|error| error.to_string())?;
        }
        None => {
            conn.execute(
                "INSERT INTO dj_memory_facts (id, kind, content, weight) VALUES (?1, ?2, ?3, 1.0)",
                params![new_id("dj-fact"), kind, content],
            )
            .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn list_memory_facts(conn: &Connection) -> Result<Vec<MemoryFactDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, kind, content, weight, updated_at
             FROM dj_memory_facts
             ORDER BY weight DESC, updated_at DESC, rowid DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MemoryFactDto {
                id: row.get(0)?,
                kind: row.get(1)?,
                content: row.get(2)?,
                weight: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

pub fn delete_memory_fact(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM dj_memory_facts WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

// ---------- 画像 ----------

/// 0..23 全量小时画像：playback_events JOIN tracks 后按本地小时聚合 play/completed/skip。
pub fn hour_preferences(conn: &Connection) -> Result<Vec<HourPreferenceDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT CAST(strftime('%H', pe.played_at, 'localtime') AS INTEGER) AS hour,
                    SUM(CASE WHEN pe.event_type = 'play' THEN 1 ELSE 0 END) AS plays,
                    SUM(CASE WHEN pe.event_type = 'completed' THEN 1 ELSE 0 END) AS completions,
                    SUM(CASE WHEN pe.event_type = 'skip' THEN 1 ELSE 0 END) AS skips
             FROM playback_events pe
             JOIN tracks t ON pe.track_id = t.id
             GROUP BY hour",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, Option<i64>>("hour")?,
                row.get::<_, i64>("plays")?,
                row.get::<_, i64>("completions")?,
                row.get::<_, i64>("skips")?,
            ))
        })
        .map_err(|error| error.to_string())?;
    let mut buckets = vec![[0i64; 3]; 24];
    for (hour, plays, completions, skips) in rows.filter_map(Result::ok) {
        let Some(hour) = hour else { continue };
        if !(0..24).contains(&hour) {
            continue;
        }
        buckets[hour as usize] = [plays, completions, skips];
    }
    Ok(buckets
        .iter()
        .enumerate()
        .map(|(hour, bucket)| HourPreferenceDto {
            hour: hour as i64,
            plays: bucket[0],
            completions: bucket[1],
            skips: bucket[2],
        })
        .collect())
}

// ---------- 上下文组装（I/O 胶水，测试只覆盖纯函数） ----------

fn current_local_hour(conn: &Connection) -> u32 {
    conn.query_row(
        "SELECT CAST(strftime('%H', 'now', 'localtime') AS INTEGER)",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map(|hour| hour.clamp(0, 23) as u32)
    .unwrap_or(0)
}

fn top_played_artists(conn: &Connection, limit: i64) -> Vec<String> {
    let Ok(mut stmt) = conn.prepare(
        "SELECT ar.name, COUNT(*) AS plays
         FROM playback_events pe
         JOIN tracks t ON pe.track_id = t.id
         JOIN artists ar ON t.artist_id = ar.id
         WHERE pe.event_type = 'play'
         GROUP BY ar.id
         ORDER BY plays DESC, ar.name
         LIMIT ?1",
    ) else {
        return Vec::new();
    };
    let Ok(rows) = stmt.query_map(params![limit], |row| row.get::<_, String>(0)) else {
        return Vec::new();
    };
    rows.filter_map(Result::ok).collect()
}

fn top_played_genres(conn: &Connection, limit: usize) -> Vec<String> {
    let Ok(mut stmt) = conn.prepare(
        "SELECT t.genres_json
         FROM playback_events pe
         JOIN tracks t ON pe.track_id = t.id
         WHERE pe.event_type = 'play'
         LIMIT 2000",
    ) else {
        return Vec::new();
    };
    let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) else {
        return Vec::new();
    };
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for genres_text in rows.filter_map(Result::ok) {
        let Ok(genres) = serde_json::from_str::<Vec<String>>(&genres_text) else {
            continue;
        };
        for genre in genres {
            *counts.entry(genre).or_insert(0) += 1;
        }
    }
    let mut genres: Vec<(String, usize)> = counts.into_iter().collect();
    genres.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    genres.truncate(limit);
    genres.into_iter().map(|(genre, _)| genre).collect()
}

fn gather_context(conn: &Connection) -> Result<(String, u32), String> {
    let hour = current_local_hour(conn);
    let input = ContextInput {
        facts: list_memory_facts(conn)?,
        recent: recent_messages(conn, CONTEXT_MESSAGE_LIMIT)?,
        hour_profile: hour_preferences(conn).unwrap_or_default(),
        top_artists: top_played_artists(conn, 5),
        top_genres: top_played_genres(conn, 5),
    };
    Ok((build_context(hour, &input), hour))
}

// ---------- LLM 客户端 ----------

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(LLM_TIMEOUT_SECS))
            .build()
            .expect("构建 HTTP 客户端失败")
    })
}

/// LLM 调用失败分类：决定是否值得重试（网络错误 / 5xx 重试，4xx 立即失败）。
#[derive(Debug, Clone, PartialEq)]
enum LlmFailure {
    /// 请求未送达、超时或响应读取失败（消息已含前缀，展示原样输出）
    Network(String),
    /// HTTP 非 2xx（状态码供重试判定）
    Status(u16, String),
    /// 2xx 但响应体不符合约定（重放同样请求结果大概率相同，不重试）
    Body(String),
}

impl fmt::Display for LlmFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LlmFailure::Network(message) => write!(f, "{message}"),
            LlmFailure::Status(status, detail) => write!(f, "LLM 返回 HTTP {status}：{detail}"),
            LlmFailure::Body(message) => write!(f, "{message}"),
        }
    }
}

impl LlmFailure {
    /// 只有网络错误与 5xx 值得重试一次；401/400 等 4xx 立即失败。
    fn retryable(&self) -> bool {
        match self {
            LlmFailure::Network(_) => true,
            LlmFailure::Status(status, _) => *status >= 500,
            LlmFailure::Body(_) => false,
        }
    }
}

async fn llm_chat_once(config: &LlmConfig, messages: &[Value]) -> Result<String, LlmFailure> {
    if config.base_url.is_empty() || config.model.is_empty() {
        return Err(LlmFailure::Body("LLM 未配置：缺少 base_url 或 model".into()));
    }
    let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    let body = json!({
        "model": config.model,
        "messages": messages,
        "temperature": LLM_TEMPERATURE,
        "max_tokens": LLM_MAX_TOKENS,
    });
    let response = http_client()
        .post(&url)
        .bearer_auth(&config.api_key)
        .json(&body)
        .send()
        .await
        .map_err(|error| LlmFailure::Network(format!("LLM 请求失败：{error}")))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| LlmFailure::Network(format!("LLM 响应读取失败：{error}")))?;
    if !status.is_success() {
        let preview: String = text.chars().take(200).collect();
        return Err(LlmFailure::Status(status.as_u16(), preview));
    }
    let value: Value = serde_json::from_str(&text)
        .map_err(|error| LlmFailure::Body(format!("LLM 响应不是合法 JSON：{error}")))?;
    value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| LlmFailure::Body("LLM 响应缺少 choices[0].message.content".into()))
}

/// 仅网络错误 / 5xx 重试一次；4xx（401 密钥错误、400 参数错误等）立即失败。
async fn llm_chat(config: &LlmConfig, messages: &[Value]) -> Result<String, String> {
    let first = match llm_chat_once(config, messages).await {
        Ok(content) => return Ok(content),
        Err(failure) => failure,
    };
    if !first.retryable() {
        return Err(first.to_string());
    }
    match llm_chat_once(config, messages).await {
        Ok(content) => Ok(content),
        Err(second) => Err(format!("{first}；重试仍失败：{second}")),
    }
}

fn chat_messages(context: &str, history: &[DjMessage], directive: Option<&str>) -> Vec<Value> {
    let mut messages = vec![
        json!({ "role": "system", "content": system_prompt() }),
        json!({ "role": "system", "content": format!("当前状态参考：\n{context}") }),
    ];
    for message in history {
        let role = match message.role.as_str() {
            "user" => "user",
            "dj" => "assistant",
            _ => "system",
        };
        messages.push(json!({ "role": role, "content": message.content }));
    }
    if let Some(directive) = directive {
        messages.push(json!({ "role": "user", "content": directive }));
    }
    messages
}

fn track_title_artist(
    conn: &Connection,
    track_id: &str,
) -> Result<Option<(String, String)>, String> {
    conn.query_row(
        "SELECT t.title, COALESCE(ar.name, '')
         FROM tracks t
         LEFT JOIN artists ar ON t.artist_id = ar.id
         WHERE t.id = ?1",
        params![track_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )
    .optional()
    .map_err(|error| error.to_string())
}

// ---------- invoke 命令 ----------

#[tauri::command]
pub fn dj_config(state: State<'_, AppState>) -> Result<DjConfigDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    load_llm_config(&conn).map(|config| config_dto(&config))
}

#[tauri::command]
pub fn dj_save_config(
    state: State<'_, AppState>,
    payload: DjSaveConfigPayload,
) -> Result<DjConfigDto, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    save_llm_config(&conn, &payload).map(|config| config_dto(&config))
}

#[tauri::command]
pub fn dj_memory_list(state: State<'_, AppState>) -> Result<Vec<MemoryFactDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    list_memory_facts(&conn)
}

#[tauri::command]
pub fn dj_memory_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    delete_memory_fact(&conn, &id)
}

#[tauri::command]
pub fn profile_hour_preferences(state: State<'_, AppState>) -> Result<Vec<HourPreferenceDto>, String> {
    let conn = state.db.lock().map_err(|error| error.to_string())?;
    hour_preferences(&conn)
}

#[tauri::command]
pub async fn dj_chat(state: State<'_, AppState>, text: String) -> Result<DjReply, String> {
    let user_text = text.trim().to_string();
    if user_text.is_empty() {
        return Err("消息内容不能为空".into());
    }
    let (config, context, history) = {
        let conn = state.db.lock().map_err(|error| error.to_string())?;
        append_message(&conn, "user", &user_text)?;
        let config = load_llm_config(&conn)?;
        let (context, _hour) = gather_context(&conn)?;
        let history = recent_messages(&conn, CONTEXT_MESSAGE_LIMIT)?;
        (config, context, history)
    };
    let offline = DjReply {
        say: String::new(),
        actions: Vec::new(),
    };
    if !config_configured(&config) {
        return Ok(offline);
    }
    let messages = chat_messages(&context, &history, None);
    let raw = match llm_chat(&config, &messages).await {
        Ok(raw) => raw,
        Err(_) => return Ok(offline),
    };
    let reply = parse_actions(&raw);
    if !reply.say.is_empty() {
        let conn = state.db.lock().map_err(|error| error.to_string())?;
        append_message(&conn, "dj", &reply.say)?;
    }
    Ok(reply)
}

#[tauri::command]
pub async fn dj_greeting(state: State<'_, AppState>) -> Result<GreetingDto, String> {
    let (config, context, band) = {
        let conn = state.db.lock().map_err(|error| error.to_string())?;
        let config = load_llm_config(&conn)?;
        let (context, hour) = gather_context(&conn)?;
        (config, context, time_band(hour))
    };
    if !config_configured(&config) {
        return Ok(GreetingDto { say: String::new() });
    }
    let directive = format!(
        "现在是{band}，电台刚开播。请给听众一句简短自然的开场问候，并在 actions 里选一个适合此刻氛围的 mood。"
    );
    let messages = chat_messages(&context, &[], Some(&directive));
    let raw = match llm_chat(&config, &messages).await {
        Ok(raw) => raw,
        Err(_) => return Ok(GreetingDto { say: String::new() }),
    };
    let reply = parse_actions(&raw);
    if !reply.say.is_empty() {
        let conn = state.db.lock().map_err(|error| error.to_string())?;
        append_message(&conn, "dj", &reply.say)?;
    }
    Ok(GreetingDto { say: reply.say })
}

#[tauri::command]
pub async fn dj_intro(
    state: State<'_, AppState>,
    track_id: String,
    event: Option<String>,
) -> Result<IntroDto, String> {
    let track_id = track_id.trim().to_string();
    if track_id.is_empty() {
        return Err("trackId 不能为空".into());
    }
    let (config, context, track_label) = {
        let conn = state.db.lock().map_err(|error| error.to_string())?;
        let config = load_llm_config(&conn)?;
        let (context, _hour) = gather_context(&conn)?;
        // 本地曲库按 id 命中；netease-{n} 多数不在 tracks 表中 → 接受缺失。
        let label = match track_title_artist(&conn, &track_id)? {
            Some((title, artist)) if artist.is_empty() => title,
            Some((title, artist)) => format!("{title} - {artist}"),
            None => format!("一首曲库里没有档案的歌（id: {track_id}）"),
        };
        (config, context, label)
    };
    if !config_configured(&config) {
        return Ok(IntroDto { say: String::new() });
    }
    // 事件语境：跳过 = 接住听众的口味变化；自然播完 = 顺势承接；开机 = 深夜开场
    let lead = match event.as_deref() {
        Some("skip") => "听众刚跳过了上一首，轻轻接住这个信号（可以带一点自嘲），然后自然地带出下一首：",
        Some("ended") => "上一首完整播完了，顺势承接情绪，然后带出下一首：",
        _ => "接下来要播放：",
    };
    let directive = format!(
        "{lead}{track_label}。请用不超过两句话把这首歌自然地带出来；actions 留空即可，不要再选歌。"
    );
    let messages = chat_messages(&context, &[], Some(&directive));
    let raw = match llm_chat(&config, &messages).await {
        Ok(raw) => raw,
        Err(_) => return Ok(IntroDto { say: String::new() }),
    };
    let reply = parse_actions(&raw);
    Ok(IntroDto { say: reply.say })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::run_migrations;

    fn memory_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    // ---------- 迁移 ----------

    #[test]
    fn migrations_004_create_dj_tables_and_are_idempotent() {
        let conn = memory_db();
        run_migrations(&conn).unwrap(); // 再次执行必须幂等
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'
                 AND name IN ('dj_messages','dj_memory_facts','app_config')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 3);
    }

    // ---------- 动作解析 ----------

    #[test]
    fn llm_failure_retry_policy() {
        // 网络错误 / 5xx 可重试；4xx 与响应体异常不重试
        assert!(LlmFailure::Network("LLM 请求失败：timeout".into()).retryable());
        assert!(LlmFailure::Status(500, "boom".into()).retryable());
        assert!(LlmFailure::Status(503, "unavailable".into()).retryable());
        assert!(!LlmFailure::Status(401, "unauthorized".into()).retryable());
        assert!(!LlmFailure::Status(400, "bad request".into()).retryable());
        assert!(!LlmFailure::Body("LLM 响应不是合法 JSON".into()).retryable());
        // 展示文本保持原有格式
        assert_eq!(
            LlmFailure::Status(401, "Unauthorized".into()).to_string(),
            "LLM 返回 HTTP 401：Unauthorized"
        );
    }

    #[test]
    fn parse_actions_parses_valid_full_reply() {
        let raw = r#"{"say":"晚上好。","actions":[{"type":"play","query":"周杰伦 晴天"},{"type":"mood","mood":"深夜"}]}"#;
        let reply = parse_actions(raw);
        assert_eq!(reply.say, "晚上好。");
        assert_eq!(reply.actions.len(), 2);
        assert_eq!(reply.actions[0].action_type, "play");
        assert_eq!(reply.actions[0].query.as_deref(), Some("周杰伦 晴天"));
        assert_eq!(reply.actions[0].mood, None);
        assert_eq!(reply.actions[1].action_type, "mood");
        assert_eq!(reply.actions[1].mood.as_deref(), Some("深夜"));
    }

    #[test]
    fn parse_actions_handles_missing_actions_field() {
        let reply = parse_actions(r#"{"say":"好。"}"#);
        assert_eq!(reply.say, "好。");
        assert!(reply.actions.is_empty());
    }

    #[test]
    fn parse_actions_filters_unknown_action_types() {
        let raw = r#"{"say":"x","actions":[
            {"type":"explode"},{"type":"play","query":"ok"},
            {"type":123},"oops",{"type":"queue"}]}"#;
        let reply = parse_actions(raw);
        assert_eq!(reply.say, "x");
        assert_eq!(reply.actions.len(), 2);
        assert_eq!(reply.actions[0].action_type, "play");
        assert_eq!(reply.actions[0].query.as_deref(), Some("ok"));
        assert_eq!(reply.actions[1].action_type, "queue");
        assert_eq!(reply.actions[1].query, None);
    }

    #[test]
    fn parse_actions_falls_back_to_say_only_on_invalid_json() {
        let raw = "今晚风很轻，来点慢歌。";
        let reply = parse_actions(raw);
        assert_eq!(reply.say, raw);
        assert!(reply.actions.is_empty());
        // JSON 合法但 say 不是字符串 → 同样按纯文本兜底
        let raw = r#"{"say": 123}"#;
        let reply = parse_actions(raw);
        assert_eq!(reply.say, raw);
        assert!(reply.actions.is_empty());
    }

    #[test]
    fn parse_actions_empty_string_yields_empty_reply() {
        let reply = parse_actions("");
        assert_eq!(reply.say, "");
        assert!(reply.actions.is_empty());
    }

    // ---------- 时段 ----------

    #[test]
    fn time_band_maps_day_boundaries() {
        let cases = [
            (4u32, "深夜"),
            (5, "清晨"),
            (10, "清晨"),
            (11, "午后"),
            (13, "午后"),
            (14, "傍晚"),
            (17, "傍晚"),
            (18, "夜晚"),
            (22, "夜晚"),
            (23, "深夜"),
            (0, "深夜"),
            (3, "深夜"),
        ];
        for (hour, band) in cases {
            assert_eq!(time_band(hour), band, "hour={hour}");
        }
    }

    // ---------- 配置 ----------

    #[test]
    fn config_roundtrip_masks_key_and_keeps_old_key_when_empty() {
        let conn = memory_db();
        // 未配置 → configured=false，key 为空
        let initial = load_llm_config(&conn).unwrap();
        assert!(!config_dto(&initial).configured);
        assert_eq!(config_dto(&initial).masked_key, "");

        let payload = DjSaveConfigPayload {
            provider_name: "deepseek".into(),
            base_url: "https://api.deepseek.com/v1".into(),
            model: "deepseek-chat".into(),
            api_key: "sk-abcd1234".into(),
        };
        let saved = save_llm_config(&conn, &payload).unwrap();
        let dto = config_dto(&saved);
        assert!(dto.configured);
        assert_eq!(dto.provider_name, "deepseek");
        assert_eq!(dto.base_url, "https://api.deepseek.com/v1");
        assert_eq!(dto.model, "deepseek-chat");
        assert_eq!(dto.masked_key, "••••••1234");

        // 空 apiKey → 保留旧 key
        let payload = DjSaveConfigPayload {
            provider_name: "deepseek".into(),
            base_url: "https://api.deepseek.com".into(),
            model: "deepseek-reasoner".into(),
            api_key: String::new(),
        };
        let saved = save_llm_config(&conn, &payload).unwrap();
        let dto = config_dto(&saved);
        assert!(dto.configured);
        assert_eq!(dto.base_url, "https://api.deepseek.com");
        assert_eq!(dto.model, "deepseek-reasoner");
        assert_eq!(dto.masked_key, "••••••1234");

        // 重新读取（模拟重启）也保持一致
        let reloaded = load_llm_config(&conn).unwrap();
        assert_eq!(config_dto(&reloaded), dto);
    }

    // ---------- 对话消息 ----------

    #[test]
    fn messages_append_and_recent_returns_last_n_in_order() {
        let conn = memory_db();
        let mut contents = Vec::new();
        for i in 0..15 {
            let role = if i % 2 == 0 { "user" } else { "dj" };
            let content = format!("消息-{i}");
            append_message(&conn, role, &content).unwrap();
            contents.push((role.to_string(), content));
        }
        let recent = recent_messages(&conn, 12).unwrap();
        assert_eq!(recent.len(), 12);
        // 只保留最后 12 条，且按旧→新排列
        for (index, message) in recent.iter().enumerate() {
            let (role, content) = &contents[index + 3];
            assert_eq!(message.content, *content);
            assert_eq!(message.role, *role);
            assert!(!message.created_at.is_empty());
        }
    }

    // ---------- 记忆事实 ----------

    #[test]
    fn facts_upsert_same_content_increments_weight() {
        let conn = memory_db();
        upsert_memory_fact(&conn, "pref", "喜欢深夜的民谣").unwrap();
        upsert_memory_fact(&conn, "pref", "喜欢深夜的民谣").unwrap();
        upsert_memory_fact(&conn, "habit", "睡前听").unwrap();
        let facts = list_memory_facts(&conn).unwrap();
        assert_eq!(facts.len(), 2);
        assert_eq!(facts[0].content, "喜欢深夜的民谣");
        assert!((facts[0].weight - 2.0).abs() < f64::EPSILON);
        assert_eq!(facts[1].content, "睡前听");
        assert!((facts[1].weight - 1.0).abs() < f64::EPSILON);

        delete_memory_fact(&conn, &facts[0].id).unwrap();
        assert_eq!(list_memory_facts(&conn).unwrap().len(), 1);
    }

    // ---------- 时段画像 ----------

    #[test]
    fn hour_profile_aggregates_playback_events_by_local_hour() {
        let conn = memory_db();
        conn.execute(
            "INSERT INTO tracks (id, title, file_path) VALUES ('t1', '夜曲', 'C:/music/yequ.flac')",
            [],
        )
        .unwrap();
        let events = [
            ("play", "2026-09-22 08:15:00"),
            ("play", "2026-09-22 08:40:00"),
            ("completed", "2026-09-22 08:50:00"),
            ("skip", "2026-09-22 23:30:00"),
        ];
        for (index, (event_type, played_at)) in events.iter().enumerate() {
            conn.execute(
                "INSERT INTO playback_events (id, track_id, event_type, played_at) VALUES (?1, 't1', ?2, ?3)",
                params![format!("e{index}"), event_type, played_at],
            )
            .unwrap();
        }
        // 期望小时用同一套 SQLite localtime 表达式计算，保证跨时区确定
        let local_hour = |timestamp: &str| -> i64 {
            conn.query_row(
                "SELECT CAST(strftime('%H', ?1, 'localtime') AS INTEGER)",
                params![timestamp],
                |row| row.get(0),
            )
            .unwrap()
        };
        let morning = local_hour("2026-09-22 08:15:00") as usize;
        let late_night = local_hour("2026-09-22 23:30:00") as usize;

        let profile = hour_preferences(&conn).unwrap();
        assert_eq!(profile.len(), 24);
        assert_eq!(profile[morning].hour, morning as i64);
        assert_eq!(profile[morning].plays, 2);
        assert_eq!(profile[morning].completions, 1);
        assert_eq!(profile[morning].skips, 0);
        assert_eq!(profile[late_night].skips, 1);
        assert_eq!(profile[late_night].plays, 0);
        let total_plays: i64 = profile.iter().map(|stat| stat.plays).sum();
        assert_eq!(total_plays, 2);
    }

    // ---------- 上下文组装 ----------

    #[test]
    fn build_context_uses_time_band_and_memory_budgets() {
        let conn = memory_db();
        for i in 1..=12 {
            conn.execute(
                "INSERT INTO dj_memory_facts (id, kind, content, weight) VALUES (?1, 'pref', ?2, ?3)",
                params![format!("f{i}"), format!("事实-{i}"), i as f64],
            )
            .unwrap();
        }
        let facts = list_memory_facts(&conn).unwrap();
        assert_eq!(facts.len(), 12);

        let mut recent = Vec::new();
        for i in 0..15 {
            recent.push(DjMessage {
                id: format!("m{i}"),
                role: "user".into(),
                content: format!("用户消息-{i}"),
                created_at: "2026-09-22 22:00:00".into(),
            });
        }

        let input = ContextInput {
            facts,
            recent,
            hour_profile: vec![HourPreferenceDto {
                hour: 22,
                plays: 7,
                completions: 5,
                skips: 1,
            }],
            top_artists: vec!["周杰伦".into(), "陈绮贞".into()],
            top_genres: vec!["民谣".into()],
        };

        let context = build_context(22, &input);
        assert!(context.contains("夜晚"), "应包含时段词：{context}");
        assert!(context.contains("周杰伦"));
        assert!(context.contains("民谣"));
        assert!(context.contains("事实-12")); // 权重最高的记忆
        assert!(context.contains("用户消息-14")); // 最近一条对话
        assert!(context.contains("用户消息-3")); // 12 条窗口内最早一条
        assert!(!context.contains("用户消息-2")); // 窗口外的被裁掉
        assert!(!context.contains("事实-4")); // 只保留权重前 8
        assert!(context.contains("播放 7 次"));

        // 其余时段词映射
        for (hour, band) in [(8u32, "清晨"), (3, "深夜")] {
            let context = build_context(hour, &ContextInput {
                facts: Vec::new(),
                recent: Vec::new(),
                hour_profile: Vec::new(),
                top_artists: Vec::new(),
                top_genres: Vec::new(),
            });
            assert!(context.contains(band), "hour={hour} 应为 {band}");
        }
    }

    // ---------- 真实 LLM（手动运行：cargo test -- --ignored） ----------

    #[test]
    #[ignore = "需要真实 OpenAI 兼容端点：OME_TEST_LLM_BASE_URL / OME_TEST_LLM_API_KEY / OME_TEST_LLM_MODEL"]
    fn llm_chat_once_returns_content_when_configured() {
        let base_url = std::env::var("OME_TEST_LLM_BASE_URL").unwrap_or_default();
        if base_url.is_empty() {
            return; // 未提供环境变量时静默跳过
        }
        let config = LlmConfig {
            provider_name: "test".into(),
            base_url,
            model: std::env::var("OME_TEST_LLM_MODEL").unwrap_or_default(),
            api_key: std::env::var("OME_TEST_LLM_API_KEY").unwrap_or_default(),
        };
        let messages = vec![json!({
            "role": "user",
            "content": r#"只输出 JSON：{"say":"你好","actions":[]}"#
        })];
        let raw = tauri::async_runtime::block_on(llm_chat_once(&config, &messages))
            .expect("LLM 调用失败");
        let reply = parse_actions(&raw);
        assert!(reply.say.contains("你好"), "raw={raw}");
    }
}
