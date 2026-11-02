'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/pollController');
const { requireAuth } = require('../middleware/auth');
const { loadPoll } = require('../middleware/access');
const { validate, validIds } = require('../middleware/validate');
const v = require('../validators/pollValidators');

const router = Router();
router.use(requireAuth);

const inPoll = [validIds('pollId'), loadPoll];

router.get('/:pollId', inPoll, ctrl.show);
router.put('/:pollId/response', inPoll, validate({ body: v.respond }), ctrl.respond);
router.post('/:pollId/convert', inPoll, validate({ body: v.convert }), ctrl.convert);
router.post('/:pollId/cancel', inPoll, ctrl.cancel);

module.exports = router;
