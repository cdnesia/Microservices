const express = require('express');
const { verifyToken } = require('../utils/jwt');
const { resolveRequiredScope } = require('../scopeRegistry');

const router = express.Router();

// Dipanggil oleh Traefik forwardAuth middleware untuk setiap request yang lewat gateway.
// Menggabungkan langkah "auth" (validasi JWT) dan "scope-check" dalam satu hop.
router.all('/verify', (req, res, next) => {
  try {
    verifyRequest(req, res);
  } catch (err) {
    next(err);
  }
});

function verifyRequest(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'missing_token' });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token', error_description: err.message });
  }

  const method = req.headers['x-forwarded-method'] || req.method;
  const uri = req.headers['x-forwarded-uri'] || req.originalUrl;
  const path = String(uri).split('?')[0];

  const requiredScope = resolveRequiredScope(method, path);
  if (!requiredScope) {
    // Deny-by-default: route belum terdaftar di routeScopes.
    return res.status(403).json({ error: 'route_not_allowed' });
  }

  const grantedScopes = payload.scopes || [];
  if (!grantedScopes.includes(requiredScope)) {
    return res
      .status(403)
      .json({ error: 'insufficient_scope', required_scope: requiredScope });
  }

  res.set('X-Client-Id', payload.sub);
  res.set('X-Auth-Scopes', grantedScopes.join(' '));
  return res.status(200).end();
}

module.exports = router;
