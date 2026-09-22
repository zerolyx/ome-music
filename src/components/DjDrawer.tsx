import { useEffect, useRef, useState } from "preact/hooks";
import { activeView } from "../state/app";
import { ask, closeDrawer, djConfig, drawerOpen, messages, thinking } from "../state/dj";
import { Icon } from "./Icon";

export function DjDrawer() {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const open = drawerOpen.value;
  const config = djConfig.value;

  // 新消息 / 思考中：贴到底部
  useEffect(() => {
    const list = listRef.current;
    if (open && list) list.scrollTop = list.scrollHeight;
  }, [messages.value, thinking.value, open]);

  const submit = () => {
    const text = draft.trim();
    if (!text || thinking.value) return;
    setDraft("");
    void ask(text);
  };

  return (
    <aside class="dj-drawer" data-open={open} aria-hidden={!open} aria-label="DJ 对话">
      <header class="dj-header">
        <span class="dj-title">DJ</span>
        <button class="dj-close" aria-label="关闭" onClick={closeDrawer}>
          <Icon name="close" size={16} />
        </button>
      </header>

      {config && !config.configured && (
        <div class="dj-offline">
          <span>DJ 离线模式：未配置语言模型</span>
          <button
            class="btn-secondary"
            onClick={() => {
              activeView.value = "settings";
              closeDrawer();
            }}
          >
            去设置
          </button>
        </div>
      )}

      <div class="dj-messages" ref={listRef}>
        {messages.value.length === 0 && !thinking.value && (
          <p class="dj-empty">
            深夜电台已经开播。
            <br />
            点一首歌，或者随便聊聊今晚。
          </p>
        )}
        {messages.value.map((msg) => (
          <div key={msg.id} class={`dj-msg ${msg.role}`}>
            {msg.text}
          </div>
        ))}
        {thinking.value && (
          <div class="dj-msg dj dj-thinking" aria-label="DJ 正在思考">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      <div class="dj-input-row">
        <input
          class="dj-input"
          type="text"
          placeholder="和 DJ 说点什么…"
          aria-label="对 DJ 说话"
          value={draft}
          onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        <button class="dj-send" aria-label="发送" disabled={!draft.trim() || thinking.value} onClick={submit}>
          发送
        </button>
      </div>
    </aside>
  );
}
