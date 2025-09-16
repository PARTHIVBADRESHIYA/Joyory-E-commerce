import axios from "axios";

const RAZORPAYX_KEY = process.env.RAZORPAYX_KEY;
const RAZORPAYX_SECRET = process.env.RAZORPAYX_SECRET;

/**
 * Creates a fund account for seller (bank account)
 * @param {Object} seller - Seller document with bank details
 * @returns {Promise<string>} fundAccountId
 */
// export async function createFundAccountForSeller(seller) {
//     try {
//         const res = await axios.post(
//             "https://api.razorpay.com/v1/fund_accounts",
//             {
//                 contact: {
//                     name: seller.businessName,
//                     type: "vendor",
//                     email: seller.email,
//                     contact: seller.phone,
//                 },
//                 account_type: "bank_account",
//                 bank_account: {
//                     name: seller.bankAccountHolder,
//                     ifsc: seller.bankIfsc,
//                     account_number: seller.bankAccountNumber,
//                 },
//             },
//             {
//                 auth: {
//                     username: RAZORPAYX_KEY,
//                     password: RAZORPAYX_SECRET,
//                 },
//             }
//         );

//         return res.data.id; // e.g. fa_12345
//     } catch (err) {
//         console.error("❌ Failed to create fund account:", err.response?.data || err.message);
//         throw err;
//     }
// }



export async function createFundAccountForSeller(seller) {
    try {
        // Step 1: Create Contact
        const contactRes = await axios.post(
            "https://api.razorpay.com/v1/contacts",
            {
                name: seller.businessName,
                email: seller.email,
                contact: seller.phone,
                type: "vendor",
            },
            {
                auth: {
                    username: RAZORPAYX_KEY,
                    password: RAZORPAYX_SECRET,
                },
            }
        );

        const contactId = contactRes.data.id;

        // Step 2: Create Fund Account
        const fundRes = await axios.post(
            "https://api.razorpay.com/v1/fund_accounts",
            {
                contact_id: contactId,
                account_type: "bank_account",
                bank_account: {
                    name: seller.bankDetails?.accountHolderName, // ✅ correct field
                    ifsc: seller.bankDetails?.ifsc,              // ✅ correct field
                    account_number: seller.bankDetails?.accountNumberEncrypted, // ✅ correct field
                },
            },
            {
                auth: {
                    username: RAZORPAYX_KEY,
                    password: RAZORPAYX_SECRET,
                },
            }
        );

        return fundRes.data.id; // ✅ fa_xxxxx
    } catch (err) {
        console.error("❌ Failed to create fund account:", err.response?.data || err.message);
        throw err;
    }
}
