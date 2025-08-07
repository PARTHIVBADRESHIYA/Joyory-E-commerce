// middlewares/utils/notifyMainAdmins.js
import Admin from '../../models/Admin.js';
import NotificationSetting from '../../models/settings/admin/AdminNotifications.js';
import { sendEmail as sendMailtrap } from './emailService.js';

export const notifyMainAdmins = async (type, details = {}) => {
    const mainAdmins = await Admin.find(); // Add filter if needed

    for (let admin of mainAdmins) {
        const setting = await NotificationSetting.findOne({
            adminId: admin._id,
            adminType: 'Admin'
        });

        if (setting?.email?.securityUpdates) {
            await sendMailtrap(
                admin.email,
                `Security Alert: ${type}`,
                `
                <h3>Security Alert: ${type}</h3>
                <p>${details.message || 'A role admin or team member account has been locked due to multiple failed logins.'}</p>
                <p>User Email: ${details.email || 'Unknown'}</p>
                <p>Time: ${new Date().toLocaleString()}</p>
            `
            );
        }
    }
};
