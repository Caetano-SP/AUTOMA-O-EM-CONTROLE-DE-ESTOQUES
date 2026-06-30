const Joi = require('joi');

const orderSchema = Joi.object({
    client_name: Joi.string().min(2).max(150).required(),
    address: Joi.string().min(5).required(),
    description: Joi.string().allow('', null).optional(),
    total_products: Joi.number().min(0).default(0).optional(),
    carrier: Joi.string().allow('', null).optional(),
    total_value: Joi.number().min(0).default(0).optional()
});

module.exports = {
    orderSchema
};
