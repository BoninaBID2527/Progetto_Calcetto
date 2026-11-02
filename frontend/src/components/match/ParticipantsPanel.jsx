import Icon from '../Icon';
import { Player } from '../Avatar';
import { formatEuro } from '../../utils/format';

function Section({ title, icon, people, render, empty }) {
  return (
    <div className="stack" style={{ gap: 'var(--space-2)' }}>
      <h3 className="row" style={{ gap: 8, fontSize: '1.05rem', textTransform: 'uppercase' }}>
        <Icon name={icon} /> {title} <span className="muted tabular">({people.length})</span>
      </h3>
      {people.length ? <ul className="people">{people.map(render)}</ul> : <p className="muted" style={{ fontSize: '0.9rem' }}>{empty}</p>}
    </div>
  );
}

export default function ParticipantsPanel({ match, meId, canManage, onPayment, busy }) {
  const by = (r) => match.participants.filter((p) => p.response === r);
  const confirmed = by('ci_sono');
  const waiting = by('attesa');
  const hasCost = match.costCents > 0;

  return (
    <section className="card stack" aria-labelledby="people-title">
      <div className="spread">
        <h2 id="people-title" className="section-title">
          <Icon name="users" /> Chi c'è
        </h2>
        {hasCost && match.quotaCents && (
          <span className="chip chip-yellow">
            <Icon name="wallet" /> {formatEuro(match.quotaCents)} a testa
          </span>
        )}
      </div>
      {hasCost && (
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          Campo {formatEuro(match.costCents)} · pagato da {match.paidCount} su {confirmed.length}
        </p>
      )}
      <Section
        title="Presenti"
        icon="check-circle"
        people={confirmed}
        empty="Nessuno per ora. Il primo che dice «ci sono» sceglie la maglia."
        render={(p, i) => {
          const mine = p.user.id === meId;
          const editable = hasCost && (mine || canManage);
          return (
            <li key={p.user.id} className={`people-enter ${mine ? 'is-me' : ''}`}>
              <span className="pos">{i + 1}</span>
              <span className="grow">
                <Player user={p.user} size={36} showRole sub={p.promotedAt ? "Entrato dalla lista d'attesa" : null} />
              </span>
              {hasCost &&
                (editable ? (
                  <button
                    type="button"
                    className={`btn btn-sm ${p.paid ? 'btn-primary' : ''}`}
                    aria-pressed={p.paid}
                    disabled={busy}
                    onClick={() => onPayment(p.user.id, !p.paid)}
                    aria-label={`${p.paid ? 'Pagato' : 'Da pagare'}: ${p.user.name}. Tocca per cambiare`}
                  >
                    {p.paid ? (
                      <>
                        <Icon name="check" /> Pagato
                      </>
                    ) : (
                      'Da pagare'
                    )}
                  </button>
                ) : (
                  <span className={`chip ${p.paid ? 'chip-primary' : ''}`}>{p.paid ? 'Pagato' : 'Da pagare'}</span>
                ))}
            </li>
          );
        }}
      />
      {(waiting.length > 0 || match.counts.ci_sono >= match.slots) && (
        <Section
          title="Lista d'attesa"
          icon="clock"
          people={waiting}
          empty="Vuota. Se i posti finiscono, chi arriva dopo si mette in fila qui."
          render={(p, i) => (
            <li key={p.user.id} className={`people-enter ${p.user.id === meId ? 'is-me' : ''}`}>
              <span className="pos">{i + 1}°</span>
              <span className="grow">
                <Player user={p.user} size={36} sub={i === 0 ? 'Il primo a entrare se si libera un posto' : null} />
              </span>
            </li>
          )}
        />
      )}
      <div className="grid-2" style={{ gap: 'var(--space-4)' }}>
        <Section
          title="Forse"
          icon="help"
          people={by('forse')}
          empty="Nessun indeciso."
          render={(p) => (
            <li key={p.user.id} className={p.user.id === meId ? 'is-me' : ''}>
              <Player user={p.user} size={32} />
            </li>
          )}
        />
        <Section
          title="Non ci sono"
          icon="x"
          people={by('non_ci_sono')}
          empty="Tutti disponibili, per ora."
          render={(p) => (
            <li key={p.user.id} className={p.user.id === meId ? 'is-me' : ''}>
              <Player user={p.user} size={32} />
            </li>
          )}
        />
      </div>
    </section>
  );
}
