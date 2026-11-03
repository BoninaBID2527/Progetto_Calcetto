import { describe, expect, test } from 'vitest';
import { buildSlides } from '../components/wrapped/slides';

const user = { id: 'u1', name: 'Marco Rossi', nickname: 'Il Sindaco' };
const full = {
  enough: true,
  user,
  season: { key: '2026-27', label: 'Stagione 2026/27' },
  summary: { played: 12, wins: 8, draws: 2, losses: 2, winRate: 0.667, goals: 9, goalsMatches: 10, mvp: 2, avgRating: 7.4, ratingsCount: 20, firstMatchAt: '2026-09-03T19:00:00Z', lastMatchAt: '2026-11-01T19:00:00Z' },
  bestMatch: { date: '2026-10-08T19:00:00Z', fieldName: 'Santena', score: '5-1', rating: 9.2, goals: 3, mvp: true },
  moments: [{ key: 'primo_gol', title: 'Il primo gol', date: '2026-09-10T19:00:00Z' }],
  rivalry: { user: { id: 'u2', name: 'Luca', nickname: null }, played: 6, wins: 3, draws: 1, losses: 2 },
  partner: null,
  awards: { mvp: 2, matchAwards: [{ key: 'bomber', label: 'Bomber della serata', count: 1 }] },
  achievements: [{ key: 'primo_gol', label: 'Primo gol' }],
  progression: { first: 6.5, second: 8, delta: 1.5, points: [] },
  records: { mostGoals: { goals: 3, date: '2026-10-08T19:00:00Z' }, bestRating: null, winStreak: null },
  standings: [{ key: 'forti', title: 'I più forti', position: 2, of: 10, display: '8,1' }],
};

describe('schermate del BONWRAPPED', () => {
  test('senza dati sufficienti non produce nessuna schermata', () => {
    expect(buildSlides(null)).toEqual([]);
    expect(buildSlides({ enough: false, reason: 'Servono almeno 3 partite.' })).toEqual([]);
  });

  test('con dati completi: introduzione, numeri e chiusura, ognuna con testo', () => {
    const slides = buildSlides(full);
    const keys = slides.map((s) => s.key);
    expect(keys[0]).toBe('intro');
    expect(keys.at(-1)).toBe('fine');
    expect(keys).toEqual(expect.arrayContaining(['partite', 'gol', 'premi', 'migliore', 'progressione', 'compagni', 'momenti', 'traguardi', 'classifiche']));
    for (const s of slides) {
      expect(s.kicker).toBeTruthy();
      expect(s.big).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.accent).toMatch(/^#/);
    }
    expect(slides.find((s) => s.key === 'partite').big).toBe('12');
    expect(slides.find((s) => s.key === 'migliore').big).toBe('9,2');
    expect(slides.find((s) => s.key === 'progressione').big).toBe('+1,5');
    expect(slides.find((s) => s.key === 'classifiche').big).toBe('2°');
  });

  test('le sezioni senza dati spariscono: niente gol, premi, rivalità, progressione', () => {
    const bare = { ...full, summary: { ...full.summary, goals: null, goalsMatches: 0, mvp: 0 }, awards: { mvp: 0, matchAwards: [] }, bestMatch: null, moments: [], rivalry: null, partner: null, achievements: [], progression: null, standings: [] };
    const keys = buildSlides(bare).map((s) => s.key);
    expect(keys).toEqual(['intro', 'partite', 'fine']);
  });

  test('con meno di 5 partite non propone una percentuale di vittorie', () => {
    const few = buildSlides({ ...full, summary: { ...full.summary, played: 4, wins: 3, winRate: 0.75 } });
    const lines = few.find((s) => s.key === 'partite').lines.join(' ');
    expect(lines).not.toContain('75%');
    expect(lines).toMatch(/non è significativa/);
  });
});
