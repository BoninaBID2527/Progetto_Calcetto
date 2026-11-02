'use strict';

const { Router } = require('express');
const ctrl = require('../controllers/rivalryController');
const { requireAuth } = require('../middleware/auth');
const { validIds } = require('../middleware/validate');

const router = Router();
router.use(requireAuth);

router.post('/:rivalryId/accept', validIds('rivalryId'), ctrl.accept);
router.post('/:rivalryId/decline', validIds('rivalryId'), ctrl.decline);
router.delete('/:rivalryId', validIds('rivalryId'), ctrl.end);

module.exports = router;
