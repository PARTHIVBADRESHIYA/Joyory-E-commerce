import Joi from 'joi';
import mongoose from 'mongoose';

const isValidObjectId = (value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
    }
    return value;
};

export const adminRoleAdminSchema = Joi.object({
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
        .required()
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'any.required': 'Password is required'
        }),
        
    roleId: Joi.string()
        .custom(isValidObjectId)
        .required()
        .messages({
            'any.invalid': 'Invalid role ID',
            'any.required': 'RoleId is required'
        }),


    newsletter: Joi.boolean().optional(),
    optimizeSpeed: Joi.boolean().optional(),

    profilePic: Joi.string()
        .uri()
        .optional()
        .allow('')
        .messages({
            'string.uri': 'Profile picture must be a valid URL'
        }),

    // OTP is managed server-side (optional on create)
    otp: Joi.object({
        code: Joi.string().length(6),
        expiresAt: Joi.date()
    }).optional(),

    otpRequests: Joi.array().items(Joi.date()).optional(),

    // Optional for creation, mostly for internal lockout tracking
    loginAttempts: Joi.number().min(0).optional(),
    lockUntil: Joi.date().optional()
});

export const updateAdminRoleAdminSchema = Joi.object({
    name: Joi.string().min(3).max(50).optional(),
    email: Joi.string().email().optional(),
    optimizeSpeed: Joi.boolean().optional(),
    newsletter: Joi.boolean().optional(),
    profilePic: Joi.string().uri().optional().allow(''),
});
