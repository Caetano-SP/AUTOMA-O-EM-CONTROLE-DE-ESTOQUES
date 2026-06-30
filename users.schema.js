const Joi = require('joi');

const registerUserSchema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    username: Joi.string().min(3).max(30).required(),
    password: Joi.string().min(4).required(),
    role: Joi.string().valid('admin', 'operator', 'technician').optional()
});

module.exports = {
    registerUserSchema
};
