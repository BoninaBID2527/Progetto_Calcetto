'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/groupController');
const matchCtrl = require('../controllers/matchController');
const chatCtrl = require('../controllers/chatController');
const postCtrl = require('../controllers/postMatchController');
const pollCtrl = require('../controllers/pollController');
const pv = require('../validators/pollValidators');
const { requireAuth } = require('../middleware/auth');
const { loadGroup, requireGroupAdmin } = require('../middleware/access');
const { validate, validIds } = require('../middleware/validate');
const gv = require('../validators/groupValidators');
const mv = require('../validators/matchValidators');
const cv = require('../validators/chatValidators');

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
router.get('/:groupId/rankings', inGroup, validate({ query: mv.rankings }), postCtrl.rankings);

router.get('/:groupId/messages', inGroup, validate({ query: cv.listMessages }), chatCtrl.list);
router.post('/:groupId/messages', inGroup, validate({ body: cv.postMessage }), chatCtrl.post);
router.post('/:groupId/messages/read', inGroup, chatCtrl.markRead);
router.post('/:groupId/messages/:messageId/reactions', inGroup, validIds('messageId'), validate({ body: cv.reaction }), chatCtrl.react);

module.exports = router;
