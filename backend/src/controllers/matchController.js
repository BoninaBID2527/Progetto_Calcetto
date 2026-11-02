'use strict';

const matchService = require('../services/matchService');
const { canManageMatch } = require('../middleware/access');

async function finalized(req) {
  // Le votazioni scadute si chiudono anche "pigramente" alla lettura.
  const votingService = require('../services/votingService');
  return votingService.finalizeIfDue(req.match);
}

const list = async (req, res) => res.json({ matches: await matchService.list(req.group, req.validQuery) });
const create = async (req, res) => res.status(201).json({ match: await matchService.create(req.group, req.user, req.body) });

async function show(req, res) {
  const match = await finalized(req);
  res.json({ match: await matchService.dtoOf(match), canManage: canManageMatch(req) });
}

const update = async (req, res) => res.json({ match: await matchService.update(req.match, req.body) });
const changeStatus = async (req, res) => res.json({ match: await matchService.changeStatus(req.match, req.user, req.body.status) });
const respond = async (req, res) => res.json(await matchService.respond(req.match, req.user, req.body.response));

async function setPayment(req, res) {
  const manager = canManageMatch(req);
  const { paid, payment } = req.body;
  // V1: { paid: true } = "ho pagato" (dichiarato); per chi riceve il denaro vale come conferma.
  const target = payment || (paid ? (manager && req.params.userId !== String(req.user._id) ? 'verificato' : 'dichiarato') : 'da_pagare');
  res.json({ match: await matchService.setPayment(req.match, req.user, manager, req.params.userId, target) });
}

const payments = async (req, res) => res.json({ payments: await require('../services/cashboxService').forMatch(req.match) });

module.exports = { list, create, show, update, changeStatus, respond, setPayment, payments };
