import ShippingSettings from '../../models/settings/ShippingSetting.js';

// Create shipping method
export const createShippingMethod = async (req, res) => {
  try {
    const shipping = await ShippingSettings.create(req.body);
    res.status(201).json({ message: 'Shipping method added successfully.', shipping });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add shipping method.', error: err.message });
  }
};

// Get all shipping methods
export const getAllShippingMethods = async (req, res) => {
  try {
    const methods = await ShippingSettings.find().sort({ createdAt: -1 });
    res.status(200).json(methods);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch shipping methods.', error: err.message });
  }
};

// Update shipping method
export const updateShippingMethod = async (req, res) => {
  try {
    const method = await ShippingSettings.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!method) return res.status(404).json({ message: 'Shipping method not found' });
    res.status(200).json({ message: 'Shipping method updated successfully.', method });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update shipping method.', error: err.message });
  }
};

// Delete shipping method
export const deleteShippingMethod = async (req, res) => {
  try {
    const deleted = await ShippingSettings.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Shipping method not found' });
    res.status(200).json({ message: 'Shipping method deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete shipping method.', error: err.message });
  }
};
