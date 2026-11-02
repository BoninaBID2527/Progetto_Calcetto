import { useId } from 'react';

/**
 * Grafico a linee in SVG, responsive e accessibile: titolo collegato,
 * descrizione e tabella dei valori per i lettori di schermo.
 * `series`: [{ key, label, color, points: [{ x, y|null }] }]
 */
export default function LineChart({ title, description, series, yMin = 1, yMax = 10, xLabels = [], height = 220, format = (v) => v }) {
  const id = useId();
  const W = 640;
  const H = height;
  const pad = { l: 36, r: 12, t: 12, b: 28 };
  const count = Math.max(1, ...series.map((s) => s.points.length));
  const xAt = (i) => pad.l + (count === 1 ? (W - pad.l - pad.r) / 2 : (i / (count - 1)) * (W - pad.l - pad.r));
  const yAt = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const ticks = [yMin, (yMin + yMax) / 2, yMax];

  return (
    <figure className="chart" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="chart-title">
        {title}
        {description && <span className="muted"> · {description}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} preserveAspectRatio="none" className="chart-svg">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={yAt(v)} y2={yAt(v)} className="chart-grid" />
            <text x={pad.l - 8} y={yAt(v) + 4} className="chart-axis" textAnchor="end">
              {format(v)}
            </text>
          </g>
        ))}
        {series.map((s) => {
          const pts = s.points.map((p, i) => (p.y === null ? null : [xAt(i), yAt(p.y)])).filter(Boolean);
          return (
            <g key={s.key}>
              {pts.length > 1 && <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2 : 3} strokeDasharray={s.dashed ? '6 6' : undefined} vectorEffect="non-scaling-stroke" />}
              {!s.dashed && pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" fill={s.color} vectorEffect="non-scaling-stroke" />)}
            </g>
          );
        })}
        {xLabels.map((label, i) =>
          label ? (
            <text key={i} x={xAt(i)} y={H - 8} className="chart-axis" textAnchor="middle">
              {label}
            </text>
          ) : null
        )}
      </svg>
      <div className="chart-legend" aria-hidden="true">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Partita</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: count }, (_, i) => (
            <tr key={i}>
              <th scope="row">{xLabels[i] || i + 1}</th>
              {series.map((s) => (
                <td key={s.key}>{s.points[i]?.y ?? 'nessun voto'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
