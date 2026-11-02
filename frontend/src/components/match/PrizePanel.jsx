import { useState } from 'react';
import Icon from '../Icon';
import PrizeArt from '../PrizeArt';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { Countdown } from '../ui';
import { formatDateTime } from '../../utils/format';

const CONFETTI_COLORS = ['#2EE59D', '#FF8A3D', '#FFD23F', '#4CC9F0', '#FF7AA2'];

export function Confetti() {
  return (
    <span className="confetti" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => (
        <i key={i} style={{ '--x': `${(i * 47) % 100}%`, '--d': `${(i % 7) * 120}ms`, '--c': CONFETTI_COLORS[i % CONFETTI_COLORS.length] }} />
      ))}
    </span>
  );
}

export default function PrizePanel({ match, voting, report, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!voting?.prize) return null;
  const { prize } = voting;
  const winners = prize.options.filter((o) => prize.winners.includes(o.key));
  const canVote = prize.open && voting.isPlayer && !prize.myVote;

  const vote = async (option) => {
    setBusy(true);
    try {
      const res = await api(`/matches/${match.id}/prize-vote`, { method: 'POST', body: { option } });
      onChange(res.voting);
      toast.success('Voto per il terzo tempo registrato!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" aria-labelledby="prize-title">
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <h2 id="prize-title" className="section-title">
          <Icon name="mug" /> Terzo tempo
        </h2>
        <span className="chip chip-orange">
          {prize.votedCount}/{prize.eligibleCount} hanno scelto
        </span>
      </div>

      {!prize.open && winners.length > 0 ? (
        <div className="ceremony" role="status">
          <Confetti />
          <span className="eyebrow" style={{ color: 'var(--c-orange-text)' }}>
            Premiazione
          </span>
          <div className="ceremony-art">
            {winners.map((w) => (
              <PrizeArt key={w.key} option={w} />
            ))}
          </div>
          <h3 style={{ fontSize: 'clamp(1.8rem, 1.3rem + 2vw, 2.6rem)', textTransform: 'uppercase' }}>
            {winners.map((w) => `${w.label} ${w.emoji}`).join(' e ')}
          </h3>
          <p className="muted">{winners.length > 1 ? 'Pari merito: si fa tutto, il gruppo è d\'accordo così.' : 'Il gruppo ha deciso. Si va!'}</p>
          {report?.loserPaysEnabled && match.result && (
            <p className="chip chip-yellow" style={{ fontSize: '0.92rem' }}>
              <Icon name="mug" /> {report.loserPays ? `Il primo giro lo offrono le ${report.loserPays}` : 'Pareggio: si fa alla romana'}
            </p>
          )}
        </div>
      ) : !prize.open ? (
        <p className="muted">Nessuno ha votato: ognuno a casa sua, stavolta.</p>
      ) : (
        <>
          {voting.mvp?.closesAt && (
            <p className="chip chip-orange" style={{ width: 'fit-content' }}>
              <Icon name="timer" /> Si vota fino a {formatDateTime(voting.mvp.closesAt)} · <Countdown to={voting.mvp.closesAt} label="Mancano" compact />
            </p>
          )}
          <p className="muted">{voting.isPlayer ? (prize.myVote ? 'Hai votato: aspettiamo gli altri.' : 'Dove si va dopo la partita? Un voto a testa.') : 'Votano i giocatori della partita.'}</p>
          <div className="prize-options" role="radiogroup" aria-label="Scegli il terzo tempo">
            {prize.options.map((o) => (
              <button key={o.key} type="button" role="radio" aria-checked={prize.myVote === o.key} className="prize-option" disabled={!canVote || busy} onClick={() => vote(o.key)}>
                <PrizeArt option={o} />
                <span>
                  {o.label} <span aria-hidden="true">{o.emoji}</span>
                </span>
                <span className="num" style={{ fontSize: '1.4rem' }} aria-label={`${o.votes} voti`}>
                  {o.votes}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
