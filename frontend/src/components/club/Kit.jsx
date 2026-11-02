/** Maglia disegnata in SVG con i colori del club (nessuna immagine esterna). */
export default function Kit({ primary, secondary, label, number = 10 }) {
  const body = primary || '#F4F8F2';
  const trim = secondary || '#111915';
  return (
    <svg className="kit" viewBox="0 0 120 120" role="img" aria-label={label}>
      <path d="M40 10 L20 20 L4 46 L24 58 L32 46 L32 108 L88 108 L88 46 L96 58 L116 46 L100 20 L80 10 C76 20 44 20 40 10 Z" fill={body} stroke="rgba(0,0,0,.35)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M40 10 C44 20 76 20 80 10" fill="none" stroke={trim} strokeWidth="5" strokeLinecap="round" />
      <path d="M4 46 L24 58 M116 46 L96 58" stroke={trim} strokeWidth="6" strokeLinecap="round" />
      <text x="60" y="76" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="30" fill={trim}>
        {number}
      </text>
    </svg>
  );
}
