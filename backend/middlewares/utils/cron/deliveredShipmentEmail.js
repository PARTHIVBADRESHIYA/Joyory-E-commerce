import cron from "node-cron";
import Order from "../../../models/Order.js";
import { sendShipmentDeliveredEmail } from "../emailService.js";

export const runDeliveredShipmentEmailCron = async () => {

    const orders = await Order.find({
        shipments: {
            $elemMatch: {
                status: "Delivered",
                deliveryEmailSentAt: { $exists: false }
            }
        }
    })
        .populate("user", "email name");

    for (const order of orders) {

        let needSave = false;

        for (const shipment of order.shipments) {

            if (
                shipment.status === "Delivered" &&
                !shipment.deliveryEmailSentAt
            ) {

                await sendShipmentDeliveredEmail({
                    user: order.user,
                    order,
                    shipment
                });

                shipment.deliveryEmailSentAt = new Date();
                needSave = true;
            }
        }

        if (needSave) {
            await order.save();
        }
    }
};


cron.schedule("*/10 * * * *", async () => {
    await runDeliveredShipmentEmailCron();
    console.log("✅ Delivered shipment email cron finished");
});
