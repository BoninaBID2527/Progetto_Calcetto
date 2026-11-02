'use strict';

const rivalryService = require('../services/rivalryService');

const list = async (req, res) => res.json(await rivalryService.list(req.group, req.user));
const detail = async (req, res) => res.json({ versus: await rivalryService.detail(req.group, req.params.userId, req.validQuery.with || String(req.user._id)) });
const propose = async (req, res) => res.status(201).json({ rivalry: await rivalryService.propose(req.group, req.user, req.body.targetUserId) });
const accept = async (req, res) => res.json({ rivalry: await rivalryService.respond(req.params.rivalryId, req.user, true) });
const decline = async (req, res) => res.json({ rivalry: await rivalryService.respond(req.params.rivalryId, req.user, false) });
const end = async (req, res) => {
  await rivalryService.end(req.params.rivalryId, req.user);
  res.status(204).end();
};

module.exports = { list, detail, propose, accept, decline, end };
