import bcrypt from 'bcryptjs';
import AdminRoleAdmin from '../../../models/settings/admin/AdminRoleAdmin.js';
import LoginHistory from '../../../models/settings/admin/AdminLoginHistory.js';
import { generateSecret, verifyToken } from '../../../middlewares/utils/mfaUtil.js';

export const changePassword = async (req, res) => {
    const admin = await AdminRoleAdmin.findById(req.user.id);
    const { currentPassword, newPassword } = req.body;

    const match = await bcrypt.compare(currentPassword, admin.password);
    if (!match) return res.status(401).json({ error: 'Incorrect current password' });

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();
    res.json({ message: 'Password changed successfully' });
};

export const setupMFA = async (req, res) => {
    const { qr, base32 } = await generateSecret();
    req.session.mfaSecret = base32;
    res.json({ qr });
};

export const verifyMFA = async (req, res) => {
    const { token } = req.body;
    const secret = req.session.mfaSecret;
    const verified = verifyToken(token, secret);
    if (!verified) return res.status(400).json({ error: 'Invalid token' });

    const admin = await AdminRoleAdmin.findById(req.user.id);
    admin.mfa = { secret, enabled: true };
    await admin.save();

    res.json({ message: 'MFA enabled successfully' });
};

export const getLoginHistory = async (req, res) => {
    const history = await LoginHistory.find({ adminId: req.user.id }).sort({ time: -1 });
    res.json(history);
};
