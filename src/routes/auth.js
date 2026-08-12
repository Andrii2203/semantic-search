'use strict';

const express = require('express');
const { login, register, logout, getStatus } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.post('/logout', logout);
router.get('/status', getStatus);

module.exports = router;
