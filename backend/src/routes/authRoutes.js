'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const v = require('../validators/authValidators');

const router = Router();

router.post('/register', validate({ body: v.register }), ctrl.register);
router.post('/login', validate({ body: v.login }), ctrl.login);
router.post('/logout', requireAuth, ctrl.logout);
router.get('/me', requireAuth, ctrl.me);

module.exports = router;
