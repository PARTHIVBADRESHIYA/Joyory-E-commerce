// middlewares/services/invoiceService.js
import PDFDocument from "pdfkit";
import cloudinary from "../../middlewares/utils/cloudinary.js";

export const generateInvoice = async (order, user) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];

            doc.on("data", buffers.push.bind(buffers));
            doc.on("end", async () => {
                const pdfBuffer = Buffer.concat(buffers);

                // Upload to Cloudinary (like your e-card)
                const uploadResult = await new Promise((res, rej) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            folder: "invoices",
                            resource_type: "raw",
                            public_id: `invoice-${order._id}`,
                            access_mode: "public",
                        },
                        (err, result) => {
                            if (err) return rej(err);
                            res(result);
                        }
                    );
                    uploadStream.end(pdfBuffer);
                });

                resolve({ pdfBuffer, pdfUrl: uploadResult.secure_url });
            });

            // ============= HEADER =============
            doc.fontSize(20).text("Joyory Invoice", { align: "center" });
            doc.moveDown();
            doc.fontSize(10).text(`Invoice #: INV-${order._id}`);
            doc.text(`Date: ${new Date().toLocaleDateString()}`);
            doc.moveDown();

            // ============= SELLER INFO =============
            doc.text("From:");
            doc.text("Joyory Pvt Ltd");
            doc.text("GSTIN: 22AAAAA0000A1Z5");
            doc.text("support@joyory.com");
            doc.moveDown();

            // ============= CUSTOMER INFO =============
            doc.text("Bill To:");
            doc.text(user.name);
            doc.text(user.email);
            doc.text(order.shippingAddress?.addressLine || "");
            doc.moveDown();

            // ============= ORDER ITEMS =============
            doc.text("Order Details:", { underline: true });
            const tableTop = doc.y + 10;

            doc.font("Helvetica-Bold");
            doc.text("Item", 50, tableTop);
            doc.text("Qty", 250, tableTop);
            doc.text("Price", 300, tableTop);
            doc.text("Total", 400, tableTop);
            doc.moveDown();
            doc.font("Helvetica");

            let total = 0;
            order.products.forEach((p, i) => {
                const y = tableTop + 25 + i * 20;
                const lineTotal = p.quantity * p.price;
                total += lineTotal;

                doc.text(p.productId.name, 50, y);
                doc.text(p.quantity, 250, y);
                doc.text(`₹${p.price}`, 300, y);
                doc.text(`₹${lineTotal}`, 400, y);
            });

            doc.moveDown();
            doc.font("Helvetica-Bold").text(`Grand Total: ₹${total}`, { align: "right" });

            // Footer
            doc.moveDown(2);
            doc.fontSize(8).text("Thank you for shopping with Joyory!", { align: "center" });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
};
