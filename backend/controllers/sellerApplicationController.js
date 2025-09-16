// controllers/sellerApplicationController.js
import SellerApplication from "../models/SellerApplication.js";
import Seller from "../models/Seller.js";
import { BUSINESS_REQUIREMENTS } from "../businessRequirements.js";
import { sendEmail } from "../middlewares/utils/emailService.js";
import { createFundAccountForSeller } from "../middlewares/services/razorpayX.js";
import { buildSellerAppPdf } from "../middlewares/services/ecardPdf.js";
import { uploadPdfBuffer } from "../middlewares/upload.js";

// export const applySeller = async (req, res) => {
//     try {
//         let {
//             email,
//             phone,
//             businessName,
//             gstNumber,
//             panNumber,
//             addresses,
//             bankDetails,
//             marketingBudget,
//             licencesMeta,
//         } = req.body;

//         // ✅ Check if already applied
//         const exists = await SellerApplication.findOne({ email });
//         if (exists) {
//             return res.status(400).json({ message: "Already applied with this email" });
//         }

//         // ✅ Parse JSON fields if sent as string
//         try {
//             if (typeof addresses === "string") addresses = JSON.parse(addresses);
//             if (typeof bankDetails === "string") bankDetails = JSON.parse(bankDetails);
//             if (typeof licencesMeta === "string") licencesMeta = JSON.parse(licencesMeta);
//         } catch (parseErr) {
//             return res.status(400).json({
//                 message: "Invalid JSON in addresses/bankDetails/licencesMeta",
//                 error: parseErr.message,
//             });
//         }

//         // ✅ Process uploaded KYC documents
//         const kycDocs =
//             req.files?.kycDocs?.map((file) => ({
//                 url: file.path,
//                 filename: file.originalname,
//                 public_id: file.filename,
//                 uploadedAt: new Date(),
//             })) || [];

//         // ✅ Process licences with metadata
//         const licenceFiles = req.files?.licences || [];
//         const licences = (licencesMeta || []).map((lic, idx) => ({
//             category: lic.category,
//             docUrl: licenceFiles[idx]?.path,
//             approved: false,
//         }));

//         // ✅ Create seller application
//         const application = new SellerApplication({
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
//             status: "pending",
//         });

//         await application.save();

//         // ✅ Build PDF
//         const pdfBuffer = await buildSellerAppPdf(application);

//         // ✅ Upload PDF to Cloudinary (for record keeping)
//         const pdfUpload = await uploadPdfBuffer(pdfBuffer, `seller_${application._id}.pdf`);

//         // ✅ Notify admin with both summary text + PDF attachment
//         await sendEmail(
//             "joyory2025@gmail.com",
//             "New Seller Application",
//             `
//             <h2>New Seller Application Received</h2>
//             <p><b>Business:</b> ${application.businessName}</p>
//             <p><b>Email:</b> ${application.email}</p>
//             <p><b>Phone:</b> ${application.phone}</p>
//             <p><b>GST:</b> ${application.gstNumber || "-"}</p>
//             <p><b>PAN:</b> ${application.panNumber || "-"}</p>
//             <p>You can also view the PDF here: <a href="${pdfUpload.secure_url}" target="_blank">Download</a></p>
//             `,
//             [
//                 {
//                     filename: `seller_${application._id}.pdf`,
//                     content: pdfBuffer,
//                     contentType: "application/pdf",
//                 },
//             ]
//         );

//         res.status(201).json({
//             message: "Application submitted successfully",
//             application,
//             pdfUrl: pdfUpload.secure_url,
//         });
//     } catch (err) {
//         res.status(500).json({ message: "Server error", error: err.message });
//     }
// };


export const applySeller = async (req, res) => {
    try {
        let {
            email,
            phone,
            businessName,
            gstNumber,
            panNumber,
            addresses,
            bankDetails,
            marketingBudget,
            licencesMeta,
            businessType,
            cin,
        } = req.body;

        // ✅ Prevent duplicate application
        const exists = await SellerApplication.findOne({ email });
        if (exists) {
            return res.status(400).json({ message: "Application already exists for this email" });
        }

        // ✅ Parse JSON fields if sent as strings
        try {
            if (typeof addresses === "string") addresses = JSON.parse(addresses);
            if (typeof bankDetails === "string") bankDetails = JSON.parse(bankDetails);
            if (typeof licencesMeta === "string") licencesMeta = JSON.parse(licencesMeta);
        } catch (parseErr) {
            return res.status(400).json({
                message: "Invalid JSON format in addresses/bankDetails/licencesMeta",
                error: parseErr.message,
            });
        }

        // ✅ Validate business type
        const requirements = BUSINESS_REQUIREMENTS[businessType];
        if (!requirements) {
            return res.status(400).json({ message: "Invalid or missing business type" });
        }

        // ✅ Validate required fields (panNumber, gstNumber, cin, bankDetails etc.)
        for (const field of requirements.requiredFields) {
            if (!req.body[field]) {
                return res
                    .status(400)
                    .json({ message: `Field "${field}" is required for ${businessType}` });
            }
        }

        // ✅ Validate required documents
        // Each uploaded file should have `fieldname` = docType (panCard, gstCertificate, etc.)
        const uploadedDocs = (req.files?.kycDocs || []).map((f) => f.fieldname);
        for (const doc of requirements.requiredDocs) {
            if (!uploadedDocs.includes(doc)) {
                return res
                    .status(400)
                    .json({ message: `Document "${doc}" is required for ${businessType}` });
            }
        }

        // ✅ Process uploaded KYC documents (with docType)
        const kycDocs =
            req.files?.kycDocs?.map((file) => ({
                docType: file.fieldname, // 👈 important
                url: file.path,
                filename: file.originalname,
                public_id: file.filename,
                uploadedAt: new Date(),
            })) || [];

        // ✅ Process licences
        const licenceFiles = req.files?.licences || [];
        const licences = (licencesMeta || []).map((lic, idx) => ({
            category: lic.category,
            docUrl: licenceFiles[idx]?.path,
            approved: false,
        }));

        // ✅ Create seller application
        const application = new SellerApplication({
            email,
            phone,
            businessName,
            gstNumber,
            panNumber,
            addresses,
            bankDetails,
            businessType,
            cin,
            kycDocs,
            licences,
            marketingBudget: marketingBudget || 0,
            status: "pending",
        });

        await application.save();

        // ✅ Build PDF summary
        const pdfBuffer = await buildSellerAppPdf(application);

        // ✅ Upload PDF to Cloudinary
        const pdfUpload = await uploadPdfBuffer(pdfBuffer, `seller_${application._id}.pdf`);

        // ✅ Notify admin with both summary + PDF
        await sendEmail(
            "joyory2025@gmail.com",
            "New Seller Application",
            `
            <h2>New Seller Application Received</h2>
            <p><b>Business:</b> ${application.businessName}</p>
            <p><b>Email:</b> ${application.email}</p>
            <p><b>Phone:</b> ${application.phone}</p>
            <p><b>GST:</b> ${application.gstNumber || "-"}</p>
            <p><b>PAN:</b> ${application.panNumber || "-"}</p>
            <p><b>CIN:</b> ${application.cin || "-"}</p>
            <p>You can view the application PDF here: <a href="${pdfUpload.secure_url}" target="_blank">Download</a></p>
            `,
            [
                {
                    filename: `seller_${application._id}.pdf`,
                    content: pdfBuffer,
                    contentType: "application/pdf",
                },
            ]
        );

        return res.status(201).json({
            message: "Application submitted successfully",
            application,
            pdfUrl: pdfUpload.secure_url,
        });
    } catch (err) {
        console.error("❌ Error in applySeller:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

export const approveSeller = async (req, res) => {
    try {
        const app = await SellerApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ message: "Application not found" });

        const tempPassword = Math.random().toString(36).slice(-8);

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

        // ✅ Create RazorpayX Fund Account for this seller
        const fundId = await createFundAccountForSeller(seller);
        seller.fundAccountId = fundId;

        await seller.save();

        app.status = "approved";
        await app.save();

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
