import Joi from 'joi';
import mongoose from 'mongoose';

// Check for valid MongoDB ObjectId
const isValidObjectId = (value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
    }
    return value;
};

export const adminRoleSchema = Joi.object({
    roleName: Joi.string()
        .trim()
        .min(3)
        .max(50)
        .required()
        .messages({
            'string.empty': 'Role name is required',
            'string.min': 'Role name must be at least 3 characters',
            'string.max': 'Role name must be at most 50 characters'
        }),

    description: Joi.string()
        .allow('', null)
        .max(255),

    users: Joi.number()
        .min(1)
        .required()
        .messages({
            'number.base': 'Users must be a number',
            'number.min': 'Users must be at least 1',
            'any.required': 'User count is required'
        }),

    permissions: Joi.object({
        dashboard: Joi.object({
            view: Joi.boolean().required(),
            customize: Joi.boolean().required()
        }).required(),

        orders: Joi.object({
            view: Joi.boolean().required(),
            edit: Joi.boolean().required(),
            delete: Joi.boolean().required()
        }).required(),

        products: Joi.object({
            view: Joi.boolean().required(),
            manage: Joi.boolean().required()
        }).required(),

        settings: Joi.object({
            update: Joi.boolean().required(),
            manageRoles: Joi.boolean().required()
        }).required()
    }).required(),

    teamMembers: Joi.array().items(
        Joi.string().custom(isValidObjectId)
    ).optional(),

    createdBy: Joi.string()
        .custom(isValidObjectId)
        .optional()
});

export const adminRoleUpdateSchema = Joi.object({
    roleName: Joi.string()
        .trim()
        .min(3)
        .max(50)
        .messages({
            'string.min': 'Role name must be at least 3 characters',
            'string.max': 'Role name must be at most 50 characters'
        }),

    description: Joi.string()
        .allow('', null)
        .max(255),

    users: Joi.number()
        .min(1)
        .messages({
            'number.base': 'Users must be a number',
            'number.min': 'Users must be at least 1'
        }),

    permissions: Joi.object({
        dashboard: Joi.object({
            view: Joi.boolean(),
            customize: Joi.boolean()
        }),

        orders: Joi.object({
            view: Joi.boolean(),
            edit: Joi.boolean(),
            delete: Joi.boolean()
        }),

        products: Joi.object({
            view: Joi.boolean(),
            manage: Joi.boolean()
        }),

        settings: Joi.object({
            update: Joi.boolean(),
            manageRoles: Joi.boolean()
        })
    }),

    teamMembers: Joi.array().items(
        Joi.string().custom(isValidObjectId)
    ),

    createdBy: Joi.string().custom(isValidObjectId)
});