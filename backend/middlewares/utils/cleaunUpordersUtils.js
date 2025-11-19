import Order from "../../models/Order.js";

export const deleteDraftOrders = async () => {
    try {
        const result = await Order.deleteMany({ isDraft: true });
        console.log(`🚮 Deleted Draft Orders: ${result.deletedCount}`);
        console.log("🎉 Cleanup Completed!");
    } catch (error) {
        console.error("❌ Error in deleteDraftOrders:", error);
    }
};
