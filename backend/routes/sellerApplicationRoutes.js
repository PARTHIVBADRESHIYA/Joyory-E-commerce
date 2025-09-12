// // routes/sellerApplicationRoutes.js
// import express from "express";
// import {
//     applySeller,
//     approveSeller
// } from "../controllers/sellerApplicationController.js";
// import { uploadSeller } from "../middlewares/upload.js";
// import { isAdmin } from "../middlewares/authMiddleware.js";

// const router = express.Router();

// /**
//  * @route POST /api/seller/apply
//  * @desc Submit seller application with docs
//  * @access Private (logged-in user)
//  */
// router.post(
//     "/apply",
//     uploadSeller.fields([
//         { name: "kycDocs", maxCount: 5 },      // KYC / identity docs
//         { name: "licences", maxCount: 5 },     // Business licences
//     ]),
//     async (req, res, next) => {
//         try {
//             // Build docs array from uploaded files
//             if (req.files?.kycDocs) {
//                 req.body.kycDocs = req.files.kycDocs.map(file => ({
//                     url: file.path,
//                     filename: file.originalname,
//                     public_id: file.filename,
//                     uploadedAt: new Date()
//                 }));
//             }

//             if (req.files?.licences) {
//                 req.body.licences = req.files.licences.map(file => ({
//                     category: req.body.licenceCategory || "general",
//                     docUrl: file.path,
//                     approved: false
//                 }));
//             }

//             // call controller
//             return applySeller(req, res, next);
//         } catch (err) {
//             next(err);
//         }
//     }
// );

// /**
//  * @route PATCH /api/seller/approve/:id
//  * @desc Admin approves a seller application
//  * @access Private (admin only)
//  */
// router.patch("/approve/:id", isAdmin, approveSeller);

// export default router;












import express from "express";
import { applySeller, approveSeller,rejectSellerApplication } from "../controllers/sellerApplicationController.js";
import { uploadSeller } from "../middlewares/upload.js";
import { isAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Submit seller application (with files)
router.post(
    "/apply",
    uploadSeller.fields([
        { name: "kycDocs", maxCount: 5 },
        { name: "licences", maxCount: 5 }
    ]),
    applySeller
);

// Approve seller (admin only)
router.patch("/approve/:id", isAdmin, approveSeller);

router.patch("/reject/:id", isAdmin, rejectSellerApplication);

export default router;
