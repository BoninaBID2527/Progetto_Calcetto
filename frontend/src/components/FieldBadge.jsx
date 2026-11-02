import { getField } from '../config';

// Simboli dei campi: si scelgono per chiave in shared/app.config.json.
const SYMBOLS = {
  campanile: '<path d="M9 21V9l3-5 3 5v12M7 21h10M9 9h6M11 13a1 1 0 0 1 2 0v2h-2z"/>',
  asparago: '<path d="M12 21c0-5 .5-9 1-12M13 9c-2.2-.5-3-2.6-2-4.5L13 2l2 2.5c1 1.9.2 4-2 4.5zM11.4 6.4 13 7.4l1.6-1M12.6 14l2-1.5M12.3 17.5l-2-1.3"/>',
  castello: '<path d="M4 21V10h2V7h2v3h2V7h4v3h2V7h2v3h2v11zM10 21v-4a2 2 0 0 1 4 0v4"/>',
  stella: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  pallone: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5l4.3 3.1-1.6 5h-5.4l-1.6-5z"/>',
};

export function FieldSymbol({ symbol }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: SYMBOLS[symbol] || SYMBOLS.pallone }}
    />
  );
}

export default function FieldBadge({ fieldKey, size = 48 }) {
  const field = getField(fieldKey);
  return (
    <span className="field-badge" style={{ '--field-color': field.color, '--size': `${size}px` }} title={`Campo di ${field.name}`}>
      <FieldSymbol symbol={field.symbol} />
    </span>
  );
}
