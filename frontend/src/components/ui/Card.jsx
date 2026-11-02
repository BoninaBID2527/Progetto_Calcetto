import Icon from '../Icon';
import { CountUp } from './Numbers';

/**
 * Superficie di base. Varianti: "default", "elevated" (più in rilievo),
 * "feature" (striscia d'accento a sinistra), "glass" (traslucida, per le hero).
 */
export function Card({ as: Tag = 'section', variant = 'default', accent, className = '', children, ...rest }) {
  return (
    <Tag className={`card card-${variant} ${className}`} style={accent ? { '--card-accent': accent, ...rest.style } : rest.style} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ icon, title, eyebrow, action, id }) {
  return (
    <div className="card-title">
      <div className="stack" style={{ gap: 2 }}>
        {eyebrow && <span className="overline">{eyebrow}</span>}
        <h2 id={id} className="section-title">
          {icon && <Icon name={icon} />} {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

/**
 * Statistica in evidenza. `samples` e `minSamples` permettono di segnalare
 * quando il dato poggia su troppi pochi casi per essere significativo.
 */
export function StatCard({ label, value, format, suffix, hint, icon, tone = 'default', samples, minSamples }) {
  const tooFew = minSamples !== undefined && samples !== undefined && samples < minSamples;
  return (
    <div className={`stat-card stat-${tone}`}>
      <span className="overline">
        {icon && <Icon name={icon} />} {label}
      </span>
      <span className="stat-value">
        {value === null || value === undefined ? '—' : <CountUp value={value} format={format} />}
        {suffix && <small>{suffix}</small>}
      </span>
      {(hint || tooFew) && <span className="stat-hint">{tooFew ? `Dato provvisorio: ${samples} su ${minSamples} necessari` : hint}</span>}
    </div>
  );
}
