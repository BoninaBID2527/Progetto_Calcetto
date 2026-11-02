import { Avatar } from './Avatar';
import { useAuth } from '../context/AuthContext';
import { displayName } from '../utils/format';

const ROLE_ORDER = { portiere: 0, difensore: 1, centrocampista: 2, attaccante: 3 };

/** Righe della formazione: il portiere (se c'è) in porta, gli altri su linee da 2 o 3. */
function formation(players) {
  const sorted = [...players].sort((a, b) => (ROLE_ORDER[a.preferredRole] ?? 2.5) - (ROLE_ORDER[b.preferredRole] ?? 2.5));
  const rows = [];
  let rest = sorted;
  if (sorted[0]?.preferredRole === 'portiere') {
    rows.push([sorted[0]]);
    rest = sorted.slice(1);
  }
  // Calcetto: linee da 2 (1-2-2) finché la squadra è piccola, da 3 per i numeri più alti.
  const perLine = rest.length <= 6 ? 2 : 3;
  const lines = Math.max(1, Math.ceil(rest.length / perLine));
  const base = Math.floor(rest.length / lines);
  let extra = rest.length % lines;
  let i = 0;
  for (let l = 0; l < lines; l++) {
    const size = base + (extra-- > 0 ? 1 : 0);
    rows.push(rest.slice(i, i + size));
    i += size;
  }
  return rows.filter((r) => r.length);
}

/** Posizioni in percentuale: verticale (mobile) e orizzontale (desktop). */
function positions(players, side) {
  const rows = formation(players);
  const out = [];
  rows.forEach((row, r) => {
    const depth = rows.length === 1 ? 0.5 : r / (rows.length - 1);
    const fromGoal = 9 + depth * 32; // dal 9% al 41% della metà campo
    row.forEach((p, k) => {
      const spread = (k + 1) / (row.length + 1);
      const v = side === 'a' ? fromGoal : 100 - fromGoal;
      out.push({ player: p, vx: spread * 100, vy: v, hx: v, hy: spread * 100 });
    });
  });
  return out;
}

function Lines({ horizontal }) {
  if (horizontal) {
    return (
      <svg className="pitch-lines desktop-pitch" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="0.8">
          <rect x="4" y="4" width="152" height="92" rx="2" />
          <path d="M80 4v92" />
          <circle cx="80" cy="50" r="12" />
          <rect x="4" y="30" width="18" height="40" />
          <rect x="138" y="30" width="18" height="40" />
        </g>
      </svg>
    );
  }
  return (
    <svg className="pitch-lines mobile-pitch" viewBox="0 0 75 100" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="0.7">
        <rect x="3" y="3" width="69" height="94" rx="2" />
        <path d="M3 50h69" />
        <circle cx="37.5" cy="50" r="9" />
        <rect x="20" y="3" width="35" height="13" />
        <rect x="20" y="84" width="35" height="13" />
      </g>
    </svg>
  );
}

export default function Pitch({ teams, drawing = false, badges = null }) {
  const { nicknameMode } = useAuth();
  if (!teams) return null;
  const placed = [...positions(teams.a.players, 'a').map((p) => ({ ...p, team: 'a' })), ...positions(teams.b.players, 'b').map((p) => ({ ...p, team: 'b' }))];
  return (
    <div
      className={`pitch ${drawing ? 'is-drawing' : ''}`}
      role="img"
      aria-label={`${teams.a.name}: ${teams.a.players.map((p) => p.name).join(', ')}. ${teams.b.name}: ${teams.b.players.map((p) => p.name).join(', ')}.`}
    >
      <Lines />
      <Lines horizontal />
      <span className="team-label a">{teams.a.name}</span>
      <span className="team-label b">{teams.b.name}</span>
      {placed.map((p, i) => (
        <div
          key={`${p.team}-${p.player.id}`}
          className="pitch-player"
          style={{
            '--i': i,
            '--team-color': p.team === 'a' ? '#F2F7F4' : '#0B1F1A',
            '--vx': `${p.vx}%`,
            '--vy': `${p.vy}%`,
            '--hx': `${p.hx}%`,
            '--hy': `${p.hy}%`,
          }}
        >
          <span className="pitch-avatar">
            <Avatar user={p.player} size={44} />
            {badges?.[p.player.id] && <span className="pitch-badge">{badges[p.player.id]}</span>}
          </span>
          <span className="tag">{displayName(p.player, nicknameMode === 'sostituisci' ? 'sostituisci' : 'accanto')}</span>
        </div>
      ))}
    </div>
  );
}
