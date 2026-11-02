'use strict';

const { Group, Match } = require('../models');
const { forbidden, notFound } = require('../utils/AppError');
const { sameId } = require('../utils/helpers');

function membershipOf(group, userId) {
  return group.members.find((m) => sameId(m.user, userId)) || null;
}

/** Carica il gruppo da :groupId e verifica che l'utente ne faccia parte (403 altrimenti). */
async function loadGroup(req, res, next) {
  const group = await Group.findById(req.params.groupId);
  if (!group) return next(notFound('Gruppo non trovato.'));
  const membership = membershipOf(group, req.user._id);
  if (!membership) return next(forbidden('Non fai parte di questo gruppo.'));
  req.group = group;
  req.membership = membership;
  return next();
}

function requireGroupAdmin(req, res, next) {
  if (req.membership?.role !== 'admin') return next(forbidden("Solo un admin del gruppo può farlo."));
  return next();
}

/** Carica la partita da :matchId insieme al suo gruppo, con lo stesso controllo di appartenenza. */
async function loadMatch(req, res, next) {
  const match = await Match.findById(req.params.matchId);
  if (!match) return next(notFound('Partita non trovata.'));
  const group = await Group.findById(match.group);
  const membership = group && membershipOf(group, req.user._id);
  if (!membership) return next(forbidden('Non fai parte del gruppo di questa partita.'));
  req.match = match;
  req.group = group;
  req.membership = membership;
  return next();
}

const canManageMatch = (req) => req.membership.role === 'admin' || sameId(req.match.organizer, req.user._id);

function requireMatchManager(req, res, next) {
  if (!canManageMatch(req)) return next(forbidden("Solo l'organizzatore della partita o un admin del gruppo può farlo."));
  return next();
}

module.exports = { loadGroup, requireGroupAdmin, loadMatch, requireMatchManager, canManageMatch, membershipOf };
