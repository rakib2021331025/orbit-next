/**
 * A plain SVG line chart, from assets/js/visitor-charts.js.
 *
 * Server-rendered inline SVG, no charting library and no CDN: the original drew
 * its own charts for exactly that reason, and a report page should not depend on
 * a script loading.
 *
 * Every chart is followed by its data table on the page, so the figures are
 * readable whatever happens to the drawing.
 */

export interface Series {
  name: string;
  /** One value per label. */
  values: number[];
  /** A CSS colour. */
  colour: string;
}

export function LineChart({
  labels,
  series,
  ariaLabel,
  height = 220,
}: {
  labels: string[];
  series: Series[];
  ariaLabel: string;
  height?: number;
}) {
  const width = 720;
  const padding = { top: 12, right: 12, bottom: 26, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const highest = Math.max(1, ...series.flatMap((row) => row.values));
  // A round top makes the axis readable: 1, 2, 5 × a power of ten.
  const step = (() => {
    const rough = highest / 4;
    const power = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
    for (const factor of [1, 2, 5, 10]) {
      if (power * factor >= rough) return power * factor;
    }
    return power * 10;
  })();
  const top = Math.ceil(highest / step) * step;

  const x = (index: number) =>
    padding.left + (labels.length <= 1 ? innerWidth / 2 : (index * innerWidth) / (labels.length - 1));
  const y = (value: number) => padding.top + innerHeight - (value / top) * innerHeight;

  const gridLines = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
  // At most a dozen labels on the axis, whatever the range.
  const labelEvery = Math.max(1, Math.ceil(labels.length / 12));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      className="h-56 w-full"
      preserveAspectRatio="none"
    >
      {gridLines.map((value) => (
        <g key={value}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={y(value)}
            y2={y(value)}
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeWidth={1}
          />
          <text
            x={padding.left - 6}
            y={y(value) + 4}
            textAnchor="end"
            fontSize={10}
            fill="currentColor"
            fillOpacity={0.6}
          >
            {value}
          </text>
        </g>
      ))}

      {labels.map((label, index) =>
        index % labelEvery === 0 ? (
          <text
            key={`${label}-${index}`}
            x={x(index)}
            y={height - 8}
            textAnchor="middle"
            fontSize={10}
            fill="currentColor"
            fillOpacity={0.6}
          >
            {label}
          </text>
        ) : null
      )}

      {series.map((row) => (
        <g key={row.name}>
          <polyline
            points={row.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')}
            fill="none"
            stroke={row.colour}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {row.values.map((value, index) => (
            <circle
              key={`${row.name}-${index}`}
              cx={x(index)}
              cy={y(value)}
              r={2.5}
              fill={row.colour}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** The legend above a chart. */
export function ChartLegend({ series }: { series: Series[] }) {
  return (
    <p className="mb-2 flex flex-wrap gap-4 text-xs text-ink-muted">
      {series.map((row) => (
        <span key={row.name} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: row.colour }}
          />
          {row.name}
        </span>
      ))}
    </p>
  );
}
