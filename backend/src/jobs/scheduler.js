'use strict';

const { Match, Group } = require('../models');
const matchService = require('../services/matchService');
const votingService = require('../services/votingService');
const notificationService = require('../services/notificationService');
const { sameId } = require('../utils/helpers');

const DAY = 86_400_000;

/**
 * Promemoria in-app il giorno prima: a chi è nel gruppo e non ha ancora
 * risposto alla partita che inizia entro 24 ore. Ogni partita riceve un solo
 * giro di promemoria (reminderSentAt).
 */
async function sendReminders(now = new Date()) {
  const due = await Match.find({ status: 'aperta', reminderSentAt: null, startsAt: { $gt: now, $lte: new Date(now.getTime() + DAY) } }).lean();
  let sent = 0;
  for (const m of due) {
    const claimed = await Match.findOneAndUpdate({ _id: m._id, reminderSentAt: null }, { $set: { reminderSentAt: now } });
    if (!claimed) continue;
    const group = await Group.findById(m.group).lean();
    if (!group) continue;
    const silent = group.members.map((x) => x.user).filter((id) => !m.participants.some((p) => sameId(p.user, id)));
    const day = matchService.dayOf(m);
    await notificationService.notify(silent, {
      type: 'promemoria',
      title: `Domani si gioca: ci sei ${day}?`,
      body: `Partita a ${matchService.fieldName(m.field)}, posti liberi: ${m.freeSlots}. Rispondi così l'organizzatore sa come regolarsi.`,
      link: `/partite/${m._id}`,
      group: m.group,
    });
    sent += silent.length;
  }
  return sent;
}

async function tick(now = new Date()) {
  const reminders = await sendReminders(now);
  const closed = await matchService.autoClose(now);
  const finalized = await votingService.finalizeExpired(now);
  return { reminders, closed, finalized };
}

let timer = null;

function start(intervalMs = 60_000) {
  if (timer) return;
  const run = () => tick().catch((err) => console.error('Programma periodico:', err.message));
  run();
  timer = setInterval(run, intervalMs);
  timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick, sendReminders };
