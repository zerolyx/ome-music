# Performance sampling

All performance claims in this repo must be measured, not asserted.

**Rule: no `Performance PASS` without a Before and an After.** Both numbers come
from this sampler, on the same machine, with the same scenario definition.

## Scripts

| Command | What it does |
|---|---|
| `npm run perf:sample` | Samples the process tree every 10s (PowerShell). Writes a CSV. |
| `npm run perf:summary` | Summarises one or more CSVs: CPU median/p95, memory first/median/last, slope MB/min, and the fraction of samples where the window was minimised. |

```bash
npm run perf:sample                     # writes samples-*.csv
node scripts/perf/summarize.mjs samples-idle.csv samples-soak.csv
```

The sampler tracks the **process tree**: main process + every WebView2 child +
the NetEase node sidecar. CPU% is normalised against total machine capacity
(100% = whole machine saturated), so numbers are comparable across runs.

## Scenario definitions

Keep these stable — a changed scenario invalidates the Before/After pair.

| Scenario | Definition |
|---|---|
| `idle` | App open, playback paused, window visible, 10 min. |
| `soak` | Continuous local playback, 30 min, window must stay visible. |
| `netease` | Continuous NetEase streaming at the highest available quality, ≥30 min. |

## Recording a measurement

Copy this block into the PR or phase report. Do not edit the numbers to look
better; if a number regressed, say so and say why.

```
Scenario:
Build:              <commit of Before> -> <commit of After>
Duration / samples:
CPU median / p95:   Before  /   ->  After  /
Memory first->last: Before      ->  After
Slope MB/min:       Before      ->  After
Minimised samples:  <must be 0% — a minimised window idles and invalidates the run>
Verdict:            improved / neutral / regressed (<reason>)
```

## Known gaps

- Long-form NetEase soak (>30 min) was previously impossible to finish because
  playback stopped on unplayable queue entries. It should now be measurable
  after the P1-7 fix.
- `ome-media` proxy memory for long video is not yet quantified.
- 1000-item queue render frame rate is not yet instrumented.
