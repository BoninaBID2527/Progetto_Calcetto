import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import BrandLogo from '../components/brand/BrandLogo';
import Icon from '../components/Icon';
import ConnectionIndicator, { ConnectionBanner } from '../components/ConnectionIndicator';
import { Avatar } from '../components/Avatar';
import { BottomSheet, IconButton } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useTheme } from '../context/ThemeContext';
import { navigationFor } from './navigation';

function GroupSwitch() {
  const { groups, activeGroup } = useAppData();
  const navigate = useNavigate();
  const location = useLocation();
  if (!groups?.length) return null;
  const onChange = (e) => {
    const id = e.target.value;
    if (id === '__all') return navigate('/gruppi');
    const section = location.pathname.match(/^\/gruppi\/[^/]+\/([a-z-]+)/)?.[1] || '';
    return navigate(`/gruppi/${id}${section ? `/${section}` : ''}`);
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

function Count({ value, label }) {
  if (!value) return null;
  return (
    <span className="badge-count" aria-label={label}>
      {value > 99 ? '99+' : value}
    </span>
  );
}

function SheetMenu({ items, onNavigate }) {
  return (
    <ul className="sheet-menu">
      {items.map((item) => (
        <li key={item.label}>
          <Link to={item.to} onClick={onNavigate}>
            <Icon name={item.icon} />
            <span style={{ flex: 1 }}>{item.label}</span>
            <Count value={item.badge} label={item.badgeLabel} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const { activeGroup, setActiveId, notifications } = useAppData();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const reduce = useReducedMotion();
  const groupMatch = useMatch('/gruppi/:groupId/*');
  const routeGroupId = groupMatch?.params.groupId;
  const [sheet, setSheet] = useState(null);

  useEffect(() => {
    if (routeGroupId) setActiveId(routeGroupId);
  }, [routeGroupId, setActiveId]);

  useEffect(() => setSheet(null), [location.pathname]);

  const nav = navigationFor(activeGroup, { unreadNotifications: notifications.unread, userId: user?.id });

  return (
    <div className="shell">
      <a href="#contenuto" className="skip-link">
        Vai al contenuto
      </a>

      <aside className="sidebar" aria-label="Navigazione principale">
        <BrandLogo to={nav.home} />
        <GroupSwitch />
        <div className="btn-row">
          {nav.create.map((c, i) => (
            <Link key={c.label} to={c.to} className={`btn ${i === 0 ? 'btn-primary' : ''}`} style={{ flex: 1 }}>
              <Icon name={c.icon} /> {c.short}
            </Link>
          ))}
        </div>
        <nav className="sidebar-nav" aria-label="Sezioni">
          {nav.sections.map((section) => (
            <div key={section.title} className="stack" style={{ gap: 4 }}>
              <span className="overline side-section">{section.title}</span>
              {section.items.map((item) => (
                <NavLink key={item.label} to={item.to} className="side-item" end={item.end}>
                  <Icon name={item.icon} />
                  {item.label}
                  <Count value={item.badge} label={item.badgeLabel} />
                </NavLink>
              ))}
            </div>
          ))}
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
            <IconButton icon="logout" label="Esci" onClick={logout} />
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <BrandLogo to={nav.home} className="logo-link" />
          <div className="mobile-only">
            <GroupSwitch />
          </div>
          <div className="topbar-actions">
            <span className="desktop-only">{activeGroup && <span className="muted">{activeGroup.memberCount} membri</span>}</span>
            <Link
              to="/notifiche"
              className="btn btn-ghost btn-icon"
              aria-label={`Notifiche${notifications.unread ? `, ${notifications.unread} non lette` : ''}`}
            >
              <Icon name="bell" />
              {notifications.unread > 0 && (
                <span className="badge-count btn-badge" aria-hidden="true">
                  {notifications.unread > 99 ? '99+' : notifications.unread}
                </span>
              )}
            </Link>
          </div>
        </header>
        <ConnectionBanner />
        <main id="contenuto" tabIndex={-1}>
          <motion.div
            key={location.pathname}
            className="page-enter"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navigazione principale">
        {nav.bottom.slice(0, 2).map((item) => (
          <NavLink key={item.label} to={item.to} className="nav-item" end={item.end}>
            <Icon name={item.icon} />
            {item.label}
            <Count value={item.badge} label={item.badgeLabel} />
          </NavLink>
        ))}
        <button type="button" className="nav-fab-button nav-fab" onClick={() => setSheet('create')} aria-haspopup="dialog">
          <span className="fab">
            <Icon name="plus" />
          </span>
          Crea
        </button>
        {nav.bottom.slice(2, 3).map((item) => (
          <NavLink key={item.label} to={item.to} className="nav-item" end={item.end}>
            <Icon name={item.icon} />
            {item.label}
            <Count value={item.badge} label={item.badgeLabel} />
          </NavLink>
        ))}
        <button type="button" className="nav-item" style={{ border: 0, background: 'none' }} onClick={() => setSheet('more')} aria-haspopup="dialog">
          <Icon name="more" />
          Altro
          <Count value={nav.moreBadge} label="Novità nelle altre sezioni" />
        </button>
      </nav>

      {sheet === 'create' && (
        <BottomSheet title="Cosa vuoi organizzare?" onClose={() => setSheet(null)}>
          <SheetMenu items={nav.create} onNavigate={() => setSheet(null)} />
        </BottomSheet>
      )}
      {sheet === 'more' && (
        <BottomSheet title="Tutte le sezioni" onClose={() => setSheet(null)}>
          <SheetMenu items={nav.more} onNavigate={() => setSheet(null)} />
        </BottomSheet>
      )}
    </div>
  );
}
