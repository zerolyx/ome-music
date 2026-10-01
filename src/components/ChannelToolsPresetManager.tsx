import { useState } from "preact/hooks";
import {
  activeChannelToolsCompareSlot,
  applyChannelToolsBuiltinPreset,
  applyChannelToolsCompareSlot,
  applyChannelToolsPreset,
  CHANNEL_TOOLS_BUILTIN_PRESETS,
  channelToolsComparisonSlots,
  channelToolsPresets,
  createChannelToolsPreset,
  deleteChannelToolsPreset,
  MAX_CHANNEL_TOOL_PRESET_NAME_LENGTH,
  renameChannelToolsPreset,
  saveCurrentChannelToolsToCompareSlot,
  updateChannelToolsPreset,
} from "../state/channel-tools";

export function ChannelToolsPresetManager() {
  const [presetName, setPresetName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const savePreset = (event: Event) => {
    event.preventDefault();
    const id = createChannelToolsPreset(presetName);
    if (!id) {
      setMessage("名称重复、为空或已达到 24 个预设上限");
      return;
    }
    setPresetName("");
    setMessage("已保存当前声道参数");
  };

  const commitRename = (id: string) => {
    if (!renameChannelToolsPreset(id, editingName)) {
      setMessage("预设名称无效或已存在");
      return;
    }
    setEditingId(null);
    setMessage("预设名称已更新");
  };

  return (
    <div class="channel-tools-profiles">
      <div class="channel-tools-profile-heading">
        <div>
          <strong>声道预设</strong>
          <span>一键套用或保存整套当前参数</span>
        </div>
        <span>{channelToolsPresets.value.length}/{24}</span>
      </div>
      <div class="channel-tools-preset-grid" aria-label="内置声道预设">
        {CHANNEL_TOOLS_BUILTIN_PRESETS.map((preset) => (
          <button
            class="channel-tools-preset-chip"
            key={preset.id}
            onClick={() => {
              applyChannelToolsBuiltinPreset(preset.id);
              setMessage(`已套用「${preset.name}」`);
            }}
          >
            {preset.name}
          </button>
        ))}
      </div>
      {channelToolsPresets.value.length > 0 && (
        <div class="channel-tools-saved-presets" aria-label="已保存的声道预设">
          {channelToolsPresets.value.map((preset) => (
            <article class="channel-tools-saved-preset" key={preset.id}>
              {editingId === preset.id ? (
                <form
                  class="channel-tools-rename-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    commitRename(preset.id);
                  }}
                >
                  <input
                    autoFocus
                    maxLength={MAX_CHANNEL_TOOL_PRESET_NAME_LENGTH}
                    aria-label={`重命名${preset.name}`}
                    value={editingName}
                    onInput={(event) => setEditingName((event.target as HTMLInputElement).value)}
                  />
                  <button class="channel-tools-mini-action" type="submit">保存</button>
                  <button class="channel-tools-mini-action" type="button" onClick={() => setEditingId(null)}>取消</button>
                </form>
              ) : (
                <>
                  <button
                    class="channel-tools-preset-apply"
                    onClick={() => {
                      applyChannelToolsPreset(preset.id);
                      setMessage(`已套用「${preset.name}」`);
                    }}
                    title={`套用「${preset.name}」`}
                  >
                    {preset.name}
                  </button>
                  <div class="channel-tools-preset-actions">
                    <button
                      class="channel-tools-mini-action"
                      onClick={() => {
                        updateChannelToolsPreset(preset.id);
                        setMessage(`已用当前参数更新「${preset.name}」`);
                      }}
                    >更新</button>
                    <button
                      class="channel-tools-mini-action"
                      onClick={() => {
                        setEditingId(preset.id);
                        setEditingName(preset.name);
                        setPendingDeleteId(null);
                      }}
                    >改名</button>
                    {pendingDeleteId === preset.id ? (
                      <>
                        <button
                          class="channel-tools-mini-action is-danger"
                          onClick={() => {
                            deleteChannelToolsPreset(preset.id);
                            setPendingDeleteId(null);
                            setMessage(`已删除「${preset.name}」`);
                          }}
                        >确认删除</button>
                        <button class="channel-tools-mini-action" onClick={() => setPendingDeleteId(null)}>取消</button>
                      </>
                    ) : (
                      <button class="channel-tools-mini-action" onClick={() => setPendingDeleteId(preset.id)}>删除</button>
                    )}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      <form class="channel-tools-save-form" onSubmit={savePreset}>
        <input
          maxLength={MAX_CHANNEL_TOOL_PRESET_NAME_LENGTH}
          aria-label="新声道预设名称"
          placeholder="给当前参数起个名字"
          value={presetName}
          onInput={(event) => setPresetName((event.target as HTMLInputElement).value)}
        />
        <button class="btn-secondary" type="submit" disabled={!presetName.trim() || channelToolsPresets.value.length >= 24}>保存当前</button>
      </form>
      <div class="channel-tools-ab" aria-label="A/B 声道试听比较">
        {(["A", "B"] as const).map((slot) => {
          const hasSnapshot = channelToolsComparisonSlots.value[slot] !== null;
          return (
            <div class={`channel-tools-ab-slot ${activeChannelToolsCompareSlot.value === slot ? "is-active" : ""}`} key={slot}>
              <div class="channel-tools-ab-label">
                <strong>{slot}</strong>
                <span>{activeChannelToolsCompareSlot.value === slot ? "正在试听" : hasSnapshot ? "已保存" : "空"}</span>
              </div>
              <button
                class="channel-tools-mini-action"
                onClick={() => {
                  saveCurrentChannelToolsToCompareSlot(slot);
                  setMessage(`当前参数已保存到 ${slot}`);
                }}
              >记住当前</button>
              <button
                class="channel-tools-ab-listen"
                disabled={!hasSnapshot}
                onClick={() => {
                  if (applyChannelToolsCompareSlot(slot)) setMessage(`正在试听 ${slot}`);
                }}
              >试听 {slot}</button>
            </div>
          );
        })}
      </div>
      <p class="channel-tools-profile-note" role="status" aria-live="polite">
        {message || "A/B 会记住两套参数；试听时立即切换当前播放声音。"}
      </p>
    </div>
  );
}
