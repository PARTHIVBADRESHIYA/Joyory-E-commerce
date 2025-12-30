import Product from '../../models/Product.js';
import Order from '../../models/Order.js';


export async function splitOrderForPersistence(order) {
    if (order.splitOrders && order.splitOrders.length) return order.splitOrders;

    const bySeller = {};
    for (const item of order.products) {
        const prod = await Product.findById(item.productId).populate("seller");
        if (!prod) continue;

        const sellerId = prod.seller?._id?.toString();
        if (!sellerId) {
            console.warn(`⚠️ Product ${prod._id} has no seller, assigning to platform`);
        }

        if (!bySeller[sellerId || "platform"]) {
            bySeller[sellerId || "platform"] = {
                seller: sellerId ? prod.seller._id : null,
                items: [],
                amount: 0,
            };
        }

        bySeller[sellerId || "platform"].items.push({
            productId: prod._id,
            qty: item.quantity || item.qty || 1,
            price: item.price,
            name: prod.name || "",
        });

        bySeller[sellerId || "platform"].amount +=
            item.price * (item.quantity || item.qty || 1);
    }

    order.splitOrders = Object.values(bySeller).map((s) => ({
        seller: s.seller,
        items: s.items,
        amount: s.amount,
        status: "pending",
    }));

    await order.save();
    return order.splitOrders;
}
