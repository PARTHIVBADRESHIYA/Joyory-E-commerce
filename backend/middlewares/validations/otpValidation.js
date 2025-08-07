import Joi from 'joi';

export const sendOtpSchema = Joi.object({
    email: Joi.string().email().required(),
    type: Joi.string().valid('admin', 'roleAdmin', 'teamMember', 'user').required(),
    preferredOtpMethod: Joi.string().valid('email', 'sms').optional()
});

export const otpLoginSchema = Joi.object({
    email: Joi.string().email().required(),
    type: Joi.string().valid('admin', 'roleAdmin', 'teamMember', 'user').required(),
    otp: Joi.string().length(6).required()
});

export const resetPasswordWithOtpSchema = Joi.object({
    email: Joi.string().email().required(),
    type: Joi.string().valid('admin', 'roleAdmin', 'teamMember', 'user').required(),
    otp: Joi.string().length(6).required(),
    newPassword: Joi.string().min(8).required()
});

export const verifyEmailOtpSchema = Joi.object({
    email: Joi.string().email().required(),
    otp: Joi.string().length(6).required()
});
