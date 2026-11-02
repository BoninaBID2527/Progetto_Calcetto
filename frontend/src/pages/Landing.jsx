import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import FieldBadge from '../components/FieldBadge';
import PrizeArt from '../components/PrizeArt';
import { Avatar, AvatarStack } from '../components/Avatar';
import { SlotsBar } from '../components/ui';
import { APP_NAME, FIELDS, PRIZE_OPTIONS, TAGLINE } from '../config';
import { useTheme } from '../context/ThemeContext';

const demoPlayers = ['Marco Rossi', 'Luca Bianchi', 'Andrea Ferrero', 'Davide Gallo', 'Simone Rinaldi', 'Matteo Bruno', 'Paolo Ghigo', 'Fede Marino'].map(
  (name, i) => ({ id: `demo-${i}`, name, avatarColor: ['#2EE59D', '#FF8A3D', '#FFD23F', '#4CC9F0', '#C9A0FF', '#FF7AA2', '#B8E35A', '#5EEAD4'][i] })
);

const FEATURES = [
  { icon: 'check-circle', title: 'Ci sono, forse, non ci sono', text: "Iscrizioni in un tocco. Posti finiti? Lista d'attesa automatica: chi si ritira lascia il posto al primo in fila." },
  { icon: 'scale', title: 'Squadre bilanciate', text: 'Il pulsante Bilancia divide i giocatori in base ai voti ricevuti, con quel pizzico di casualità che non guasta.' },
  { icon: 'star', title: 'MVP e pagelle', text: "Dopo il fischio finale si vota l'MVP e si danno i voti ai compagni. Anonimi, come al bar." },
  { icon: 'mug', title: 'Terzo tempo', text: 'Birra, pizza o panino? Decide il gruppo, e se volete chi perde offre il primo giro.' },
  { icon: 'trophy', title: 'Classifiche vere', text: "I più forti, i più vincenti, i bomber e il club di chi non vince mai. Partita dopo partita." },
  { icon: 'chat', title: 'Chat dello spogliatoio', text: 'Messaggi in tempo reale, reazioni rapide e soprannomi che restano (se il diretto interessato è d\'accordo).' },
];

export default function Landing() {
  const { theme, toggle } = useTheme();
  return (
    <div className="landing">
      <header className="landing-top">
        <Logo />
        <div className="row">
          <button type="button" className="btn btn-ghost btn-icon" onClick={toggle} aria-label={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <Link to="/accedi" className="btn btn-ghost">
            Accedi
          </Link>
          <Link to="/registrati" className="btn btn-primary">
            Registrati
          </Link>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="stack" style={{ gap: 'var(--space-5)' }}>
            <span className="eyebrow">{TAGLINE}</span>
            <h1 id="hero-title">
              Chi c'è <em>giovedì?</em>
              <br />
              Lo sai in un attimo.
            </h1>
            <p className="hero-lead">
              {APP_NAME} organizza le partite di calcetto del tuo gruppo: iscrizioni, squadre equilibrate, risultato, MVP, terzo tempo e classifiche che si
              aggiornano da sole. Tutto dal telefono, tutto in tempo reale.
            </p>
            <div className="row">
              <Link to="/registrati" className="btn btn-primary btn-lg">
                Crea il tuo gruppo <Icon name="chevron-right" />
              </Link>
              <Link to="/accedi" className="btn btn-lg">
                Ho già un account
              </Link>
            </div>
            <div className="row" aria-label="I campi disponibili">
              {FIELDS.map((f) => (
                <span key={f.key} className="chip">
                  <FieldBadge fieldKey={f.key} size={22} /> {f.name}
                </span>
              ))}
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="card match-card" style={{ '--field-color': FIELDS[1].color }}>
              <div className="match-card-head">
                <FieldBadge fieldKey={FIELDS[1].key} />
                <div className="grow">
                  <div className="match-field-name">{FIELDS[1].name}</div>
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    {FIELDS[1].town}
                  </span>
                </div>
                <span className="status status-aperta">Iscrizioni aperte</span>
              </div>
              <div className="match-when">
                <span className="match-day">Giovedì</span>
                <span className="match-time">21:00</span>
                <span className="kv">
                  <Icon name="euro" /> 6,00 € a testa
                </span>
              </div>
              <SlotsBar taken={8} slots={10} />
              <div className="match-card-foot">
                <AvatarStack users={demoPlayers} />
                <span className="btn btn-in">Ci sono</span>
              </div>
            </div>
            <div className="card">
              <div className="spread">
                <span className="eyebrow">MVP della serata</span>
                <Icon name="star" />
              </div>
              <div className="player" style={{ marginTop: 12 }}>
                <Avatar user={demoPlayers[1]} size={52} />
                <span className="player-text">
                  <span className="player-name" style={{ fontSize: '1.2rem' }}>
                    Luca Bianchi <span className="nickname">«Cesarini»</span>
                  </span>
                  <span className="player-sub">Doppietta all'ultimo minuto · 6 voti</span>
                </span>
              </div>
            </div>
            <div className="card ceremony" style={{ padding: 'var(--space-4)' }}>
              <div className="ceremony-art">
                {PRIZE_OPTIONS.map((p) => (
                  <PrizeArt key={p.key} option={p} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="features" aria-label="Cosa puoi fare">
          {FEATURES.map((f) => (
            <article key={f.title} className="card feature">
              <span className="icon-wrap">
                <Icon name={f.icon} />
              </span>
              <h3>{f.title}</h3>
              <p className="muted">{f.text}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="landing-foot">
        <span>
          {APP_NAME} · fatto per chi gioca a calcetto con gli amici. Nessuna pubblicità, nessun tifo organizzato.
        </span>
      </footer>
    </div>
  );
}
