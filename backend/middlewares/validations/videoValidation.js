import Joi from 'joi';


export const createVideoSchema = Joi.object({
title: Joi.string().min(3).max(140).required(),
description: Joi.string().allow(''),
category: Joi.string().allow(''),
tags: Joi.array().items(Joi.string()).default([]),
sourceUrl: Joi.string().uri().required(), // YouTube/Vimeo/mp4 URL
status: Joi.string().valid('draft', 'published').default('draft'),
isPopular: Joi.boolean().default(false),
order: Joi.number().integer().min(0).default(0),
publishedAt: Joi.date().optional(),
});


export const updateVideoSchema = createVideoSchema.fork(['sourceUrl'], (s) => s.optional());