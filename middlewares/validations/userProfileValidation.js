import Joi from 'joi';

export const updateUserProfileSchema = Joi.object({
    fullName: Joi.string().min(2).max(80).optional(),
    gender: Joi.string().valid('male', 'female', 'other').optional(),
    dob: Joi.date().optional(),

    email: Joi.string().email().optional(),

    phone: Joi.string().custom((value, helpers) => {
        // auto format if user sends 10-digit Indian phone number
        if (/^\d{10}$/.test(value)) {
            return `+91${value}`;
        }

        // allow only E.164 format otherwise
        if (/^\+\d{10,15}$/.test(value)) {
            return value;
        }

        return helpers.error('any.invalid');
    }).optional()
});
