import PDFDocument from "pdfkit";
import path from "path";
import axios from "axios";

export const buildEcardPdf = async ({ title, name, message }) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: "A4", margin: 50 });
            const chunks = [];

            doc.on("data", (chunk) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));

            // 🌄 Background image (watermark style)
            try {
                const bgPath = path.resolve("assets/bg-pattern.png"); // put an image in assets/
                doc.image(bgPath, 0, 0, {
                    width: doc.page.width,
                    height: doc.page.height,
                    align: "center",
                    valign: "center"
                });
            } catch (e) {
                console.warn("⚠️ Background not found, skipping...");
            }

            // 🎨 HEADER BANNER
            doc.rect(0, 0, doc.page.width, 80).fillOpacity(0.85).fill("#f39c12");
            doc.fillColor("#fff").fontSize(26).text("Joyory", 50, 30);

            doc.moveDown(3);

            // 🎉 Title (with 🎉 emoji as image)
            doc.fillColor("#333").fontSize(20).text(title, { align: "center" });
            try {
                const partyIcon = path.resolve("assets/party.jpeg"); // add a 🎉 png here
                doc.image(partyIcon, doc.page.width / 2 - 15, doc.y + 5, { width: 25, height: 25 });
            } catch (e) {
                console.warn("⚠️ Missing party icon, skipping...");
            }

            doc.moveDown(3);

            // 👋 Greeting
            doc.fontSize(16).fillColor("#000").text(`Dear ${name},`, { align: "left" });

            doc.moveDown();

            // ✨ Message
            doc.fontSize(14).fillColor("#555").text(message, {
                align: "left",
                lineGap: 6,
            });

            doc.moveDown(3);

            // ❤️ Footer (with heart icon image)
            doc.fontSize(12).fillColor("#e74c3c").text("With ", { continued: true, align: "right" });
            try {
                const heartIcon = path.resolve("assets/heart.jpeg"); // add a ❤️ png here
                doc.image(heartIcon, doc.page.width - 120, doc.y - 5, { width: 14, height: 14 });
            } catch (e) {
                console.warn("⚠️ Missing heart icon, skipping...");
            }
            doc.fillColor("#e74c3c").text(" from Joyory", { align: "right" });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

export const buildSellerAppPdf = (application) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: "A4", margin: 40 });
            const chunks = [];

            doc.on("data", (c) => chunks.push(c));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", (err) => reject(err));

            // ===== HEADER =====
            doc.fontSize(22).fillColor("#2c3e50").text("New Seller Application", { align: "center" });
            doc.moveDown();

            // ===== Business Info =====
            doc.fontSize(16).fillColor("#000").text("Business Information");
            doc.fontSize(12).fillColor("#555")
                .text(`Business Name: ${application.businessName || "-"}`)
                .text(`Email: ${application.email}`)
                .text(`Phone: ${application.phone}`)
                .text(`GST: ${application.gstNumber || "-"}`)
                .text(`PAN: ${application.panNumber || "-"}`);
            doc.moveDown();

            // ===== Addresses =====
            doc.fontSize(16).fillColor("#000").text("Addresses");
            (application.addresses || []).forEach((addr, idx) => {
                doc.fontSize(12).fillColor("#555")
                    .text(`${idx + 1}. ${addr.line1}, ${addr.city}, ${addr.state}, ${addr.pincode}, ${addr.country}`);
            });
            doc.moveDown();

            // ===== Bank Details =====
            doc.fontSize(16).fillColor("#000").text("Bank Details");
            const bd = application.bankDetails || {};
            doc.fontSize(12).fillColor("#555")
                .text(`Bank Name: ${bd.bankName || "-"}`)
                .text(`Account Number: ${bd.accountNumberEncrypted || "-"}`)
                .text(`IFSC: ${bd.ifsc || "-"}`);
            doc.moveDown();

            // ===== Licences =====
            doc.fontSize(16).fillColor("#000").text("Licences");
            (application.licences || []).forEach((lic, idx) => {
                doc.fontSize(12).fillColor("#555")
                    .text(`${idx + 1}. Category: ${lic.category} | Status: ${lic.approved ? "Approved" : "Pending"}`);

                if (lic.docUrl) {
                    // clickable link instead of dumping URL
                    doc.fillColor("blue").text("🔗 View Document", { link: lic.docUrl, underline: true });
                    doc.fillColor("#555"); // reset color
                } else {
                    doc.text("   No document uploaded");
                }
                doc.moveDown(0.5);
            });
            doc.moveDown();

            // ===== KYC Docs =====
            doc.fontSize(16).fillColor("#000").text("KYC Documents");
            (application.kycDocs || []).forEach((d, idx) => {
                doc.fontSize(12).fillColor("#555").text(`${idx + 1}. ${d.filename}`);

                if (d.url) {
                    doc.fillColor("blue").text("🔗 View Document", { link: d.url, underline: true });
                    doc.fillColor("#555");
                } else {
                    doc.text("   No file uploaded");
                }
                doc.moveDown(0.5);
            });
            doc.moveDown();

            // ===== Footer =====
            doc.fontSize(14).fillColor("#2c3e50")
                .text(`Marketing Budget: ₹${application.marketingBudget || 0}`)
                .text(`Status: ${application.status}`);
            doc.moveDown();

            // ✅ Finalize PDF
            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};