# Plan 2「NetEase」Implementation Plan — Rust 原生客户端

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 ~800 行 Rust 替代 115MB Node sidecar：QR 登录、云搜索、取流、歌词、红心、推荐，前端接入搜索页与登录设置。

**Architecture:** `src-tauri/src/netease/`（crypto/auth/api 三模块）+ 全局 HTTP 客户端；Cookie 持久化到 app_data `netease-cookie.txt`；流媒体直连 https（CSP 已放行），失败再代理。加密协议常量从锁定版本 NeteaseCloudMusicApi@4.32.0 源码逐字提取（已核对，见 Global Constraints）。

**Tech Stack:** Rust: aes/cbc/ecb（AES-128）、rsa 0.9（解析公钥 + num-bigint 做裸 RSA-NONE）、md5（已有）、base64（已有）、rand 0.8、qrcode 0.14（SVG 输出，无 image 依赖）、reqwest/tokio（已有）。前端不加依赖。

**Spec:** `docs/superpowers/specs/2026-09-21-ome-lightweight-personal-radio-design.md` §3

## Global Constraints

- **协议常量（逐字，来自 NeteaseCloudMusicApi@4.32.0 util/crypto.js）**：
  - weapi：`iv="0102030405060708"`，`presetKey="0CoJUm6Qyw8W8jud"`，secretKey=base62（`abc…XYZ0123456789`，注意顺序：小写在前）随机 16 字符；`params=base64(AES128CBC(base64(AES128CBC(text,presetKey,iv)), secretKey, iv))`（PKCS7）；`encSecKey=hex(RSA_NONE(reverse(secretKey), publicKey))`，公钥 PEM（单行体）：
    `MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB`
  - eapi：`eapiKey="e82ckenh8dichen8"`；`message="nobody{uri}use{text}md5forencrypt"`；`data="{uri}-36cd479b6b5-{text}-36cd479b6b5-{md5hex(message)}"`；`params=hex_upper? — 注意为小写 hex(AES128ECB(data,eapiKey))`（CryptoJS ciphertext.toString() 默认 hex 小写，参考实现外层 `.toUpperCase()` 仅 linuxapi 用，eapi 输出为 hex 小写）；POST 表单 `params=<hex>`。
- **端点（uri → eapi/weapi、域名、payload）**：
  - QR key：eapi `https://interface3.music.163.com/eapi/login/qrcode/unikey` body `{type:3, e_r:false, header:{...}}` → `data.unikey`
  - QR check：eapi `…/eapi/login/qrcode/client/login` body `{key, type:3, e_r:false, header:{...}}` → code 801 等待/802 已扫/803 成功（cookie 在响应 Set-Cookie）/800 过期
  - 搜索：eapi `…/eapi/cloudsearch/pc` body `{s, type:1, limit:30, offset:0, total:true, e_r:false, header:{...}}`
  - 取流：eapi `…/eapi/song/enhance/player/url/v1` body `{ids:"[ID]", level:"standard", encodeType:"flac", e_r:false, header:{...}}` → `data[0].url`
  - 歌词：eapi `…/eapi/song/lyric/v1` body `{id, cp:false, tv:0, lv:0, rv:0, kv:0, yv:0, ytv:0, yrv:0, e_r:false, header:{...}}` → `lrc.lyric`
  - 红心：weapi `https://music.163.com/weapi/radio/like` body `{alg:"itembased", trackId, like, time:"3", csrf_token}` → 需登录 cookie
  - 域名：eapi 用 `https://interface3.music.163.com`（uri 去 `/api` 前缀拼接 `/eapi/` 其余）；weapi 用 `https://music.163.com/weapi/…`，Referer=`https://music.163.com`
- **eapi header 字段**（进 data.header 与 Cookie）：`osver:"Microsoft-Windows-10-Professional-build-19045-64bit"` 可缺省、`os:"pc"`、`appver:"3.1.17.204416"`、`channel:"netease"`、`versioncode:"140"`、`resolution:"1920x1080"`、`buildver:<当日 yyyyMMdd>`、`requestId:<ms>_<4位随机>`、登录后加 `MUSIC_U`。UA 用 iphone 风格：`Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) NeteaseMusic v8.7.01 mobile Safari/605.1.15`？——**实现时以 4.32.0 `util/index.js chooseUserAgent` 输出为准**（执行者从 /tmp/ncm/package/util/index.js 读取或重新解包 tgz），不要凭记忆。
- **Cookie 持久化**：`app_data_dir()/netease-cookie.txt`，存 QR check 成功响应的原始 cookie 串（含 `MUSIC_U=…; __csrf=…`）；命令读写它；删除 = 登出。
- **前端契约（camelCase invoke）**：`netease_status() -> {loggedIn: bool, nickname?: string}`；`netease_qr_key() -> {key: string, qrSvg: string}`（SVG 字符串，前端 innerHTML 渲染）；`netease_qr_check(key) -> {code: 800|801|802|803, nickname?: string}`；`netease_search(keywords, limit?) -> Vec<NeteaseSongDto>`；`netease_stream_url(id) -> string`（https 直链）；`netease_lyric(id) -> {lrc: string}`；`netease_like(id, like) -> ()`（未登录报错文案"未登录"）；`netease_logout()`。
- `NeteaseSongDto`：`{id: u64, name, artists: String(逗号拼接), album, durationMs: i64, fee: i64, plain: bool}`（plain = 免费/可播判定：fee 0/8 可播）。
- UI 文案简体中文；不加前端依赖；提交信息 Conventional Commits。
- 每任务结束 `cargo test`/`npm run test` 绿。

---

### Task 1: crypto.rs — weapi/eapi 加密与单测

**Files:** Create `src-tauri/src/netease/mod.rs`、`crypto.rs`、`crypto_test.rs`(或 `#[cfg(test)]`)；Modify `Cargo.toml`（+aes, cbc, ecb, rsa, rand, qrcode）、`lib.rs`（`mod netease;`）

**Interfaces（后续任务依赖，签名固定）:** `crypto::weapi(data: &serde_json::Value) -> (String params_b64, String enc_sec_key_hex)`；`crypto::eapi(uri: &str, data: &serde_json::Value) -> String params_hex`；`crypto::random_secret() -> String`。

- [ ] TDD：先写测试——weapi 输出可被反向验证（用固定 secretKey 注入的可测版本 `weapi_with_secret(data, secret)`：解密两层 CBC 得回原 JSON；encSecKey 用 rsa 公钥 n 做 modpow 验证长度 256 hex）；eapi 测试用固定输入断言确定性（md5 链正确性用 node 对照：`node -e` 算一次期望值硬编码）
- [ ] 实现（RSA：`RsaPublicKey::from_public_key_pem` → `n()` → `BigUint::from_bytes_be` 补零到 128 字节 → `modpow(&e,&n)` → 小写 hex）
- [ ] `cargo test` 通过、clippy -D warnings 干净 → commit `feat(netease): weapi/eapi crypto with test vectors`

### Task 2: api.rs + auth.rs — 请求层与 QR 登录

**Files:** Create `netease/request.rs`（eapi/weapi POST 封装 + Cookie 读写）、`netease/api.rs`（六端点）、`netease/auth.rs`（QR 三步 + 状态 + 登出）；Modify `lib.rs` 注册命令

**Interfaces:** Global Constraints 里的全部 invoke 命令。QR SVG 用 `qrcode::QrCode::new(key)?.to_string()`。cookie 文件读写放 request.rs（`load_cookie()/save_cookie(s)/clear_cookie()`）。
- [ ] TDD：api 层可测部分（URL 拼接、header 构造、cookie 解析 MUSIC_U/__csrf）纯函数化 + 单测；网络调用打真实端点的测试放 `#[ignore]`
- [ ] 实现 → `cargo test` + clippy → commit `feat(netease): request layer, qr login, search, url, lyric, like`

### Task 3: 前端 — 搜索页 + 登录设置 + NetEase 播放

**Files:** Modify `src/lib/api.ts`（契约封装）、`src/types/music.ts`（NeteaseSong）、`src/state/netease.ts`（新）、`src/views/Search.tsx`（真实现）、`src/views/Settings.tsx`（登录卡片）、`src/components/TrackList.tsx`（复用：NetEase 结果也用它，like 走 netease_like）、`src/state/player.ts`（toPlayableSrc 分支：netease 走 stream_url 异步解析——播放信号流需要 async src 解析器）、`layout.css` 追加

**Interfaces:** 播放 NetEase：`playTracks` 前对 `source==="netease"` 的曲目调 `netease_stream_url` 换真实 URL（缓存到 track.filePath 一次）。未登录红心→提示。歌词占位（NetEase 歌词在 Plan 3 中接 LyricsView？**本期：歌词页不在范围**，lrc 接口先备好）。
- [ ] TDD/验证：`npm run test`、tsc、lint → 手动验收（见 Task 4）→ commit `feat(netease): search, qr login settings, streaming playback`

### Task 4: 真机验收

- [ ] `cargo test`（含 #[ignore] 的真机测试可选跑：`cargo test -- --ignored`，需网络）
- [ ] 手动清单：设置页出二维码 → 手机网易云扫码 → 状态变已登录+昵称 → 搜索"周杰伦 晴天" → 出结果 → 播放有声 → 红心 → 网易云网页端可见 → 登出 → 红心报"未登录"
- [ ] commit 修复 + `git merge` 回 main（ finishing 流程）

## Self-Review 记录

- 占位符检查：chooseUserAgent 标注了执行时以源码为准（事实待提取，非 TBD——提取路径已给出）
- 一致性：命令名 camelCase 与前端 api.ts 对齐；DTO 字段与 Track 映射注明
- 风险：QR 协议若变 → 回退方案（重提 node sidecar）第一时间上报用户
