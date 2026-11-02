'use strict';

const pollService = require('../services/pollService');

const list = async (req, res) => res.json({ polls: await pollService.list(req.group, req.validQuery) });
const create = async (req, res) => res.status(201).json({ poll: await pollService.create(req.group, req.user, req.body) });
const show = async (req, res) => {
  const { membership } = req;
  const canManage = membership.role === 'admin' || String(req.poll.author) === String(req.user._id);
  res.json({ poll: await pollService.dtoOf(req.poll.toObject()), canManage });
};
const respond = async (req, res) => res.json(await pollService.respond(req.poll, req.user, req.body));
const convert = async (req, res) => {
  const result = await pollService.convert(req.poll, req.group, req.user, req.body);
  res.status(result.created ? 201 : 200).json(result);
};
const cancel = async (req, res) => res.json({ poll: await pollService.cancel(req.poll, req.group, req.user) });

module.exports = { list, create, show, respond, convert, cancel };
