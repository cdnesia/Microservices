const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { findClientById } = require('../data/clients');
const { revokeRefreshTokenByValue } = require('../data/refreshTokens');

const router = express.Router();

const revokeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Mirip RFC 7009: client harus autentikasi (client_id + client_secret) untuk mencabut
// refresh token miliknya sendiri — supaya tidak ada yang bisa iseng revoke token orang
// lain hanya dengan menebak nilai token.
router.post('/revoke', revokeLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const { client_id: clientId, client_secret: clientSecret, token } = body;

    if (
      typeof clientId !== 'string' ||
      typeof clientSecret !== 'string' ||
      typeof token !== 'string' ||
      !clientId ||
      !clientSecret ||
      !token
    ) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'client_id, client_secret, and token are required',
      });
    }

    const client = await findClientById(clientId);
    if (!client) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    const secretMatches = await bcrypt.compare(clientSecret, client.clientSecretHash);
    if (!secretMatches) {
      return res.status(401).json({ error: 'invalid_client' });
    }

    // Sesuai RFC 7009: revoke selalu 200 walau token tidak ditemukan/sudah revoked,
    // supaya endpoint ini tidak bisa dipakai untuk menebak token mana yang valid.
    await revokeRefreshTokenByValue(token);
    return res.status(200).json({ revoked: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
