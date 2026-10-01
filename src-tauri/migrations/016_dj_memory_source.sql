-- 016: DJ 记忆事实来源字段。
-- dj_memory_facts 增加 source 字段，区分用户手动写入（manual）、
-- LLM 自动提炼（inferred）和对话摘要（summary）；
-- 旧记录默认 'manual'，全部语句幂等。

ALTER TABLE dj_memory_facts ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
