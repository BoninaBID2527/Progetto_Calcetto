'use strict';

/*
 * Cassa del gruppo: un registro contabile interno, non un sistema di
 * pagamento. Regole:
 *  - un pagamento dichiarato da chi paga NON conta finché chi riceve il denaro
 *    (organizzatore della partita o admin) non lo conferma ("verificato");
 *  - ogni passaggio di stato è atomico e finisce nello storico della voce;
 *  - una voce non si cancella mai: si annulla e resta tracciata;
 *  - saldi e totali contano solo le voci verificate, le dichiarate sono a parte.
 */
const { Match, LedgerEntry, Group } = require('../models');
const { conflict, forbidden, notFound, unprocessable } = require('../utils/AppError');
const { sameId } = require('../utils/helpers');
const { getField } = require('../config/appConfig');
const { userResolver } = require('./dto');
const nicknameService = require('./nicknameService');
const notificationService = require('./notificationService');
const realtime = require('./realtime');

const COUNTED_STATUSES = ['chiusa', 'giocata', 'archiviata']; // partite per cui la quota è dovuta
const euro = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

const isAdmin = (group, user) => group.members.some((m) => sameId(m.user, user._id) && m.role === 'admin');
const quotaOf = (match, confirmed) => (match.costCents > 0 && confirmed > 0 ? Math.ceil(match.costCents / confirmed) : 0);
const confirmedOf = (match) => match.participants.filter((p) => p.response === 'ci_sono');

const step = (by, action, from, to, note = '') => ({ at: new Date(), by, action, from, to, note });

/** Passaggio di stato atomico: avviene solo se la voce è ancora in uno degli stati di partenza. */
async function transition(id, from, to, by, action, { note = '', set = {} } = {}) {
  const updated = await LedgerEntry.findOneAndUpdate(
    { _id: id, status: { $in: from } },
    { $set: { status: to, ...set }, $push: { history: step(by._id, action, null, to, note) } },
    { new: true }
  );
  if (!updated) throw conflict('La voce è stata modificata nel frattempo. Ricarica e riprova.');
  return updated;
}

// ------------------------------------------------------------------ quote delle partite

/** Specchia lo stato della quota sul giocatore della partita (e su `paid`, che vale "verificato"). */
async function mirror(matchId, userId, payment) {
  await Match.updateOne({ _id: matchId }, { $set: { 'participants.$[t].payment': payment, 'participants.$[t].paid': payment === 'verificato' } }, { arrayFilters: [{ 't.user': userId }] });
}

async function notifyPayment(match, to, title, body) {
  await notificationService.notify(to, { type: 'pagamento', title, body, link: `/partite/${match._id}`, group: match.group });
}

/**
 * Cambia lo stato di pagamento della quota di un giocatore.
 * @param {'da_pagare'|'dichiarato'|'verificato'} target
 */
async function setQuota(match, actor, isManager, targetId, target) {
  const participant = match.participants.find((p) => sameId(p.user, targetId));
  if (!participant || participant.response !== 'ci_sono') throw unprocessable('La quota riguarda solo i presenti.', { userId: 'Questa persona non è tra i presenti.' });
  const own = sameId(actor._id, targetId);
  if (!own && !isManager) throw forbidden("Puoi segnare solo il tuo pagamento; gli altri li gestisce l'organizzatore.");
  if (target === 'verificato' && !isManager) throw forbidden('Solo chi riceve il denaro (organizzatore o admin) può confermare un pagamento.');

  let entry = await LedgerEntry.findOne({ match: match._id, user: targetId, type: 'quota' });
  const current = !entry || entry.status === 'annullato' ? 'da_pagare' : entry.status;
  if (current === target) return Match.findById(match._id).lean();

  const amount = quotaOf(match, confirmedOf(match).length);
  if (target === 'dichiarato') {
    if (current === 'verificato') throw conflict('Questo pagamento è già stato confermato.');
    entry = await upsertQuota(match, targetId, actor, amount, 'dichiarato');
    await mirror(match._id, targetId, 'dichiarato');
    if (own && !sameId(match.organizer, actor._id)) await notifyPayment(match, [match.organizer], `${actor.name} dichiara di aver pagato`, `Quota di ${euro(amount)}: confermala quando l'hai ricevuta.`);
  } else if (target === 'verificato') {
    entry = await upsertQuota(match, targetId, actor, amount, 'verificato');
    await mirror(match._id, targetId, 'verificato');
    if (!own) await notifyPayment(match, [targetId], 'Pagamento confermato', `${actor.name} ha confermato la tua quota di ${euro(entry.amountCents)}.`);
  } else {
    // da_pagare: chi ha dichiarato può ritirare la dichiarazione; solo chi riceve può revocare una conferma.
    if (current === 'verificato' && !isManager) throw forbidden('Una conferma può essere revocata solo da organizzatore o admin.');
    await transition(entry._id, ['dichiarato', 'verificato'], 'annullato', actor, current === 'verificato' ? 'revocato' : 'ritirato', {
      set: { cancelledBy: actor._id, cancelledAt: new Date(), cancelReason: current === 'verificato' ? 'Conferma revocata' : 'Dichiarazione ritirata' },
    });
    await mirror(match._id, targetId, 'da_pagare');
  }
  realtime.toGroup(match.group, 'cashbox:updated', { groupId: String(match.group), matchId: String(match._id) });
  return Match.findById(match._id).lean();
}

async function upsertQuota(match, userId, actor, amount, status) {
  const where = { match: match._id, user: userId, type: 'quota' };
  const run = async () => {
    const existing = await LedgerEntry.findOne(where);
    if (!existing) {
      return LedgerEntry.create({
        group: match.group,
        ...where,
        status,
        amountCents: amount,
        createdBy: actor._id,
        ...(status === 'verificato' ? { verifiedBy: actor._id, verifiedAt: new Date() } : {}),
        history: [step(actor._id, status === 'verificato' ? 'verificato' : 'dichiarato', null, status)],
      });
    }
    const from = status === 'verificato' ? ['dichiarato', 'annullato'] : ['annullato'];
    return transition(existing._id, from, status, actor, status === 'verificato' ? 'verificato' : 'dichiarato', {
      set: { amountCents: amount, cancelledBy: null, cancelledAt: null, cancelReason: '', ...(status === 'verificato' ? { verifiedBy: actor._id, verifiedAt: new Date() } : { verifiedBy: null, verifiedAt: null }) },
    });
  };
  try {
    return await run();
  } catch (err) {
    if (err.code === 11000) return run(); // due richieste insieme: la seconda trova la voce della prima
    throw err;
  }
}

/** Chi lascia la partita: la dichiarazione non confermata decade, il denaro già confermato resta come credito. */
async function onLeft(match, userId) {
  const entry = await LedgerEntry.findOne({ match: match._id, user: userId, type: 'quota', status: 'dichiarato' });
  if (entry) {
    await LedgerEntry.findOneAndUpdate(
      { _id: entry._id, status: 'dichiarato' },
      { $set: { status: 'annullato', cancelledAt: new Date(), cancelledBy: userId, cancelReason: 'Ha lasciato la partita' }, $push: { history: step(userId, 'annullato', null, 'annullato', 'Ha lasciato la partita') } }
    );
  }
  const verified = await LedgerEntry.exists({ match: match._id, user: userId, type: 'quota', status: 'verificato' });
  await mirror(match._id, userId, verified ? 'verificato' : 'da_pagare');
}

// ------------------------------------------------------------------ voci di gruppo

async function createEntry(group, actor, data) {
  const admin = isAdmin(group, actor);
  const { type, amountCents, note = '', userId = null, paidFrom = null, matchId = null } = data;
  if (!group.settings.cashbox && (type === 'versamento' || paidFrom === 'cassa')) {
    throw unprocessable('La cassa comune non è attiva in questo gruppo.', { type: 'Cassa comune disattivata.' });
  }
  if (type !== 'versamento' && !admin) throw forbidden('Spese e rimborsi li registra un admin del gruppo.');
  if (type === 'versamento' && userId && !sameId(userId, actor._id) && !admin) throw forbidden('Puoi dichiarare solo i tuoi versamenti.');
  const subject = type === 'versamento' ? userId || actor._id : userId;
  if ((type === 'rimborso' || type === 'versamento' || (type === 'spesa' && paidFrom === 'membro')) && !subject) {
    throw unprocessable('Indica la persona interessata.', { userId: 'Persona mancante.' });
  }
  if (subject && !group.members.some((m) => sameId(m.user, subject))) throw unprocessable('La persona non fa parte del gruppo.', { userId: 'Non è un membro.' });
  if (type === 'spesa' && !paidFrom) throw unprocessable('Indica da dove è stata pagata la spesa.', { paidFrom: 'Cassa comune o anticipata da un membro.' });
  if (matchId && !(await Match.exists({ _id: matchId, group: group._id }))) throw notFound('Partita non trovata in questo gruppo.');

  // Chi riceve il denaro (admin) registra direttamente il dato confermato; il membro che versa dichiara soltanto.
  const status = admin ? 'verificato' : 'dichiarato';
  const entry = await LedgerEntry.create({
    group: group._id,
    type,
    status,
    amountCents,
    user: subject,
    match: matchId || undefined,
    paidFrom: type === 'spesa' ? paidFrom : null,
    note,
    createdBy: actor._id,
    ...(status === 'verificato' ? { verifiedBy: actor._id, verifiedAt: new Date() } : {}),
    history: [step(actor._id, status === 'verificato' ? 'registrato e verificato' : 'dichiarato', null, status, note)],
  });
  if (status === 'dichiarato') {
    const admins = group.members.filter((m) => m.role === 'admin' && !sameId(m.user, actor._id)).map((m) => m.user);
    await notificationService.notify(admins, { type: 'pagamento', title: `${actor.name} dichiara un versamento`, body: `${euro(amountCents)}: confermalo quando lo hai ricevuto.`, link: `/gruppi/${group._id}/cassa`, group: group._id });
  }
  realtime.toGroup(group._id, 'cashbox:updated', { groupId: String(group._id) });
  return entry.toObject();
}

async function loadEntry(group, entryId) {
  const entry = await LedgerEntry.findOne({ _id: entryId, group: group._id });
  if (!entry) throw notFound('Voce non trovata.');
  return entry;
}

/** Chi può confermare: l'admin del gruppo o, per le quote, l'organizzatore della partita. */
async function canVerify(group, user, entry) {
  if (isAdmin(group, user)) return true;
  if (entry.type !== 'quota' || !entry.match) return false;
  const match = await Match.findById(entry.match).select('organizer').lean();
  return Boolean(match && sameId(match.organizer, user._id));
}

async function verify(group, actor, entryId) {
  const entry = await loadEntry(group, entryId);
  if (entry.status !== 'dichiarato') throw conflict(entry.status === 'verificato' ? 'La voce è già confermata.' : 'Una voce annullata non si può confermare.');
  if (!(await canVerify(group, actor, entry))) throw forbidden('Solo chi riceve il denaro (admin o organizzatore) può confermare.');
  const updated = await transition(entry._id, ['dichiarato'], 'verificato', actor, 'verificato', { set: { verifiedBy: actor._id, verifiedAt: new Date() } });
  if (updated.type === 'quota' && updated.match) await mirror(updated.match, updated.user, 'verificato');
  if (updated.user && !sameId(updated.user, actor._id)) {
    await notificationService.notify([updated.user], { type: 'pagamento', title: 'Pagamento confermato', body: `${actor.name} ha confermato ${euro(updated.amountCents)}.`, link: updated.match ? `/partite/${updated.match}` : `/gruppi/${group._id}/cassa`, group: group._id });
  }
  realtime.toGroup(group._id, 'cashbox:updated', { groupId: String(group._id) });
  return updated.toObject();
}

async function cancel(group, actor, entryId, reason = '') {
  const entry = await loadEntry(group, entryId);
  if (entry.status === 'annullato') throw conflict('La voce è già annullata.');
  const manager = await canVerify(group, actor, entry);
  const ownDeclared = entry.status === 'dichiarato' && (sameId(entry.createdBy, actor._id) || sameId(entry.user, actor._id));
  if (!manager && !ownDeclared) throw forbidden('Puoi annullare solo le tue dichiarazioni non ancora confermate.');
  if (entry.status === 'verificato' && !reason.trim()) throw unprocessable('Per annullare una voce confermata serve un motivo.', { reason: 'Motivo obbligatorio.' });
  const updated = await transition(entry._id, ['dichiarato', 'verificato'], 'annullato', actor, 'annullato', { note: reason, set: { cancelledBy: actor._id, cancelledAt: new Date(), cancelReason: reason } });
  if (updated.type === 'quota' && updated.match) await mirror(updated.match, updated.user, 'da_pagare');
  realtime.toGroup(group._id, 'cashbox:updated', { groupId: String(group._id) });
  return updated.toObject();
}

// ------------------------------------------------------------------ lettura

async function shape(group, entries) {
  const resolve = await userResolver(
    entries.flatMap((e) => [e.user, e.createdBy, e.verifiedBy, e.cancelledBy, ...e.history.map((h) => h.by)]),
    await nicknameService.activeMap(group._id)
  );
  const matchIds = [...new Set(entries.map((e) => e.match).filter(Boolean).map(String))];
  const matches = matchIds.length ? await Match.find({ _id: { $in: matchIds } }).select('field startsAt').lean() : [];
  const byMatch = new Map(matches.map((m) => [String(m._id), { id: String(m._id), field: m.field, fieldName: getField(m.field)?.name || m.field, startsAt: m.startsAt }]));
  return entries.map((e) => ({
    id: String(e._id),
    type: e.type,
    status: e.status,
    amountCents: e.amountCents,
    user: e.user ? resolve(e.user) : null,
    match: e.match ? byMatch.get(String(e.match)) || { id: String(e.match) } : null,
    paidFrom: e.paidFrom,
    note: e.note,
    createdBy: resolve(e.createdBy),
    createdAt: e.createdAt,
    verifiedBy: e.verifiedBy ? resolve(e.verifiedBy) : null,
    verifiedAt: e.verifiedAt,
    cancelledBy: e.cancelledBy ? resolve(e.cancelledBy) : null,
    cancelledAt: e.cancelledAt,
    cancelReason: e.cancelReason,
    history: e.history.map((h) => ({ at: h.at, by: resolve(h.by), action: h.action, to: h.to, note: h.note })),
  }));
}

/** Storico: l'admin vede tutto; un membro le proprie voci e le spese del gruppo. */
async function ledger(group, viewer, { type, status, userId, before, limit = 30 } = {}) {
  const admin = isAdmin(group, viewer);
  const filter = { group: group._id, ...(type ? { type } : {}), ...(status ? { status } : {}), ...(before ? { _id: { $lt: before } } : {}) };
  if (userId) filter.user = userId;
  if (!admin) {
    filter.$or = [{ user: viewer._id }, { createdBy: viewer._id }, { type: 'spesa' }];
  }
  const items = await LedgerEntry.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  return { items: await shape(group, items.slice(0, limit)), hasMore: items.length > limit };
}

/** Saldi, cassa comune e riepilogo per partita. Contano solo le voci verificate. */
async function summary(group, viewer) {
  const admin = isAdmin(group, viewer);
  const entries = await LedgerEntry.find({ group: group._id, status: { $ne: 'annullato' } }).lean();
  const verified = entries.filter((e) => e.status === 'verificato');
  const declared = entries.filter((e) => e.status === 'dichiarato');
  const matches = await Match.find({ group: group._id, status: { $in: COUNTED_STATUSES } }).sort({ startsAt: -1 }).lean();

  const members = new Map(group.members.map((m) => [String(m.user), { userId: String(m.user), dueCents: 0, paidCents: 0, depositsCents: 0, advancedCents: 0, reimbursedCents: 0, declaredCents: 0 }]));
  const perMatch = [];
  for (const m of matches) {
    const confirmed = confirmedOf(m);
    const quota = quotaOf(m, confirmed.length);
    for (const p of confirmed) if (members.has(String(p.user))) members.get(String(p.user)).dueCents += quota;
    const mine = entries.filter((e) => e.type === 'quota' && sameId(e.match, m._id));
    const v = mine.filter((e) => e.status === 'verificato').reduce((a, e) => a + e.amountCents, 0);
    const d = mine.filter((e) => e.status === 'dichiarato').reduce((a, e) => a + e.amountCents, 0);
    if (m.costCents > 0) {
      perMatch.push({
        id: String(m._id),
        startsAt: m.startsAt,
        field: m.field,
        fieldName: getField(m.field)?.name || m.field,
        status: m.status,
        costCents: m.costCents,
        quotaCents: quota,
        confirmed: confirmed.length,
        verifiedCents: v,
        declaredCents: d,
        missingCents: Math.max(0, m.costCents - v - d),
        paidCount: confirmed.filter((p) => mine.some((e) => e.status === 'verificato' && sameId(e.user, p.user))).length,
      });
    }
  }
  for (const e of verified) {
    const row = e.user ? members.get(String(e.user)) : null;
    if (!row) continue;
    if (e.type === 'quota') row.paidCents += e.amountCents;
    if (e.type === 'versamento') row.depositsCents += e.amountCents;
    if (e.type === 'spesa' && e.paidFrom === 'membro') row.advancedCents += e.amountCents;
    if (e.type === 'rimborso') row.reimbursedCents += e.amountCents;
  }
  for (const e of declared) {
    const row = e.user ? members.get(String(e.user)) : null;
    if (row && (e.type === 'quota' || e.type === 'versamento')) row.declaredCents += e.amountCents;
  }
  const rows = [...members.values()].map((r) => ({ ...r, balanceCents: r.paidCents + r.depositsCents + r.advancedCents - r.dueCents - r.reimbursedCents }));

  const sum = (list, f) => list.filter(f).reduce((a, e) => a + e.amountCents, 0);
  const cashboxOn = Boolean(group.settings.cashbox);
  // Le quote pagano il campo: non entrano nel fondo comune, che è fatto solo di versamenti.
  const inCents = sum(verified, (e) => e.type === 'versamento');
  const outCents = sum(verified, (e) => (e.type === 'spesa' && e.paidFrom === 'cassa') || e.type === 'rimborso');

  const resolve = await userResolver(rows.map((r) => r.userId), await nicknameService.activeMap(group._id));
  const pendingRaw = declared.filter((e) => e.type === 'versamento' || e.type === 'quota');
  let pending = [];
  if (admin) pending = pendingRaw;
  else {
    const organizerOf = new Set(matches.filter((m) => sameId(m.organizer, viewer._id)).map((m) => String(m._id)));
    pending = pendingRaw.filter((e) => e.type === 'quota' && organizerOf.has(String(e.match)));
  }
  const mine = rows.find((r) => r.userId === String(viewer._id));

  return {
    enabled: cashboxOn,
    isAdmin: admin,
    fund: cashboxOn ? { balanceCents: inCents - outCents, inCents, outCents, pendingCents: sum(declared, (e) => e.type === 'versamento') } : null,
    me: mine || null,
    members: admin ? rows.map((r) => ({ ...r, user: resolve(r.userId) })).sort((a, b) => a.balanceCents - b.balanceCents) : null,
    pending: await shape(group, pending),
    matches: perMatch.slice(0, 20),
    totals: { verifiedCents: sum(verified, (e) => e.type === 'quota'), declaredCents: sum(declared, (e) => e.type === 'quota'), expensesCents: sum(verified, (e) => e.type === 'spesa') },
  };
}

/** Pagamenti di una partita: totale, quota, stato di ciascuno. */
async function forMatch(match) {
  const entries = await LedgerEntry.find({ match: match._id, type: 'quota' }).lean();
  const confirmed = confirmedOf(match);
  const quota = quotaOf(match, confirmed.length);
  const sum = (s) => entries.filter((e) => e.status === s).reduce((a, e) => a + e.amountCents, 0);
  return {
    matchId: String(match._id),
    costCents: match.costCents,
    quotaCents: quota,
    confirmed: confirmed.length,
    verifiedCents: sum('verificato'),
    declaredCents: sum('dichiarato'),
    missingCents: Math.max(0, match.costCents - sum('verificato') - sum('dichiarato')),
    players: confirmed.map((p) => {
      const e = entries.find((x) => sameId(x.user, p.user) && x.status !== 'annullato');
      return { userId: String(p.user), payment: e?.status === 'verificato' ? 'verificato' : e?.status === 'dichiarato' ? 'dichiarato' : 'da_pagare', entryId: e ? String(e._id) : null, amountCents: e?.amountCents ?? quota };
    }),
  };
}

/** Migrazione dalla V1: i `paid: true` diventano quote verificate (storico: "importato"). Idempotente. */
async function backfillFromLegacy() {
  let created = 0;
  const matches = await Match.find({ 'participants.paid': true }).lean();
  for (const m of matches) {
    for (const p of m.participants) {
      if (!p.paid || p.response !== 'ci_sono') continue;
      const confirmed = m.participants.filter((x) => x.response === 'ci_sono').length;
      try {
        await LedgerEntry.create({
          group: m.group,
          type: 'quota',
          status: 'verificato',
          amountCents: quotaOf(m, confirmed),
          user: p.user,
          match: m._id,
          note: 'Importato dalla versione precedente',
          createdBy: p.paidUpdatedBy || m.organizer,
          verifiedBy: p.paidUpdatedBy || m.organizer,
          verifiedAt: m.updatedAt || new Date(),
          history: [step(p.paidUpdatedBy || m.organizer, 'importato', null, 'verificato', 'Importato dalla versione precedente')],
        });
        created += 1;
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    await Match.updateOne({ _id: m._id }, { $set: { 'participants.$[t].payment': 'verificato' } }, { arrayFilters: [{ 't.paid': true, 't.payment': { $ne: 'verificato' } }] });
  }
  void Group;
  return created;
}

module.exports = { setQuota, onLeft, createEntry, verify, cancel, ledger, summary, forMatch, backfillFromLegacy, quotaOf, isAdmin };
