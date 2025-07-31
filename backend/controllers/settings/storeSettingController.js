import StoreSettings from '../../models/settings/StoreSetting.js';

// GET current store settings
export const getStoreSettings = async (req, res) => {
    try {
        const settings = await StoreSettings.findOne();
        res.status(200).json(settings);
    } catch (err) {
        res.status(500).json({ message: 'Failed to load settings', error: err.message });
    }
};

// UPDATE or CREATE store settings
export const updateStoreSettings = async (req, res) => {
    try {
        const data = req.body;
        if (req.file) {
            data.logo = req.file.path;
        }

        let settings = await StoreSettings.findOne();
        if (settings) {
            settings = await StoreSettings.findByIdAndUpdate(settings._id, data, { new: true });
        } else {
            settings = await StoreSettings.create(data);
        }

        res.status(200).json({ message: 'Store settings updated', settings });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update store settings', error: err.message });
    }
};
