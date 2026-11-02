// Illustrazioni del terzo tempo: stesso stile (sfondo tondo, contorno spesso, colori pieni).

function Beer() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle cx="60" cy="60" r="56" fill="#FFD23F" opacity="0.16" />
      <g stroke="#5A3A12" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M84 52h7a12 12 0 0 1 0 24h-7" fill="none" />
        <rect x="34" y="44" width="50" height="50" rx="8" fill="#FFB020" />
        <path d="M46 58v26M59 58v26M72 58v26" stroke="#D9860A" />
        <path d="M30 46c-5-11 7-19 15-14 4-9 19-9 23 0 7-5 19 0 17 13-7 4-48 6-55 1z" fill="#FFF8E6" />
      </g>
      <circle cx="52" cy="72" r="2.6" fill="#FFE8A3" />
      <circle cx="66" cy="80" r="2" fill="#FFE8A3" />
      <circle cx="62" cy="66" r="1.6" fill="#FFE8A3" />
    </svg>
  );
}

function Pizza() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle cx="60" cy="60" r="56" fill="#FF8A3D" opacity="0.16" />
      <g stroke="#8C4A12" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M20 36Q60 18 100 36L60 104z" fill="#FFC857" />
        <path d="M20 36Q60 18 100 36l-4 9Q60 29 24 45z" fill="#E0913A" />
        <circle cx="50" cy="56" r="7" fill="#E5484D" strokeWidth="3" />
        <circle cx="71" cy="62" r="6.5" fill="#E5484D" strokeWidth="3" />
        <circle cx="59" cy="82" r="5" fill="#E5484D" strokeWidth="3" />
        <path d="M40 66l4 3M77 47l-3 4M64 72l3-3" stroke="#2F8F46" strokeWidth="4" />
      </g>
    </svg>
  );
}

function Sandwich() {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <circle cx="60" cy="60" r="56" fill="#2EE59D" opacity="0.14" />
      <g stroke="#7A4A16" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M20 60c0-19 18-31 40-31s40 12 40 31z" fill="#F0B35B" />
        <path d="M17 64q10.5 9 21.5 0t21.5 0 21.5 0 21.5 0" fill="none" stroke="#3FA34D" strokeWidth="7" />
        <rect x="22" y="68" width="76" height="9" rx="4.5" fill="#E5484D" strokeWidth="3" />
        <rect x="19" y="78" width="82" height="8" rx="4" fill="#FFD23F" strokeWidth="3" />
        <path d="M22 88h76v3a11 11 0 0 1-11 11H33a11 11 0 0 1-11-11z" fill="#E3A24E" />
      </g>
      <g fill="#FFF3D6">
        <ellipse cx="44" cy="44" rx="3" ry="1.8" />
        <ellipse cx="60" cy="38" rx="3" ry="1.8" />
        <ellipse cx="76" cy="45" rx="3" ry="1.8" />
        <ellipse cx="56" cy="50" rx="3" ry="1.8" />
      </g>
    </svg>
  );
}

const ART = { birra: Beer, pizza: Pizza, panino: Sandwich };

/** Illustrazione del premio; per le opzioni extra del gruppo si usa la loro emoji. */
export default function PrizeArt({ option }) {
  const Art = ART[option.key];
  if (Art) return <Art />;
  return (
    <span className="emoji-art" aria-hidden="true">
      {option.emoji}
    </span>
  );
}
