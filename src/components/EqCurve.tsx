import { useRef } from "preact/hooks";
import {
  bandLabel,
  EQ_BANDS,
  EQ_DB_RANGE,
  EQ_FREQ_MAX,
  EQ_FREQ_MIN,
  eqCurvePoints,
  eqGains,
  EQ_MAX,
  EQ_MIN,
  setEqBand,
} from "../state/equalizer";

const WIDTH = 560;
const HEIGHT = 150;

const freqToX = (freq: number) =>
  (Math.log(freq / EQ_FREQ_MIN) / Math.log(EQ_FREQ_MAX / EQ_FREQ_MIN)) * WIDTH;

const dbToY = (db: number) =>
  HEIGHT / 2 - (Math.max(-EQ_DB_RANGE, Math.min(EQ_DB_RANGE, db)) / EQ_DB_RANGE) * (HEIGHT / 2);

/**
 * EQ 频响曲线（ECHO EqCurveView 思路）：10 段总响应画成 SVG 曲线，
 * 节点可纵向拖拽调增益（横向锁定在各自频点，避免频率/Q 语义纠缠）。
 */
export function EqCurve() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragBand = useRef(-1);

  const gains = eqGains.value;
  const points = eqCurvePoints(gains);
  const path = points
    .map((db, i) => {
      const freq = EQ_FREQ_MIN * Math.pow(EQ_FREQ_MAX / EQ_FREQ_MIN, i / (points.length - 1));
      return `${i === 0 ? "M" : "L"}${freqToX(freq).toFixed(1)},${dbToY(db).toFixed(1)}`;
    })
    .join(" ");

  const setGainFromPointer = (event: PointerEvent) => {
    const svg = svgRef.current;
    const band = dragBand.current;
    if (!svg || band < 0) return;
    const rect = svg.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const db = ((HEIGHT / 2 - y) / (HEIGHT / 2)) * EQ_DB_RANGE;
    setEqBand(band, Math.max(EQ_MIN, Math.min(EQ_MAX, db)));
  };

  const onPointerDown = (index: number) => (event: PointerEvent) => {
    dragBand.current = index;
    svgRef.current?.setPointerCapture(event.pointerId);
    setGainFromPointer(event);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (dragBand.current >= 0) setGainFromPointer(event);
  };

  const endDrag = () => {
    dragBand.current = -1;
  };

  return (
    <svg
      ref={svgRef}
      class={`eq-curve ${eqGains.value.some((g) => g !== 0) ? "" : "is-flat"}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-label="均衡器频响曲线"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      {/* 参考线：±12 / ±6 / 0 */}
      {[EQ_MAX, 6, 0, -6, EQ_MIN].map((db) => (
        <line
          key={db}
          class={`eq-grid ${db === 0 ? "is-zero" : ""}`}
          x1={0}
          x2={WIDTH}
          y1={dbToY(db)}
          y2={dbToY(db)}
        />
      ))}
      <path class="eq-curve-line" d={path} />
      {/* 频段节点：拖拽纵向调增益 */}
      {EQ_BANDS.map((freq, index) => (
        <g key={freq}>
          <circle
            class="eq-node"
            cx={freqToX(freq)}
            cy={dbToY(gains[index] ?? 0)}
            r={7}
            tabIndex={0}
            role="slider"
            aria-label={`${bandLabel(freq)} 赫兹`}
            aria-valuemin={EQ_MIN}
            aria-valuemax={EQ_MAX}
            aria-valuenow={gains[index] ?? 0}
            onPointerDown={onPointerDown(index)}
          />
          <text class="eq-node-label" x={freqToX(freq)} y={HEIGHT - 2} text-anchor="middle">
            {bandLabel(freq)}
          </text>
        </g>
      ))}
    </svg>
  );
}
