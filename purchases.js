const express = require('express');
const db = require('../database');
const jwt = require('jsonwebtoken');
const router = express.Router();

const CHAVE_MESTRA = "360stock_seguranca_maxima_2026";

// Segurança: Verificar Crachá Digital (JWT)
function verificarCracha(req, res, next) {
    const tokenHeader = req.headers['authorization'];
    if (!tokenHeader) return res.status(401).json({ error: "Acesso negado" });
    const token = tokenHeader.split(' ')[1];
    jwt.verify(token, CHAVE_MESTRA, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Sessão expirada" });
        req.user = decoded;
        next();
    });
}

// 1. Rota: Registrar nova importação/compra - BLINDADA
router.post('/', verificarCracha, (req, res) => {
    const { product_id, quantity, priority, estimated_arrival } = req.body;
    const query = `INSERT INTO purchase_orders (product_id, quantity, status, priority, estimated_arrival) VALUES (?, ?, 'Em Trânsito', ?, ?)`;
    
    db.run(query, [product_id, quantity, priority, estimated_arrival], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Pedido registrado!", id: this.lastID });
    });
});

// 2. Rota: Listar o que está "Em Trânsito" (Apenas leitura, não precisa blindar forte)
router.get('/pending', (req, res) => {
    const sql = `
        SELECT po.*, p.name, p.sku 
        FROM purchase_orders po
        JOIN products p ON po.product_id = p.id
        WHERE po.status = 'Em Trânsito'
        ORDER BY po.estimated_arrival ASC
    `;
    db.all(sql, [], (err, rows) => res.json(err ? { error: err.message } : rows));
});

// 3. Rota: Receber a Carga (Mágica da Logística) - BLINDADA
router.post('/:id/receive', verificarCracha, (req, res) => {
    const orderId = req.params.id;
    const userName = req.user.name; // Identifica quem recebeu a carga
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        // A. Pega os dados do pedido
        db.get("SELECT product_id, quantity FROM purchase_orders WHERE id = ?", [orderId], (err, order) => {
            if (err || !order) {
                db.run("ROLLBACK");
                return res.status(404).json({ error: "Pedido não encontrado" });
            }

            // B. Atualiza o pedido para 'Recebido'
            db.run("UPDATE purchase_orders SET status = 'Recebido' WHERE id = ?", [orderId]);

            // C. Soma as peças na prateleira
            db.run("UPDATE products SET current_stock = current_stock + ? WHERE id = ?", [order.quantity, order.product_id]);

            // D. Salva no histórico de auditoria quem conferiu a carga
            db.run("INSERT INTO stock_movements (product_id, type, quantity, reason, user_name) VALUES (?, 'IN', ?, 'Recebimento de Importação', ?)", [order.product_id, order.quantity, userName]);

            db.run("COMMIT", (commitErr) => {
                if (commitErr) return res.status(500).json({ error: "Erro ao processar recebimento." });
                
                req.app.get('io').emit('estoque_alterado');
                res.json({ message: "Carga recebida com sucesso! Estoque atualizado." });
            });
        });
    });
});
// ==========================================
// EXCLUIR IMPORTAÇÃO (CANCELAR/APAGAR TESTES)
// ==========================================
router.delete('/:id', verificarCracha, (req, res) => {
    const id = req.params.id;

    db.run("DELETE FROM purchase_orders WHERE id = ?", [id], function(err) {
        if (err) {
            console.error("Erro ao excluir importação:", err.message);
            return res.status(500).json({ error: "Erro ao excluir a importação no banco de dados." });
        }
        res.json({ message: "Importação cancelada com sucesso!" });
    });
});

// 🚨 ESTA LINHA TEM QUE SER OBRIGATORIAMENTE A ÚLTIMA DO ARQUIVO!
module.exports = router;