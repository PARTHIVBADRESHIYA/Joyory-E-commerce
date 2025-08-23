// cron/autoSendCampaigns.js
import Campaign from '../../../models/Campaign.js';
import { sendCampaignNow } from '../../../controllers/campaignController.js';

export const autoSendScheduledCampaigns = async () => {
    const now = new Date();
    const campaigns = await Campaign.find({
        'schedule.sendNow': false,
        'schedule.date': { $lte: now },
        delivered: false
    });

    for (const campaign of campaigns) {
        await sendCampaignNow({ params: { id: campaign._id } }, { json: () => {} });
    }
};
