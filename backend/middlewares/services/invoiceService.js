// // middlewares/services/invoiceService.js
// import PDFDocument from "pdfkit";
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import cloudinary from "../../middlewares/utils/cloudinary.js";
// import Invoice from "../../models/Invoice.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const cleanNumber = (value) => {
//     if (typeof value === "string") {
//         // Remove all NON-DIGITS, NON-DOT, NON-MINUS characters
//         value = value.replace(/[^0-9\.-]/g, "");
//     }
//     const num = Number(value);
//     return isNaN(num) ? 0 : num;
// };


// export const generateAndSaveInvoice = async (order) => {
//     try {
//         const invoiceNumber = `INV-${order.orderNumber || Date.now()}-${order._id.toString().slice(-5)}`;
//         const invoiceDate = new Date();
//         const user = order.user;

//         // Calculate totals
//         let subtotal = 0;
//         const items = order.products.map(p => {
//             const qty = Number(p.quantity);
//             const price = cleanNumber(p.price);
//             const total = qty * price;
//             subtotal += total;
//             return {
//                 productId: p.productId._id,
//                 name: p.productId.name,
//                 sku: p.variant?.sku || p.productId.sku,
//                 quantity: qty,
//                 price,
//                 total,
//                 hsn: p.productId.hsn || ""
//             };
//         });

//         const shippingCharge = cleanNumber(order.shippingCharge);
//         const discount =
//             cleanNumber(order.couponDiscount) +
//             cleanNumber(order.pointsDiscount) +
//             cleanNumber(order.giftCardDiscount);
//         const gstRate = order.gst?.rate ?? 12;
//         const gstAmount = cleanNumber(order.gst?.amount || (subtotal * gstRate / 100));
//         const grandTotal = cleanNumber(subtotal + gstAmount + shippingCharge - discount);

//         // Generate PDF
//         const pdfBuffer = await generateProfessionalInvoice({
//             invoiceNumber,
//             invoiceDate,
//             order,
//             user,
//             items,
//             subtotal,
//             shippingCharge,
//             discount,
//             gstRate,
//             gstAmount,
//             grandTotal
//         });

//         // Upload to Cloudinary with optimized settings
//         const uploadResult = await uploadToCloudinary(pdfBuffer, invoiceNumber);

//         // Save to database
//         const invoiceDoc = await Invoice.create({
//             invoiceNumber,
//             invoicePdfUrl: uploadResult.secure_url,
//             order: order._id,
//             user: user._id,
//             shippingAddress: order.shippingAddress,
//             items,
//             subtotal,
//             taxPercent: gstRate,
//             taxAmount: gstAmount,
//             shippingCharge,
//             discountAmount: discount,
//             grandTotal,
//             paymentMethod: order.paymentMethod,
//             paid: order.paid,
//             paymentId: order.paymentId,
//             orderDate: order.createdAt
//         });

//         return invoiceDoc;
//     } catch (error) {
//         console.error('Invoice generation error:', error);
//         throw new Error(`Failed to generate invoice: ${error.message}`);
//     }
// };

// const generateProfessionalInvoice = async (data) => {
//     return new Promise((resolve, reject) => {
//         try {
//             const doc = new PDFDocument({
//                 margin: 40,
//                 size: 'A4',
//                 info: {
//                     Title: `Invoice ${data.invoiceNumber}`,
//                     Author: 'Joyory | Premium Beauty & Fashion Shopping Online',
//                     Subject: 'Tax Invoice'
//                 }
//             });

//             const buffers = [];
//             doc.on('data', buffers.push.bind(buffers));
//             doc.on('end', () => resolve(Buffer.concat(buffers)));
//             doc.on('error', reject);

//             // Colors - Nykaa style
//             const primaryColor = '#ff2e63'; // Pink similar to Nykaa
//             const secondaryColor = '#367498'; // Dark blue
//             const lightGray = '#f5f5f5';
//             const darkGray = '#666666';
//             const textColor = '#333333';

//             // Helper function for drawing rounded rectangles
//             const roundedRect = (x, y, width, height, radius) => {
//                 doc.roundedRect(x, y, width, height, radius).stroke();
//             };

//             // ==================== HEADER SECTION ====================
//             // Company Header with background
//             doc.rect(0, 0, doc.page.width, 120)
//                 .fill(secondaryColor);

//             doc.fillColor('#cccccc')
//                 .fontSize(10)
//                 .font('Helvetica')
//                 .text('Joyory | Premium Beauty & Fashion Shopping Online', 50, 60);

//             // Invoice Title on right
//             doc.fillColor('#ffffff')
//                 .fontSize(28)
//                 .font('Helvetica-Bold')
//                 .text('TAX INVOICE', doc.page.width - 250, 30, {
//                     width: 150,
//                     align: 'right'
//                 });

//             doc.fillColor('#cccccc')
//                 .fontSize(12)
//                 .text('Original for Recipient', doc.page.width - 250, 65, {
//                     width: 200,
//                     align: 'right'
//                 });

//             // ==================== COMPANY & BILLING INFO ====================
//             let yPos = 140;

//             // Left Column - Company Info
//             doc.fillColor(textColor)
//                 .fontSize(10)
//                 .font('Helvetica-Bold')
//                 .text('SOLD BY:', 50, yPos);

//             doc.fillColor(darkGray)
//                 .font('Helvetica')
//                 .text('Joyory | Premium Beauty & Fashion Shopping Online', 50, yPos + 15)
//                 .text('GSTIN: 24AAAAA0000A1Z5', 50, yPos + 30)
//                 .text('joyory2025@gmail.com', 50, yPos + 45)
//                 .text('+91 79900 32368', 50, yPos + 60);

//             // Right Column - Invoice Details Box
//             const boxWidth = 250;
//             const boxX = doc.page.width - boxWidth - 50;

//             // Background for invoice details
//             doc.roundedRect(boxX, yPos, boxWidth, 80, 5)
//                 .fill(lightGray);

//             doc.fillColor(secondaryColor)
//                 .fontSize(11)
//                 .font('Helvetica-Bold')
//                 .text('INVOICE DETAILS', boxX + 15, yPos + 10);

//             doc.fillColor(textColor)
//                 .fontSize(9)
//                 .font('Helvetica')
//                 .text(`Invoice No: ${data.invoiceNumber}`, boxX + 15, yPos + 30)
//                 .text(`Invoice Date: ${data.invoiceDate.toLocaleDateString('en-IN')}`, boxX + 15, yPos + 45)
//                 .text(`Order No: ${data.order.orderNumber || data.order._id}`, boxX + 15, yPos + 60);

//             yPos += 100;

//             // ==================== BILLING & SHIPPING ADDRESS ====================
//             // Billing Address
//             doc.fillColor(textColor)
//                 .fontSize(11)
//                 .font('Helvetica-Bold')
//                 .text('BILLING ADDRESS:', 50, yPos);

//             doc.fillColor(darkGray)
//                 .fontSize(10)
//                 .font('Helvetica')
//                 .text(data.user.name, 50, yPos + 15)
//                 .text(data.user.email, 50, yPos + 30)
//                 .text(data.user.phone || 'N/A', 50, yPos + 45);

//             // Shipping Address
//             doc.fillColor(textColor)
//                 .fontSize(11)
//                 .font('Helvetica-Bold')
//                 .text('SHIPPING ADDRESS:', 250, yPos);

//             const shipping = data.order.shippingAddress;
//             doc.fillColor(darkGray)
//                 .fontSize(10)
//                 .font('Helvetica')
//                 .text(shipping.addressLine1, 250, yPos + 15)
//                 .text(shipping.addressLine2 || '', 250, yPos + 30)
//                 .text(`${shipping.city}, ${shipping.state} - ${shipping.pincode}`, 250, yPos + 45)
//                 .text(shipping.country || 'India', 250, yPos + 60);

//             yPos += 90;

//             // ==================== PRODUCTS TABLE ====================
//             // Table Header with background
//             doc.rect(50, yPos, doc.page.width - 100, 30)
//                 .fill(primaryColor);

//             doc.fillColor('#ffffff')
//                 .fontSize(10)
//                 .font('Helvetica-Bold')
//                 .text('PRODUCT', 60, yPos + 10)
//                 .text('HSN', 200, yPos + 10)
//                 .text('QTY', 260, yPos + 10)
//                 .text('PRICE', 310, yPos + 10)
//                 .text('GST%', 370, yPos + 10)
//                 .text('GST AMT', 420, yPos + 10)
//                 .text('TOTAL', 480, yPos + 10);

//             yPos += 35;

//             // Table Rows
//             data.items.forEach((item, index) => {
//                 // Alternate row background
//                 if (index % 2 === 0) {
//                     doc.rect(50, yPos - 5, doc.page.width - 100, 25)
//                         .fill('#fafafa');
//                 }

//                 const itemGst = (item.total * data.gstRate) / 100;

//                 doc.fillColor(textColor)
//                     .fontSize(9)
//                     .font('Helvetica')
//                     .text(item.name.substring(0, 30) + (item.name.length > 30 ? '...' : ''), 60, yPos)
//                     .text(item.hsn || 'N/A', 200, yPos)
//                     .text(item.quantity.toString(), 260, yPos)
//                     .text(`₹${item.price.toFixed(2)}`, 310, yPos)
//                     .text(`${data.gstRate}%`, 370, yPos)
//                     .text(`₹${itemGst.toFixed(2)}`, 420, yPos)
//                     .text(`₹${cleanNumber(item.total).toFixed(2)}`, 480, yPos);

//                 yPos += 25;
//             });

//             // Horizontal line after items
//             doc.moveTo(50, yPos + 5)
//                 .lineTo(doc.page.width - 50, yPos + 5)
//                 .stroke(darkGray);

//             yPos += 20;

//             // ==================== PAYMENT & TOTALS SECTION ====================
//             // Payment Method Box
//             doc.fillColor(secondaryColor)
//                 .fontSize(11)
//                 .font('Helvetica-Bold')
//                 .text('PAYMENT METHOD', 50, yPos);

//             doc.fillColor(textColor)
//                 .fontSize(10)
//                 .font('Helvetica')
//                 .text(data.order.paymentMethod.toUpperCase(), 50, yPos + 15)
//                 .text(`Status: ${data.order.paid ? 'PAID' : 'PENDING'}`, 50, yPos + 30)
//                 .text(`Transaction ID: ${data.order.paymentId || 'N/A'}`, 50, yPos + 45);

//             // Totals Box (right aligned)
//             const totalsWidth = 250;
//             const totalsX = doc.page.width - totalsWidth - 50;

//             // Totals background
//             doc.roundedRect(totalsX, yPos - 10, totalsWidth, 180, 8)
//                 .fill(lightGray)
//                 .stroke();

//             doc.fillColor(secondaryColor)
//                 .fontSize(12)
//                 .font('Helvetica-Bold')
//                 .text('ORDER SUMMARY', totalsX + 15, yPos);

//             let summaryY = yPos + 25;

//             const summaryItems = [
//                 { label: 'Subtotal:', value: `₹${data.subtotal.toFixed(2)}` },
//                 { label: `GST (${data.gstRate}%):`, value: `₹${data.gstAmount.toFixed(2)}` },
//                 { label: 'Shipping:', value: `₹${data.shippingCharge.toFixed(2)}` },
//                 { label: 'Discount:', value: `-₹${data.discount.toFixed(2)}` },
//             ];

//             summaryItems.forEach(item => {
//                 doc.fillColor(darkGray)
//                     .fontSize(10)
//                     .font('Helvetica')
//                     .text(item.label, totalsX + 15, summaryY);

//                 doc.fillColor(textColor)
//                     .fontSize(10)
//                     .font('Helvetica-Bold')
//                     .text(item.value, totalsX + totalsWidth - 70, summaryY, {
//                         width: 55,
//                         align: 'right'
//                     });

//                 summaryY += 20;
//             });

//             // Grand Total
//             doc.moveTo(totalsX + 15, summaryY)
//                 .lineTo(totalsX + totalsWidth - 15, summaryY)
//                 .stroke(darkGray);

//             summaryY += 15;

//             doc.fillColor(primaryColor)
//                 .fontSize(14)
//                 .font('Helvetica-Bold')
//                 .text('Grand Total:', totalsX + 15, summaryY);

//             doc.fillColor(primaryColor)
//                 .fontSize(16)
//                 .font('Helvetica-Bold')
//                 .text(`₹${data.grandTotal.toFixed(2)}`, totalsX + totalsWidth - 70, summaryY, {
//                     width: 55,
//                     align: 'right'
//                 });

//             // ==================== FOOTER ====================
//             const footerY = doc.page.height - 80;

//             doc.fillColor(darkGray)
//                 .fontSize(8)
//                 .text('Thank you for shopping with Joyory Beauty!', 50, footerY, {
//                     align: 'center',
//                     width: doc.page.width - 100
//                 })
//                 .moveDown(0.5)
//                 .text('This is a computer-generated invoice and does not require a physical signature.', {
//                     align: 'center',
//                     width: doc.page.width - 100
//                 })
//                 .moveDown(0.5)
//                 .text('For any queries, contact: joyory2025@gmail.com | +91 79900 32368', {
//                     align: 'center',
//                     width: doc.page.width - 100
//                 });

//             // Page number
//             doc.text(`Page 1 of 1`, doc.page.width - 100, doc.page.height - 40, {
//                 align: 'right'
//             });

//             doc.end();
//         } catch (error) {
//             reject(error);
//         }
//     });
// };

// const uploadToCloudinary = async (pdfBuffer, invoiceNumber) => {
//     try {
//         return await new Promise((resolve, reject) => {
//             cloudinary.uploader.upload_stream(
//                 {
//                     folder: "invoices",
//                     resource_type: "auto",     // auto-detect PDF
//                     type: "upload",
//                     public_id: invoiceNumber,
//                     access_mode: "public",
//                     format: "pdf",
//                     tags: ["invoice", "ecommerce"],
//                     context: {
//                         invoice: invoiceNumber
//                     }
//                 },
//                 (error, result) => {
//                     if (error) return reject(
//                         new Error("Cloudinary upload failed: " + error.message)
//                     );
//                     resolve(result);
//                 }
//             ).end(pdfBuffer);
//         });
//     } catch (error) {
//         throw error;
//     }
// };



// middlewares/services/invoiceService.js
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import cloudinary from "../../middlewares/utils/cloudinary.js";
import Invoice from "../../models/Invoice.js";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Clean number utility
const cleanNumber = (value) => {
    if (typeof value === "string") {
        value = value.replace(/[^0-9\.-]/g, "");
    }
    const num = Number(value);
    return isNaN(num) ? 0 : num;
};

export const generateAndSaveInvoice = async (order) => {
    try {
        const invoiceNumber = `INV-${order.orderNumber || Date.now()}-${order._id
            .toString()
            .slice(-5)}`;
        const invoiceDate = new Date();
        const user = order.user;
        const customerName = order.customerName || order.shippingAddress?.name || "Unknown";

        // ---- Calculate totals ----
        let subtotal = 0;
        const items = order.products.map((p) => {
            const qty = Number(p.quantity);
            const price = cleanNumber(p.price);
            const total = qty * price;
            subtotal += total;

            return {
                productId: p.productId._id,
                name: p.productId.name,
                sku: p.variant?.sku || p.productId.sku,
                quantity: qty,
                price,
                total,
                hsn: p.productId.hsn || "N/A",
            };
        });

        const shippingCharge = cleanNumber(order.shippingCharge);
        const discount =
            cleanNumber(order.couponDiscount) +
            cleanNumber(order.pointsDiscount) +
            cleanNumber(order.giftCardDiscount);
        const gstRate = order.gst?.rate ?? 12;
        const gstAmount = cleanNumber(
            order.gst?.amount || (subtotal * gstRate) / 100
        );
        const grandTotal = cleanNumber(
            subtotal + gstAmount + shippingCharge - discount
        );

        // ---- Generate PDF ----
        const pdfBuffer = await generateProfessionalInvoice({
            invoiceNumber,
            invoiceDate,
            order,
            user,
            customerName,
            items,
            subtotal,
            shippingCharge,
            discount,
            gstRate,
            gstAmount,
            grandTotal,
        });

        // ---- Upload to Cloudinary ----
        const upload = await uploadToCloudinary(pdfBuffer, invoiceNumber);

        // ---- Save invoice ----
        const invoiceDoc = await Invoice.create({
            invoiceNumber,
            invoicePdfUrl: upload.secure_url,
            order: order._id,
            user: user._id,
            shippingAddress: order.shippingAddress,
            items,
            subtotal,
            taxPercent: gstRate,
            taxAmount: gstAmount,
            shippingCharge,
            discountAmount: discount,
            grandTotal,
            paymentMethod: order.paymentMethod,
            paid: order.paid,
            paymentId: order.paymentId,
            orderDate: order.createdAt,
        });

        return invoiceDoc;
    } catch (error) {
        console.error("Invoice generation error:", error);
        throw new Error("Failed to generate invoice: " + error.message);
    }
};

const generateProfessionalInvoice = async (data) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: "A4",
                margin: 40,
                info: {
                    Title: `Invoice ${data.invoiceNumber}`,
                    Author: "Joyory | Premium Beauty & Fashion Shopping Online",
                },
            });

            const buffers = [];
            doc.on("data", buffers.push.bind(buffers));
            doc.on("end", () => resolve(Buffer.concat(buffers)));
            doc.on("error", reject);

            const fontRegular = path.join(process.cwd(), "assets", "NotoSans-Regular.ttf");
            const fontBold = path.join(process.cwd(), "assets", "NotoSans-Bold.ttf");

            console.log("Font Regular Path:", fontRegular, "Exists?", fs.existsSync(fontRegular));
            console.log("Font Bold Path:", fontBold, "Exists?", fs.existsSync(fontBold));

            doc.registerFont("Regular", fontRegular);
            doc.registerFont("Bold", fontBold);

            // ---- Colors ----
            const primary = "#ff2e63";
            const secondary = "#367498";
            const gray = "#555";
            const lightGray = "#f7f7f7";

            // ---- HEADER ----
            doc.rect(0, 0, doc.page.width, 120).fill(secondary);

            const logoPath = path.join(__dirname, "../../assets/logo.png");

            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 40, 25, { width: 80 });
            }


            doc.fillColor("#fff")
                .fontSize(26)
                .font("Bold")
                .text("TAX INVOICE", 0, 40, {
                    align: "right",
                    width: doc.page.width - 40,
                });

            doc.fillColor("#ddd")
                .font("Regular")
                .fontSize(10)
                .text("Original for Recipient", 0, 75, {
                    align: "right",
                    width: doc.page.width - 40,
                });

            let y = 140;

            // ---- SOLD BY ----
            doc.fillColor(primary)
                .font("Bold")
                .fontSize(11)
                .text("SOLD BY:", 40, y);

            doc.fillColor(gray)
                .font("Regular")
                .fontSize(10)
                .text("Joyory | Premium Beauty & Fashion Shopping Online", 40, y + 18)
                .text("GSTIN: 24AAAAA0000A1Z5", 40, y + 33)
                .text("Email: joyory2025@gmail.com", 40, y + 48)
                .text("Phone: +91 79900 32368", 40, y + 63);

            // ---- INVOICE DETAILS BOX ----
            const boxX = 300;
            doc.roundedRect(boxX, y, 250, 85, 8).fill(lightGray);

            doc.fillColor(secondary)
                .font("Bold")
                .fontSize(11)
                .text("INVOICE DETAILS", boxX + 12, y + 12);

            doc.fillColor(gray)
                .font("Regular")
                .fontSize(10)
                .text(`Invoice No: ${data.invoiceNumber}`, boxX + 12, y + 32)
                .text(
                    `Invoice Date: ${data.invoiceDate.toLocaleDateString("en-IN")}`,
                    boxX + 12,
                    y + 47
                )
                .text(
                    `Order No: ${data.order.orderNumber || data.order._id}`,
                    boxX + 12,
                    y + 62
                );

            y += 110;

            // ---- BILLING + SHIPPING ----
            doc.fillColor(primary)
                .font("Bold")
                .fontSize(12)
                .text("BILLING ADDRESS", 40, y);

            const ship = data.order.shippingAddress;

            doc.fillColor(gray)
                .font("Regular")
                .fontSize(10)
                .text(data.user.name, 40, y + 18)
                .text(data.user.email, 40, y + 33)
                .text(data.user.phone || "N/A", 40, y + 48);

            doc.fillColor(primary)
                .font("Bold")
                .fontSize(12)
                .text("SHIPPING ADDRESS", 300, y);

            doc.fillColor(gray)
                .font("Regular")
                .fontSize(10)
                .text(ship.addressLine1, 300, y + 18)
                .text(ship.addressLine2 || "", 300, y + 33)
                .text(
                    `${ship.city}, ${ship.state} - ${ship.pincode}`,
                    300,
                    y + 48
                )
                .text(ship.country || "India", 300, y + 63);

            y += 110;

            const items = order.products.map((p) => {
                const qty = Number(p.quantity);
                const price = cleanNumber(p.price);
                const total = qty * price;
                subtotal += total;

                return {
                    productId: p.productId._id,
                    name: `${p.productId.name}${p.variant?.shadeName ? " - " + p.variant.shadeName : ""}`, // <-- updated
                    sku: p.variant?.sku || p.productId.sku,
                    quantity: qty,
                    price,
                    total,
                    hsn: p.productId.hsn || "N/A", // <-- keep HSN
                };
            });

            // ---- PRODUCT TABLE HEADER ----
            doc.rect(40, y, doc.page.width - 80, 30).fill(primary);

            doc.fillColor("#fff")
                .font("Bold")
                .fontSize(10)
                .text("PRODUCT", 50, y + 10)
                .text("HSN", 210, y + 10)
                .text("QTY", 260, y + 10)
                .text("PRICE", 310, y + 10)
                .text("GST%", 380, y + 10)
                .text("GST AMT", 430, y + 10)
                .text("TOTAL", 500, y + 10);

            y += 40;

            // ---- PRODUCT TABLE ROWS ----
            data.items.forEach((item, i) => {
                const rowY = y + i * 28;

                if (i % 2 === 0) {
                    doc.rect(40, rowY - 2, doc.page.width - 80, 26).fill("#fafafa");
                }

                const itemGst = (item.total * data.gstRate) / 100;

                doc.fillColor(gray)
                    .font("Regular")
                    .fontSize(9)
                    .text(item.name.substring(0, 30), 50, rowY)
                    .text(item.hsn, 210, rowY)
                    .text(item.quantity.toString(), 260, rowY)
                    .text(`₹${item.price.toFixed(2)}`, 310, rowY)
                    .text(`${data.gstRate}%`, 380, rowY)
                    .text(`₹${itemGst.toFixed(2)}`, 430, rowY)
                    .text(`₹${item.total.toFixed(2)}`, 500, rowY);
            });

            y += data.items.length * 28 + 20;

            // ---- ORDER SUMMARY ----
            const sumX = 300;
            doc.roundedRect(sumX, y, 250, 150, 10).fill(lightGray);

            doc.fillColor(secondary)
                .font("Bold")
                .fontSize(12)
                .text("ORDER SUMMARY", sumX + 14, y + 10);

            const summary = [
                ["Subtotal:", `₹${data.subtotal.toFixed(2)}`],
                [`GST (${data.gstRate}%):`, `₹${data.gstAmount.toFixed(2)}`],
                ["Shipping:", `₹${data.shippingCharge.toFixed(2)}`],
                ["Discount:", `-₹${data.discount.toFixed(2)}`],
            ];

            let sy = y + 40;
            summary.forEach(([label, value]) => {
                doc.fillColor(gray)
                    .font("Regular")
                    .fontSize(8)
                    .text(label, sumX + 14, sy);

                doc.fillColor(primary)
                    .font("Bold")
                    .fontSize(10) // smaller than before

                    .text(value, sumX + 200, sy, { width: 40, align: "right" });

                sy += 20;
            });

            // GRAND TOTAL
            doc.fillColor(primary)
                .font("Bold")
                .fontSize(12)
                .text("Grand Total:", sumX + 14, sy + 10);

            doc.fillColor(primary)
                .font("Bold")
                .fontSize(12)
                .text(
                    `₹${data.grandTotal.toFixed(2)}`,
                    sumX + 200,
                    sy + 10,
                    { width: 40, align: "right" }
                );

            // ---- FOOTER ----
            doc.fillColor(gray)
                .font("Regular")
                .fontSize(9)
                .text(
                    "Thank you for shopping with Joyory Beauty!",
                    40,
                    doc.page.height - 100,
                    { align: "center", width: doc.page.width - 80 }
                )
                .text(
                    "This is a computer-generated invoice and does not require a signature.",
                    40,
                    doc.page.height - 80,
                    { align: "center", width: doc.page.width - 80 }
                );

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};

const uploadToCloudinary = async (pdfBuffer, invoiceNumber) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader
            .upload_stream(
                {
                    folder: "invoices",
                    public_id: invoiceNumber,
                    resource_type: "auto",
                    format: "pdf",
                },
                (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                }
            )
            .end(pdfBuffer);
    });
};
