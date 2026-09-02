import React, { useEffect, useRef, useState } from 'react';
import { round } from '../lib/validate';

/**
 * Accessible inline-SVG charts.
 *
 * Every chart ships: a title, a written numerical summary, a data table view,
 * a hover/focus tooltip, and (for two or more series) a legend. Colours come
 * from validated palette tokens defined in app.css - one hue for magnitude,
 * fixed categorical slots for identity, and reserved status colours for state.
 */

export interface Point {
  label: string;
  value: number;
  /** Optional longer label used in the tooltip and the data table. */
  fullLabel?: string;
}

/**
 * Charts render at their container's real pixel width with a fixed height, so
 * a wide screen gets a wider chart rather than a scaled-up (and enormous) one.
 * Where ResizeObserver is unavailable the fallback width keeps them readable.
 */
function useChartWidth(minWidth = 320, fallback = 640): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const measure = () => setWidth(Math.max(minWidth, Math.round(node.clientWidth || fallback)));
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [minWidth, fallback]);

  return [ref, width];
}

/**
 * Chart width plus tooltip state. The tooltip is cleared whenever the chart is
 * re-measured or the pointer leaves the figure, so it can never be left behind
 * by a re-render.
 */
function useChartInteraction(minWidth?: number) {
  const [ref, width] = useChartWidth(minWidth);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  useEffect(() => {
    setTooltip(null);
  }, [width]);
  return { ref, width, tooltip, setTooltip };
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

function Tooltip({ state }: { state: TooltipState | null }): JSX.Element | null {
  if (!state) return null;
  return (
    <div className="viz-tooltip" style={{ left: state.x, top: state.y }} role="presentation">
      <div className="tt-title">{state.title}</div>
      {state.lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

function ChartFrame({
  title,
  summary,
  legend,
  table,
  children,
  tooltip,
  frameRef,
  onHide,
}: {
  title: string;
  summary: string;
  legend?: React.ReactNode;
  table: React.ReactNode;
  children: React.ReactNode;
  tooltip: TooltipState | null;
  frameRef?: React.RefObject<HTMLDivElement>;
  onHide?: () => void;
}): JSX.Element {
  return (
    <figure className="viz viz-figure">
      <div
        className="chart"
        style={{ position: 'relative' }}
        ref={frameRef}
        onPointerLeave={() => onHide?.()}
        onBlur={() => onHide?.()}
      >
        {children}
        <Tooltip state={tooltip} />
      </div>
      {legend && <div className="chart-legend">{legend}</div>}
      <figcaption>{summary}</figcaption>
      <details className="data-table">
        <summary>Show the numbers behind &ldquo;{title}&rdquo;</summary>
        <div className="table-wrap">{table}</div>
      </details>
    </figure>
  );
}

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = scaled <= 1.2 ? 1.2 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

/* ------------------------------------------------------------- bar chart */

export function BarChart({
  title,
  data,
  unit = '',
  target = null,
  targetLabel = 'Target',
  decimals = 0,
  height = 190,
}: {
  title: string;
  data: Point[];
  unit?: string;
  target?: number | null;
  targetLabel?: string;
  decimals?: number;
  height?: number;
}): JSX.Element {
  const { ref: frameRef, width: containerWidth, tooltip, setTooltip } = useChartInteraction();
  const width = Math.max(containerWidth, data.length * 34);
  const padding = { top: 14, right: 10, bottom: 30, left: 44 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const maxValue = niceMax(Math.max(target ?? 0, ...data.map((d) => d.value), 0));
  const band = data.length > 0 ? plotW / data.length : plotW;
  const barW = Math.max(6, Math.min(34, band - 8));
  const scaleY = (value: number) => padding.top + plotH - (value / maxValue) * plotH;

  const values = data.map((d) => d.value);
  const total = values.reduce((sum, v) => sum + v, 0);
  const average = values.length > 0 ? total / values.length : 0;
  const best = data.reduce<Point | null>((acc, d) => (acc === null || d.value > acc.value ? d : acc), null);
  const summary = data.length === 0
    ? 'No records in this range yet.'
    : `${data.length} days. Total ${round(total, decimals)}${unit}, daily average ${round(average, decimals)}${unit}` +
      (best ? `, highest ${round(best.value, decimals)}${unit} on ${best.fullLabel ?? best.label}` : '') +
      (target !== null ? `. ${targetLabel} ${round(target, decimals)}${unit}.` : '.');

  return (
    <ChartFrame
      title={title}
      summary={summary}
      tooltip={tooltip}
      frameRef={frameRef}
      onHide={() => setTooltip(null)}
      table={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{unit ? `Value (${unit.trim()})` : 'Value'}</th>
              {target !== null && <th scope="col">{targetLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.label + point.fullLabel}>
                <th scope="row">{point.fullLabel ?? point.label}</th>
                <td>{round(point.value, decimals)}</td>
                {target !== null && <td>{round(target, decimals)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${title}. ${summary}`}
        preserveAspectRatio="xMinYMid meet"
        onMouseLeave={() => setTooltip(null)}
      >
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line
              className="viz-grid-line"
              x1={padding.left}
              x2={width - padding.right}
              y1={scaleY(maxValue * fraction)}
              y2={scaleY(maxValue * fraction)}
            />
            <text className="viz-axis-label" x={padding.left - 6} y={scaleY(maxValue * fraction) + 4} textAnchor="end">
              {round(maxValue * fraction, decimals)}
            </text>
          </g>
        ))}

        {data.map((point, index) => {
          const x = padding.left + index * band + (band - barW) / 2;
          const y = scaleY(point.value);
          const barH = Math.max(point.value > 0 ? 3 : 0, padding.top + plotH - y);
          return (
            <g key={`${point.label}-${index}`}>
              <rect x={x} y={y} width={barW} height={barH} rx={4} fill="var(--seq-5)" />
              <rect
                className="viz-hit"
                x={padding.left + index * band}
                y={padding.top}
                width={band}
                height={plotH}
                tabIndex={0}
                role="button"
                aria-label={`${point.fullLabel ?? point.label}: ${round(point.value, decimals)}${unit}`}
                onMouseEnter={() =>
                  setTooltip({
                    x: padding.left + index * band + band / 2,
                    y,
                    title: point.fullLabel ?? point.label,
                    lines: [`${round(point.value, decimals)}${unit}`],
                  })
                }
                onFocus={() =>
                  setTooltip({
                    x: padding.left + index * band + band / 2,
                    y,
                    title: point.fullLabel ?? point.label,
                    lines: [`${round(point.value, decimals)}${unit}`],
                  })
                }
                onBlur={() => setTooltip(null)}
              />
            </g>
          );
        })}

        {target !== null && target > 0 && (
          <>
            <line className="viz-target-line" x1={padding.left} x2={width - padding.right} y1={scaleY(target)} y2={scaleY(target)} />
            <text className="viz-axis-label" x={width - padding.right} y={scaleY(target) - 5} textAnchor="end">
              {targetLabel}
            </text>
          </>
        )}

        <line className="viz-baseline" x1={padding.left} x2={width - padding.right} y1={padding.top + plotH} y2={padding.top + plotH} />
        {data.map((point, index) =>
          data.length <= 16 || index % Math.ceil(data.length / 12) === 0 ? (
            <text
              key={`label-${point.label}-${index}`}
              className="viz-axis-label"
              x={padding.left + index * band + band / 2}
              y={height - 10}
              textAnchor="middle"
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------ line chart */

export interface Series {
  name: string;
  points: Point[];
  slot: 1 | 2 | 3;
}

export function LineChart({
  title,
  series,
  unit = '',
  decimals = 0,
  height = 200,
}: {
  title: string;
  series: Series[];
  unit?: string;
  decimals?: number;
  height?: number;
}): JSX.Element {
  const { ref: frameRef, width: containerWidth, tooltip, setTooltip } = useChartInteraction();
  const length = Math.max(0, ...series.map((s) => s.points.length));
  const width = Math.max(containerWidth, length * 22);
  const padding = { top: 14, right: 14, bottom: 30, left: 46 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const allValues = series.flatMap((s) => s.points.map((p) => p.value));
  const maxValue = niceMax(Math.max(1, ...allValues));
  const minValue = Math.min(0, ...allValues);
  const range = maxValue - minValue || 1;
  const stepX = length > 1 ? plotW / (length - 1) : plotW;
  const scaleY = (value: number) => padding.top + plotH - ((value - minValue) / range) * plotH;

  const first = series[0];
  const summary = length === 0
    ? 'No records in this range yet.'
    : series
        .map((s) => {
          const values = s.points.map((p) => p.value);
          const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          const last = values.length ? values[values.length - 1] : 0;
          return `${s.name}: average ${round(avg, decimals)}${unit}, latest ${round(last, decimals)}${unit}`;
        })
        .join('. ') + '.';

  return (
    <ChartFrame
      title={title}
      summary={summary}
      tooltip={tooltip}
      frameRef={frameRef}
      onHide={() => setTooltip(null)}
      legend={
        series.length > 1
          ? series.map((s) => (
              <span key={s.name}>
                <i className="legend-dot" style={{ background: `var(--series-${s.slot})` }} aria-hidden="true" />
                {s.name}
              </span>
            ))
          : undefined
      }
      table={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {series.map((s) => (
                <th key={s.name} scope="col">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(first?.points ?? []).map((point, index) => (
              <tr key={`${point.label}-${index}`}>
                <th scope="row">{point.fullLabel ?? point.label}</th>
                {series.map((s) => (
                  <td key={s.name}>{round(s.points[index]?.value ?? 0, decimals)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${title}. ${summary}`}
        preserveAspectRatio="xMinYMid meet"
        onMouseLeave={() => setTooltip(null)}
      >
        {[0, 0.5, 1].map((fraction) => {
          const value = minValue + range * fraction;
          return (
            <g key={fraction}>
              <line className="viz-grid-line" x1={padding.left} x2={width - padding.right} y1={scaleY(value)} y2={scaleY(value)} />
              <text className="viz-axis-label" x={padding.left - 6} y={scaleY(value) + 4} textAnchor="end">
                {round(value, decimals)}
              </text>
            </g>
          );
        })}

        {series.map((s) => {
          const d = s.points
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${padding.left + index * stepX} ${scaleY(point.value)}`)
            .join(' ');
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={`var(--series-${s.slot})`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.points.length <= 40 &&
                s.points.map((point, index) => (
                  <circle
                    key={`${s.name}-${index}`}
                    cx={padding.left + index * stepX}
                    cy={scaleY(point.value)}
                    r={4}
                    fill={`var(--series-${s.slot})`}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ))}
            </g>
          );
        })}

        {(first?.points ?? []).map((point, index) => (
          <rect
            key={`hit-${index}`}
            className="viz-hit"
            x={padding.left + index * stepX - stepX / 2}
            y={padding.top}
            width={Math.max(10, stepX)}
            height={plotH}
            tabIndex={0}
            role="button"
            aria-label={`${point.fullLabel ?? point.label}: ${series
              .map((s) => `${s.name} ${round(s.points[index]?.value ?? 0, decimals)}${unit}`)
              .join(', ')}`}
            onMouseEnter={() =>
              setTooltip({
                x: padding.left + index * stepX,
                y: scaleY(series[0]?.points[index]?.value ?? 0),
                title: point.fullLabel ?? point.label,
                lines: series.map((s) => `${s.name}: ${round(s.points[index]?.value ?? 0, decimals)}${unit}`),
              })
            }
            onFocus={() =>
              setTooltip({
                x: padding.left + index * stepX,
                y: scaleY(series[0]?.points[index]?.value ?? 0),
                title: point.fullLabel ?? point.label,
                lines: series.map((s) => `${s.name}: ${round(s.points[index]?.value ?? 0, decimals)}${unit}`),
              })
            }
            onBlur={() => setTooltip(null)}
          />
        ))}

        <line className="viz-baseline" x1={padding.left} x2={width - padding.right} y1={padding.top + plotH} y2={padding.top + plotH} />
        {(first?.points ?? []).map((point, index) =>
          length <= 14 || index % Math.ceil(length / 10) === 0 ? (
            <text
              key={`x-${index}`}
              className="viz-axis-label"
              x={padding.left + index * stepX}
              y={height - 10}
              textAnchor="middle"
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
    </ChartFrame>
  );
}

/* --------------------------------------------------- ranked horizontal bars */

export function RankedBarChart({
  title,
  data,
  unit = '',
  decimals = 0,
}: {
  title: string;
  data: Point[];
  unit?: string;
  decimals?: number;
}): JSX.Element {
  const { ref: frameRef, width: containerWidth, tooltip, setTooltip } = useChartInteraction();
  const rows = [...data].sort((a, b) => b.value - a.value).slice(0, 10);
  const rowH = 30;
  const width = containerWidth;
  const height = Math.max(60, rows.length * rowH + 18);
  const labelW = 128;
  const maxValue = niceMax(Math.max(1, ...rows.map((r) => r.value)));
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const summary = rows.length === 0
    ? 'Nothing recorded in this range yet.'
    : `${rows.length} entries totalling ${round(total, decimals)}${unit}. Highest: ${rows[0].fullLabel ?? rows[0].label} at ${round(rows[0].value, decimals)}${unit}.`;

  return (
    <ChartFrame
      title={title}
      summary={summary}
      tooltip={tooltip}
      frameRef={frameRef}
      onHide={() => setTooltip(null)}
      table={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">{unit ? `Value (${unit.trim()})` : 'Value'}</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.fullLabel ?? row.label}</th>
                <td>{round(row.value, decimals)}</td>
                <td>{total > 0 ? `${round((row.value / total) * 100, 1)}%` : '0%'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${title}. ${summary}`}
        preserveAspectRatio="xMinYMid meet"
        onMouseLeave={() => setTooltip(null)}
      >
        {rows.map((row, index) => {
          const y = index * rowH + 6;
          const barW = Math.max(row.value > 0 ? 3 : 0, ((width - labelW - 60) * row.value) / maxValue);
          const seq = Math.min(8, Math.max(1, 6 - Math.floor((index / Math.max(1, rows.length)) * 4)));
          return (
            <g key={row.label}>
              <text className="viz-axis-label" x={labelW - 8} y={y + 15} textAnchor="end">
                {(row.label ?? '').slice(0, 18)}
              </text>
              <rect x={labelW} y={y + 4} width={barW} height={rowH - 12} rx={4} fill={`var(--seq-${seq})`} />
              <text className="viz-axis-label" x={labelW + barW + 6} y={y + 15}>
                {round(row.value, decimals)}
                {unit}
              </text>
              <rect
                className="viz-hit"
                x={labelW}
                y={y}
                width={width - labelW}
                height={rowH}
                tabIndex={0}
                role="button"
                aria-label={`${row.fullLabel ?? row.label}: ${round(row.value, decimals)}${unit}`}
                onMouseEnter={() =>
                  setTooltip({ x: labelW + barW, y: y + 4, title: row.fullLabel ?? row.label, lines: [`${round(row.value, decimals)}${unit}`] })
                }
                onFocus={() =>
                  setTooltip({ x: labelW + barW, y: y + 4, title: row.fullLabel ?? row.label, lines: [`${round(row.value, decimals)}${unit}`] })
                }
                onBlur={() => setTooltip(null)}
              />
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}

/* ---------------------------------------------------------- stacked status */

export interface StatusStack {
  label: string;
  fullLabel?: string;
  completed: number;
  missed: number;
  excused: number;
}

const STATUS_PARTS = [
  { key: 'completed' as const, name: 'Completed', colour: 'var(--status-good)', mark: 'done' },
  { key: 'missed' as const, name: 'Missed', colour: 'var(--status-critical)', mark: 'missed' },
  { key: 'excused' as const, name: 'Excused', colour: 'var(--status-warning)', mark: 'excused' },
];

export function StatusStackChart({ title, data }: { title: string; data: StatusStack[] }): JSX.Element {
  const { ref: frameRef, width: containerWidth, tooltip, setTooltip } = useChartInteraction();
  const width = Math.max(containerWidth, data.length * 34);
  const height = 190;
  const padding = { top: 14, right: 10, bottom: 30, left: 34 };
  const plotH = height - padding.top - padding.bottom;
  const plotW = width - padding.left - padding.right;
  const band = data.length > 0 ? plotW / data.length : plotW;
  const barW = Math.max(6, Math.min(30, band - 10));
  const maxTotal = Math.max(1, ...data.map((d) => d.completed + d.missed + d.excused));

  const totals = data.reduce(
    (acc, d) => ({ completed: acc.completed + d.completed, missed: acc.missed + d.missed, excused: acc.excused + d.excused }),
    { completed: 0, missed: 0, excused: 0 },
  );
  const summary = `${totals.completed} completed, ${totals.missed} missed, ${totals.excused} excused across ${data.length} days.`;

  return (
    <ChartFrame
      title={title}
      summary={summary}
      tooltip={tooltip}
      frameRef={frameRef}
      onHide={() => setTooltip(null)}
      legend={STATUS_PARTS.map((part) => (
        <span key={part.key}>
          <i className="legend-dot" style={{ background: part.colour }} aria-hidden="true" />
          {part.name}
        </span>
      ))}
      table={
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Completed</th>
              <th scope="col">Missed</th>
              <th scope="col">Excused</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.label + (row.fullLabel ?? '')}>
                <th scope="row">{row.fullLabel ?? row.label}</th>
                <td>{row.completed}</td>
                <td>{row.missed}</td>
                <td>{row.excused}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`${title}. ${summary}`}
        preserveAspectRatio="xMinYMid meet"
        onMouseLeave={() => setTooltip(null)}
      >
        <line className="viz-baseline" x1={padding.left} x2={width - padding.right} y1={padding.top + plotH} y2={padding.top + plotH} />
        {data.map((row, index) => {
          const x = padding.left + index * band + (band - barW) / 2;
          let cursor = padding.top + plotH;
          return (
            <g key={`${row.label}-${index}`}>
              {STATUS_PARTS.map((part) => {
                const value = row[part.key];
                if (value <= 0) return null;
                const segmentH = (value / maxTotal) * plotH;
                cursor -= segmentH;
                return (
                  <rect
                    key={part.key}
                    x={x}
                    y={cursor + 1}
                    width={barW}
                    height={Math.max(2, segmentH - 2)}
                    rx={3}
                    fill={part.colour}
                  />
                );
              })}
              <rect
                className="viz-hit"
                x={padding.left + index * band}
                y={padding.top}
                width={band}
                height={plotH}
                tabIndex={0}
                role="button"
                aria-label={`${row.fullLabel ?? row.label}: ${row.completed} completed, ${row.missed} missed, ${row.excused} excused`}
                onMouseEnter={() =>
                  setTooltip({
                    x: padding.left + index * band + band / 2,
                    y: cursor,
                    title: row.fullLabel ?? row.label,
                    lines: [`Completed ${row.completed}`, `Missed ${row.missed}`, `Excused ${row.excused}`],
                  })
                }
                onFocus={() =>
                  setTooltip({
                    x: padding.left + index * band + band / 2,
                    y: cursor,
                    title: row.fullLabel ?? row.label,
                    lines: [`Completed ${row.completed}`, `Missed ${row.missed}`, `Excused ${row.excused}`],
                  })
                }
                onBlur={() => setTooltip(null)}
              />
              <text className="viz-axis-label" x={padding.left + index * band + band / 2} y={height - 10} textAnchor="middle">
                {row.label}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}
