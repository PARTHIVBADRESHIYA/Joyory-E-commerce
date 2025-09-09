import crypto from 'crypto';
import User from '../../models/User.js';

export async function generateUniqueReferralCode() {
    let code, exists;
    do {
        code = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars, e.g. A1B2C3D4
        exists = await User.exists({ referralCode: code });
    } while (exists);
    return code;
}
