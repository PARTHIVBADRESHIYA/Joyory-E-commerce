import Promotion from '../models/Promotion.js';

// ✅ Auto-calculate promotion status based on date
const calculateStatus = (start, end) => {
    const now = new Date();
    if (now < new Date(start)) return 'upcoming';
    if (now > new Date(end)) return 'expired';
    return 'active';
};

// ✅ Create Promotion
  const createPromotion = async (req, res) => {
    try {
        const status = calculateStatus(req.body.startDate, req.body.endDate);
        const bannerUrls = req.files?.map(file => `/uploads/banners/${file.filename}`) || [];

        const promotion = await Promotion.create({
            ...req.body,
            status,
            banners: bannerUrls,
            createdBy: req.admin._id
        });

        res.status(201).json({ message: 'Promotion created successfully', promotion });
    } catch (err) {
        res.status(500).json({ message: 'Failed to create promotion', error: err.message });
    }
};

// ✅ Get Promotion Summary Table (with optional status filter)
const getPromotionSummary = async (req, res) => {
    try {
        const query = {};
        if (req.query.status) query.status = req.query.status;

        const promotions = await Promotion.find(query)
            .select('campaignName targetAudience status promotionType channels startDate endDate methods')
            .populate('methods', 'name');

        const summary = promotions.map(p => ({
            name: p.campaignName,
            audience: p.targetAudience,
            status: p.status,
            type: p.promotionType,
            channels: p.channels,
            duration: `${p.startDate.toISOString().split('T')[0]} to ${p.endDate.toISOString().split('T')[0]}`,
            products: p.methods.map(m => m.name)
        }));

        res.status(200).json(summary);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch summary', error: err.message });
    }
};

const getPromotionList = async (req, res) => {
  try {
    const promotions = await Promotion.find()
      .select('campaignName promotionType startDate endDate status targetAudience');

    const list = promotions.map(p => ({
      name: p.campaignName,
      type: p.promotionType,
      startDate: p.startDate.toISOString().split('T')[0],
      endDate: p.endDate.toISOString().split('T')[0],
      status: p.status,
      targetGroup: p.targetAudience,
      id: p._id  // For frontend to perform actions like edit/delete
    }));

    res.status(200).json(list);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch promotion list', error: err.message });
  }
};


export { createPromotion, getPromotionSummary, getPromotionList };
