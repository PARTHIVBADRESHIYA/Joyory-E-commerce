import cron from 'node-cron';
import Campaign from '../../../models/Campaign.js';

// Run every 1 minute
cron.schedule('* * * * *', async () => {
    const now = new Date();
    const campaigns = await Campaign.find({
        status: 'Scheduled',
        'schedule.sendNow': false,
        'schedule.date': { $lte: now }
    }); 

    for (const c of campaigns) {
        // OPTIONAL: Integrate actual email sending logic here
        c.status = 'Completed';
        c.sentCount += 1;
        await c.save();
        console.log(`✅ Campaign sent: ${c.campaignName}`);
    }
});
