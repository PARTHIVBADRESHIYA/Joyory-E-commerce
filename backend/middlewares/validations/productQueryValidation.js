// validations/productQueryValidation.js
import Joi from 'joi';

export const productQuerySchema = Joi.object({
    priceMin: Joi.number().min(0),
    priceMax: Joi.number().min(0),

    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(12),

    brand: Joi.string().trim(),
    category: Joi.string().trim(),
    color: Joi.string().trim(),
    shade: Joi.string().trim(),

    // Tag filters - optional strings
    skinType: Joi.string().trim(),
    formulation: Joi.string().trim(),
    makeupFinish: Joi.string().trim(),
    benefits: Joi.string().trim(),
    concern: Joi.string().trim(),
    skinTone: Joi.string().trim(),
    gender: Joi.string().trim(),
    age: Joi.string().trim(),
    conscious: Joi.string().trim(),
    preference: Joi.string().trim(),
    ingredients: Joi.string().trim(),
    discount: Joi.string().trim()
});

export const productDetailQuerySchema = Joi.object({
    sort: Joi.string().valid('recent', 'helpful').default('recent'),
    withPhotos: Joi.boolean().truthy('true').falsy('false').default(false),
    ratingFilter: Joi.number().integer().min(1).max(5),

    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(20).default(5)
});