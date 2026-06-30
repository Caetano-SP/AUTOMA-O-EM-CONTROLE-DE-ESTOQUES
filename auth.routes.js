const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const validarSchema = require('../../middlewares/validate.middleware');
const { loginSchema } = require('./auth.schema');

// POST /api/auth/login
router.post('/login', validarSchema(loginSchema), authController.login);

module.exports = router;
