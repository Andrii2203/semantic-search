'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const logger = require('../logger');
const db = require('../db');

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

// Token format: userId.randomValue.sig  (2 dots, userId has no dots)
function createSessionToken(userId) {
  const value = crypto.randomBytes(32).toString('base64url');
  const payload = `${userId}.${value}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

// Returns userId if valid, null otherwise
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const firstDot = token.indexOf('.');
  const lastDot = token.lastIndexOf('.');
  if (firstDot < 0 || firstDot === lastDot) return null;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = sign(payload);
  try {
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    return token.slice(0, firstDot); // userId
  } catch {
    return null;
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

const PUBLIC_PREFIXES = ['/api/auth', '/api/health', '/api/client-error'];

function isPublic(path) {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

function getSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] || null;
}

function requireAuth(req, res, next) {
  if (isPublic(req.path)) return next();

  const token = getSessionToken(req);
  const userId = verifySessionToken(token);
  if (!userId) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  req.userId = userId;
  next();
}

async function login(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: { code: 'VALIDATION_FAILED', message: 'Email and password are required' },
    });
  }

  const user = db.findUserByEmail(email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
    });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
    });
  }

  const token = createSessionToken(user.id);
  res.setHeader('Set-Cookie', buildCookieHeader(token));
  logger.info({ userId: user.id }, 'User logged in');
  res.json({ success: true });
}

async function register(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: { code: 'VALIDATION_FAILED', message: 'Email and password are required' },
    });
  }
  if (password.length < 8) {
    return res.status(400).json({
      error: { code: 'VALIDATION_FAILED', message: 'Password must be at least 8 characters' },
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  if (db.findUserByEmail(normalizedEmail)) {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'Email already registered' },
    });
  }

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  db.createUser({ id, email: normalizedEmail, passwordHash });

  const token = createSessionToken(id);
  res.setHeader('Set-Cookie', buildCookieHeader(token));
  logger.info({ userId: id, email: normalizedEmail }, 'User registered');
  res.status(201).json({ success: true });
}

function logout(req, res) {
  res.setHeader('Set-Cookie', clearCookieHeader());
  res.json({ success: true });
}

function getStatus(req, res) {
  const token = getSessionToken(req);
  const userId = verifySessionToken(token);
  if (!userId) {
    return res.json({ authenticated: false });
  }
  const user = db.findUserById(userId);
  res.json({ authenticated: true, userId, email: user?.email || null });
}

module.exports = {
  requireAuth,
  login,
  register,
  logout,
  getStatus,
  parseCookies,
  verifySessionToken,
  createSessionToken,
};
