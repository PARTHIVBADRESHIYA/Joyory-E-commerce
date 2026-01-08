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

/**
 * Delete abandoned online / credit-card orders
 */
export const deleteAbandonedPaymentOrders = async () => {
    try {
        const result = await Order.deleteMany({
            orderType: { $in: ["Online", "Credit card"] },
            paymentStatus: "pending",
            orderStatus: "Awaiting Payment"
        });

        console.log(`🧹 Deleted Abandoned Payment Orders: ${result.deletedCount}`);
    } catch (error) {
        console.error("❌ Error deleting abandoned payment orders:", error);
    }
};