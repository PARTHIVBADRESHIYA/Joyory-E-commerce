import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const RAZORPAYX_KEY = process.env.RAZORPAYX_KEY;
const RAZORPAYX_SECRET = process.env.RAZORPAYX_SECRET;
const RAZORPAYX_ACCOUNT = process.env.RAZORPAYX_ACCOUNT;
const RAZORPAYX_FUND_ACCOUNT_ID = process.env.RAZORPAYX_FUND_ID;

async function testRazorpayXAuth() {
    try {
        const response = await axios.post(
            "https://api.razorpay.com/v1/payouts",
            {
                account_number: RAZORPAYX_ACCOUNT,
                fund_account_id: RAZORPAYX_FUND_ACCOUNT_ID, // using same for test
                amount: 100, // ₹1 in paise
                currency: "INR",
                mode: "IMPS",
                purpose: "payout",
                queue_if_low_balance: true,
                reference_id: "test_auth_check",
                narration: "Test Payout Auth Check",
            },
            {
                auth: {
                    username: RAZORPAYX_KEY,
                    password: RAZORPAYX_SECRET,
                },
            }
        );

        console.log("✅ Authentication succeeded! Response:");
        console.log(response.data);
    } catch (err) {
        console.error("❌ Authentication failed:");
        console.error(err.response?.data || err.message);
    }
}

testRazorpayXAuth();
