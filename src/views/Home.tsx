import { Icon } from "../components/Icon";

export function HomeView() {
  return (
    <section class="view view-home">
      <div class="home-glow" aria-hidden="true" />
      <div class="home-empty">
        <p class="home-kicker">OME RADIO · 私人电台</p>
        <div class="home-disc" aria-hidden="true">
          <div class="home-disc-face">
            <span class="home-disc-label">
              <Icon name="music-note" size={30} />
            </span>
          </div>
        </div>
        <h1>电台即将开播</h1>
        <p class="home-hint">导入音乐后，这里会成为你的私人电台</p>
      </div>
    </section>
  );
}
