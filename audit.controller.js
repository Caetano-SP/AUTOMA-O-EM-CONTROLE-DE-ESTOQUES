const db = require('../../database');

const logAction = (req, res) => {
    const { action, detail } = req.body;
    const userName = (req.user && req.user.name) ? req.user.name : "Sistema (Automático)";
    
    db.run("INSERT INTO stock_movements (product_id, type, quantity, reason, user_name) VALUES (0, 'SYS', 0, ?, ?)", [`${action} - ${detail}`, userName], (err) => {
        if (!err && req.app.get('io')) {
            req.app.get('io').emit('estoque_alterado');
        }
        res.json({ success: true });
    });
};

const getHistory = (req, res) => {
    const sql = `
        SELECT m.*, p.name as product_name 
        FROM stock_movements m 
        LEFT JOIN products p ON m.product_id = p.id 
        ORDER BY m.created_at DESC LIMIT 200
    `;
    db.all(sql, [], (err, rows) => res.json(rows || []));
};

module.exports = {
    logAction,
    getHistory
};
