import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import ConnectionIndicator, { ConnectionBanner } from '../components/ConnectionIndicator';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useTheme } from '../context/ThemeContext';

function GroupSwitch() {
  const { groups, activeGroup } = useAppData();
  const navigate = useNavigate();
  const location = useLocation();
  if (!groups?.length) return null;
  const onChange = (e) => {
    const id = e.target.value;
    if (id === '__all') return navigate('/gruppi');
    const section = location.pathname.match(/^\/gruppi\/[^/]+\/(partite|classifiche|chat|membri)/)?.[1] || 'partite';
    return navigate(`/gruppi/${id}/${section}`);
  };
  return (
    <div className="group-switch">
      <label htmlFor="group-switch" className="visually-hidden">
        Gruppo attivo
      </label>
      <select id="group-switch" value={activeGroup?.id || ''} onChange={onChange}>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.emoji} {g.name}
          </option>
        ))}
        <option value="__all">Tutti i gruppi…</option>
      </select>
    </div>
  );
}

function useNavItems() {
  const { activeGroup } = useAppData();
  const base = activeGroup ? `/gruppi/${activeGroup.id}` : '/gruppi';
  const unread = activeGroup?.unreadCount || 0;
  return {
    base,
    hasGroup: Boolean(activeGroup),
    items: [
      { to: activeGroup ? `${base}/partite` : '/gruppi', label: 'Partite', icon: 'calendar' },
      { to: activeGroup ? `${base}/classifiche` : '/gruppi', label: 'Classifiche', icon: 'trophy' },
      { to: activeGroup ? `${base}/chat` : '/gruppi', label: 'Chat', icon: 'chat', badge: unread },
      { to: activeGroup ? `${base}/membri` : '/gruppi', label: 'Gruppo', icon: 'shield' },
      { to: '/profilo', label: 'Profilo', icon: 'user' },
    ],
  };
}

function Badge({ count, label }) {
  if (!count) return null;
  return (
    <span className="badge-count" aria-label={label}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { activeGroup, setActiveId, notifications } = useAppData();
  const { theme, toggle } = useTheme();
  const groupMatch = useMatch('/gruppi/:groupId/*');
  const { items, base, hasGroup } = useNavItems();
  const navigate = useNavigate();
  const routeGroupId = groupMatch?.params.groupId;

  useEffect(() => {
    if (routeGroupId) setActiveId(routeGroupId);
  }, [routeGroupId, setActiveId]);

  const newMatch = hasGroup ? `${base}/nuova-partita` : '/gruppi';
  const unreadNotes = notifications.unread;

  return (
    <div className="shell">
      <a href="#contenuto" className="skip-link">
        Vai al contenuto
      </a>

      <aside className="sidebar" aria-label="Navigazione principale">
        <Logo to={hasGroup ? `${base}/partite` : '/gruppi'} />
        <GroupSwitch />
        <Link to={newMatch} className="btn btn-primary btn-block">
          <Icon name="plus" /> Nuova partita
        </Link>
        <nav className="sidebar-nav" aria-label="Sezioni">
          {items.map((item) => (
            <NavLink key={item.label} to={item.to} className="side-item" end={item.to === '/gruppi'}>
              <Icon name={item.icon} />
              {item.label}
              <Badge count={item.badge} label={`${item.badge} messaggi non letti`} />
            </NavLink>
          ))}
          <NavLink to="/notifiche" className="side-item">
            <Icon name="bell" />
            Notifiche
            <Badge count={unreadNotes} label={`${unreadNotes} notifiche non lette`} />
          </NavLink>
          <NavLink to="/gruppi" className="side-item" end>
            <Icon name="home" />
            Tutti i gruppi
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <ConnectionIndicator />
          <button type="button" className="btn btn-ghost" onClick={toggle} aria-pressed={theme === 'light'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            {theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
          </button>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Link to="/profilo" className="player" style={{ color: 'inherit', textDecoration: 'none', flex: 1, minWidth: 0 }}>
              <Avatar user={user} size={38} />
              <span className="player-text">
                <span className="player-name">{user?.name}</span>
                <span className="player-sub">Il tuo profilo</span>
              </span>
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label="Esci"
              title="Esci"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <Logo to={hasGroup ? `${base}/partite` : '/gruppi'} className="logo-link" />
          <div className="mobile-only">
            <GroupSwitch />
          </div>
          <div className="topbar-actions">
            <span className="desktop-only">{activeGroup && <span className="muted">{activeGroup.memberCount} membri</span>}</span>
            <Link to="/notifiche" className="btn btn-ghost btn-icon" aria-label={`Notifiche${unreadNotes ? `, ${unreadNotes} non lette` : ''}`} style={{ position: 'relative' }}>
              <Icon name="bell" />
              {unreadNotes > 0 && (
                <span className="badge-count" style={{ position: 'absolute', top: 2, right: 0 }} aria-hidden="true">
                  {unreadNotes > 99 ? '99+' : unreadNotes}
                </span>
              )}
            </Link>
          </div>
        </header>
        <ConnectionBanner />
        <main id="contenuto" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navigazione principale">
        {items.slice(0, 2).map((item) => (
          <NavLink key={item.label} to={item.to} className="nav-item">
            <Icon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
        <Link to={newMatch} className="nav-fab" aria-label="Nuova partita">
          <span className="fab">
            <Icon name="plus" />
          </span>
          Nuova
        </Link>
        {items.slice(2).map((item) => (
          <NavLink key={item.label} to={item.to} className="nav-item">
            <Icon name={item.icon} />
            {item.label}
            {item.badge > 0 && (
              <span className="badge-count" aria-label={`${item.badge} messaggi non letti`}>
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
