//! NetEase Cloud Music 原生客户端：加密、请求层、QR 登录与业务端点。
//!
//! 协议常量逐字对齐锁定版本 NeteaseCloudMusicApi@4.32.0（见
//! `docs/superpowers/plans/2026-09-22-plan2-netease.md` Global Constraints）。

pub mod api;
pub mod auth;
pub mod crypto;
pub mod request;
