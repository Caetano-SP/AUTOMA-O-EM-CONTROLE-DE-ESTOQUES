const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const ordersController = require('./orders.controller');
const { verificarCracha, verificarRole } = require('../../middlewares/auth.middleware');
const validarSchema = require('../../middlewares/validate.middleware');
const { orderSchema } = require('./orders.schema');

// Configuração de Fotos em Memória
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage, 
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error("Apenas imagens são permitidas"), false);
    },
    limits: { fileSize: 15 * 1024 * 1024 }
});

const comprimirImagem = async (req, res, next) => {
    if (!req.file) return next();
    req.file.filename = Date.now() + '.webp';
    const outputPath = path.join(__dirname, '../../../uploads/', req.file.filename);
    try {
        await sharp(req.file.buffer)
            .resize({ width: 800, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(outputPath);
        next();
    } catch (error) {
        console.error("Erro ao comprimir imagem de pedido:", error);
        return res.status(500).json({ error: "Erro ao comprimir imagem." });
    }
};

// Rotas de Pedidos
router.get('/', verificarCracha, ordersController.listOrders);
router.post('/', verificarCracha, verificarRole(['admin']), validarSchema(orderSchema), ordersController.createOrder);
router.put('/:id', verificarCracha, verificarRole(['admin']), validarSchema(orderSchema), ordersController.updateOrder);
router.delete('/:id', verificarCracha, verificarRole(['admin']), ordersController.deleteOrder);
router.post('/:id/ship', verificarCracha, upload.single('foto'), comprimirImagem, ordersController.shipOrder);

module.exports = router;
