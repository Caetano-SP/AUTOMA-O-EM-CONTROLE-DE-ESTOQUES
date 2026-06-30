const express = require('express');
const router = express.Router();
const usersController = require('./users.controller');
const validarSchema = require('../../middlewares/validate.middleware');
const { registerUserSchema } = require('./users.schema');
const { verificarCracha, verificarRole } = require('../../middlewares/auth.middleware');

// Todas as rotas de usuários requerem Crachá e privilégio de ADMIN
router.use(verificarCracha, verificarRole(['admin']));

router.get('/', usersController.listUsers);
router.post('/register', validarSchema(registerUserSchema), usersController.registerUser);
router.delete('/:id', usersController.deleteUser);
router.put('/:id/role', usersController.updateUserRole);

module.exports = router;
