import { Icon } from "../components/Icon";

export function HomeView() {
  return (
    <section class="view view-home">
      <div class="home-glow" aria-hidden="true" />
      <div class="home-empty">
        <div class="home-disc">
          <Icon name="music-note" size={40} />
        </div>
        <h1>电台即将开播</h1>
        <p>导入音乐后，这里会成为你的私人电台</p>
      </div>
    </section>
  );
}
