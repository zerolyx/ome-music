-- 017: DJ 对话摘要标记字段。
-- dj_messages 增加 summarized 字段（0 = 未摘要，1 = 已摘要进 dj_memory_facts）；
-- recent_messages 查询将只返回 summarized=0 的记录，保持上下文窗口始终有效。
-- 全部语句幂等。

ALTER TABLE dj_messages ADD COLUMN summarized INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_dj_messages_summarized ON dj_messages(summarized);
