const express = require('express');
const router = express.Router();
const auditController = require('./audit.controller');
const { verificarCracha, verificarRole } = require('../../middlewares/auth.middleware');

// Qualquer um logado pode registrar ações (ex: app no celular)
router.post('/log', verificarCracha, auditController.logAction);

// Apenas Administradores podem visualizar a aba de auditoria
router.get('/history', verificarCracha, verificarRole(['admin']), auditController.getHistory);

module.exports = router;
