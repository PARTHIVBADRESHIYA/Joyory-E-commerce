// middlewares/validations/returnValidator.js
import Joi from 'joi';

export const returnRequestSchema = Joi.object({
    orderId: Joi.string().required(),
    returnType: Joi.string().valid('return', 'replace', 'exchange').required(),
    items: Joi.array().items(
        Joi.object({
            productId: Joi.string().required(),
            quantity: Joi.number().min(1).required(),
            reason: Joi.string().required(),
            description: Joi.string().optional(),
            condition: Joi.string()
                .valid('Unopened', 'Opened - Unused', 'Used', 'Damaged')
                .required(),
        })
    ).min(1).required(),
    reason: Joi.string().required(),
    description: Joi.string().optional(),
});

export const validateReturnRequest = (data) => {
    const { error, value } = returnRequestSchema.validate(data, {
        abortEarly: false,
    });

    if (error) {
        return {
            valid: false,
            errors: error.details.map(detail => detail.message)
        };
    }

    return { valid: true, data: value };
};