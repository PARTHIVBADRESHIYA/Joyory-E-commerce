// validations/userValidation.js
import Joi from 'joi';

export const userSignupSchema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
    phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).optional(), // for India: 10-digit
    preferredOtpMethod: Joi.string().valid('email', 'sms').optional(),
    createdBy: Joi.string().valid('admin', 'self').optional()
});

export const userLoginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});


export const updateUserProfileSchema = Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    phone: Joi.string().pattern(/^[0-9]{10,15}$/).optional(),
    address1: Joi.string().max(255).optional(),
    address2: Joi.string().max(255).optional(),
    state: Joi.string().max(100).optional(),
    country: Joi.string().max(100).optional(),
    preferredOtpMethod: Joi.string().valid('email', 'sms').optional()
});
