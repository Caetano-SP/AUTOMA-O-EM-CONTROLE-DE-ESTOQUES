const jwt = require('jsonwebtoken');

const CHAVE_MESTRA = "360stock_seguranca_maxima_2026";

// Segurança Básica: Verificar se o token JWT existe e é válido
function verificarCracha(req, res, next) {
    const tokenHeader = req.headers['authorization'];
    if (!tokenHeader) return res.status(401).json({ error: "Acesso negado: Crachá não encontrado." });
    
    const token = tokenHeader.split(' ')[1];
    jwt.verify(token, CHAVE_MESTRA, (err, decoded) => {
        if (err) return res.status(403).json({ error: "Sessão expirada ou crachá inválido." });
        req.user = decoded; // injeta { id, username, name, role }
        next();
    });
}

// Segurança Avançada: RBAC - Baseado em Funções
function verificarRole(rolesPermitidos) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ error: "Identificação de cargo não encontrada no crachá." });
        }
        
        if (!rolesPermitidos.includes(req.user.role)) {
            return res.status(403).json({ error: "Acesso bloqueado: Requer privilégios de gestor para esta ação." });
        }
        
        next();
    };
}

module.exports = {
    verificarCracha,
    verificarRole,
    CHAVE_MESTRA
};
