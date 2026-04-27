const express = require('express');
const db = require('../database');
const router = express.Router();

// Rota: Registrar nova importação/compra
router.post('/', (req, res) => {
    const { product_id, quantity, priority, estimated_arrival } = req.body;
    
    const query = `INSERT INTO purchase_orders 
                  (product_id, quantity, status, priority, estimated_arrival) 
                  VALUES (?, ?, 'Em Trânsito', ?, ?)`;

    db.run(query, [product_id, quantity, priority, estimated_arrival], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Pedido registrado!", id: this.lastID });
    });
});

module.exports = router;