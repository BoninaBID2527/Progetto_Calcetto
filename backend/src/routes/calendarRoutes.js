'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/calendarController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const v = require('../validators/matchValidators');

const router = Router();
router.use(requireAuth);

router.get('/', validate({ query: v.calendarQuery }), ctrl.range);
router.get('/export.ics', validate({ query: v.exportQuery }), ctrl.exportIcs);

module.exports = router;
