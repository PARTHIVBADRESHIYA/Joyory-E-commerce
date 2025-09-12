import Seller from '../models/Seller.js';

export const requireActiveSeller = async (req, res, next) => {
    try {
        const seller = await Seller.findOne({ user: req.user._id });
        if (!seller) return res.status(403).json({ message: 'You are not a seller' });
        if (seller.status !== 'active') return res.status(403).json({ message: 'Seller not active' });
        req.seller = seller;
        next();
    } catch (err) {
        next(err);
    }
};
