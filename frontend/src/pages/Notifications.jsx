import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { EmptyState } from '../components/ui';
import { useAppData } from '../context/AppDataContext';
import { timeAgo } from '../utils/format';

const ICONS = {
  nuova_partita: 'calendar',
  promozione: 'check-circle',
  partita_chiusa: 'lock',
  partita_annullata: 'ban',
  risultato: 'flag',
  votazione_aperta: 'star',
  soprannome: 'tag',
  promemoria: 'clock',
};

export default function Notifications() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useAppData();
  const list = notifications.notifications;
  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <h1>Notifiche</h1>
          <p>{notifications.unread ? `${notifications.unread} da leggere.` : 'Sei in pari con tutto.'}</p>
        </div>
        {notifications.unread > 0 && (
          <button type="button" className="btn" onClick={markAllNotificationsRead}>
            <Icon name="check" /> Segna tutte come lette
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <EmptyState title="Nessuna notifica">Qui arrivano nuove partite, promozioni dalla lista d'attesa, risultati, votazioni e soprannomi.</EmptyState>
      ) : (
        <ul className="grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {list.map((n) => (
            <li key={n.id}>
              <Link to={n.link || '#'} className={`notif ${n.read ? '' : 'is-unread'}`} onClick={() => !n.read && markNotificationRead(n.id)}>
                <span className="icon-wrap">
                  <Icon name={ICONS[n.type] || 'bell'} />
                </span>
                <span className="stack" style={{ gap: 2 }}>
                  <strong>{n.title}</strong>
                  {n.body && <span className="muted" style={{ fontSize: '0.9rem' }}>{n.body}</span>}
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    {timeAgo(n.createdAt)}
                    {!n.read && <span className="visually-hidden"> · non letta</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
