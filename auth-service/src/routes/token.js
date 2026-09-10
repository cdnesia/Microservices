const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { findClientById } = require('../data/clients');
const { signToken, ACCESS_TOKEN_TTL_SECONDS } = require('../utils/jwt');
const {
  REFRESH_TOKEN_TTL_MS,
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshTokenById,
} = require('../data/refreshTokens');

const router = express.Router();

// Batasi brute-force ke endpoint token secara ketat (di luar rate-limit gateway).
// Di-key per client_id kalau ada di body (supaya satu client tidak bisa habiskan kuota
// client lain di belakang IP/NAT yang sama), fallback ke IP kalau body belum valid.
const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const clientId = req.body && typeof req.body.client_id === 'string' ? req.body.client_id : null;
    return clientId || req.ip;
  },
});

async function issueTokenPair(client, scopes) {
  const accessToken = signToken(client.clientId, scopes);
  const { token: refreshToken, expiresAt } = await createRefreshToken(client.clientId, scopes);

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    scope: scopes.join(' '),
    refresh_token: refreshToken,
    refresh_token_expires_in: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
  };
}

async function handleClientCredentials(req, res) {
  const body = req.body || {};
  const clientId = body.client_id;
  const clientSecret = body.client_secret;
  const scope = body.scope;

  if (typeof clientId !== 'string' || typeof clientSecret !== 'string') {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'client_id and client_secret must be strings',
    });
  }
  if (scope !== undefined && typeof scope !== 'string') {
    return res.status(400).json({ error: 'invalid_request', error_description: 'scope must be a string' });
  }
  if (!clientId || !clientSecret) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'client_id and client_secret required',
    });
  }

  const client = await findClientById(clientId);
  if (!client || client.status !== 'active') {
    return res.status(401).json({ error: 'invalid_client' });
  }

  const secretMatches = await bcrypt.compare(clientSecret, client.clientSecretHash);
  if (!secretMatches) {
    return res.status(401).json({ error: 'invalid_client' });
  }

  const requestedScopes = (scope ? scope.split(' ') : client.allowedScopes).filter(Boolean);
  const hasInvalidScope = requestedScopes.some((s) => !client.allowedScopes.includes(s));
  if (hasInvalidScope) {
    return res.status(400).json({ error: 'invalid_scope' });
  }

  const tokenResponse = await issueTokenPair(client, requestedScopes);
  return res.json(tokenResponse);
}

async function handleRefreshToken(req, res) {
  const body = req.body || {};
  const refreshToken = body.refresh_token;

  if (typeof refreshToken !== 'string' || !refreshToken) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'refresh_token is required',
    });
  }

  const stored = await findValidRefreshToken(refreshToken);
  if (!stored) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'refresh token invalid or expired' });
  }

  const client = await findClientById(stored.clientId);
  if (!client || client.status !== 'active') {
    await revokeRefreshTokenById(stored.id);
    return res.status(401).json({ error: 'invalid_client' });
  }

  // Scope bisa saja sudah dicabut dari client sejak refresh token ini terbit —
  // saring supaya token baru tidak lebih besar hak-nya dari allowed_scopes saat ini.
  const stillAllowedScopes = stored.scopes.filter((s) => client.allowedScopes.includes(s));
  if (stillAllowedScopes.length === 0) {
    await revokeRefreshTokenById(stored.id);
    return res.status(400).json({ error: 'invalid_scope', error_description: 'no scopes remain valid for this client' });
  }

  // Rotasi: refresh token lama langsung dicabut begitu dipakai, supaya kalau ada
  // yang mencuri & memakainya duluan, refresh token itu tidak bisa dipakai dua kali.
  await revokeRefreshTokenById(stored.id);

  const tokenResponse = await issueTokenPair(client, stillAllowedScopes);
  return res.json(tokenResponse);
}

router.post('/token', tokenLimiter, async (req, res, next) => {
  try {
    const grantType = req.body && req.body.grant_type;

    if (grantType === 'client_credentials') {
      return await handleClientCredentials(req, res);
    }
    if (grantType === 'refresh_token') {
      return await handleRefreshToken(req, res);
    }
    return res.status(400).json({ error: 'unsupported_grant_type' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
