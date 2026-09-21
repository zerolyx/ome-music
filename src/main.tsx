import { render } from "preact";
import "./styles/theme.css";
import "./styles/layout.css";
import { App } from "./app";
import "./state/theme"; // 引入即生效：应用主题到 <html>

render(<App />, document.getElementById("app")!);
