import ClubCrest from '../components/club/ClubCrest';
import { NavLink, Outlet, useParams, Link, useMatch } from 'react-router-dom';
import Icon from '../components/Icon';
import { CardSkeleton, EmptyState } from '../components/ui';
import { useAppData } from '../context/AppDataContext';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';

const TABS = [
  { to: '', label: 'Spogliatoio', icon: 'dashboard', end: true },
  { to: 'partite', label: 'Partite', icon: 'calendar' },
  { to: 'boncall', label: 'BONCALL', icon: 'boncall' },
  { to: 'classifiche', label: 'Classifiche', icon: 'trophy' },
  { to: 'chat', label: 'Chat', icon: 'chat' },
  { to: 'membri', label: 'Membri', icon: 'users' },
];

export default function GroupLayout() {
  const { groupId } = useParams();
  const { groups } = useAppData();
  const fromList = groups?.find((g) => g.id === groupId);
  const inChat = Boolean(useMatch('/gruppi/:groupId/chat'));
  // Se il gruppo non è nell'elenco chiedo al server: così 403 e 404 hanno un messaggio chiaro.
  const { error } = useResource(() => (groups && !fromList ? api(`/groups/${groupId}`) : Promise.resolve(null)), [groupId, Boolean(groups), Boolean(fromList)]);

  if (!groups) {
    return (
      <div className="page">
        <CardSkeleton />
      </div>
    );
  }
  if (!fromList) {
    return (
      <div className="page">
        <EmptyState
          title={error?.status === 403 ? 'Spogliatoio riservato' : 'Gruppo non trovato'}
          action={
            <Link to="/gruppi" className="btn btn-primary">
              I tuoi gruppi
            </Link>
          }
        >
          {error?.status === 403 ? 'Non fai parte di questo gruppo: chiedi il codice d\'invito a un membro.' : 'Il gruppo non esiste o sei stato rimosso.'}
        </EmptyState>
      </div>
    );
  }

  const group = fromList;
  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <header className="row" style={{ flexWrap: 'nowrap' }}>
        <ClubCrest group={group} size={52} />
        <div className="page-head-text">
          <h1 style={{ fontSize: 'clamp(1.6rem, 1.2rem + 1.6vw, 2.6rem)' }}>{group.name}</h1>
          {group.description && !inChat && (
            <p className="muted" style={{ fontSize: '0.92rem' }}>
              {group.description}
            </p>
          )}
        </div>
      </header>
      <nav className="tabs" aria-label="Sezioni del gruppo">
        {TABS.map((t) => (
          <NavLink key={t.label} to={t.to} className="tab" end={t.end}>
            <Icon name={t.icon} />
            {t.label}
            {t.to === 'chat' && group.unreadCount > 0 && <span className="badge-count" aria-label={`${group.unreadCount} non letti`}>{group.unreadCount}</span>}
          </NavLink>
        ))}
      </nav>
      <div style={{ margin: '0 calc(var(--gutter) * -1)' }}>
        <Outlet context={{ group }} />
      </div>
    </div>
  );
}
