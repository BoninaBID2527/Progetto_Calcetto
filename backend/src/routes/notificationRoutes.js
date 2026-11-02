'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/chatController');
const { requireAuth } = require('../middleware/auth');
const { validate, validIds } = require('../middleware/validate');
const v = require('../validators/chatValidators');

const router = Router();

router.use(requireAuth);
router.get('/', validate({ query: v.listNotifications }), ctrl.notifications);
router.post('/read-all', ctrl.readAllNotifications);
router.post('/:notificationId/read', validIds('notificationId'), ctrl.readNotification);

module.exports = router;
