import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { CardSkeleton, ErrorState } from '../components/ui';
import { useAppData } from '../context/AppDataContext';
import { useToast } from '../context/ToastContext';

export default function JoinByLink() {
  const { code } = useParams();
  const { data, error, loading } = useResource(() => api(`/groups/invite/${encodeURIComponent(code)}`), [code]);
  const { refreshGroups } = useAppData();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const invite = data?.invite;

  const join = async () => {
    setBusy(true);
    try {
      const { group } = await api('/groups/join', { method: 'POST', body: { code } });
      await refreshGroups();
      toast.success(`Benvenuto in ${group.name}!`);
      navigate(`/gruppi/${group.id}/partite`, { replace: true });
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <span className="eyebrow">Invito</span>
          <h1>Ti hanno convocato</h1>
        </div>
      </div>
      {loading && <CardSkeleton />}
      {error && <ErrorState error={error} />}
      {invite && (
        <section className="card group-tile" style={{ '--group-color': invite.color, maxWidth: 'none' }}>
          <span className="group-emoji" aria-hidden="true">
            {invite.emoji}
          </span>
          <div className="stack" style={{ gap: 6, flex: 1 }}>
            <h2>{invite.name}</h2>
            {invite.description && <p className="muted">{invite.description}</p>}
            <span className="muted">{invite.memberCount} membri</span>
          </div>
          {invite.alreadyMember ? (
            <Link className="btn btn-primary" to={`/gruppi/${invite.groupId}/partite`}>
              Ne fai già parte: vai al gruppo
            </Link>
          ) : (
            <button type="button" className="btn btn-primary btn-lg" onClick={join} disabled={busy}>
              Entra nel gruppo
            </button>
          )}
        </section>
      )}
    </div>
  );
}
