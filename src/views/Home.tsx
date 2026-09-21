import { Icon } from "../components/Icon";

export function HomeView() {
  return (
    <section class="view view-home">
      <div class="home-empty">
        <Icon name="music-note" size={44} />
        <h1>电台即将开播</h1>
        <p>先把你的音乐带进来吧</p>
      </div>
    </section>
  );
}
