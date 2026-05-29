'use strict';

const crypto = require('crypto');
const config = require('../config');
const logger = require('../logger');

const SESSION_COOKIE = 'ume_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return acc;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    acc[key] = val;
    return acc;
  }, {});
}

function sign(value) {
  return crypto
    .createHmac('sha256', config.sessionSecret)
    .update(value)
    .digest('base64url');
}

function createSessionToken() {
  const value = crypto.randomBytes(32).toString('base64url');
  const sig = sign(value);
  return `${value}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return false;
  const value = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(value);
  try {
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

function buildCookieHeader(value) {
  const flags = [
    `${SESSION_COOKIE}=${value}`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (config.isProduction) flags.push('Secure');
  return flags.join('; ');
}

function clearCookieHeader() {
  const flags = [
    `${SESSION_COOKIE}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (config.isProduction) flags.push('Secure');
  return flags.join('; ');
}

// Routes that bypass auth unconditionally
const PUBLIC_PREFIXES = ['/api/auth', '/api/health', '/api/client-error'];
// Routes that are public (Files mode)
const PUBLIC_ROUTES = ['/api/upload', '/api/search'];

function isPublic(path) {
  if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) return true;
  if (PUBLIC_ROUTES.some((p) => path === p || path.startsWith(p + '/'))) return true;
  return false;
}

function getSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] || null;
}

function requireAuth(req, res, next) {
  if (!config.internetModePassword) return next();
  if (isPublic(req.path)) return next();

  const token = getSessionToken(req);
  if (!token || !verifySessionToken(token)) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  next();
}

function login(req, res) {
  const { password } = req.body || {};

  if (!config.internetModePassword) {
    return res.json({ success: true, passwordRequired: false });
  }

  if (!password || password !== config.internetModePassword) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid password' },
    });
  }

  const token = createSessionToken();
  res.setHeader('Set-Cookie', buildCookieHeader(token));
  logger.info('User authenticated');
  res.json({ success: true, passwordRequired: true });
}

function logout(req, res) {
  res.setHeader('Set-Cookie', clearCookieHeader());
  res.json({ success: true });
}

function getStatus(req, res) {
  if (!config.internetModePassword) {
    return res.json({ authenticated: true, passwordRequired: false });
  }
  const token = getSessionToken(req);
  const authenticated = verifySessionToken(token);
  res.json({ authenticated, passwordRequired: true });
}

module.exports = {
  requireAuth,
  login,
  logout,
  getStatus,
  parseCookies,
  verifySessionToken,
  createSessionToken,
};
