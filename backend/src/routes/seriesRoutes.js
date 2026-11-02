'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/calendarController');
const { requireAuth } = require('../middleware/auth');
const { validate, validIds } = require('../middleware/validate');
const v = require('../validators/matchValidators');

const router = Router();
router.use(requireAuth);

router.patch('/:seriesId', validIds('seriesId'), validate({ body: v.updateSeries }), ctrl.updateSeries);
router.delete('/:seriesId', validIds('seriesId'), validate({ query: v.endSeries }), ctrl.endSeries);

module.exports = router;
