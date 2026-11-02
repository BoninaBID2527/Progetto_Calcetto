'use strict';

const authService = require('../services/authService');
const { selfUser } = require('../services/dto');
const { User } = require('../models');

async function register(req, res) {
  res.status(201).json(await authService.register(req.body));
}

async function login(req, res) {
  res.json(await authService.login(req.body));
}

async function logout(req, res) {
  await authService.logout(req.token);
  res.status(204).end();
}

async function me(req, res) {
  res.json({ user: selfUser(req.user) });
}

async function updateMe(req, res) {
  const { settings, ...rest } = req.body;
  const update = { ...rest };
  for (const [key, value] of Object.entries(settings || {})) update[`settings.${key}`] = value;
  const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true, runValidators: true });
  res.json({ user: selfUser(user) });
}

module.exports = { register, login, logout, me, updateMe };
