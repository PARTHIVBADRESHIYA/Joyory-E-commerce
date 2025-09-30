// // // import nodemailer from 'nodemailer';
// // // import dotenv from 'dotenv';
// // // dotenv.config();

// // // const transporter = nodemailer.createTransport({
// // //     host: process.env.SMTP_HOST,
// // //     port: parseInt(process.env.SMTP_PORT),
// // //     secure: true, // Use true for 465
// // //     auth: {
// // //         user: process.env.SMTP_USER,
// // //         pass: process.env.SMTP_PASS,
// // //     },
// // // });

// // // export const sendEmail = async (to, subject, html,attachments) => {
// // //     try {
// // //         const mailOptions = {
// // //             from: `"Joyory" <${process.env.SMTP_FROM}>`,
// // //             to,
// // //             subject,
// // //             html,
// // //             attachments, // 👉 allow optional attachments

// // //         };

// // //         const result = await transporter.sendMail(mailOptions);
// // //         return result;
// // //     } catch (error) {
// // //         console.error("❌ Email sending failed:", error.message);
// // //         throw error;
// // //     }
// // // };





// // import sgMail from "@sendgrid/mail";
// // import dotenv from "dotenv";
// // dotenv.config();

// // // 🔑 Set API key
// // sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// // export const sendEmail = async (to, subject, html, attachments = []) => {
// //     try {
// //         const msg = {
// //             to,
// //             from: process.env.SENDGRID_FROM, // must match verified sender in SendGrid
// //             subject,
// //             html,
// //         };

// //         // Optional: handle attachments
// //         if (attachments.length > 0) {
// //             msg.attachments = attachments.map(att => ({
// //                 content: att.content, // base64 string
// //                 filename: att.filename,
// //                 type: att.type,
// //                 disposition: "attachment",
// //             }));
// //         }

// //         const result = await sgMail.send(msg);
// //         console.log("✅ Email sent via SendGrid to:", to);
// //         return result;
// //     } catch (error) {
// //         console.error("❌ Email sending failed:", error.response?.body || error.message);
// //         throw error;
// //     }
// // };

// import nodemailer from 'nodemailer';
// import dotenv from 'dotenv';
// dotenv.config();

// // 🔹 Create transporter for Zoho SMTP
// const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,
//     port: parseInt(process.env.SMTP_PORT),
//     secure: true, // true for 465
//     auth: {
//         user: process.env.SMTP_USER,
//         pass: process.env.SMTP_PASS,
//     },
// });

// export const sendEmail = async (to, subject, html, attachments = []) => {
//     try {
//         const mailOptions = {
//             from: `"Joyory" <${process.env.SMTP_FROM}>`,
//             to,
//             subject,
//             html,
//             attachments: attachments.length > 0
//                 ? attachments.map(att => ({
//                     filename: att.filename,
//                     content: att.content,
//                     contentType: att.type,
//                     disposition: "attachment",
//                 }))
//                 : undefined
//         };

//         const result = await transporter.sendMail(mailOptions);
//         console.log("✅ Email sent via Zoho to:", to);
//         return result;
//     } catch (error) {
//         console.error("❌ Email sending failed:", error.message);
//         throw error;
//     }
// };



import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

// 🔹 Create transporter for ZeptoMail SMTP
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,       // smtp.zeptomail.in
    port: parseInt(process.env.SMTP_PORT), // 465 (SSL) or 587 (TLS)
    secure: parseInt(process.env.SMTP_PORT) === 465, // true only for 465
    auth: {
        user: process.env.SMTP_USER, // "emailapikey"
        pass: process.env.SMTP_PASS, // long token from ZeptoMail
    },
});

export const sendEmail = async (to, subject, html, attachments = []) => {
    try {
        const mailOptions = {
            from: `"Joyory" < ${process.env.SMTP_FROM}> `, // no-reply@joyory.com
            to,
            subject,
            html,
            attachments:
                attachments.length > 0
                    ? attachments.map((att) => ({
                        filename: att.filename,
                        content: att.content,
                        contentType: att.type,
                        disposition: "attachment",
                    }))
                    : undefined,
        };

        const result = await transporter.sendMail(mailOptions);
        console.log("✅ Email sent via ZeptoMail to:", to);
        return result;
    } catch (error) {
        console.error("❌ Email sending failed:", error);
        throw error;
    }
};

