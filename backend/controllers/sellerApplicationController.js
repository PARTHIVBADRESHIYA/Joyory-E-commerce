// // import SellerApplication from "../models/SellerApplication.js";
// // import Seller from "../models/Seller.js";
// // import User from "../models/User.js";
// // import bcrypt from "bcryptjs";
// // import { sendEmail } from "../middlewares/utils/emailService.js"; // implement nodemailer

// // // ========== Apply as Seller ==========
// // export const applySeller = async (req, res) => {
// //     try {
// //         const { email, phone, businessName, gstNumber, panNumber, addresses, bankDetails } = req.body;

// //         const exists = await SellerApplication.findOne({ email });
// //         if (exists) return res.status(400).json({ message: "Already applied with this email" });

// //         const app = new SellerApplication({
// //             email,
// //             phone,
// //             businessName,
// //             gstNumber,
// //             panNumber,
// //             addresses,
// //             bankDetails
// //         });
// //         await app.save();

// //         // notify admin
// //         await sendEmail("admin@yourapp.com", "New Seller Application", JSON.stringify(app, null, 2));

// //         res.status(201).json({ message: "Application submitted", application: app });
// //     } catch (err) {
// //         res.status(500).json({ message: "Server error", error: err.message });
// //     }
// // };

// // // ========== Admin Approve ==========
// // export const approveSeller = async (req, res) => {
// //     try {
// //         const app = await SellerApplication.findById(req.params.id);
// //         if (!app) return res.status(404).json({ message: "Application not found" });

// //         // temp password
// //         const tempPassword = Math.random().toString(36).slice(-8);
// //         const hashed = await bcrypt.hash(tempPassword, 10);

// //         // create seller account
// //         const seller = new Seller({
// //             email: app.email,
// //             phone: app.phone,
// //             password: hashed,
// //             businessName: app.businessName,
// //             gstNumber: app.gstNumber,
// //             panNumber: app.panNumber,
// //             addresses: app.addresses,
// //             bankDetails: app.bankDetails,
// //             kycDocs: app.kycDocs,
// //             status: "active"
// //         });
// //         await seller.save();

// //         // update application
// //         app.status = "approved";
// //         await app.save();

// //         // send email with credentials
// //         await sendEmail(app.email, "Seller Account Approved",
// //             `Welcome ${app.businessName}!\n\nYou can login with:\nEmail: ${app.email}\nPassword: ${tempPassword}`
// //         );

// //         res.json({ message: "Seller approved", seller });
// //     } catch (err) {
// //         res.status(500).json({ message: "Error approving seller", error: err.message });
// //     }
// // };











// import SellerApplication from "../models/SellerApplication.js";
// import Seller from "../models/Seller.js";
// import bcrypt from "bcryptjs";
// import { sendEmail } from "../middlewares/utils/emailService.js";

// /**
//  * Submit seller application
//  */
// export const applySeller = async (req, res) => {
//     try {
//         const {
//             email,
//             phone,
//             businessName,
//             gstNumber,
//             panNumber,
//             addresses,
//             bankDetails,
//             marketingBudget,
//             licenceCategory
//         } = req.body;

//         const exists = await SellerApplication.findOne({ email });
//         if (exists) return res.status(400).json({ message: "Already applied with this email" });

//         // Handle uploaded files (KYC & licences)
//         let kycDocs = [];
//         if (req.files?.kycDocs) {
//             kycDocs = req.files.kycDocs.map(file => ({
//                 url: file.path,
//                 filename: file.originalname,
//                 public_id: file.filename,
//                 uploadedAt: new Date()
//             }));
//         }

//         let licences = [];
//         if (req.files?.licences) {
//             licences = req.files.licences.map(file => ({
//                 category: licenceCategory || "general",
//                 docUrl: file.path,
//                 approved: false
//             }));
//         }

//         const app = new SellerApplication({
//             email,
//             phone,
//             businessName,
//             gstNumber,
//             panNumber,
//             addresses,
//             bankDetails,
//             kycDocs,
//             licences,
//             marketingBudget: marketingBudget || 0,
//             status: "pending"
//         });

//         await app.save();

//         // Notify admin
//         await sendEmail("admin@yourapp.com", "New Seller Application", JSON.stringify(app, null, 2));

//         res.status(201).json({ message: "Application submitted", application: app });
//     } catch (err) {
//         res.status(500).json({ message: "Server error", error: err.message });
//     }
// };

// /**
//  * Admin approves seller application
//  */
// export const approveSeller = async (req, res) => {
//     try {
//         const app = await SellerApplication.findById(req.params.id);
//         if (!app) return res.status(404).json({ message: "Application not found" });

//         // temp password
//         const tempPassword = Math.random().toString(36).slice(-8);

//         // create seller account
//         const seller = new Seller({
//             email: app.email,
//             phone: app.phone,
//             password: tempPassword,
//             businessName: app.businessName,
//             gstNumber: app.gstNumber,
//             panNumber: app.panNumber,
//             addresses: app.addresses,
//             bankDetails: app.bankDetails,
//             kycDocs: app.kycDocs,
//             licences: app.licences,
//             marketingBudget: app.marketingBudget,
//             status: "active"
//         });
//         await seller.save();

//         // update application
//         app.status = "approved";
//         await app.save();

//         // send credentials to seller
//         await sendEmail(app.email, "Seller Account Approved",
//             `Welcome ${app.businessName}!\n\nYou can login with:\nEmail: ${app.email}\nPassword: ${tempPassword}`
//         );

//         res.json({ message: "Seller approved", seller });
//     } catch (err) {
//         res.status(500).json({ message: "Error approving seller", error: err.message });
//     }
// };












// controllers/sellerApplicationController.js
import SellerApplication from "../models/SellerApplication.js";
import Seller from "../models/Seller.js";
import { sendEmail } from "../middlewares/utils/emailService.js";

/**
 * Submit seller application
 * - Handles KYC docs & licences
 * - Sends notification to admin
 */
export const applySeller = async (req, res) => {
    try {
        const {
            email,
            phone,
            businessName,
            gstNumber,
            panNumber,
            addresses,
            bankDetails,
            marketingBudget,
            licenceCategory
        } = req.body;

        // Check if already applied
        const exists = await SellerApplication.findOne({ email });
        if (exists)
            return res.status(400).json({ message: "Already applied with this email" });

        // Process uploaded KYC documents
        const kycDocs = req.files?.kycDocs?.map(file => ({
            url: file.path,
            filename: file.originalname,
            public_id: file.filename,
            uploadedAt: new Date()
        })) || [];

        // Process uploaded licences
        const licences = req.files?.licences?.map(file => ({
            category: licenceCategory || "general",
            docUrl: file.path,
            approved: false
        })) || [];

        // Create seller application
        const application = new SellerApplication({
            email,
            phone,
            businessName,
            gstNumber,
            panNumber,
            addresses,
            bankDetails,
            kycDocs,
            licences,
            marketingBudget: marketingBudget || 0,
            status: "pending"
        });
        await application.save();

        // Notify admin via email
        await sendEmail(
            "joyory2025@gmail.com",
            "New Seller Application",
            `A new seller has applied.\n\nDetails:\n${JSON.stringify(application, null, 2)}`
        );

        res.status(201).json({
            message: "Application submitted successfully",
            application
        });
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

/**
 * Admin approves seller application
 * - Creates Seller account with temp password
 * - Updates application status
 * - Sends credentials to seller
 */
export const approveSeller = async (req, res) => {
    try {
        const app = await SellerApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ message: "Application not found" });

        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);

        // Create seller account (password hashed via pre-save hook)
        const seller = new Seller({
            email: app.email,
            phone: app.phone,
            password: tempPassword,
            businessName: app.businessName,
            gstNumber: app.gstNumber,
            panNumber: app.panNumber,
            addresses: app.addresses,
            bankDetails: app.bankDetails,
            kycDocs: app.kycDocs,
            licences: app.licences,
            marketingBudget: app.marketingBudget,
            status: "active"
        });
        await seller.save();

        // Update application status
        app.status = "approved";
        await app.save();

        // Notify seller via email
        await sendEmail(
            app.email,
            "Seller Account Approved",
            `Hello ${app.businessName},\n\nYour seller account has been approved!\n\nLogin details:\nEmail: ${app.email}\nPassword: ${tempPassword}\n\nPlease change your password after first login.`
        );

        res.json({ message: "Seller approved successfully", seller });
    } catch (err) {
        res.status(500).json({ message: "Error approving seller", error: err.message });
    }
};

/**
 * Admin can reject seller application (optional)
 */
export const rejectSellerApplication = async (req, res) => {
    try {
        const app = await SellerApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ message: "Application not found" });

        app.status = "rejected";
        await app.save();

        // Notify seller
        await sendEmail(
            app.email,
            "Seller Application Rejected",
            `Hello ${app.businessName},\n\nYour seller application has been rejected.`
        );

        res.json({ message: "Seller application rejected", application: app });
    } catch (err) {
        res.status(500).json({ message: "Error rejecting application", error: err.message });
    }
};
