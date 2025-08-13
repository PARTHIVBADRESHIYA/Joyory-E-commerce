import Joi from 'joi';

export const sendOtpSchema = Joi.object({
    email: Joi.string().email().required(),
    type: Joi.string().valid('admin', 'roleAdmin', 'teamMember', 'user').optional(),
    preferredOtpMethod: Joi.string().valid('email', 'sms').optional()
});

export const otpLoginSchema = Joi.object({
    email: Joi.string().email().required(),
    type: Joi.string().valid('admin', 'roleAdmin', 'teamMember', 'user').optional(),
    otp: Joi.string().length(4).required()
});

export const resetPasswordWithOtpSchema = Joi.object({
    email: Joi.string().email().required(),
    type: Joi.string().valid('admin', 'roleAdmin', 'teamMember', 'user').optional(),
    otp: Joi.string().length(4).required(),
    newPassword: Joi.string().min(8).required(),
    confirmPassword: Joi.string().required().valid(Joi.ref('newPassword')).messages({
        'any.only': 'Confirm password does not match new password',
        'any.required': 'Confirm password is required',
    }),

});

export const verifyEmailOtpSchema = Joi.object({
    email: Joi.string().email().optional(),
    otp: Joi.string().length(4).required()
});
