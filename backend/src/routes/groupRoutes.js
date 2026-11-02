'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/groupController');
const matchCtrl = require('../controllers/matchController');
const chatCtrl = require('../controllers/chatController');
const postCtrl = require('../controllers/postMatchController');
const pollCtrl = require('../controllers/pollController');
const playerCtrl = require('../controllers/playerController');
const rivalryCtrl = require('../controllers/rivalryController');
const pv = require('../validators/pollValidators');
const { requireAuth } = require('../middleware/auth');
const { loadGroup, requireGroupAdmin } = require('../middleware/access');
const { uploadImage } = require('../middleware/upload');
const { LIMITS } = require('../services/clubService');
const { validate, validIds } = require('../middleware/validate');
const gv = require('../validators/groupValidators');
const mv = require('../validators/matchValidators');
const cv = require('../validators/chatValidators');
const calCtrl = require('../controllers/calendarController');

const router = Router();
router.use(requireAuth);

router.get('/', ctrl.list);
router.post('/', validate({ body: gv.createGroup }), ctrl.create);
router.get('/invite/:code', ctrl.preview);
router.post('/join', validate({ body: gv.join }), ctrl.join);

// Da qui in poi servono gruppo esistente e appartenenza (404 / 403).
const inGroup = [validIds('groupId'), loadGroup];
const admin = [...inGroup, requireGroupAdmin];

router.get('/:groupId', inGroup, ctrl.show);
router.get('/:groupId/dashboard', inGroup, ctrl.dashboard);
router.get('/:groupId/activity', inGroup, validate({ query: cv.listActivity }), ctrl.activity);
router.patch('/:groupId', admin, validate({ body: gv.updateGroup }), ctrl.update);
router.post('/:groupId/invite-code', admin, ctrl.regenerateCode);
router.get('/:groupId/members', inGroup, ctrl.members);
router.patch('/:groupId/members/:userId', admin, validIds('userId'), validate({ body: gv.setRole }), ctrl.setRole);
router.delete('/:groupId/members/:userId', inGroup, validIds('userId'), ctrl.removeMember);
router.get('/:groupId/prize-stats', inGroup, ctrl.prizeStats);

router.get('/:groupId/nicknames', inGroup, validate({ query: gv.listNicknames }), ctrl.listNicknames);
router.post('/:groupId/nicknames', inGroup, validate({ body: gv.proposeNickname }), ctrl.proposeNickname);
router.post('/:groupId/nicknames/:nicknameId/reject', inGroup, validIds('nicknameId'), ctrl.rejectNickname);
router.post('/:groupId/nicknames/:nicknameId/replace', inGroup, validIds('nicknameId'), validate({ body: gv.replaceNickname }), ctrl.replaceNickname);
router.delete('/:groupId/nicknames/:nicknameId', admin, validIds('nicknameId'), ctrl.removeNickname);

router.get('/:groupId/matches', inGroup, validate({ query: mv.listMatches }), matchCtrl.list);
router.post('/:groupId/matches', inGroup, validate({ body: mv.createMatch }), matchCtrl.create);

router.get('/:groupId/polls', inGroup, validate({ query: pv.list }), pollCtrl.list);
router.post('/:groupId/polls', inGroup, validate({ body: pv.createPoll }), pollCtrl.create);
router.get('/:groupId/players/:userId/card', inGroup, validIds('userId'), validate({ query: mv.cardScope }), playerCtrl.card);
router.get('/:groupId/players/:userId/progression', inGroup, validIds('userId'), playerCtrl.progression);
router.get('/:groupId/players/:userId/achievements', inGroup, validIds('userId'), playerCtrl.achievements);
router.get('/:groupId/rivalries', inGroup, rivalryCtrl.list);
router.post('/:groupId/rivalries', inGroup, validate({ body: gv.proposeRivalry }), rivalryCtrl.propose);
router.get('/:groupId/rivalries/:userId', inGroup, validIds('userId'), validate({ query: gv.versusQuery }), rivalryCtrl.detail);
router.get('/:groupId/series', inGroup, calCtrl.listSeries);
router.post('/:groupId/series', inGroup, validate({ body: mv.createSeries }), calCtrl.createSeries);
router.get('/:groupId/availability', inGroup, validate({ query: mv.availabilityQuery }), calCtrl.availability);
router.put('/:groupId/availability/:date', inGroup, validate({ body: mv.setAvailability }), calCtrl.setAvailability);
router.delete('/:groupId/availability/:date', inGroup, calCtrl.clearAvailability);
router.get('/:groupId/seasons', inGroup, ctrl.listSeasons);
router.post('/:groupId/seasons', admin, validate({ body: gv.createSeason }), ctrl.createSeason);
router.delete('/:groupId/seasons/:seasonId', admin, validIds('seasonId'), ctrl.removeSeason);
router.get('/:groupId/club', inGroup, ctrl.club);
router.put('/:groupId/club/crest', admin, uploadImage(LIMITS.crest), ctrl.setClubImage('crest'));
router.delete('/:groupId/club/crest', admin, ctrl.removeClubImage('crest'));
router.put('/:groupId/club/cover', admin, uploadImage(LIMITS.cover), ctrl.setClubImage('cover'));
router.delete('/:groupId/club/cover', admin, ctrl.removeClubImage('cover'));
router.get('/:groupId/hall-of-fame', inGroup, ctrl.hallOfFame);
router.get('/:groupId/rankings', inGroup, validate({ query: mv.rankings }), postCtrl.rankings);

router.get('/:groupId/messages', inGroup, validate({ query: cv.listMessages }), chatCtrl.list);
router.post('/:groupId/messages', inGroup, validate({ body: cv.postMessage }), chatCtrl.post);
router.post('/:groupId/messages/read', inGroup, chatCtrl.markRead);
router.post('/:groupId/messages/:messageId/reactions', inGroup, validIds('messageId'), validate({ body: cv.reaction }), chatCtrl.react);

module.exports = router;
