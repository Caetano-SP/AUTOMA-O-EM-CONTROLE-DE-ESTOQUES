const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../database');
const { CHAVE_MESTRA } = require('../../middlewares/auth.middleware');

const login = (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ success: false, message: 'Usuário não encontrado' });
        
        const senhaValida = user.password.startsWith('$2') ? 
            await bcrypt.compare(password, user.password) : (password === user.password);

        if (senhaValida) {
            // Agora assinamos o token COM A ROLE!
            const token = jwt.sign({ 
                id: user.id, 
                username: user.username, 
                name: user.name,
                role: user.role 
            }, CHAVE_MESTRA, { expiresIn: '12h' });
            
            res.json({ 
                success: true, 
                token, 
                user: { id: user.id, name: user.name, role: user.role } 
            });
        } else {
            res.status(401).json({ success: false, message: 'Senha incorreta' });
        }
    });
};

module.exports = {
    login
};
