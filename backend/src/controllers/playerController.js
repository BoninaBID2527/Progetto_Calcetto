'use strict';

const playerService = require('../services/playerService');

const card = async (req, res) => res.json({ card: await playerService.card(req.group, req.params.userId, req.user, req.validQuery.scope) });
const progression = async (req, res) => res.json({ progression: await playerService.progression(req.group, req.params.userId) });

module.exports = { card, progression };
