import Joi from "joi";
import mongoose from "mongoose";

// helper to validate ObjectId
const objectId = (value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error("any.invalid");
    }
    return value;
};

// Schema for getting tones
export const toneSchema = Joi.object({
    categoryId: Joi.string().custom(objectId).required(), // foundation category
});

// Schema for undertone selection
export const undertoneSchema = Joi.object({
    toneId: Joi.string().custom(objectId).required(),
});

// Schema for shade family selection
export const familySchema = Joi.object({
    undertoneId: Joi.string().custom(objectId).required(),
});

// Schema for recommendations
export const recommendationSchema = Joi.object({
    categoryId: Joi.string().custom(objectId).required(),
    toneId: Joi.string().custom(objectId).required(),
    undertoneId: Joi.string().custom(objectId).required(),
    familyId: Joi.string().custom(objectId).required(),
    formulation: Joi.string().valid("liquid", "stick", "powder").optional(), // extendable
});
