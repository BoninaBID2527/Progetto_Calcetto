'use strict';

const { api, useTestDatabase, groupWithMembers, createMatch, respond } = require('./helpers');
const { sniffImage } = require('../src/utils/image');

useTestDatabase();

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([40, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(30, 3)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');

describe('Riconoscimento delle immagini', () => {
  test('dai primi byte: PNG, JPEG, WebP sì; SVG, GIF, testo, file troppo corti no', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(JPEG)).toBe('image/jpeg');
    expect(sniffImage(WEBP)).toBe('image/webp');
    expect(sniffImage(SVG)).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a' + 'x'.repeat(30)))).toBeNull();
    expect(sniffImage(Buffer.from('%PDF-1.4 ' + 'x'.repeat(30)))).toBeNull();
    expect(sniffImage(Buffer.alloc(4))).toBeNull();
  });
});

describe('Club', () => {
  let ctx;
  beforeAll(async () => {
    ctx = await groupWithMembers(4);
  });
  const url = (p) => `/api/groups/${ctx.group.id}${p}`;
  const put = (path, who, buf, name = 'stemma.png', type = 'image/png') => api().put(url(path)).set(who.auth).attach('file', buf, { filename: name, contentType: type });

  test('gruppi privati: chi non è membro non vede il club né può caricare', async () => {
    const outsider = (await groupWithMembers(2)).admin;
    expect((await api().get(url('/club')).set(outsider.auth)).status).toBe(403);
    expect((await put('/club/crest', outsider, PNG)).status).toBe(403);
    expect((await api().get(url('/club'))).status).toBe(401);
  });

  test('stemma: solo admin, tipo vero dai primi byte, salvato come data URL', async () => {
    expect((await put('/club/crest', ctx.members[0], PNG)).status).toBe(403);
    for (const [buf, mime] of [[PNG, 'image/png'], [JPEG, 'image/jpeg'], [WEBP, 'image/webp']]) {
      const ok = await put('/club/crest', ctx.admin, buf, 'x.bin', 'application/octet-stream');
      expect(ok.status).toBe(200);
      expect(ok.body.group.crestUrl.startsWith(`data:${mime};base64,`)).toBe(true);
    }
    const shown = await api().get(url('')).set(ctx.members[1].auth);
    expect(shown.body.group.crestUrl).toMatch(/^data:image\/webp/);
  });

  test('SVG e file falsi sono rifiutati anche se dichiarati PNG; troppo pesanti: 413', async () => {
    const svg = await put('/club/crest', ctx.admin, SVG, 'logo.png', 'image/png');
    expect(svg.status).toBe(422);
    const fake = await put('/club/crest', ctx.admin, Buffer.from('non sono un\'immagine, sono testo normale'), 'a.png', 'image/png');
    expect(fake.status).toBe(422);
    const big = await put('/club/crest', ctx.admin, Buffer.concat([PNG, Buffer.alloc(200 * 1024)]));
    expect(big.status).toBe(413);
    const noFile = await api().put(url('/club/crest')).set(ctx.admin.auth).field('x', 'y');
    expect([413, 422]).toContain(noFile.status);
    // Lo stemma valido caricato prima non è stato toccato dai tentativi falliti.
    expect((await api().get(url('')).set(ctx.admin.auth)).body.group.crestUrl).toMatch(/^data:image\/webp/);
  });

  test('copertina: limite più ampio, non compare nell\'elenco ma nella pagina del club; rimozione', async () => {
    const cover = await put('/club/cover', ctx.admin, Buffer.concat([JPEG, Buffer.alloc(300 * 1024)]), 'c.jpg', 'image/jpeg');
    expect(cover.status).toBe(200);
    expect(cover.body.group.hasCover).toBe(true);
    expect(JSON.stringify(cover.body)).not.toContain('coverUrl');
    expect((await api().get(url('')).set(ctx.admin.auth)).body.group).not.toHaveProperty('coverUrl');
    const club = await api().get(url('/club')).set(ctx.members[0].auth);
    expect(club.body.club.identity.coverUrl).toMatch(/^data:image\/jpeg/);
    expect((await api().delete(url('/club/cover')).set(ctx.members[0].auth)).status).toBe(403);
    const removed = await api().delete(url('/club/cover')).set(ctx.admin.auth);
    expect(removed.body.group.hasCover).toBe(false);
    expect((await api().delete(url('/club/crest')).set(ctx.admin.auth)).body.group.crestUrl).toBeNull();
  });

  test('motto, colore secondario e maglie: validati e modificabili solo dall\'admin', async () => {
    const body = { motto: 'Mai sotto di due gol', secondaryColor: '#FFD23F', kits: { light: { primary: '#F4F8F2', secondary: '#111111' }, dark: { primary: '#222222' } } };
    expect((await api().patch(url('')).set(ctx.members[0].auth).send(body)).status).toBe(403);
    const ok = await api().patch(url('')).set(ctx.admin.auth).send(body);
    expect(ok.status).toBe(200);
    expect(ok.body.group).toMatchObject({ motto: 'Mai sotto di due gol', secondaryColor: '#FFD23F', kits: { light: { primary: '#F4F8F2', secondary: '#111111' }, dark: { primary: '#222222', secondary: null } } });
    for (const bad of [{ secondaryColor: 'rosso' }, { motto: 'x'.repeat(81) }, { kits: { light: { primary: 'url(javascript:1)' } } }, { kits: { fuori: {} } }]) {
      expect((await api().patch(url('')).set(ctx.admin.auth).send(bad)).status).toBe(422);
    }
    expect((await api().patch(url('')).set(ctx.admin.auth).send({ secondaryColor: null })).body.group.secondaryColor).toBeNull();
  });

  test('statistiche del club: vuote senza partite, reali con le partite giocate', async () => {
    const empty = (await api().get(url('/club')).set(ctx.admin.auth)).body.club.stats;
    expect(empty).toMatchObject({ matches: 0, goals: 0, goalsPerMatch: null, members: 4, topScorer: null, mostPresent: null });
    const players = ctx.all.slice(0, 4);
    const match = await createMatch(ctx.admin, ctx.group, { slots: 4 });
    for (const u of players) await respond(u, match);
    await api().post(`/api/matches/${match.id}/status`).set(ctx.admin.auth).send({ status: 'chiusa' });
    const ids = players.map((u) => u.user.id);
    await api().put(`/api/matches/${match.id}/teams`).set(ctx.admin.auth).send({ a: { players: ids.slice(0, 2) }, b: { players: ids.slice(2) } });
    await api().put(`/api/matches/${match.id}/result`).set(ctx.admin.auth).send({ scoreA: 4, scoreB: 2, scorers: [{ userId: ids[0], goals: 3 }] });
    const stats = (await api().get(url('/club')).set(ctx.admin.auth)).body.club.stats;
    expect(stats).toMatchObject({ matches: 1, goals: 6, goalsPerMatch: 6, members: 4 });
    expect(stats.topScorer.value).toBe(3);
    expect(stats.topScorer.users[0].id).toBe(ids[0]);
    expect(stats.mostPresent.users).toHaveLength(3);
    expect(stats.mostPresent.others).toBe(1);
    expect(JSON.stringify(stats)).not.toMatch(/@calcetto\.test/);
  });
});
