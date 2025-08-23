import Joi from 'joi';
import mongoose from 'mongoose';

const isValidObjectId = (value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
    }
    return value;
};

export const teamMemberSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(3)
        .max(50)
        .required()
        .messages({
            'string.empty': 'Name is required',
            'string.min': 'Name must be at least 3 characters',
            'string.max': 'Name must be at most 50 characters'
        }),

    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Must be a valid email address',
            'any.required': 'Email is required'
        }),

    password: Joi.string()
        .min(8)
        .max(50)
        .required()
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'any.required': 'Password is required'
        }),

    role: Joi.string()
        .custom(isValidObjectId)
        .required()
        .messages({
            'any.invalid': 'Invalid role ID',
            'any.required': 'Role is required'
        }),

    createdBy: Joi.string()
        .custom(isValidObjectId)
        .optional()
});

