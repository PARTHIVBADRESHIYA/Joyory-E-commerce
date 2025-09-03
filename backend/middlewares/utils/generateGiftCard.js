import crypto from "crypto";

export function generateGiftCardCode() {
    return "GC-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

export function generatePin() {
    return Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit pin
}
