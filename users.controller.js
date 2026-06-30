const bcrypt = require('bcryptjs');
const db = require('../../database');

const listUsers = (req, res) => {
    db.all("SELECT id, name, username, role FROM users", [], (err, rows) => res.json(rows || []));
};

const registerUser = async (req, res) => {
    const { username, password, name, role } = req.body;
    const userRole = (role === 'admin' || role === 'operator' || role === 'technician') ? role : 'operator';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run("INSERT INTO users (username, password, name, role) VALUES (?, ?, ?, ?)", [username, hashedPassword, name, userRole], function(err) {
        if (err) return res.status(500).json({ error: "Erro ao cadastrar ou usuário já existe." });
        res.json({ message: "Usuário cadastrado com sucesso", id: this.lastID });
    });
};

const deleteUser = (req, res) => {
    const id = req.params.id;
    if (id === '1') {
        return res.status(403).json({ error: "O usuário Master não pode ser excluído." });
    }

    db.run("DELETE FROM users WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: "Erro ao revogar acesso." });
        res.json({ message: "Usuário excluído com sucesso" });
    });
};

const updateUserRole = (req, res) => {
    const id = req.params.id;
    const { role } = req.body;
    
    if (id === '1') {
        return res.status(403).json({ error: "O cargo do usuário Master Admin não pode ser alterado." });
    }
    
    if (role !== 'admin' && role !== 'operator' && role !== 'technician') {
        return res.status(400).json({ error: "Cargo inválido." });
    }
    
    db.run("UPDATE users SET role = ? WHERE id = ?", [role, id], function(err) {
        if (err) return res.status(500).json({ error: "Erro ao atualizar cargo do usuário." });
        res.json({ message: "Cargo atualizado com sucesso" });
    });
};

module.exports = {
    listUsers,
    registerUser,
    deleteUser,
    updateUserRole
};
