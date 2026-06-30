const Joi = require('joi');

const loginSchema = Joi.object({
    username: Joi.string().min(3).max(30).required().messages({
        'string.empty': `O usuário não pode estar vazio`,
        'string.min': `O usuário deve ter pelo menos 3 caracteres`,
        'any.required': `O usuário é obrigatório`
    }),
    password: Joi.string().required().messages({
        'string.empty': `A senha não pode estar vazia`,
        'any.required': `A senha é obrigatória`
    })
});

module.exports = {
    loginSchema
};
