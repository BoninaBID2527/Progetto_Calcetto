import { useAuth } from '../context/AuthContext';
import { initials, displayName } from '../utils/format';
import { roleLabel } from '../config';

export function Avatar({ user, size = 40, className = '' }) {
  if (!user) return null;
  return (
    <span className={`avatar ${className}`} style={{ '--size': `${size}px`, '--avatar-bg': user.avatarColor }} aria-hidden="true">
      {user.avatarUrl ? <img src={user.avatarUrl} alt="" loading="lazy" /> : initials(user.name)}
    </span>
  );
}

export function AvatarStack({ users, max = 5, size = 34, label }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <span className="avatar-stack" role="img" aria-label={label || `${users.length} persone`}>
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {extra > 0 && (
        <span className="avatar avatar-more" style={{ '--size': `${size}px` }} aria-hidden="true">
          +{extra}
        </span>
      )}
    </span>
  );
}

/** Nome con soprannome, secondo la preferenza di chi guarda. */
export function PlayerName({ user }) {
  const { nicknameMode } = useAuth();
  if (!user) return null;
  if (user.nickname && nicknameMode === 'sostituisci') {
    return (
      <span className="nickname" title={user.name}>
        {user.nickname}
      </span>
    );
  }
  return (
    <>
      {user.name}
      {user.nickname && <span className="nickname"> «{user.nickname}»</span>}
    </>
  );
}

export function playerLabel(user, mode) {
  if (!user) return '';
  return user.nickname && mode !== 'sostituisci' ? `${user.name} «${user.nickname}»` : displayName(user, mode);
}

export function Player({ user, sub, size = 40, showRole = false }) {
  const role = showRole ? roleLabel(user?.preferredRole) : null;
  return (
    <span className="player">
      <Avatar user={user} size={size} />
      <span className="player-text">
        <span className="player-name">
          <PlayerName user={user} />
        </span>
        {(sub || role) && <span className="player-sub">{sub || role}</span>}
      </span>
    </span>
  );
}
