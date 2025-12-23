// middlewares/services/invoiceService.js
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import cloudinary from "../../middlewares/utils/cloudinary.js";
import Invoice from "../../models/Invoice.js";
import fs from "fs";
import Order from "../../models/Order.js";
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

        await order.populate("user");

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
            transactionId: order.transactionId,
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
                .text(
                    ship.addressLine1 || ship.address || "N/A",
                    300,
                    y + 18
                )
                .text(
                    ship.addressLine2 || "",
                    300,
                    y + 33
                )
                .text(
                    `${ship.city}, ${ship.state} - ${ship.pincode}`,
                    300,
                    y + 48
                )
                .text(ship.country || "India", 300, y + 63);

            y += 110;

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
                .fontSize(10) // ⬅ smaller
                .text("Grand Total:", sumX + 14, sy + 10);

            doc.fillColor(primary)
                .font("Bold")
                .fontSize(10) // ⬅ smaller
                .text(
                    `₹${data.grandTotal.toFixed(2)}`,
                    sumX + 180,          // ⬅ shift left slightly
                    sy + 10,
                    { width: 60, align: "right" } // ⬅ more breathing space
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
