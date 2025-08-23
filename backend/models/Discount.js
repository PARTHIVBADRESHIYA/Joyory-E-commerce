import mongoose from 'mongoose';

const discountSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: {
        type: String, required: true, trim: true,
        unique: true
    },
    type: { type: String, enum: ['Flat', 'Percentage'], required: true },
    value: { type: Number, required: true },
      status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }, // ✅ Add this
    minimumOrderAmount: { type: Number },
    eligibility: { type: String, enum: ['All', 'New Users', 'Existing Users'], default: 'All' },
    appliesTo: {
        type: {
            type: String,
            enum: ['Entire Order', 'Product', 'Category', 'Brand'],
            required: true,
        },
        productIds: [mongoose.Schema.Types.ObjectId],
        categoryIds: [String],
        brandIds: [String]
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalLimit: { type: Number },
    perCustomerLimit: { type: Number },
    usageCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
});


export default mongoose.model('Discount', discountSchema);
