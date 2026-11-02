'use strict';

const { unauthorized } = require('../utils/AppError');
const authService = require('../services/authService');

/** Richiede un JWT valido e non revocato in "Authorization: Bearer <token>". */
async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());
  try {
    const { user, payload } = await authService.authenticate(token);
    req.user = user;
    req.token = payload;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAuth };
