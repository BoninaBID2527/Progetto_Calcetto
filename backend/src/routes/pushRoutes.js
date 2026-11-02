'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z } = require('../validators/common');
const pushService = require('../services/pushService');

const router = Router();
router.use(requireAuth);

const subscription = z
  .object({
    endpoint: z.string().url().max(1000).refine((v) => v.startsWith('https://'), 'Endpoint push non valido (serve https).'),
    keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
    expirationTime: z.any().optional(),
  })
  .strip();
const endpointOnly = z.object({ endpoint: z.string().url().max(1000) }).strip();

router.get('/config', (req, res) => res.json({ enabled: pushService.isEnabled(), publicKey: pushService.isEnabled() ? pushService.publicKey() : null }));

router.post('/subscriptions', validate({ body: subscription }), async (req, res) => {
  await pushService.subscribe(req.user, req.body, req.get('user-agent') || '');
  res.status(201).json({ subscribed: true });
});

router.delete('/subscriptions', validate({ body: endpointOnly }), async (req, res) => {
  await pushService.unsubscribe(req.user, req.body.endpoint);
  res.status(204).end();
});

router.post('/test', async (req, res) => res.json(await pushService.sendTest(req.user)));

module.exports = router;
