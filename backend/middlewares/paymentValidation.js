// middleware/paymentValidation.js

import PaymentMethod from "../models/settings/payments/PaymentMethod.js";

// --- Helper functions ---
export const validateUPI = (upiId) => {
    const upiRegex = /^[\w.-]+@[\w]+$/;
    return upiRegex.test(upiId);
};

export const validateCardNumber = (cardNumber) => {
    const sanitized = cardNumber.replace(/\D/g, "");
    let sum = 0, shouldDouble = false;

    for (let i = sanitized.length - 1; i >= 0; i--) {
        let digit = parseInt(sanitized.charAt(i));
        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        shouldDouble = !shouldDouble;
    }

    return (sum % 10 === 0);
};

export const validateExpiry = (expiry) => {
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) return false;
    const [mm, yy] = expiry.split("/").map(Number);
    const expiryDate = new Date(2000 + yy, mm);
    return expiryDate > new Date();
};

export const validateCVV = (cvv) => /^[0-9]{3,4}$/.test(cvv);

// --- Admin Validation (create/update payment method) ---
export const adminPaymentValidation = (req, res, next) => {
    const { type, config } = req.body;

    if (!type) return res.status(400).json({ success: false, message: "Payment type is required" });
    if (!config) return res.status(400).json({ success: false, message: "Payment config is required" });

    let error = null;
    switch (type) {
        case "upi":
            if (!config.upiId || !validateUPI(config.upiId)) error = "Invalid UPI ID format";
            break;
        case "card":
            if (!config.cardNumber || !validateCardNumber(config.cardNumber)) error = "Invalid card number";
            else if (!config.expiry || !validateExpiry(config.expiry)) error = "Invalid or expired card expiry date";
            else if (!config.cvv || !validateCVV(config.cvv)) error = "Invalid CVV";
            break;
        case "wallet":
            if (!config.walletId) error = "Wallet ID is required";
            break;
    }

    if (error) return res.status(400).json({ success: false, message: error });

    next();
};

// // --- User Validation (payment input) ---
// export const userPaymentValidation = (req, res, next) => {
//     const { paymentMethod, details } = req.body;

//     if (!paymentMethod) return res.status(400).json({ success: false, message: "Payment method ID is required" });
//     if (!details) return res.status(400).json({ success: false, message: "Payment details are required" });

//     let error = null;
//     switch (paymentMethod.type) {
//         case "upi":
//             if (!details.upiId || !validateUPI(details.upiId)) error = "Invalid UPI ID";
//             break;
//         case "card":
//             if (!details.cardNumber || !validateCardNumber(details.cardNumber)) error = "Invalid card number";
//             else if (!details.expiry || !validateExpiry(details.expiry)) error = "Invalid or expired expiry date";
//             else if (!details.cvv || !validateCVV(details.cvv)) error = "Invalid CVV";
//             break;
//         case "wallet":
//             if (!details.walletId) error = "Wallet ID is required";
//             break;
//     }

//     if (error) return res.status(400).json({ success: false, message: error });

//     next();
// };



export const userPaymentValidation = async (req, res, next) => {
    try {
        const { paymentMethodKey, details } = req.body;

        // 1️⃣ Required field check
        if (!paymentMethodKey) 
            return res.status(400).json({ success: false, message: "Payment method key is required" });

        // 2️⃣ Fetch payment method by key
        const method = await PaymentMethod.findOne({ key: paymentMethodKey, isActive: true });
        if (!method) 
            return res.status(400).json({ success: false, message: "Payment method not available" });

        // 3️⃣ Only validate details if required
        // For offline methods or UPI QR, details may not be needed
        if (["upi", "card", "wallet"].includes(method.type)) {
            if (!details) 
                return res.status(400).json({ success: false, message: "Payment details are required" });

            let error = null;
            switch (method.type) {
                case "upi":
                    if (!details.upiId || !validateUPI(details.upiId)) 
                        error = "Invalid UPI ID";
                    break;
                case "card":
                    if (!details.cardNumber || !validateCardNumber(details.cardNumber)) 
                        error = "Invalid card number";
                    else if (!details.expiry || !validateExpiry(details.expiry)) 
                        error = "Invalid or expired expiry date";
                    else if (!details.cvv || !validateCVV(details.cvv)) 
                        error = "Invalid CVV";
                    break;
                case "wallet":
                    if (!details.walletId) 
                        error = "Wallet ID is required";
                    break;
            }

            if (error) 
                return res.status(400).json({ success: false, message: error });
        }

        // 4️⃣ Attach method info to req for controller
        req.paymentMethod = method;

        next();
    } catch (err) {
        console.error("userPaymentValidation error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
