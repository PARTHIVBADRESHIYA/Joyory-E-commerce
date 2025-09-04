import PDFDocument from "pdfkit";
import path from "path";

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
