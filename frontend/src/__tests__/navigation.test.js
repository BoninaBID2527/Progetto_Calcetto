import { describe, expect, test } from 'vitest';
import { navigationFor } from '../layouts/navigation';

const group = { id: 'g1', name: 'Calcetto', myRole: 'member', unreadCount: 3, settings: { organizers: 'tutti' } };

describe('navigazione', () => {
  test('ogni voce ha etichetta, icona e un percorso valido (nessun collegamento morto)', () => {
    const nav = navigationFor(group, { unreadNotifications: 2, userId: 'u1' });
    const all = [...nav.bottom, ...nav.more, ...nav.sections.flatMap((s) => s.items), ...nav.create];
    for (const item of all) {
      expect(item.label).toBeTruthy();
      expect(item.icon).toBeTruthy();
      expect(item.to).toMatch(/^\//);
      expect(item.to).not.toContain('undefined');
    }
  });

  test('le nuove sezioni sono raggiungibili dal menu del gruppo', () => {
    const nav = navigationFor(group, { userId: 'u1' });
    const targets = nav.sections.flatMap((s) => s.items).map((i) => i.to);
    for (const path of ['/calendario', '/gruppi/g1/classifiche', '/gruppi/g1/hall-of-fame', '/gruppi/g1/club', '/gruppi/g1/cassa', '/gruppi/g1/terzo-tempo', '/gruppi/g1/wrapped', '/gruppi/g1/boncall']) {
      expect(targets).toContain(path);
    }
  });

  test('chi non può creare partite non vede il pulsante "Nuova partita"', () => {
    const closed = navigationFor({ ...group, settings: { organizers: 'admin' } }, { userId: 'u1' });
    expect(closed.create.map((c) => c.label)).not.toContain('Nuova partita');
    const admin = navigationFor({ ...group, myRole: 'admin', settings: { organizers: 'admin' } }, { userId: 'u1' });
    expect(admin.create.map((c) => c.label)).toContain('Nuova partita');
  });

  test('senza gruppo si riparte dall\'elenco dei gruppi', () => {
    const nav = navigationFor(null, { userId: 'u1' });
    expect(nav.home).toBe('/gruppi');
    expect(nav.create[0].to).toBe('/gruppi');
  });

  test('i contatori delle notifiche arrivano al menu "Altro"', () => {
    expect(navigationFor(group, { unreadNotifications: 4, userId: 'u1' }).moreBadge).toBe(4);
  });
});
