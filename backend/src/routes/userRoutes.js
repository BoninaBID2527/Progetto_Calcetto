'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const v = require('../validators/authValidators');

const router = Router();

router.get('/me', requireAuth, ctrl.me);
router.patch('/me', requireAuth, validate({ body: v.updateMe }), ctrl.updateMe);

module.exports = router;
