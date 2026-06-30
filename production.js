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
        req.user = decoded; // Salva quem está logado
        next();
    });
}

// Rota: Registrar Produção (Dar baixa nos componentes e entrada no produto) - BLINDADA
router.post('/fabricate', verificarCracha, (req, res) => {
    const { productId, quantity } = req.body;
    
    // Prevenção contra undefined:
    const userName = (req.user && req.user.name) ? req.user.name : "Sistema (Automático)";
    

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // 🚨 TRAVA DE SEGURANÇA SÊNIOR: Verifica se 'componentes' existe antes de ler o .length
        db.all("SELECT child_component_id, quantity_needed FROM product_composition WHERE parent_product_id = ?", [productId], (err, componentes) => {
            if (err || !componentes || componentes.length === 0) {
                db.run("ROLLBACK");
                return res.status(400).json({ error: "Receita não encontrada para este produto ou falha no banco de dados." });
            }

            // Subtrair componentes
            for (const item of componentes) {
                const totalNecessario = item.quantity_needed * quantity;
                db.run(
                    "UPDATE products SET current_stock = current_stock - ? WHERE id = ? AND current_stock >= ?",
                    [totalNecessario, item.child_component_id, totalNecessario]
                );
            }

            // Adicionar produto final
            db.run("UPDATE products SET current_stock = current_stock + ? WHERE id = ?", [quantity, productId]);

            // Salvar no histórico com a assinatura de quem fez
            db.run("INSERT INTO stock_movements (product_id, type, quantity, reason, user_name) VALUES (?, 'IN', ?, 'Produção Interna', ?)", [productId, quantity, userName]);
            
            db.run("COMMIT", (commitErr) => {
                if (commitErr) return res.status(500).json({ error: "Falha na transação" });
                
                // Dispara o aviso para as telas
                req.app.get('io').emit('estoque_alterado');
                res.json({ message: "Produção registrada e estoque atualizado!" });
            });
        });
    });
});

module.exports = router;