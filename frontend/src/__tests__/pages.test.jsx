import { beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { group, renderInGroup, user } from '../test/render';

vi.mock('../api/client', () => ({ api: vi.fn(), getToken: () => 'token', setToken: () => {}, ApiError: class ApiError extends Error {} }));
vi.mock('../context/RealtimeContext', () => ({ useRealtimeEvent: () => {}, useOnReconnect: () => {}, useRealtime: () => ({ connected: true }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Marco Rossi' }, nicknameMode: 'accanto' }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../context/AppDataContext', () => ({ useAppData: () => ({ groups: [{ id: 'g1', name: 'Calcetto del giovedì', emoji: '⚽', color: '#2EE59D' }], refreshGroups: vi.fn(), activeGroup: null }) }));

const { api } = await import('../api/client');
const { default: GroupRankings } = await import('../pages/GroupRankings');
const { default: HallOfFame } = await import('../pages/HallOfFame');
const { default: ThirdHalf } = await import('../pages/ThirdHalf');
const { default: Wrapped } = await import('../pages/Wrapped');
const { default: Calendar } = await import('../pages/Calendar');
const { default: Club } = await import('../pages/Club');

const marco = user('u1', 'Marco Rossi', { nickname: 'Il Sindaco' });
const ranking = (key, title, entries, extra = {}) => ({ key, title, note: 'Come si calcola questa classifica nel dettaglio.', requirement: 'Almeno 3 partite.', minMatches: 3, available: entries.length > 0, unavailableReason: entries.length ? null : 'Nessuno soddisfa ancora il requisito: almeno 3 valutazioni DIF.', entries, ...extra });
const entry = (u, position, display, extra = {}) => ({ user: u, position, display, detail: 'dettaglio', bar: 0.5, played: 5, previousPosition: null, ...extra });

const routes = (map) =>
  api.mockImplementation(async (path) => {
    for (const [prefix, value] of Object.entries(map)) if (path.startsWith(prefix)) return typeof value === 'function' ? value(path) : value;
    throw new Error(`Richiesta non prevista nel test: ${path}`);
  });

beforeEach(() => {
  api.mockReset();
});

describe('Classifiche', () => {
  const data = (extra = {}) => ({
    period: 'sempre',
    season: null,
    previous: null,
    totalMatches: 8,
    hasScorers: true,
    minMatches: 3,
    rankings: [
      ranking('forti', 'I più forti', [entry(marco, 1, '8,1', { previousPosition: 3 })]),
      ranking('difensore', 'Miglior difensore', []),
    ],
    ...extra,
  });
  const setup = (rankings = data()) => routes({ '/groups/g1/rankings': rankings, '/groups/g1/prize-stats': { prizes: [{ key: 'pizza', label: 'Pizza', emoji: '🍕', count: 3 }] }, '/groups/g1/seasons': { seasons: [{ key: '2025-26', label: 'Stagione 2025/26', closed: true, current: false }, { key: '2026-27', label: 'Stagione 2026/27', closed: false, current: true }] } });

  test('mostra lo scheletro e poi le classifiche con la variazione di posizione', async () => {
    setup();
    renderInGroup(<GroupRankings />);
    expect(await screen.findByRole('heading', { name: 'I più forti' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Sale di 2 posizioni/ })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  test('una classifica senza requisiti soddisfatti spiega il motivo invece di restare vuota', async () => {
    setup();
    renderInGroup(<GroupRankings />);
    await userEvent.click(await screen.findByRole('tab', { name: /Miglior difensore/ }));
    expect(screen.getByText('Classifica non disponibile')).toBeInTheDocument();
    expect(screen.getByText(/almeno 3 valutazioni DIF/)).toBeInTheDocument();
  });

  test('il selettore del periodo include le stagioni passate e ricarica con la stagione scelta', async () => {
    setup();
    renderInGroup(<GroupRankings />);
    const select = await screen.findByLabelText('Periodo');
    expect(within(select).getByRole('option', { name: 'Stagione 2025/26' })).toBeInTheDocument();
    await userEvent.selectOptions(select, 'season:2025-26');
    await waitFor(() => expect(api).toHaveBeenCalledWith(expect.stringContaining('/rankings?season=2025-26')));
  });

  test('errore di rete: messaggio e pulsante per riprovare', async () => {
    api.mockRejectedValue(Object.assign(new Error('Connessione assente: controlla la rete e riprova.'), { status: 0 }));
    renderInGroup(<GroupRankings />);
    expect(await screen.findByText(/Connessione assente/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /riprova/i })).toBeInTheDocument();
  });
});

describe('Hall of Fame', () => {
  test('senza partite: stato vuoto', async () => {
    routes({ '/groups/g1/hall-of-fame': { hallOfFame: { totalMatches: 0, seasons: [], records: [], mostAwarded: [] } } });
    renderInGroup(<HallOfFame />);
    expect(await screen.findByText('Ancora nessun record')).toBeInTheDocument();
  });

  test('record non disponibili dichiarati come tali, i pari merito lunghi accorciati', async () => {
    const many = Array.from({ length: 5 }, (_, i) => user(`p${i}`, `Giocatore ${i}`));
    routes({
      '/groups/g1/hall-of-fame': {
        hallOfFame: {
          totalMatches: 9,
          seasons: [],
          records: [
            { key: 'presenze', title: 'Più presenze', value: '9', available: true, users: many },
            { key: 'gol_partita', title: 'Più gol in una partita', value: null, available: false, users: [] },
          ],
          mostAwarded: [{ user: marco, mvp: 2, awards: 1, seasonTitles: 0, total: 3 }],
        },
      },
    });
    renderInGroup(<HallOfFame />);
    expect(await screen.findByText('Dati non ancora sufficienti')).toBeInTheDocument();
    expect(screen.getByText('a pari merito con altri 2')).toBeInTheDocument();
    expect(screen.getByText(/nessuna stagione è ancora conclusa/i)).toBeInTheDocument();
  });
});

describe('Terzo tempo', () => {
  test('nessuna votazione conclusa: stato vuoto con spiegazione', async () => {
    routes({ '/groups/g1/seasons': { seasons: [] }, '/groups/g1/third-half': { thirdHalf: { open: [], history: [], hasMore: false, season: null, loserPaysFirstRound: false, stats: { polls: 0, options: [], mostChosen: [] } } } });
    renderInGroup(<ThirdHalf />);
    expect(await screen.findByText('Nessun terzo tempo concluso')).toBeInTheDocument();
  });

  test('"chi perde offre" compare solo come gesto facoltativo, senza importi', async () => {
    const pizza = { key: 'pizza', label: 'Pizza', emoji: '🍕', wins: 1, votes: 3, share: 1 };
    routes({
      '/groups/g1/seasons': { seasons: [] },
      '/groups/g1/third-half': {
        thirdHalf: {
          open: [],
          season: null,
          loserPaysFirstRound: true,
          hasMore: false,
          stats: { polls: 1, pollsWithVotes: 1, totalVotes: 3, participationRate: 0.75, options: [pizza], mostChosen: [pizza], streak: null },
          history: [{ matchId: 'm1', startsAt: '2026-10-01T19:00:00Z', fieldName: 'Santena', score: 'Chiare 3 - 1 Scure', winners: [pizza], options: [{ ...pizza, votes: 3 }], votedCount: 3, eligibleCount: 4, loserTeam: 'Scure', draw: false }],
        },
      },
    });
    renderInGroup(<ThirdHalf />);
    expect(await screen.findByText(/facoltativo scelto dal gruppo/)).toBeInTheDocument();
    expect(screen.getByText(/non registra importi né debiti/)).toBeInTheDocument();
    expect(screen.getByText(/il primo giro, se va, tocca alle Scure/)).toBeInTheDocument();
  });
});

describe('BONWRAPPED', () => {
  test('dati insufficienti: messaggio con il motivo e nessuna schermata di numeri', async () => {
    routes({ '/groups/g1/seasons': { seasons: [] }, '/groups/g1/wrapped': { wrapped: { enough: false, played: 1, user: marco, reason: 'Servono almeno 3 partite giocate: finora 1.' } } });
    renderInGroup(<Wrapped />);
    expect(await screen.findByText('Non ci sono ancora abbastanza dati')).toBeInTheDocument();
    expect(screen.getByText(/finora 1/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Condividi questa schermata/ })).toBeNull();
  });

  test('con dati: schermate navigabili con il pulsante e con la tastiera', async () => {
    const w = {
      enough: true,
      user: marco,
      season: null,
      summary: { played: 12, wins: 8, draws: 2, losses: 2, winRate: 0.667, goals: null, goalsMatches: 0, mvp: 0, avgRating: null, ratingsCount: 0, firstMatchAt: '2026-09-03T19:00:00Z', lastMatchAt: '2026-11-01T19:00:00Z' },
      bestMatch: null, moments: [], rivalry: null, partner: null, awards: { mvp: 0, matchAwards: [] }, achievements: [], progression: null, records: {}, standings: [],
    };
    routes({ '/groups/g1/seasons': { seasons: [] }, '/groups/g1/wrapped': { wrapped: w } });
    renderInGroup(<Wrapped />);
    expect(await screen.findByText('Il tuo BONWRAPPED')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Schermata successiva' }));
    expect(await screen.findByText('partite giocate')).toBeInTheDocument();
    expect(screen.getByText(/8 vittorie/)).toBeInTheDocument();
    await userEvent.keyboard('{ArrowLeft}');
    expect(await screen.findByText('Il tuo BONWRAPPED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schermata precedente' })).toBeDisabled();
  });
});

describe('Calendario', () => {
  const item = { type: 'partita', id: 'm1', groupId: 'g1', groupName: 'Calcetto del giovedì', groupColor: '#2EE59D', timezone: 'Europe/Rome', date: '2026-11-05', startsAt: '2026-11-05T20:00:00Z', field: 'santena', fieldName: 'Santena', status: 'aperta', slots: 10, confirmed: 6, myResponse: 'ci_sono', recurring: true, link: '/partite/m1' };

  test('griglia del mese con giorni e legenda; il giorno scelto elenca le partite', async () => {
    routes({ '/calendar?': { items: [item], groups: [], from: '', to: '' }, '/groups/g1/series': { series: [] }, '/groups/g1/availability': { days: {} } });
    renderInGroup(<Calendar />);
    const grid = await screen.findByRole('grid');
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(42);
    await userEvent.click(within(grid).getByRole('gridcell', { name: /giovedì 5 novembre: 1 evento/ }));
    const link = await screen.findByRole('link', { name: /Santena/ });
    expect(link).toHaveAttribute('href', '/partite/m1');
    expect(screen.getByText(/ricorrente/)).toBeInTheDocument();
  });

  test('scelto un gruppo compaiono disponibilità e ricorrenze; il filtro ricarica con il gruppo', async () => {
    routes({ '/calendar?': { items: [], groups: [], from: '', to: '' }, '/groups/g1/series': { series: [{ id: 's1', active: true, weekdayLabel: 'giovedì', time: '21:00', field: 'santena', slots: 10, upcoming: 4 }] }, '/groups/g1/availability': { days: {} } });
    renderInGroup(<Calendar />);
    await userEvent.selectOptions(await screen.findByLabelText('Gruppo'), 'g1');
    expect(await screen.findByText('Ogni giovedì alle 21:00')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(expect.stringContaining('group=g1'));
    expect(screen.getByRole('radiogroup', { name: /Disponibilità per/ })).toBeInTheDocument();
  });

  test('vista "Prossime" senza eventi: stato vuoto', async () => {
    routes({ '/calendar?': { items: [], groups: [], from: '', to: '' } });
    renderInGroup(<Calendar />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Prossime' }));
    expect(await screen.findByText('Niente in programma')).toBeInTheDocument();
  });
});

describe('Club', () => {
  const club = (over = {}) => ({
    club: {
      identity: { ...group, coverUrl: null, kits: group.kits, secondaryColor: null, motto: 'Sempre un tempo in più', description: 'Il giovedì sera' },
      stats: { matches: 0, goals: 0, goalsPerMatch: null, members: 4, since: '2026-09-01T00:00:00Z', mvpAwarded: 0, activeSeason: null, topScorer: null, mostPresent: null, mostMvp: null, ...over },
    },
  });

  test('motto, statistiche vuote dichiarate e fallback grafico dello stemma', async () => {
    routes({ '/groups/g1/club': club() });
    renderInGroup(<Club />);
    expect(await screen.findByText('«Sempre un tempo in più»')).toBeInTheDocument();
    expect(screen.getAllByText('Dati non ancora disponibili')).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Maglia chiara' })).toBeInTheDocument();
  });

  test('l\'editor è solo per gli admin e rifiuta lato client un file SVG', async () => {
    routes({ '/groups/g1/club': club() });
    const { unmount } = renderInGroup(<Club />, { ctx: { group: { ...group, myRole: 'member' } } });
    await screen.findByText('«Sempre un tempo in più»');
    expect(screen.queryByText('Personalizza il club')).toBeNull();
    unmount();

    routes({ '/groups/g1/club': club() });
    renderInGroup(<Club />);
    await screen.findByText('Personalizza il club');
    const input = document.getElementById('up-crest');
    await userEvent.upload(input, new File(['<svg></svg>'], 'logo.svg', { type: 'image/svg+xml' }), { applyAccept: false });
    expect(await screen.findByText(/niente SVG/)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalledWith(expect.stringContaining('/club/crest'), expect.anything());
  });
});
