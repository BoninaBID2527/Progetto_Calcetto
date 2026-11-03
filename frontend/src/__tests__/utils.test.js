import { describe, expect, test } from 'vitest';
import { addDays, addMonths, dayLabel, isoWeekday, monthGrid, startOfWeek, weekDays } from '../utils/calendar';
import { formatEuro } from '../utils/format';

describe('calendario (date pure)', () => {
  test('giorno ISO e inizio settimana al lunedì', () => {
    expect(isoWeekday('2026-11-05')).toBe(4);
    expect(isoWeekday('2026-11-08')).toBe(7);
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02');
    expect(startOfWeek('2026-11-02')).toBe('2026-11-02');
  });

  test('somma di giorni e mesi anche a cavallo dell\'anno e dell\'ora legale', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addMonths('2026-11-15', 2)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
  });

  test('la griglia del mese ha 42 giorni, parte da un lunedì e contiene tutto il mese', () => {
    const grid = monthGrid('2026-11-02');
    expect(grid).toHaveLength(42);
    expect(isoWeekday(grid[0])).toBe(1);
    expect(grid).toContain('2026-11-01');
    expect(grid).toContain('2026-11-30');
    expect(new Set(grid).size).toBe(42);
  });

  test('la settimana ha 7 giorni da lunedì a domenica; etichetta in italiano', () => {
    const w = weekDays('2026-11-05');
    expect(w[0]).toBe('2026-11-02');
    expect(w[6]).toBe('2026-11-08');
    expect(dayLabel('2026-11-05')).toBe('giovedì 5 novembre');
  });
});

describe('formattazione', () => {
  test('importi in euro con virgola', () => {
    expect(formatEuro(1250).replace(/\s/g, ' ')).toMatch(/12,50\s?€/);
    expect(formatEuro(0)).toMatch(/0,00/);
    expect(formatEuro(null)).toMatch(/0,00/);
  });
});
