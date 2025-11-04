// validators/orderValidators.js
import Joi from "joi";

export const cancelOrderSchema = Joi.object({
    orderId: Joi.string().required(),
    reason: Joi.string().allow("", null).max(500),
    refundOption: Joi.string().valid("wallet_credit", "instant_upi", "refund_no").required(),
    upiId: Joi.when("refundOption", {
        is: "instant_upi",
        then: Joi.string().pattern(/^[\w.\-]{2,}@[\w]{2,}$/).required(), // basic UPI id pattern - tweak if needed
        otherwise: Joi.forbidden()
    })
});
