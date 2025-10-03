import Joi from "joi";

// ✅ Common schema for Add/Update Address
export const addressSchema = Joi.object({
    name: Joi.string().trim().min(2).max(50).required().messages({
        "string.empty": "Name is required",
        "string.min": "Name must be at least 2 characters",
        "any.required": "Name is required"
    }),
    phone: Joi.string().trim().pattern(/^[0-9]{10}$/).required().messages({
        "string.pattern.base": "Phone must be 10 digits",
        "string.empty": "Phone is required",
        "any.required": "Phone is required"
    }),
    email: Joi.string().trim().email().optional().messages({
        "string.email": "Invalid email format"
    }),
    pincode: Joi.string().trim().pattern(/^[0-9]{6}$/).required().messages({
        "string.pattern.base": "Pincode must be 6 digits",
        "string.empty": "Pincode is required",
        "any.required": "Pincode is required"
    }),
    addressLine1: Joi.string().trim().min(5).max(200).required().messages({
        "string.empty": "Address is required",
        "string.min": "Address must be at least 5 characters",
        "any.required": "Address is required"
    }),
    city: Joi.string().trim().min(2).max(50).required().messages({
        "string.empty": "City is required",
        "string.min": "City must be at least 2 characters",
        "any.required": "City is required"
    }),
    state: Joi.string().trim().min(2).max(50).required().messages({
        "string.empty": "State is required",
        "string.min": "State must be at least 2 characters",
        "any.required": "State is required"
    }),
    houseNumber: Joi.string().trim().max(50).allow("").optional().messages({
        "string.max": "House number can be max 50 characters"
    })
});
