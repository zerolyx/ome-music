-- 004: DJ 记忆与配置层。
-- dj_messages 存电台对话（user/dj/system），只进不出、本地留存；
-- dj_memory_facts 存关于听众的事实卡（同 content 合并时 weight+1，权重高者优先进入上下文）；
-- app_config 存 LLM 配置（provider_name/base_url/model/api_key，仅本地 SQLite）。
-- 全部语句幂等，可在每次启动时重复执行。

CREATE TABLE IF NOT EXISTS dj_messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user', 'dj', 'system')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dj_memory_facts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('pref', 'habit', 'fact', 'summary')),
  content TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dj_memory_facts_weight ON dj_memory_facts(weight);
