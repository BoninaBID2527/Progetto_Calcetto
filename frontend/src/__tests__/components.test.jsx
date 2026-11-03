import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LeaderboardRow } from '../components/ui';
import ClubCrest from '../components/club/ClubCrest';
import Kit from '../components/club/Kit';
import ActivityFeed from '../components/dashboard/ActivityFeed';
import { user } from '../test/render';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, nicknameMode: 'accanto' }) }));

const entry = (extra = {}) => ({ position: 1, user: user('u1', 'Marco Rossi'), detail: '3 MVP', display: '8,1', bar: 0.8, ...extra });
const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('LeaderboardRow e confronto con la stagione precedente', () => {
  test('senza confronto non mostra nessuna freccia', () => {
    inRouter(<ol><LeaderboardRow entry={entry()} /></ol>);
    expect(screen.queryByRole('img', { name: /stagione precedente/i })).toBeNull();
  });

  test('sale, scende e resta: etichetta accessibile con il numero di posizioni', () => {
    inRouter(
      <ol>
        <LeaderboardRow entry={entry({ position: 1, previousPosition: 4 })} />
        <LeaderboardRow entry={entry({ position: 5, previousPosition: 3, user: user('u2', 'Luca') })} />
        <LeaderboardRow entry={entry({ position: 2, previousPosition: 2, user: user('u3', 'Andrea') })} />
      </ol>
    );
    expect(screen.getByRole('img', { name: 'Sale di 3 posizioni rispetto alla stagione precedente' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Scende di 2 posizioni rispetto alla stagione precedente' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Stessa posizione della stagione precedente' })).toBeInTheDocument();
  });

  test('evidenzia la propria riga e mostra valore e dettaglio', () => {
    inRouter(<ol><LeaderboardRow entry={entry()} isMe /></ol>);
    const row = screen.getByRole('listitem');
    expect(row).toHaveClass('is-me');
    expect(within(row).getByText('8,1')).toBeInTheDocument();
    expect(within(row).getByText('3 MVP')).toBeInTheDocument();
  });
});

describe('stemma e maglie del club', () => {
  test('con lo stemma caricato mostra l\'immagine (decorativa)', () => {
    const { container } = render(<ClubCrest group={{ crestUrl: 'data:image/png;base64,AAAA', color: '#fff', emoji: '⚽' }} size={60} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(img).toHaveAttribute('alt', '');
  });

  test('senza stemma ripiega su simbolo e colore del gruppo', () => {
    const { container } = render(<ClubCrest group={{ crestUrl: null, color: '#2EE59D', emoji: '🦁' }} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('🦁')).toBeInTheDocument();
  });

  test('la maglia usa i colori scelti, con valori di ripiego, ed è descritta per gli screen reader', () => {
    const { container, rerender } = render(<Kit primary="#123456" secondary="#abcdef" label="Maglia chiara" />);
    expect(screen.getByRole('img', { name: 'Maglia chiara' })).toBeInTheDocument();
    expect(container.querySelector('path').getAttribute('fill')).toBe('#123456');
    rerender(<Kit label="Maglia scura" />);
    expect(container.querySelector('path').getAttribute('fill')).toBe('#F4F8F2');
  });
});

describe('feed attività', () => {
  const base = { id: 'a1', actor: null, target: user('u1', 'Marco Rossi'), match: null, pollId: null, createdAt: new Date().toISOString() };

  test('premio di partita e achievement con il testo giusto', () => {
    inRouter(
      <ActivityFeed
        items={[
          { ...base, id: 'a1', type: 'premio_partita', data: { label: 'Miglior portiere', winners: ['u1'] } },
          { ...base, id: 'a2', type: 'achievement', data: { label: 'Primo gol' } },
        ]}
      />
    );
    expect(screen.getByText(/Miglior portiere/)).toBeInTheDocument();
    expect(screen.getByText(/ha sbloccato «Primo gol»/)).toBeInTheDocument();
  });

  test('feed vuoto: messaggio invece di una lista vuota', () => {
    inRouter(<ActivityFeed items={[]} />);
    expect(screen.getByText(/Ancora nessuna attività/)).toBeInTheDocument();
  });
});
