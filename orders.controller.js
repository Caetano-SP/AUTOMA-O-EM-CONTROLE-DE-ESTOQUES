const db = require('../../database');

const listOrders = (req, res) => {
    const sql = `
        SELECT * FROM client_orders 
        WHERE status = 'Fila' 
           OR (status = 'Enviado' AND shipped_at >= datetime('now', '-14 days', 'localtime'))
        ORDER BY id DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error("Erro ao listar pedidos:", err.message);
            return res.status(500).json({ error: "Erro ao carregar lista de pedidos." });
        }
        res.json(rows || []);
    });
};

const createOrder = (req, res) => {
    const { client_name, address, description, total_products, carrier, total_value } = req.body;
    const sql = `INSERT INTO client_orders (client_name, address, description, status, total_products, carrier, total_value) VALUES (?, ?, ?, 'Fila', ?, ?, ?)`;
    db.run(sql, [
        client_name, 
        address, 
        description || '', 
        parseFloat(total_products) || 0, 
        carrier || '', 
        parseFloat(total_value) || 0
    ], function(err) {
        if (err) {
            console.error("Erro ao criar pedido:", err.message);
            return res.status(500).json({ error: "Erro ao criar pedido." });
        }
        req.app.get('io').emit('pedidos_alterados');
        res.json({ message: "Pedido criado com sucesso", id: this.lastID });
    });
};

const updateOrder = (req, res) => {
    const id = req.params.id;
    const { client_name, address, description, total_products, carrier, total_value } = req.body;
    const sql = `UPDATE client_orders SET client_name = ?, address = ?, description = ?, total_products = ?, carrier = ?, total_value = ? WHERE id = ? AND status = 'Fila'`;
    db.run(sql, [
        client_name, 
        address, 
        description || '', 
        parseFloat(total_products) || 0, 
        carrier || '', 
        parseFloat(total_value) || 0,
        id
    ], function(err) {
        if (err) {
            console.error("Erro ao atualizar pedido:", err.message);
            return res.status(500).json({ error: "Erro ao atualizar pedido." });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: "Pedido não encontrado ou já enviado." });
        }
        req.app.get('io').emit('pedidos_alterados');
        res.json({ message: "Pedido atualizado com sucesso" });
    });
};

const deleteOrder = (req, res) => {
    const id = req.params.id;
    const sql = `DELETE FROM client_orders WHERE id = ?`;
    db.run(sql, [id], function(err) {
        if (err) {
            console.error("Erro ao excluir pedido:", err.message);
            return res.status(500).json({ error: "Erro ao excluir pedido." });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: "Pedido não encontrado." });
        }
        req.app.get('io').emit('pedidos_alterados');
        res.json({ message: "Pedido excluído com sucesso" });
    });
};

const shipOrder = (req, res) => {
    const id = req.params.id;
    if (!req.file) {
        return res.status(400).json({ error: "Comprovante de envio (foto) é obrigatório." });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    
    // Status vira 'Enviado', shipped_at vira local-time (usando datetime('now', 'localtime') no SQL)
    const sql = `
        UPDATE client_orders 
        SET status = 'Enviado', image_url = ?, shipped_at = datetime('now', 'localtime') 
        WHERE id = ? AND status = 'Fila'
    `;
    db.run(sql, [imageUrl, id], function(err) {
        if (err) {
            console.error("Erro ao confirmar envio do pedido:", err.message);
            return res.status(500).json({ error: "Erro ao confirmar envio." });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: "Pedido não encontrado ou já enviado." });
        }
        req.app.get('io').emit('pedidos_alterados');
        res.json({ message: "Envio do pedido confirmado com sucesso", imageUrl });
    });
};

module.exports = {
    listOrders,
    createOrder,
    updateOrder,
    deleteOrder,
    shipOrder
};
