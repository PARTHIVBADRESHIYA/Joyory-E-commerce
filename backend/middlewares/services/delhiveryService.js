import axios from "axios";
import qs from "qs";

const DELHIVERY_BASE_URL = process.env.DELHIVERY_BASE_URL;
const DELHIVERY_API_KEY = process.env.DELHIVERY_API_KEY;

export const createDelhiveryShipment = async ({
    order,
    pickup,
    shipping_address,
    customer,
    items
}) => {
    const quantity = items.reduce((s, i) => s + i.quantity, 0);

    const payload = {
        shipments: [{
            name: shipping_address.name,
            add: shipping_address.address,
            city: shipping_address.city,
            state: shipping_address.state,
            pin: shipping_address.pincode,
            country: "India",
            phone: shipping_address.phone,
            email: customer.email,

            order: order.order_id,
            payment_mode: order.payment_mode,
            order_date: new Date().toISOString(),

            total_amount: order.total_amount,
            shipment_value: order.total_amount,

            cod_amount: order.payment_mode === "COD"
                ? order.total_amount
                : 0,

            quantity,
            weight: 500,                // 🔥 grams
            shipping_mode: "Surface",

            products_desc: "Joyory Products",
            hsn_code: "330499",

            seller_inv: order.order_id,
            seller_inv_date: new Date().toISOString(),

            return_add: pickup.address,
            return_city: pickup.city,
            return_pin: pickup.pincode,
            return_state: pickup.state,
            return_country: "India",
            return_phone: pickup.phone,

            seller_name: process.env.STORE_NAME,
            seller_address: pickup.address,
            seller_gst_tin: ""
        }],

        pickup_location: {
            name: process.env.DELHIVERY_PICKUP_NAME // 🔥 EXACT MATCH
        }
    };

    const response = await axios.post(
        `${DELHIVERY_BASE_URL}/api/cmu/create.json`,
        qs.stringify({
            format: "json",                     // 🔥 THIS FIXES IT
            data: JSON.stringify(payload)
        }),
        {
            headers: {
                Authorization: `Token ${DELHIVERY_API_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded"
            }
        }
    );




    if (!response.data?.packages?.length) {
        throw new Error(JSON.stringify(response.data));
    }

    const pkg = response.data.packages[0];

    return {
        waybill: pkg.waybill,
        pickup_id: pkg.refnum,
        tracking_url: `https://www.delhivery.com/track/package/${pkg.waybill}`
    };
};

