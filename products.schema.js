const Joi = require('joi');

const productSchema = Joi.object({
    name: Joi.string().min(2).max(150).required(),
    sku: Joi.string().allow('', null),
    category: Joi.string().required(),
    supplier: Joi.string().allow('null', '', null),
    is_manufactured: Joi.number().integer().min(0).max(2).required()
});

const stockUpdateSchema = Joi.object({
    name: Joi.string().min(2).max(150).required(),
    category: Joi.string().required(),
    is_manufactured: Joi.number().integer().min(0).max(2).required(),
    stock: Joi.number().min(0).required(),
    userName: Joi.string().allow('', null),
    supplier: Joi.string().allow('null', '', null)
});

const bulkImportSchema = Joi.object({
    itens: Joi.array().min(1).required()
});

const compositionSchema = Joi.object({
    components: Joi.array().items(
        Joi.object({
            child_id: Joi.number().required(),
            quantity: Joi.number().min(0.01).required()
        })
    ).required()
});

module.exports = {
    productSchema,
    stockUpdateSchema,
    bulkImportSchema,
    compositionSchema
};
