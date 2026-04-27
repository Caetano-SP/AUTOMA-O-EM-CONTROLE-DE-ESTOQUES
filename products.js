const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../database');
const router = express.Router();

// Configurar onde salvar as fotos
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads/')),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Rota: Cadastrar Novo Produto
router.post('/', upload.single('foto'), (req, res) => {
    const { name, sku, category, supplier_id, is_manufactured } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const sql = `INSERT INTO products (name, sku, category, image_url, supplier_id, is_manufactured) VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [name, sku, category, imageUrl, supplier_id, is_manufactured || 0], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Produto cadastrado", id: this.lastID, photo: imageUrl });
    });
});

// Rota: Alertas Críticos (Estoque baixo x Tempo da China)
router.get('/alerts/critical', (req, res) => {
    const sql = `
        SELECT p.name, p.current_stock, p.min_stock, s.origin, s.lead_time_days,
               (p.min_stock - p.current_stock) * s.lead_time_days as risk_score
        FROM products p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.current_stock < p.min_stock
        ORDER BY risk_score DESC
    `;
    db.all(sql, [], (err, rows) => res.json(err ? { error: err.message } : rows));
});
// Rota: Criar ou Atualizar a "Receita" (BOM) de um Produto Fabricado
router.post('/:id/composition', (req, res) => {
    const parentProductId = req.params.id;
    const { components } = req.body; 
    // components deve ser um array: [{ child_id: 2, quantity: 1 }, { child_id: 5, quantity: 2 }]

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // 1. Limpa a receita antiga caso você esteja atualizando a placa
        db.run("DELETE FROM product_composition WHERE parent_product_id = ?", [parentProductId]);

        // 2. Prepara a inserção dos novos componentes
        const stmt = db.prepare("INSERT INTO product_composition (parent_product_id, child_component_id, quantity_needed) VALUES (?, ?, ?)");
        
        for (const item of components) {
            stmt.run(parentProductId, item.child_id, item.quantity);
        }
        
        stmt.finalize();

        db.run("COMMIT", (err) => {
            if (err) {
                return res.status(500).json({ error: "Erro ao salvar a receita da placa." });
            }
            res.json({ message: "Receita (BOM) salva com sucesso! Agora a baixa automática vai funcionar." });
        });
    });
});
// Rota: Listar TODOS os produtos para o Dashboard
router.get('/', (req, res) => {
    const sql = "SELECT * FROM products ORDER BY id DESC";
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});
module.exports = router;