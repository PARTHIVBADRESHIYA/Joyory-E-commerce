import axios from "axios";
import qs from "qs";

const DELHIVERY_BASE_URL = process.env.DELHIVERY_BASE_URL;
const DELHIVERY_API_KEY = process.env.DELHIVERY_API_KEY;
const DELHIVERY_WAREHOUSE_CODE = process.env.DELHIVERY_WAREHOUSE_CODE;

export const createDelhiveryShipment = async ({
    order,
    pickup,
    shipping_address,
    customer,
    items,
    productDescription

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

            products_desc: productDescription,
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

    // 🔥 HARD VALIDATION
    if (!pkg || !pkg.waybill || pkg.waybill.trim() === "") {
        throw new Error(
            `Delhivery AWB not generated. Raw response: ${JSON.stringify(response.data)}`
        );
    }


    return {
        waybill: pkg.waybill,
        pickup_id: pkg.refnum,
        tracking_url: `https://www.delhivery.com/track/package/${pkg.waybill}`
    };
};



export const cancelDelhiveryShipment = async (waybill) => {
    if (!waybill) throw new Error("Missing AWB for delhivery cancel.");

    try {
        const response = await axios.post(
            "https://track.delhivery.com/api/p/edit",
            {
                waybill: waybill,
                status: "Cancelled",
            },
            {
                headers: {
                    Authorization: `Token ${process.env.DELHIVERY_API_KEY}`,
                }
            }
        );

        if (!response.data?.success) {
            throw new Error(`Delhivery cancel failed: ${JSON.stringify(response.data)}`);
        }

        return response.data;
    } catch (err) {
        console.error("Delhivery Cancel Shipment Error:", err?.response?.data || err.message);
        throw err;
    }
};







export async function validatePincodeServiceabilityDelhivery(pincode, cod = true) {
    try {
        const token = process.env.DELHIVERY_API_KEY;
        if (!token) throw new Error("Delhivery API key missing");

        const url = `https://track.delhivery.com/c/api/pin-codes/json/?filter_codes=${String(
            pincode
        ).trim()}`;

        const res = await axios.get(url, {
            headers: { Authorization: `Token ${token}` }
        });

        const list = res.data?.delivery_codes || [];
        if (!list.length) {
            return { serviceable: false, couriers: [] };
        }

        const details = list[0]?.postal_code || {};

        // FIX: Correct Delhivery fields
        const isCodAvailable = details.cod === "Y";
        const isPrepaidAvailable = details.pre_paid === "Y";

        if (cod && !isCodAvailable) {
            return { serviceable: false, couriers: [] };
        }

        return {
            serviceable: true,
            couriers: [
                {
                    name: "Delhivery",
                    cod: isCodAvailable,
                    prepaid: isPrepaidAvailable,
                    state: details.state_code || "",
                    city: details.city || "",
                    district: details.district || "",
                }
            ]
        };

    } catch (err) {
        console.error("❌ Delhivery Pincode Validation Failed:", err.response?.data || err.message);
        throw new Error("Failed to check pincode with Delhivery");
    }
}

