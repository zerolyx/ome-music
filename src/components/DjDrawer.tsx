import { useEffect, useRef, useState } from "preact/hooks";
import { activeView } from "../state/app";
import {
  ask,
  clearMood,
  closeDrawer,
  djConfig,
  djTab,
  drawerOpen,
  forgetFact,
  loadHourProfile,
  loadMemoryFacts,
  messages,
  mood,
  memoryFacts,
  hourProfile,
  thinking,
  type DjTab,
} from "../state/dj";
import { bandOf, profileInsights } from "../lib/insight";
import { Icon } from "./Icon";

const TABS: Array<{ id: DjTab; label: string }> = [
  { id: "chat", label: "对话" },
  { id: "memory", label: "记忆" },
  { id: "profile", label: "画像" },
];

export function DjDrawer() {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const open = drawerOpen.value;
  const config = djConfig.value;
  const tab = djTab.value;

  // 切到记忆 / 画像页时按需加载
  useEffect(() => {
    if (open && tab === "memory" && memoryFacts.peek() === null) void loadMemoryFacts();
    if (open && tab === "profile" && hourProfile.peek() === null) void loadHourProfile();
  }, [open, tab]);

  // 新消息 / 思考中：贴到底部
  useEffect(() => {
    const list = listRef.current;
    if (open && tab === "chat" && list) list.scrollTop = list.scrollHeight;
  }, [messages.value, thinking.value, open, tab]);

  const submit = () => {
    const text = draft.trim();
    if (!text || thinking.value) return;
    setDraft("");
    void ask(text);
  };

  return (
    <aside class="dj-drawer" data-open={open} aria-hidden={!open} aria-label="DJ 电台">
      <header class="dj-header">
        <span class="dj-title">DJ</span>
        <nav class="dj-tabs" aria-label="DJ 面板切换">
          {TABS.map((item) => (
            <button
              key={item.id}
              class="dj-tab"
              data-active={tab === item.id}
              aria-pressed={tab === item.id}
              onClick={() => {
                djTab.value = item.id;
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
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

      {tab === "chat" && (
        <>
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
            <button
              class="dj-send"
              aria-label="发送"
              disabled={!draft.trim() || thinking.value}
              onClick={submit}
            >
              发送
            </button>
          </div>
        </>
      )}

      {tab === "memory" && <MemoryPanel />}
      {tab === "profile" && <ProfilePanel />}
    </aside>
  );
}

/* ============ 记忆页：DJ 记住的事实 + 当前氛围 ============ */

function MemoryPanel() {
  const facts = memoryFacts.value;
  const currentMood = mood.value;

  return (
    <div class="dj-panel dj-memory-panel">
      {currentMood && (
        <div class="dj-mood-row">
          <span class="dj-mood-chip">此刻氛围 · {currentMood}</span>
          <button class="dj-mood-clear" aria-label="清除氛围" onClick={clearMood}>
            清除
          </button>
        </div>
      )}
      {facts === null && <p class="dj-panel-hint">正在读取记忆…</p>}
      {facts !== null && facts.length === 0 && (
        <p class="dj-panel-hint">DJ 还没有记住任何事，多聊几句就会有了。</p>
      )}
      {facts !== null && facts.length > 0 && (
        <ul class="dj-memory-list">
          {facts.map((fact) => (
            <li key={fact.id} class="dj-fact">
              <div class="dj-fact-main">
                <span class="dj-fact-kind">{fact.kind}</span>
                <span class="dj-fact-content">{fact.content}</span>
              </div>
              <div class="dj-fact-side">
                <span class="dj-fact-weight" title="记忆权重">
                  ×{formatWeight(fact.weight)}
                </span>
                <button
                  class="dj-fact-forget"
                  aria-label="忘掉这条记忆"
                  onClick={() => {
                    void forgetFact(fact.id);
                  }}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(1);
}

/* ============ 画像页：24 小时播放柱状图 + 洞察 ============ */

const CHART_WIDTH = 240;
const CHART_HEIGHT = 110;
const SLOT = CHART_WIDTH / 24; // 每小时 10px
const CHART_BASE = CHART_HEIGHT - 14;

function ProfilePanel() {
  const prefs = hourProfile.value;
  const totalPlays = (prefs ?? []).reduce((sum, s) => sum + s.plays, 0);

  if (prefs === null) return <div class="dj-panel dj-profile-panel"><p class="dj-panel-hint">正在读取播放画像…</p></div>;
  if (totalPlays === 0) {
    return (
      <div class="dj-panel dj-profile-panel">
        <p class="dj-panel-hint">还没有足够的播放数据，多听几首歌再来。</p>
      </div>
    );
  }

  const maxPlays = Math.max(1, ...prefs.map((s) => s.plays));
  const nowHour = new Date().getHours();
  const insights = profileInsights(prefs);

  return (
    <div class="dj-panel dj-profile-panel">
      <div class="dj-band-now">现在是{bandOf(nowHour)} · {nowHour} 点</div>
      <svg
        class="dj-hour-chart"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label="24 小时播放分布"
      >
        {/* 基准线 */}
        <line x1={0} y1={CHART_BASE} x2={CHART_WIDTH} y2={CHART_BASE} class="dj-chart-base" />
        {prefs.map((stat) => {
          const x = stat.hour * SLOT + 1;
          const barH = (stat.plays / maxPlays) * (CHART_BASE - 6);
          const skipH = stat.plays > 0 ? (stat.skips / stat.plays) * barH : 0;
          const now = stat.hour === nowHour;
          return (
            <g key={stat.hour}>
              {stat.plays > 0 && (
                <rect
                  x={x}
                  y={CHART_BASE - barH}
                  width={SLOT - 2}
                  height={barH}
                  rx={1.5}
                  class="dj-chart-bar"
                  data-now={now}
                />
              )}
              {skipH >= 2 && (
                <rect
                  x={x}
                  y={CHART_BASE - skipH}
                  width={SLOT - 2}
                  height={skipH}
                  rx={1.5}
                  class="dj-chart-skip"
                />
              )}
              {now && (
                <line
                  x1={stat.hour * SLOT + SLOT / 2}
                  y1={4}
                  x2={stat.hour * SLOT + SLOT / 2}
                  y2={CHART_BASE}
                  class="dj-chart-now"
                />
              )}
            </g>
          );
        })}
        {/* 时刻标注 */}
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={Math.min(h * SLOT, CHART_WIDTH - 4)} y={CHART_HEIGHT - 2} class="dj-chart-label">
            {h}
          </text>
        ))}
      </svg>
      <div class="dj-chart-legend">
        <span class="dj-legend-item"><i class="dj-legend-bar" />播放</span>
        <span class="dj-legend-item"><i class="dj-legend-skip" />跳过</span>
      </div>
      {insights.length > 0 && (
        <ul class="dj-insights">
          {insights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
