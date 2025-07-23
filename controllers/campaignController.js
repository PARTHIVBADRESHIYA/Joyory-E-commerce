// controllers/campaignController.js
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';

// 📤 Send campaign immediately (or by cron job)
export const sendCampaignNow = async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id).populate('recipients');
        if (!campaign || campaign.delivered) {
            return res.status(400).json({ message: 'Already sent or not found' });
        }

        for (const user of campaign.recipients) {
            // Placeholder: You can later use nodemailer or sendgrid here
            console.log(`📧 Sending to: ${user.email}`);
        }

        campaign.delivered = true;
        campaign.deliveredAt = new Date();
        await campaign.save();

        res.json({ message: '✅ Campaign sent successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to send campaign', error: err.message });
    }
};

// Create a new campaign
export const createCampaign = async (req, res) => {
    try {
        const {
            campaignName,
            campaignType,
            objective,
            description,
            subjectLine,
            emailBody,
            ctaText,
            redirectUrl,
            audience,
            filters,
            schedule,
            trackOpens,
            trackClicks,
            utmParameters,
            tags,
            status
        } = req.body;

        const headerImage = req.file ? req.file.path : null;

        const parsedFilters = JSON.parse(filters);
        const parsedSchedule = JSON.parse(schedule);
        const parsedTags = JSON.parse(tags);

        // 🔍 Filter users dynamically
        const userQuery = {};
        if (audience !== 'All Customers') {
            if (parsedFilters.age) userQuery.age = { $regex: parsedFilters.age };
            if (parsedFilters.location) userQuery.location = { $regex: parsedFilters.location, $options: 'i' };
        }
        const targetUsers = await User.find(userQuery);

        const campaign = await Campaign.create({
            campaignName,
            campaignType,
            objective,
            description,
            subjectLine,
            emailBody,
            ctaText,
            redirectUrl,
            audience,
            filters: parsedFilters,
            schedule: parsedSchedule,
            trackOpens,
            trackClicks,
            utmParameters,
            tags: parsedTags,
            status: status || 'Scheduled',
            headerImage,
            recipients: targetUsers.map(user => user._id),
            sentCount: targetUsers.length,
            opens: 0,
            clicks: 0,
            newCustomers: 0,
            delivered: false
        });

        res.status(201).json({ message: 'Campaign created', campaign });
    } catch (err) {
        res.status(500).json({ message: 'Failed to create campaign', error: err.message });
    }
};

// Get marketing dashboard summary
export const getCampaignDashboard = async (req, res) => {
    try {
        const now = new Date();
        const last7Days = new Date(now);
        last7Days.setDate(now.getDate() - 7);

        const prev7Days = new Date(last7Days);
        prev7Days.setDate(last7Days.getDate() - 7);

        const currentCampaigns = await Campaign.find({ createdAt: { $gte: last7Days } });
        const openRate = average(currentCampaigns.map(c => c.opens));
        const clickThroughRate = average(currentCampaigns.map(c => c.clicks));
        const newCustomers = await User.countDocuments({ createdAt: { $gte: last7Days } });

        const previousCampaigns = await Campaign.find({ createdAt: { $gte: prev7Days, $lt: last7Days } });
        const previousOpenRate = average(previousCampaigns.map(c => c.opens));
        const previousCTR = average(previousCampaigns.map(c => c.clicks));
        const previousNewCustomers = await User.countDocuments({ createdAt: { $gte: prev7Days, $lt: last7Days } });

        const totalCampaigns = currentCampaigns.length;
        const totalCampaignsChange = percentageChange(currentCampaigns.length, previousCampaigns.length);
        const openRateChange = percentageChange(openRate, previousOpenRate);
        const clickThroughRateChange = percentageChange(clickThroughRate, previousCTR);
        const newCustomersChange = percentageChange(newCustomers, previousNewCustomers);

        res.status(200).json({
            totalCampaigns,
            openRate,
            clickThroughRate,
            newCustomers,
            totalCampaignsChange,
            openRateChange,
            clickThroughRateChange,
            newCustomersChange
        });

    } catch (err) {
        res.status(500).json({ message: 'Failed to load dashboard data', error: err.message });
    }
};

const average = (arr) => {
    if (!arr.length) return 0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return parseFloat((sum / arr.length).toFixed(2));
};

const percentageChange = (current, previous) => {
    if (previous === 0) return current === 0 ? 0 : 100;
    return parseFloat((((current - previous) / previous) * 100).toFixed(2));
};

export const getCampaignById = async (req, res) => {
    try {
        const campaign = await Campaign.findById(req.params.id);
        if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
        res.status(200).json(campaign);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch campaign', error: err.message });
    }
};

export const getAllCampaigns = async (req, res) => {
    try {
        const campaigns = await Campaign.find().sort({ createdAt: -1 });
        res.status(200).json(campaigns);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch campaigns', error: err.message });
    }
};

export const getPerformanceByType = async (req, res) => {
    try {
        const performance = await Campaign.aggregate([
            {
                $group: {
                    _id: "$campaignType",
                    total: { $sum: 1 },
                    opens: { $sum: "$opens" },
                    clicks: { $sum: "$clicks" },
                    sent: { $sum: "$sentCount" }
                }
            }
        ]);

        const result = performance.map(item => ({
            type: item._id,
            openRate: item.sent ? +(item.opens / item.sent * 100).toFixed(1) : 0,
            clickRate: item.sent ? +(item.clicks / item.sent * 100).toFixed(1) : 0
        }));

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: 'Failed to get performance data', error });
    }
};

export const getEmailOpenTrends = async (req, res) => {
    try {
        const trends = await Campaign.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    totalOpens: { $sum: "$opens" },
                    totalSent: { $sum: "$sentCount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const data = trends.map(item => ({
            date: item._id,
            openRate: item.totalSent ? +(item.totalOpens / item.totalSent * 100).toFixed(1) : 0
        }));

        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ message: 'Failed to get open trends', error });
    }
};
// Track Email Open
export const trackOpen = async (req, res) => {
    try {
        await Campaign.findByIdAndUpdate(req.params.id, { $inc: { opens: 1 } });
        // Send 1x1 transparent GIF
        const imgBuffer = Buffer.from(
            'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
            'base64'
        );
        res.set('Content-Type', 'image/gif');
        res.send(imgBuffer);
    } catch (err) {
        res.status(500).send();
    }
};

// Track Click
export const trackClick = async (req, res) => {
    try {
        const { redirect } = req.query;
        await Campaign.findByIdAndUpdate(req.params.id, { $inc: { clicks: 1 } });
        res.redirect(redirect || 'https://yourdomain.com');
    } catch (err) {
        res.status(500).json({ msg: 'Failed to track click' });
    }
};
