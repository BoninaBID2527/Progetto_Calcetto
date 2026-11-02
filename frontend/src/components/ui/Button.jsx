import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../Icon';

const cls = (variant, size, block, extra) =>
  ['btn', variant && variant !== 'secondary' ? `btn-${variant}` : '', size ? `btn-${size}` : '', block ? 'btn-block' : '', extra || ''].filter(Boolean).join(' ');

/**
 * Pulsante del design system. `to` lo trasforma in link di navigazione,
 * `loading` lo disattiva mostrando lo stato di attesa.
 */
export const Button = forwardRef(function Button(
  { variant = 'secondary', size, block, icon, iconRight, loading, to, className, children, type = 'button', disabled, ...rest },
  ref
) {
  const content = (
    <>
      {icon && <Icon name={loading ? 'refresh' : icon} className={loading ? 'spin' : undefined} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </>
  );
  if (to) {
    return (
      <Link ref={ref} to={to} className={cls(variant, size, block, className)} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={cls(variant, size, block, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
});

/** Pulsante con sola icona: l'etichetta accessibile è obbligatoria. */
export const IconButton = forwardRef(function IconButton({ icon, label, variant = 'ghost', size, className, badge, ...rest }, ref) {
  return (
    <button ref={ref} type="button" className={cls(variant, size, false, `btn-icon ${className || ''}`)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
      {badge > 0 && (
        <span className="badge-count btn-badge" aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
});
