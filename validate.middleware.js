// Middleware de validação baseada em specs (Joi)
function validarSchema(schema) {
    return (req, res, next) => {
        const { error } = schema.validate(req.body, { abortEarly: false });
        
        if (error) {
            // Mapeia os erros para uma mensagem clara de feedback
            const mensagens = error.details.map(err => err.message).join(', ');
            return res.status(400).json({ error: "Erro de validação (Spec): " + mensagens });
        }
        
        next();
    };
}

module.exports = validarSchema;
