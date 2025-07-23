export const sendEmail = async (admin, type) => {
    console.log(`[EMAIL] To: ${admin.email} | Type: ${type}`);
};

export const sendSMS = async (phone, type) => {
    console.log(`[SMS] To: ${phone} | Type: ${type}`);
};
