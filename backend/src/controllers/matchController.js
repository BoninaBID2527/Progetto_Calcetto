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
  res.json({ match: await matchService.setPayment(req.match, req.user, canManageMatch(req), req.params.userId, req.body.paid) });
}

module.exports = { list, create, show, update, changeStatus, respond, setPayment };
