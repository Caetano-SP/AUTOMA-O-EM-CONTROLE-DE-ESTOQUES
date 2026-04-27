const express = require('express');
const db = require('../database');
const router = express.Router();

// Rota: Registrar Produção (Dar baixa nos componentes e entrada no produto)
router.post('/fabricate', (req, res) => {
    const { productId, quantity } = req.body;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        db.all("SELECT child_component_id, quantity_needed FROM product_composition WHERE parent_product_id = ?", [productId], (err, componentes) => {
            if (err || componentes.length === 0) {
                db.run("ROLLBACK");
                return res.status(400).json({ error: "Receita não encontrada para este produto." });
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

            // Salvar no histórico
            db.run("INSERT INTO stock_movements (product_id, type, quantity, reason) VALUES (?, 'IN', ?, 'Produção Interna')", [productId, quantity]);

            db.run("COMMIT", (commitErr) => {
                if (commitErr) return res.status(500).json({ error: "Falha na transação" });
                res.json({ message: "Produção registrada e estoque atualizado!" });
            });
        });
    });
});

module.exports = router;