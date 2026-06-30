const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const db = require('../../database');
const validarSchema = require('../../middlewares/validate.middleware');
const { verificarCracha, verificarRole } = require('../../middlewares/auth.middleware');
const schemas = require('./products.schema');

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
        return res.status(500).json({ error: "Erro ao comprimir imagem." });
    }
};

// ==========================================
// ROTAS DE PRODUTOS
// ==========================================

// Listar todos os produtos (Livre para logados)
router.get('/', verificarCracha, (req, res) => {
    db.all("SELECT * FROM products ORDER BY id DESC", [], (err, rows) => res.json(rows));
});

// Listar itens críticos (Livre para logados)
router.get('/alerts/critical', verificarCracha, (req, res) => {
    db.all("SELECT * FROM products WHERE current_stock < min_stock", [], (err, rows) => res.json(rows));
});

// Criar novo produto com foto (Livre para logados)
// Obs: O multer consome formData, o body chega como string, então para simplificar vamos ignorar a Joi spec aqui 
// ou deveríamos validá-la manualmente.
router.post('/', verificarCracha, upload.single('foto'), comprimirImagem, (req, res) => {
    let { name, sku, category, is_manufactured, supplier } = req.body;
    if (!sku || String(sku).trim() === '') sku = `AUTO-${Math.floor(Math.random() * 1000000)}`;
    if (!supplier || String(supplier).trim() === '') supplier = '360virtu';

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const currentStock = 0;
    const minStock = 5;

    const sql = `INSERT INTO products (name, sku, category, is_manufactured, supplier, current_stock, min_stock, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [name, sku, category, is_manufactured, supplier, currentStock, minStock, imageUrl], function(err) {
        if (err) return res.status(500).json({ error: "Erro ao cadastrar. SKU existente." });
        const userName = (req.user && req.user.name) ? req.user.name : 'Sistema';
        db.run("INSERT INTO stock_movements (product_id, type, quantity, reason, user_name) VALUES (?, 'IN', 0, 'Cadastro Inicial', ?)", [this.lastID, userName]);
        req.app.get('io').emit('estoque_alterado');
        res.json({ message: "Produto cadastrado", id: this.lastID });
    });
});

// Atualizar Estoque (Livre para logados)
router.put('/:id/stock', verificarCracha, validarSchema(schemas.stockUpdateSchema), (req, res) => {
    let { name, category, is_manufactured, stock, userName, supplier } = req.body;
    if (supplier === 'null' || !supplier || String(supplier).trim() === '') supplier = '360virtu';
    const sql = `UPDATE products SET name = ?, category = ?, is_manufactured = ?, supplier = ?, current_stock = ? WHERE id = ?`;
    db.run(sql, [name, category, is_manufactured, supplier, stock, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: "Erro banco." });
        db.run("INSERT INTO stock_movements (product_id, type, quantity, reason, user_name) VALUES (?, 'OUT', ?, 'Ajuste/Edição Manual', ?)", [req.params.id, stock, userName || "Sistema"]);
        req.app.get('io').emit('estoque_alterado');
        res.json({ message: "OK" });
    });
});

// Atualizar Foto (Livre para logados)
router.put('/:id/image', verificarCracha, upload.single('foto'), comprimirImagem, (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nenhuma foto chegou." });
    const imageUrl = `/uploads/${req.file.filename}`;
    db.run("UPDATE products SET image_url = ? WHERE id = ?", [imageUrl, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: "Erro ao salvar foto." });
        req.app.get('io').emit('estoque_alterado');
        res.json({ message: "Foto atualizada!" });
    });
});

// Salvar Receita/BOM (Livre para logados)
router.post('/:id/composition', verificarCracha, validarSchema(schemas.compositionSchema), (req, res) => {
    const { components } = req.body;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("DELETE FROM product_composition WHERE parent_product_id = ?", [req.params.id]);
        const stmt = db.prepare("INSERT INTO product_composition (parent_product_id, child_component_id, quantity_needed) VALUES (?, ?, ?)");
        for (let c of components) stmt.run([req.params.id, c.child_id, c.quantity]);
        stmt.finalize();
        db.run("COMMIT", (err) => {
            if (err) return res.status(500).json({ error: "Erro banco." });
            res.json({ message: "Receita salva!" });
        });
    });
});
// Listar todas as composições (BOMs) cadastradas
router.get('/composition', verificarCracha, (req, res) => {
    const sql = `
        SELECT DISTINCT 
            p.id, 
            p.name, 
            p.sku, 
            p.category, 
            (SELECT COUNT(*) FROM product_composition WHERE parent_product_id = p.id) as component_count 
        FROM products p 
        JOIN product_composition pc ON p.id = pc.parent_product_id
        ORDER BY p.name ASC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro ao buscar receitas." });
        res.json(rows || []);
    });
});

// Detalhar a composição de um produto específico
router.get('/:id/composition', verificarCracha, (req, res) => {
    const sql = `
        SELECT 
            pc.child_component_id as child_id, 
            p.name, 
            p.sku, 
            pc.quantity_needed as quantity 
        FROM product_composition pc 
        JOIN products p ON pc.child_component_id = p.id 
        WHERE pc.parent_product_id = ?
    `;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: "Erro ao buscar composição." });
        res.json(rows || []);
    });
});

// Deletar a composição inteira de um produto (Admin only)
router.delete('/:id/composition', verificarCracha, verificarRole(['admin']), (req, res) => {
    db.run("DELETE FROM product_composition WHERE parent_product_id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: "Erro ao excluir composição." });
        res.json({ message: "Composição excluída com sucesso." });
    });
});

// 🛡️ EXCLUSÃO TOTAL: Somente Administrador
router.delete('/:id', verificarCracha, verificarRole(['admin']), (req, res) => {
    const id = req.params.id;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("DELETE FROM stock_movements WHERE product_id = ?", [id]);
        db.run("DELETE FROM purchase_orders WHERE product_id = ?", [id]);
        db.run("DELETE FROM product_composition WHERE parent_product_id = ? OR child_component_id = ?", [id, id]);
        db.run("DELETE FROM products WHERE id = ?", [id], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: "Item travado no banco." });
            }
            db.run("COMMIT");
            req.app.get('io').emit('estoque_alterado');
            res.json({ message: "Excluído com sucesso" });
        });
    });
});

// 🛡️ CARGA EM LOTE: Somente Administrador
router.post('/bulk', verificarCracha, verificarRole(['admin']), validarSchema(schemas.bulkImportSchema), async (req, res) => {
    const { itens } = req.body;
    const userName = (req.user && req.user.name) ? req.user.name : "Sistema";
    const dadosReais = itens[0].nome && itens[0].nome.toLowerCase() === 'nome' ? itens.slice(1) : itens;

    if (dadosReais.length === 0) return res.status(400).json({ error: "Arquivo vazio." });

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const stmtProduto = db.prepare("INSERT INTO products (name, sku, category, is_manufactured, supplier, current_stock, min_stock) VALUES (?, ?, ?, ?, '360virtu', ?, 5)");
        const stmtHistorico = db.prepare("INSERT INTO stock_movements (product_id, type, quantity, reason, user_name) VALUES (?, 'IN', ?, 'Carga Inicial via Planilha', ?)");

        let promises = dadosReais.map(item => {
            return new Promise((resolve, reject) => {
                const skuFinal = item.sku && String(item.sku).trim() !== '' ? item.sku : `AUTO-${Math.floor(Math.random() * 1000000)}`;
                const qtd = parseFloat(item.quantidade) || 0;
                const tipo = parseInt(item.tipo) || 0;
                stmtProduto.run([item.nome, skuFinal, item.categoria, tipo, qtd], function(err) {
                    if (err) return reject(err);
                    if (qtd > 0) {
                        stmtHistorico.run([this.lastID, qtd, userName], (err2) => {
                            if (err2) return reject(err2);
                            resolve();
                        });
                    } else resolve();
                });
            });
        });

        Promise.all(promises).then(() => {
            stmtProduto.finalize(); stmtHistorico.finalize();
            db.run("COMMIT", (err) => {
                if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: "Erro" }); }
                req.app.get('io').emit('estoque_alterado');
                res.json({ message: "Lote processado!" });
            });
        }).catch(err => {
            stmtProduto.finalize(); stmtHistorico.finalize();
            db.run("ROLLBACK"); return res.status(500).json({ error: "Falha na inserção." });
        });
    });
});

module.exports = router;
