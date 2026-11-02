'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/matchController');
const post = require('../controllers/postMatchController');
const { requireAuth } = require('../middleware/auth');
const { loadMatch, requireMatchManager } = require('../middleware/access');
const { validate, validIds } = require('../middleware/validate');
const v = require('../validators/matchValidators');

const router = Router();
router.use(requireAuth);

const { KEYS: AWARD_KEYS } = require('../services/awardsService');
const { badRequest } = require('../utils/AppError');

const validAwardKey = (req, res, next) => (AWARD_KEYS.includes(req.params.key) ? next() : next(badRequest('Premio non valido.')));
const inMatch = [validIds('matchId'), loadMatch];
const manager = [...inMatch, requireMatchManager];

router.get('/:matchId', inMatch, ctrl.show);
router.patch('/:matchId', manager, validate({ body: v.updateMatch }), ctrl.update);
router.post('/:matchId/status', manager, validate({ body: v.changeStatus }), ctrl.changeStatus);
router.put('/:matchId/response', inMatch, validate({ body: v.respond }), ctrl.respond);
router.patch('/:matchId/participants/:userId/payment', inMatch, validIds('userId'), validate({ body: v.payment }), ctrl.setPayment);

// Squadre e dopo partita
router.post('/:matchId/teams/balance', manager, validate({ body: v.balanceTeams }), post.balance);
router.put('/:matchId/teams', manager, validate({ body: v.setTeams }), post.setTeams);
router.put('/:matchId/result', manager, validate({ body: v.result }), post.setResult);
router.get('/:matchId/voting', inMatch, post.votingState);
router.post('/:matchId/mvp-vote', inMatch, validate({ body: v.mvpVote }), post.mvpVote);
router.post('/:matchId/ratings', inMatch, validate({ body: v.ratings }), post.ratings);
router.post('/:matchId/prize-vote', inMatch, validate({ body: v.prizeVote }), post.prizeVote);
router.post('/:matchId/voting/close', manager, post.closeVoting);
router.get('/:matchId/awards', inMatch, post.awards);
router.post('/:matchId/awards/:key/vote', inMatch, validAwardKey, validate({ body: v.awardVote }), post.awardVote);
router.post('/:matchId/awards/:key/assign', manager, validAwardKey, validate({ body: v.awardAssign }), post.awardAssign);
router.get('/:matchId/report', inMatch, post.report);
router.get('/:matchId/matchday', inMatch, post.matchday);

module.exports = router;
