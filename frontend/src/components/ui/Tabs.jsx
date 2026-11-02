import { useId } from 'react';
import Icon from '../Icon';

/**
 * Schede accessibili (tablist/tab/tabpanel, frecce sinistra e destra, Home e Fine).
 * Il pannello lo rende il chiamante dentro <TabPanel>.
 */
export function Tabs({ tabs, value, onChange, label, idBase }) {
  const auto = useId();
  const base = idBase || auto;
  const index = tabs.findIndex((t) => t.value === value);
  const onKey = (e) => {
    const map = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(e.key in map)) return;
    e.preventDefault();
    const next = (map[e.key] + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    document.getElementById(`${base}-tab-${tabs[next].value}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          id={`${base}-tab-${t.value}`}
          aria-selected={t.value === value}
          aria-controls={`${base}-panel`}
          tabIndex={t.value === value ? 0 : -1}
          className="tab"
          onClick={() => onChange(t.value)}
        >
          {t.icon && <Icon name={t.icon} />}
          {t.label}
          {t.badge > 0 && <span className="badge-count">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ idBase, value, children, className = '' }) {
  return (
    <div role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-tab-${value}`} className={className} tabIndex={0}>
      {children}
    </div>
  );
}
