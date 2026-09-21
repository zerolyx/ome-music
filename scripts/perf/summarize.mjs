#!/usr/bin/env node
// Summarize perf-sampler CSV output: per-scenario CPU medians and memory growth.
// Usage: node scripts/perf/summarize.mjs <csv> [<csv> ...]
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/perf/summarize.mjs <csv> [<csv> ...]");
  process.exit(1);
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] ?? NaN;

const scenarios = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  const header = lines[0] ?? "";
  // Column layout: with win_minimized (v2) or without (v1).
  const v2 = header.includes("win_minimized");
  const off = v2 ? 1 : 0;
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const c = line.split(",");
    if (c.length < 13) continue;
    const row = {
      ts: c[0],
      scenario: c[1],
      minimized: v2 ? c[3] === "1" : false,
      mainWs: +c[3 + off],
      mainPriv: +c[4 + off],
      mainCpu: c[5 + off] === "" ? null : +c[5 + off],
      webWs: +c[6 + off],
      webPriv: +c[7 + off],
      webCpu: c[8 + off] === "" ? null : +c[8 + off],
      webProcs: +c[9 + off],
      sideWs: +c[10 + off],
      sideCpu: c[11 + off] === "" ? null : +c[11 + off],
      sysAvail: +c[12 + off],
    };
    if (!scenarios.has(row.scenario)) scenarios.set(row.scenario, []);
    scenarios.get(row.scenario).push(row);
  }
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");

for (const [name, rows] of scenarios) {
  const cpuRows = rows.filter((r) => r.mainCpu !== null);
  const totalCpu = cpuRows.map((r) => r.mainCpu + r.webCpu + r.sideCpu);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const priv = (r) => r.mainPriv + r.webPriv + r.sideWs;
  const privSeries = rows.map(priv);
  const minFrac = rows.filter((r) => r.minimized).length / rows.length;
  const growLinear = (series) => {
    const ts = rows.map((r) => new Date(r.ts.replace(" ", "T")).getTime());
    const x0 = ts[0];
    const xs = ts.map((t) => (t - x0) / 60000);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = series.reduce((a, b) => a + b, 0) / series.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (series[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    return den === 0 ? 0 : num / den;
  };
  const spanMin = (new Date(last.ts.replace(" ", "T")) - new Date(first.ts.replace(" ", "T"))) / 60000;
  console.log(`scenario: ${name}  (samples: ${rows.length}, span: ${fmt(spanMin)} min, minimized: ${(minFrac * 100).toFixed(0)}%)`);
  console.log(`  CPU total median/p95: ${fmt(median(totalCpu), 2)}% / ${fmt(p95(totalCpu), 2)}%  (main ${fmt(median(cpuRows.map((r) => r.mainCpu)), 2)} | webview ${fmt(median(cpuRows.map((r) => r.webCpu)), 2)} | sidecar ${fmt(median(cpuRows.map((r) => r.sideCpu)), 2)})`);
  console.log(`  Private+sidecar WS MB first/median/last: ${fmt(priv(first))} / ${fmt(median(privSeries))} / ${fmt(priv(last))}  (net ${fmt(priv(last) - priv(first), 1)} MB, slope ${fmt(growLinear(privSeries), 2)} MB/min)`);
  console.log(`  Main priv MB: ${fmt(first.mainPriv)} -> ${fmt(last.mainPriv)}   WebView priv MB: ${fmt(first.webPriv)} -> ${fmt(last.webPriv)}   SysAvail MB: ${fmt(first.sysAvail, 0)} -> ${fmt(last.sysAvail, 0)}`);
}
