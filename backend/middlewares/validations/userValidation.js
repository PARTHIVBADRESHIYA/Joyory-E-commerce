// validations/userValidation.js
import Joi from 'joi';

export const userSignupSchema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).optional(), // for India: 10-digit
    preferredOtpMethod: Joi.string().valid('email', 'sms').optional(),
    referralCode: Joi.string().optional(),
    promo: Joi.string().optional(),
    createdBy: Joi.string().valid('admin', 'self').optional()
});

export const userLoginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

export const addressSchema = Joi.object({
    pincode: Joi.string().pattern(/^[1-9][0-9]{5}$/).required(),
    addressLine1: Joi.string().required(),
    addressLine2: Joi.string().optional(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    country: Joi.string().optional(),
    addressType: Joi.string().valid('home', 'office').optional()
});
