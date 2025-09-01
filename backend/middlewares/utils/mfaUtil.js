import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

export const generateSecret = async () => {
    const secret = speakeasy.generateSecret({ name: 'EcommerceAdminPanel' });
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    return { base32: secret.base32, qr };
};

export const verifyToken = (token, secret) => {
    return speakeasy.totp.verify({ secret, encoding: 'base32', token });
};
