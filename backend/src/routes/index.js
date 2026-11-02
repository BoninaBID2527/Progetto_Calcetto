'use strict';

const { Router } = require('express');
const { appConfig } = require('../config/appConfig');

const router = Router();

router.get('/health', (req, res) => res.json({ status: 'ok', app: appConfig.appName, time: new Date().toISOString() }));
router.get('/config', (req, res) => res.json(appConfig));

router.use('/auth', require('./authRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/groups', require('./groupRoutes'));
router.use('/matches', require('./matchRoutes'));
router.use('/notifications', require('./notificationRoutes'));

module.exports = router;
