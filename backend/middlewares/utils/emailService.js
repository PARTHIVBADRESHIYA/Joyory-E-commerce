// // // // import nodemailer from 'nodemailer';
// // // // import dotenv from 'dotenv';
// // // // dotenv.config();

// // // // const transporter = nodemailer.createTransport({
// // // //     host: process.env.SMTP_HOST,
// // // //     port: parseInt(process.env.SMTP_PORT),
// // // //     secure: true, // Use true for 465
// // // //     auth: {
// // // //         user: process.env.SMTP_USER,
// // // //         pass: process.env.SMTP_PASS,
// // // //     },
// // // // });

// // // // export const sendEmail = async (to, subject, html,attachments) => {
// // // //     try {
// // // //         const mailOptions = {
// // // //             from: `"Joyory" <${process.env.SMTP_FROM}>`,
// // // //             to,
// // // //             subject,
// // // //             html,
// // // //             attachments, // 👉 allow optional attachments

// // // //         };

// // // //         const result = await transporter.sendMail(mailOptions);
// // // //         return result;
// // // //     } catch (error) {
// // // //         console.error("❌ Email sending failed:", error.message);
// // // //         throw error;
// // // //     }
// // // // };





// // // import sgMail from "@sendgrid/mail";
// // // import dotenv from "dotenv";
// // // dotenv.config();

// // // // 🔑 Set API key
// // // sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// // // export const sendEmail = async (to, subject, html, attachments = []) => {
// // //     try {
// // //         const msg = {
// // //             to,
// // //             from: process.env.SENDGRID_FROM, // must match verified sender in SendGrid
// // //             subject,
// // //             html,
// // //         };

// // //         // Optional: handle attachments
// // //         if (attachments.length > 0) {
// // //             msg.attachments = attachments.map(att => ({
// // //                 content: att.content, // base64 string
// // //                 filename: att.filename,
// // //                 type: att.type,
// // //                 disposition: "attachment",
// // //             }));
// // //         }

// // //         const result = await sgMail.send(msg);
// // //         console.log("✅ Email sent via SendGrid to:", to);
// // //         return result;
// // //     } catch (error) {
// // //         console.error("❌ Email sending failed:", error.response?.body || error.message);
// // //         throw error;
// // //     }
// // // };

// // import nodemailer from 'nodemailer';
// // import dotenv from 'dotenv';
// // dotenv.config();

// // // 🔹 Create transporter for Zoho SMTP
// // const transporter = nodemailer.createTransport({
// //     host: process.env.SMTP_HOST,
// //     port: parseInt(process.env.SMTP_PORT),
// //     secure: true, // true for 465
// //     auth: {
// //         user: process.env.SMTP_USER,
// //         pass: process.env.SMTP_PASS,
// //     },
// // });

// // export const sendEmail = async (to, subject, html, attachments = []) => {
// //     try {
// //         const mailOptions = {
// //             from: `"Joyory" <${process.env.SMTP_FROM}>`,
// //             to,
// //             subject,
// //             html,
// //             attachments: attachments.length > 0
// //                 ? attachments.map(att => ({
// //                     filename: att.filename,
// //                     content: att.content,
// //                     contentType: att.type,
// //                     disposition: "attachment",
// //                 }))
// //                 : undefined
// //         };

// //         const result = await transporter.sendMail(mailOptions);
// //         console.log("✅ Email sent via Zoho to:", to);
// //         return result;
// //     } catch (error) {
// //         console.error("❌ Email sending failed:", error.message);
// //         throw error;
// //     }
// // };



// import nodemailer from "nodemailer";
// import dotenv from "dotenv";
// dotenv.config();

// // 🔹 Create transporter for ZeptoMail SMTP
// const transporter = nodemailer.createTransport({
//     host: process.env.SMTP_HOST,       // smtp.zeptomail.in
//     port: parseInt(process.env.SMTP_PORT), // 465 (SSL) or 587 (TLS)
//     secure: parseInt(process.env.SMTP_PORT) === 465, // true only for 465
//     auth: {
//         user: process.env.SMTP_USER, // "emailapikey"
//         pass: process.env.SMTP_PASS, // long token from ZeptoMail
//     },
// });

// export const sendEmail = async (to, subject, html, attachments = []) => {
//     try {
//         const mailOptions = {
//             from: `"Joyory" < ${process.env.SMTP_FROM}> `, // no-reply@joyory.com
//             to,
//             subject,
//             html,
//             attachments:
//                 attachments.length > 0
//                     ? attachments.map((att) => ({
//                         filename: att.filename,
//                         content: att.content,
//                         contentType: att.type,
//                         disposition: "attachment",
//                     }))
//                     : undefined,
//         };

//         const result = await transporter.sendMail(mailOptions);
//         console.log("✅ Email sent via ZeptoMail to:", to);
//         return result;
//     } catch (error) {
//         console.error("❌ Email sending failed:", error);
//         throw error;
//     }
// };










// sendEmail.js
import "../../config/env.js";

import fetch from "node-fetch";


/**
 * Send email via ZeptoMail REST API
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 * @param {Array} attachments - Optional [{ filename, content(base64), type }]
 */
export const sendEmail = async (to, subject, html, attachments = []) => {
  try {
    const url = "https://api.zeptomail.in/v1.1/email";

    const payload = {
      from: {
        address: process.env.SMTP_FROM,
        name: "Joyory Luxe Private Limited" // Add sender name for better UX
      }, // no-reply@joyory.com
      to: [{ email_address: { address: to } }],
      subject,
      htmlbody: html,
    };

    if (attachments.length > 0) {
      payload.attachments = attachments.map(att => ({
        name: att.filename || att.name,           // fallback
        content: att.content,
        mime_type: att.type || att.mime_type,     // fallback
      }));
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Zoho-enczapikey ${process.env.SMTP_PASS}`, // ZeptoMail API Key
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("❌ Email API failed:", data);
      throw new Error(data.message || "ZeptoMail API error");
    }
    return data;
  } catch (error) {
    console.error("❌ Email sending failed:", error);
    throw error;
  }
};


/**
 * Generate HTML welcome email template
 */
// const generateWelcomeEmailHTML = (user, wallet, referralInfo) => {
//     const appUrl = process.env.APP_URL || "https://joyory.com";
//     const referralLink = `${appUrl}/signup?ref=${user.referralCode}`;

//     return `
// <!DOCTYPE html>
// <html lang="en">
// <head>
//     <meta charset="UTF-8">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Welcome to Joyory!</title>
//     <style>
//         * {
//             margin: 0;
//             padding: 0;
//             box-sizing: border-box;
//         }

//         body {
//             font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
//             line-height: 1.6;
//             color: #333;
//             background-color: #f9f9f9;
//         }

//         .email-container {
//             max-width: 600px;
//             margin: 0 auto;
//             background: #ffffff;
//             border-radius: 12px;
//             overflow: hidden;
//             box-shadow: 0 4px 20px rgba(0,0,0,0.1);
//         }

//         .email-header {
//             background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//             color: white;
//             padding: 40px 30px;
//             text-align: center;
//         }

//         .logo {
//             font-size: 32px;
//             font-weight: bold;
//             margin-bottom: 15px;
//             letter-spacing: 1px;
//         }

//         .greeting {
//             font-size: 28px;
//             margin-bottom: 20px;
//             font-weight: 600;
//         }

//         .subtitle {
//             font-size: 18px;
//             opacity: 0.9;
//             margin-bottom: 30px;
//         }

//         .content-section {
//             padding: 40px 30px;
//         }

//         .card {
//             background: #f8f9fa;
//             border-radius: 10px;
//             padding: 25px;
//             margin-bottom: 25px;
//             border-left: 4px solid #667eea;
//         }

//         .card-title {
//             color: #2d3748;
//             font-size: 18px;
//             font-weight: 600;
//             margin-bottom: 15px;
//             display: flex;
//             align-items: center;
//             gap: 10px;
//         }

//         .card-title i {
//             color: #667eea;
//         }

//         .points-display {
//             display: flex;
//             justify-content: space-around;
//             text-align: center;
//             margin: 20px 0;
//         }

//         .point-item {
//             padding: 20px;
//             flex: 1;
//         }

//         .point-value {
//             font-size: 36px;
//             font-weight: bold;
//             color: #667eea;
//             margin: 10px 0;
//         }

//         .point-label {
//             color: #718096;
//             font-size: 14px;
//             text-transform: uppercase;
//             letter-spacing: 1px;
//         }

//         .referral-section {
//             background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
//             color: white;
//             border-radius: 10px;
//             padding: 30px;
//             margin: 30px 0;
//             text-align: center;
//         }

//         .referral-code {
//             background: white;
//             color: #2d3748;
//             padding: 15px 30px;
//             border-radius: 50px;
//             font-size: 24px;
//             font-weight: bold;
//             letter-spacing: 2px;
//             display: inline-block;
//             margin: 20px 0;
//             box-shadow: 0 4px 15px rgba(0,0,0,0.1);
//         }

//         .referral-link {
//             background: white;
//             color: #667eea;
//             padding: 12px 25px;
//             border-radius: 25px;
//             text-decoration: none;
//             display: inline-block;
//             margin: 10px 0;
//             font-weight: 600;
//             transition: all 0.3s ease;
//         }

//         .referral-link:hover {
//             transform: translateY(-2px);
//             box-shadow: 0 6px 20px rgba(0,0,0,0.15);
//         }

//         .cta-button {
//             display: inline-block;
//             background: #667eea;
//             color: white;
//             padding: 16px 40px;
//             border-radius: 30px;
//             text-decoration: none;
//             font-weight: 600;
//             font-size: 16px;
//             margin: 20px 0;
//             transition: all 0.3s ease;
//         }

//         .cta-button:hover {
//             background: #5a67d8;
//             transform: translateY(-2px);
//             box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
//         }

//         .steps {
//             margin: 30px 0;
//         }

//         .step {
//             display: flex;
//             align-items: flex-start;
//             margin-bottom: 20px;
//             padding: 15px;
//             background: #f8f9fa;
//             border-radius: 8px;
//         }

//         .step-number {
//             background: #667eea;
//             color: white;
//             width: 30px;
//             height: 30px;
//             border-radius: 50%;
//             display: flex;
//             align-items: center;
//             justify-content: center;
//             font-weight: bold;
//             margin-right: 15px;
//             flex-shrink: 0;
//         }

//         .step-content {
//             flex: 1;
//         }

//         .step-title {
//             font-weight: 600;
//             margin-bottom: 5px;
//             color: #2d3748;
//         }

//         .email-footer {
//             background: #2d3748;
//             color: #a0aec0;
//             padding: 30px;
//             text-align: center;
//             font-size: 14px;
//         }

//         .social-links {
//             margin: 20px 0;
//         }

//         .social-icon {
//             color: #a0aec0;
//             margin: 0 10px;
//             text-decoration: none;
//             font-size: 20px;
//         }

//         @media (max-width: 600px) {
//             .points-display {
//                 flex-direction: column;
//             }

//             .point-item {
//                 margin-bottom: 20px;
//             }

//             .email-header, .content-section {
//                 padding: 25px 20px;
//             }
//         }
//     </style>
// </head>
// <body>
//     <div class="email-container">
//         <!-- Header -->
//         <div class="email-header">
//             <div class="logo">🎉 JOYORY</div>
//             <h1 class="greeting">Welcome aboard, ${user.name}!</h1>
//             <p class="subtitle">Your account has been successfully verified and is ready to use!</p>
//         </div>

//         <!-- Main Content -->
//         <div class="content-section">
//             ${referralInfo.referrerName ? `
//             <!-- Referral Success -->
//             <div class="card">
//                 <div class="card-title">🎁 Referral Bonus Activated!</div>
//                 <p>Thanks for joining using ${referralInfo.referrerName}'s referral! Both of you have earned bonus points.</p>
//                 <div class="points-display">
//                     <div class="point-item">
//                         <div class="point-label">You Received</div>
//                         <div class="point-value">${referralInfo.refereeReward} pts</div>
//                     </div>
//                     <div class="point-item">
//                         <div class="point-label">Friend Received</div>
//                         <div class="point-value">${referralInfo.referrerReward} pts</div>
//                     </div>
//                 </div>
//             </div>
//             ` : ''}

//             <!-- Your Rewards -->
//             <div class="card">
//                 <div class="card-title">💰 Your Current Balance</div>
//                 <div class="points-display">
//                     <div class="point-item">
//                         <div class="point-label">Reward Points</div>
//                         <div class="point-value">${wallet.rewardPoints}</div>
//                         <p>Earned from referrals & activities</p>
//                     </div>
//                     <div class="point-item">
//                         <div class="point-label">Joyory Cash</div>
//                         <div class="point-value">${wallet.joyoryCash}</div>
//                         <p>Available for shopping</p>
//                     </div>
//                 </div>
//             </div>

//             <!-- Your Referral Code -->
//             <div class="referral-section">
//                 <h2 style="color: white; margin-bottom: 15px;">🎯 Your Unique Referral Code</h2>
//                 <p style="color: rgba(255,255,255,0.9); margin-bottom: 20px;">
//                     Share with friends and earn <strong>200 points</strong> for each successful referral!
//                 </p>
//                 <div class="referral-code">${user.referralCode}</div>
//                 <br>
//                 <a href="${referralLink}" class="referral-link" style="color: #667eea;">
//                     ${referralLink}
//                 </a>
//                 <p style="color: rgba(255,255,255,0.9); margin-top: 20px;">
//                     Copy the link above or share your code!
//                 </p>
//             </div>

//             <!-- How to Earn More -->
//             <div class="card">
//                 <div class="card-title">🚀 How to Earn More Points</div>
//                 <div class="steps">
//                     <div class="step">
//                         <div class="step-number">1</div>
//                         <div class="step-content">
//                             <div class="step-title">Share Your Referral Link</div>
//                             <p>Get 200 points for each friend who signs up using your link</p>
//                         </div>
//                     </div>
//                     <div class="step">
//                         <div class="step-number">2</div>
//                         <div class="step-content">
//                             <div class="step-title">Complete Your First Order</div>
//                             <p>Earn bonus points on your first purchase</p>
//                         </div>
//                     </div>
//                     <div class="step">
//                         <div class="step-number">3</div>
//                         <div class="step-content">
//                             <div class="step-title">Write Product Reviews</div>
//                             <p>Get 10 points for each verified review</p>
//                         </div>
//                     </div>
//                 </div>
//             </div>

//             <!-- Call to Action -->
//             <div style="text-align: center; margin: 40px 0;">
//                 <a href="${appUrl}/dashboard" class="cta-button">
//                     Start Shopping Now →
//                 </a>
//                 <p style="color: #718096; margin-top: 10px;">
//                     Your ${wallet.joyoryCash + wallet.rewardPoints} points are ready to use!
//                 </p>
//             </div>
//         </div>

//         <!-- Footer -->
//         <div class="email-footer">
//             <p style="margin-bottom: 20px;">
//                 Questions? We're here to help!<br>
//                 Email us at <a href="mailto:support@joyory.com" style="color: #a0aec0;">support@joyory.com</a>
//             </p>

//             <div class="social-links">
//                 <a href="#" class="social-icon">📱</a>
//                 <a href="#" class="social-icon">📘</a>
//                 <a href="#" class="social-icon">📸</a>
//                 <a href="#" class="social-icon">🐦</a>
//             </div>

//             <p style="font-size: 12px; color: #718096; margin-top: 20px;">
//                 © ${new Date().getFullYear()} Joyory. All rights reserved.<br>
//                 You're receiving this email because you signed up on Joyory.<br>
//                 <a href="${appUrl}/unsubscribe" style="color: #a0aec0;">Unsubscribe</a>
//             </p>
//         </div>
//     </div>
// </body>
// </html>
//     `;
// };
const generateWelcomeEmailHTML = (user, wallet, referralInfo) => {
  const appUrl = process.env.APP_URL || "https://joyory.com";
  const referralLink = `${appUrl}/signup?ref=${user.referralCode}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome to Joyory</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#333;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
  <tr>
    <td align="center">

      <!-- Container -->
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:#6b5cf6;color:#ffffff;padding:30px;text-align:center;">
           <h1 style="margin:0;font-size:28px;">Welcome to Joyory</h1>
<p style="margin:10px 0 0;font-size:16px;">Your account has been successfully verified</p>

              Hi ${user.name}, your account is now verified!
            </p>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding:30px;">

            <p style="font-size:16px;margin:0 0 20px;">
              We’re excited to have you on Joyory. You can now start shopping,
              earning rewards, and sharing Joyory with friends.
            </p>

            ${referralInfo.referrerName
      ? `
            <!-- Referral Bonus -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9ff;border-radius:8px;margin-bottom:20px;">
              <tr>
                <td style="padding:20px;">
                  <strong>🎁 Referral Bonus Applied!</strong>
                  <p style="margin:10px 0 0;">
                    You joined using <strong>${referralInfo.referrerName}</strong>'s referral.
                  </p>
                  <p style="margin:5px 0 0;">
                    You earned <strong>${referralInfo.refereeReward} points</strong>.
                  </p>
                </td>
              </tr>
            </table>
            `
      : ""
    }

           <!-- Wallet -->
<table width="100%" cellpadding="0" cellspacing="0"
       style="background:#f8f8f8;border-radius:8px;margin-bottom:25px;">
  <tr>
    <td style="padding:20px;text-align:center;">
      <p style="margin:0;font-size:14px;color:#777;">
        Your Rewards Balance
      </p>
      <h2 style="margin:10px 0;color:#6b5cf6;">
        ${wallet.rewardPoints} Points
      </h2>
    </td>
  </tr>
</table>


            <!-- Referral Code -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px dashed #ddd;border-radius:8px;margin-bottom:25px;">
              <tr>
                <td style="padding:20px;text-align:center;">
                  <p style="margin:0 0 10px;font-weight:bold;">
                    Your Referral Code
                  </p>
                  <div style="font-size:22px;font-weight:bold;letter-spacing:2px;">
                    ${user.referralCode}
                  </div>
                  <p style="margin:10px 0 0;font-size:14px;">
                    Share & earn <strong>200 points</strong> per referral
                  </p>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <div style="text-align:center;">
              <a href="${appUrl}" 
                 style="background:#6b5cf6;color:#ffffff;text-decoration:none;
                        padding:14px 30px;border-radius:30px;
                        font-size:16px;font-weight:bold;display:inline-block;">
                Start Shopping
              </a>
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#222;color:#aaa;text-align:center;padding:20px;font-size:12px;">
            <p style="margin:0;">
              Need help? Contact us at
              <a href="mailto:joyory2025@gmail.com" style="color:#aaa;">joyory2025@gmail.com</a>
            </p>
            <p style="margin:10px 0 0;">
              © ${new Date().getFullYear()} Joyory
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>
`;
};

/**
 * Send welcome email after verification
 */
export const sendWelcomeEmail = async (user, wallet, referralInfo = {}) => {
  try {
    const html = generateWelcomeEmailHTML(user, wallet, referralInfo);
    const subject = `🎉 Welcome to Joyory, ${user.name}! Your Account is Verified`;

    await sendEmail(user.email, subject, html);

    console.log(`✅ Welcome email sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error("❌ Failed to send welcome email:", error);
    throw error;
  }
};


/**
 * Send OTP email for verification
 */
export const sendVerificationEmail = async (user, otp) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        .container { max-width: 600px; margin: auto; font-family: Arial, sans-serif; }
        .header { background: #667eea; color: white; padding: 30px; text-align: center; }
        .otp-code { font-size: 48px; letter-spacing: 10px; color: #667eea; text-align: center; margin: 30px 0; font-weight: bold; }
        .note { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Verify Your Email</h1>
            <p>Complete your Joyory registration</p>
        </div>
        
        <div style="padding: 30px;">
            <p>Hi ${user.name},</p>
            <p>Thank you for signing up with Joyory! Use the OTP below to verify your email address:</p>
            
            <div class="otp-code">${otp}</div>
            
            <div class="note">
                <strong>⚠️ Important:</strong> This OTP is valid for 5 minutes only.
                Do not share this code with anyone.
            </div>
            
            <p>After verification, you'll receive:</p>
            <ul>
                <li>🎁 <strong>200 points</strong> welcome bonus</li>
                <li>🔗 Your unique referral code to earn more</li>
                <li>🛒 Access to exclusive member-only deals</li>
            </ul>
            
           <div style="text-align:center; margin:30px 0;">
  <a href="https://joyory.com/otp"
     style="display:inline-block;
            background:#667eea;
            color:#ffffff;
            padding:12px 30px;
            text-decoration:none;
            border-radius:5px;
            font-weight:bold;">
    Verify Email
  </a>

  <div style="font-size:12px;color:#777;margin-top:15px;">
    If the button doesn’t work, open this link:<br>
    <a href="https://joyory.com/otp" style="color:#667eea;">
      https://joyory.com/otp
    </a>
  </div>
</div>


            </p>
            
            <p>If you didn't request this, please ignore this email.</p>
            
            <p>Best regards,<br>The Joyory Team</p>
        </div>
    </div>
</body>
</html>
    `;

  await sendEmail(user.email, "Your Joyory Verification Code", html);
};


export const sendAbandonedCartEmail = async (user, stage) => {
  try {
    const appUrl = process.env.APP_URL || "https://joyory.com/";
    const cartUrl = `${appUrl}cartpage`;

    const subjectMap = {
      1: "🛒 You left something in your cart",
      2: "⏰ Your cart is still waiting",
      3: "🔥 Last chance! Complete your purchase"
    };

    const headlineMap = {
      1: "You left something behind 👀",
      2: "Still thinking it over?",
      3: "Your cart is about to expire!"
    };

    const subTextMap = {
      1: "Complete your purchase before items sell out.",
      2: "Popular items don't stay long. Grab them now.",
      3: "This is your final reminder before we clear your cart."
    };

    const subject = subjectMap[stage];
    const headline = headlineMap[stage];
    const subText = subTextMap[stage];

    // Calculate total items
    const totalItems = user.cart.reduce((sum, item) => sum + item.quantity, 0);

    // Build cart items HTML with images
    const cartItemsHtml = user.cart.map(item => {
      const name = item.selectedVariant?.shadeName || "Selected Item";
      const imageUrl = item.selectedVariant?.images ||
        "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=300&h=300&fit=crop";

      return `
        <tr class="cart-item">
          <td width="80" style="padding: 15px 0 15px 15px; vertical-align: top;" class="mobile-image">
            <img src="${imageUrl}" 
                 alt="${name}" 
                 width="80" 
                 height="80" 
                 style="border-radius: 10px; object-fit: cover; border: 1px solid #f0f0f0; display: block;" />
          </td>
          <td style="padding: 15px 15px 15px 20px; vertical-align: top;" class="mobile-details">
            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #333; font-family: 'Poppins', sans-serif;">
              ${name}
            </h3>
            <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">
              Quantity: ${item.quantity}
            </p>
            ${item.selectedVariant?.hex ? `
            <div style="display: inline-block; padding: 4px 12px; background-color: ${item.selectedVariant.hex}; 
                        border-radius: 20px; font-size: 12px; color: ${getContrastColor(item.selectedVariant.hex)};">
              ${item.selectedVariant.shadeName}
            </div>
            ` : ''}
          </td>
        </tr>
        <tr><td colspan="2" style="padding: 0 15px;"><hr style="border: none; border-top: 1px solid #eee; margin: 0;"></td></tr>
      `;
    }).join("");

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Complete Your Order</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    /* Reset Styles */
    body {
      margin: 0;
      padding: 0;
      min-width: 100%;
      width: 100% !important;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    
    /* Mobile Styles */
    @media only screen and (max-width: 640px) {
      /* Main Container */
      table.email-container {
        width: 100% !important;
      }
      
      /* Header */
      .header-section h2 {
        font-size: 22px !important;
        line-height: 1.3 !important;
      }
      
      .header-section p {
        font-size: 14px !important;
        line-height: 1.4 !important;
      }
      
      /* Body Content */
      .body-content {
        padding: 25px 15px !important;
      }
      
      /* Cart Items */
      .cart-item td {
        display: block !important;
        width: 100% !important;
        padding: 10px 15px !important;
        text-align: center !important;
      }
      
      .mobile-image {
        padding-bottom: 5px !important;
      }
      
      .mobile-details {
        padding-top: 0 !important;
      }
      
      .mobile-image img {
        margin: 0 auto !important;
      }
      
      /* CTA Button */
      .cta-button {
        padding: 14px 30px !important;
        font-size: 15px !important;
        width: 90% !important;
        text-align: center !important;
      }
      
      /* Benefits */
      .benefit-item {
        display: block !important;
        width: 100% !important;
        padding: 15px 0 !important;
        text-align: center !important;
      }
      
      .benefit-item td {
        display: block !important;
        width: 100% !important;
        padding: 10px 0 !important;
      }
      
      /* Footer */
      .footer-section {
        padding: 20px 15px !important;
      }
      
      .footer-links {
        display: block !important;
        text-align: center !important;
        padding: 5px 0 !important;
      }
    }
    
    /* Tablet Styles */
    @media only screen and (max-width: 480px) {
      .header-section {
        padding: 25px 15px !important;
      }
      
      .body-content {
        padding: 20px 10px !important;
      }
      
      .cart-summary h3 {
        font-size: 16px !important;
      }
      
      .cart-summary div {
        font-size: 16px !important;
        padding: 10px 20px !important;
      }
      
      /* Stack benefits on very small screens */
      .benefits-container table tr {
        display: block !important;
        width: 100% !important;
      }
    }
    
    /* Dark Mode Support */
    @media (prefers-color-scheme: dark) {
      .email-body {
        background-color: #1a1a1a !important;
      }
      
      .email-card {
        background-color: #2d2d2d !important;
      }
      
      .email-card h1, 
      .email-card h2, 
      .email-card h3,
      .email-card p,
      .email-card td {
        color: #ffffff !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8f8f8; font-family: 'Inter', Arial, sans-serif; -webkit-font-smoothing: antialiased;">

<!-- Main Container -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8f8f8" style="padding: 20px 0; width: 100%;">
  <tr>
    <td align="center">
      
      <!-- Email Card -->
      <table width="600" cellpadding="0" cellspacing="0" border="0" 
             style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); max-width: 600px; width: 100%;" 
             class="email-container">
        
        <!-- Header -->
        <tr>
          <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;" class="header-section">
            <div style="max-width: 120px; margin: 0 auto 20px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; font-family: 'Poppins', sans-serif;">
                JOYORY
              </h1>
            </div>
            <h2 style="margin: 0 0 15px 0; color: #ffffff; font-size: 28px; font-weight: 600; font-family: 'Poppins', sans-serif; line-height: 1.2;">
              ${headline}
            </h2>
            <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 16px; line-height: 1.5; max-width: 500px; margin: 0 auto;">
              Hi ${user.name}, we noticed you left something special behind!
            </p>
          </td>
        </tr>

        <!-- Body Content -->
        <tr>
          <td style="padding: 40px 30px;" class="body-content">
            
            <!-- Main Message -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 25px;">
              <tr>
                <td style="padding-bottom: 20px;">
                  <p style="margin: 0 0 15px 0; font-size: 16px; color: #555; line-height: 1.6;">
                    ${subText}
                  </p>
                  
                  ${stage === 3 ? `
                  <div style="background: linear-gradient(to right, #ffeaa7, #fab1a0); 
                              padding: 12px 15px; border-radius: 12px; margin: 20px 0; text-align: center;">
                    <p style="margin: 0; color: #d63031; font-weight: 600; font-size: 14px;">
                      ⚠️ Final reminder — Your cart will expire in 24 hours!
                    </p>
                  </div>
                  ` : ''}
                </td>
              </tr>

              <!-- Cart Summary -->
              <tr>
                <td style="padding-bottom: 30px;">
                  <div style="background: #f9f9ff; border-radius: 12px; padding: 20px; text-align: center;" class="cart-summary">
                    <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #333; font-weight: 600; font-family: 'Poppins', sans-serif;">
                      Your Cart Summary
                    </h3>
                    <div style="display: inline-block; background: linear-gradient(135deg, #6b5cf6 0%, #8a7dff 100%); 
                                 padding: 12px 25px; border-radius: 50px; color: white; font-weight: 600; font-size: 17px;">
                      ${totalItems} ${totalItems === 1 ? 'Item' : 'Items'} in Cart
                    </div>
                  </div>
                </td>
              </tr>

              <!-- Cart Items -->
              <tr>
                <td style="padding-bottom: 30px;">
                  <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #333; font-weight: 600; font-family: 'Poppins', sans-serif;">
                    Items in your cart:
                  </h3>
                  
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: #fafafa; border-radius: 12px; overflow: hidden;">
                    ${cartItemsHtml}
                  </table>
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td style="padding-bottom: 30px; text-align: center;">
                  <a href="${cartUrl}" 
                     class="cta-button"
                     style="background: linear-gradient(135deg, #6b5cf6 0%, #8a7dff 100%); 
                            color: #ffffff; text-decoration: none; padding: 16px 40px; 
                            border-radius: 30px; font-size: 16px; font-weight: 600; 
                            display: inline-block; box-shadow: 0 6px 20px rgba(107, 92, 246, 0.3);
                            transition: all 0.3s ease; max-width: 300px;">
                    Complete Your Order Now
                  </a>
                  
                  <p style="margin: 20px 0 0 0; color: #888; font-size: 14px;">
                    <a href="${appUrl}ShopProduct" 
                       style="color: #6b5cf6; text-decoration: none; font-weight: 500;">
                      Continue Shopping →
                    </a>
                  </p>
                </td>
              </tr>

              <!-- Benefits Section -->
              <tr>
                <td>
                  <div style="background: linear-gradient(135deg, #f8f9ff 0%, #f0f2ff 100%); 
                              border-radius: 12px; padding: 25px; margin-top: 20px;">
                    <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #333; text-align: center; font-weight: 600;">
                      Why Shop With Us
                    </h3>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;" class="benefits-container">
                      <tr>
                        <td width="25%" align="center" style="padding: 10px; vertical-align: top;" class="benefit-item">
                          <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #6b5cf6 0%, #8a7dff 100%); 
                                      border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                            <span style="color: white; font-size: 22px;">🚚</span>
                          </div>
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #333;">Free Shipping</p>
                          <p style="margin: 5px 0 0 0; font-size: 13px; color: #666;">Over ₹499</p>
                        </td>
                        
                        <td width="25%" align="center" style="padding: 10px; vertical-align: top;" class="benefit-item">
                          <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #6b5cf6 0%, #8a7dff 100%); 
                                      border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                            <span style="color: white; font-size: 22px;">↩️</span>
                          </div>
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #333;">Easy Returns</p>
                          <p style="margin: 5px 0 0 0; font-size: 13px; color: #666;">7 Days Policy</p>
                        </td>
                        
                        <td width="25%" align="center" style="padding: 10px; vertical-align: top;" class="benefit-item">
                          <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #6b5cf6 0%, #8a7dff 100%); 
                                      border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                            <span style="color: white; font-size: 22px;">🔒</span>
                          </div>
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #333;">Secure Payment</p>
                          <p style="margin: 5px 0 0 0; font-size: 13px; color: #666;">100% Safe</p>
                        </td>
                        
                        <td width="25%" align="center" style="padding: 10px; vertical-align: top;" class="benefit-item">
                          <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #6b5cf6 0%, #8a7dff 100%); 
                                      border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                            <span style="color: white; font-size: 22px;">⭐</span>
                          </div>
                          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #333;">Premium Quality</p>
                          <p style="margin: 5px 0 0 0; font-size: 13px; color: #666;">Authentic Products</p>
                        </td>
                      </tr>
                    </table>
                  </div>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background: #1a1a2e; color: #aaa; padding: 30px; text-align: center;" class="footer-section">
            <p style="margin: 0 0 15px 0; font-size: 14px; color: #fff;">
              Need help with your order?
            </p>
            <a href="mailto:joyory2025@gmail.com" 
               style="color: #8a7dff; text-decoration: none; font-weight: 500;">
              joyory2025@gmail.com
            </a>
            
            <p style="margin: 20px 0 0 0; font-size: 12px; color: #888;">
              © ${new Date().getFullYear()} Joyory. All rights reserved.
            </p>
            
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #888;">
              <span class="footer-links">
                <a href="${appUrl}/unsubscribe" style="color: #888; text-decoration: underline; padding: 0 5px;">
                  Unsubscribe
                </a> 
              </span>
              <span class="footer-links">
                <a href="${appUrl}/privacy" style="color: #888; text-decoration: underline; padding: 0 5px;">
                  Privacy Policy
                </a>
              </span>
            </p>
            
            <!-- Social Media -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
              <tr>
                <td align="center">
                  <a href="${appUrl}" style="text-decoration: none; margin: 0 8px;">
                    <img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" 
                         alt="Instagram" width="24" height="24" 
                         style="opacity: 0.7; transition: opacity 0.3s;">
                  </a>
                  <a href="${appUrl}" style="text-decoration: none; margin: 0 8px;">
                    <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" 
                         alt="Facebook" width="24" height="24" 
                         style="opacity: 0.7; transition: opacity 0.3s;">
                  </a>
                  <a href="${appUrl}" style="text-decoration: none; margin: 0 8px;">
                    <img src="https://cdn-icons-png.flaticon.com/512/733/733579.png" 
                         alt="Twitter" width="24" height="24" 
                         style="opacity: 0.7; transition: opacity 0.3s;">
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>

      <!-- Mobile Footer Note -->
      <table width="600" cellpadding="0" cellspacing="0" style="margin-top: 20px; max-width: 600px; width: 100%;">
        <tr>
          <td align="center">
            <p style="margin: 0; font-size: 12px; color: #999;">
              Can't see images? <a href="${cartUrl}" style="color: #6b5cf6;">View in browser</a>
            </p>
            <p style="margin: 5px 0 0 0; font-size: 11px; color: #999;">
              This email is optimized for all devices.
            </p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>

</body>
</html>
`;

    // Helper function to determine contrast color for shade badges
    function getContrastColor(hexcolor) {
      // Remove the hash if present
      hexcolor = hexcolor.replace('#', '');
      
      // Parse the hex color
      const r = parseInt(hexcolor.substr(0, 2), 16);
      const g = parseInt(hexcolor.substr(2, 2), 16);
      const b = parseInt(hexcolor.substr(4, 2), 16);
      
      // Calculate brightness
      const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
      
      // Return black for bright colors, white for dark colors
      return brightness > 128 ? '#000000' : '#ffffff';
    }

    await sendEmail(user.email, subject, html);

    console.log(`✅ Abandoned cart email (stage ${stage}) sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error("❌ Failed to send abandoned cart email:", error);
    throw error;
  }
};


// export const sendAbandonedCartEmail = async (user, stage) => {
//   try {
//     const appUrl = process.env.APP_URL || "https://joyory.com/";
//     const cartUrl = `${appUrl}cartpage`;

//     const subjectMap = {
//       1: "🛒 You left something in your cart",
//       2: "⏰ Your cart is still waiting",
//       3: "🔥 Last chance! Complete your purchase"
//     };

//     const headlineMap = {
//       1: "You left something behind 👀",
//       2: "Still thinking it over?",
//       3: "Your cart is about to expire!"
//     };

//     const subTextMap = {
//       1: "Complete your purchase before items sell out.",
//       2: "Popular items don't stay long. Grab them now.",
//       3: "This is your final reminder before we clear your cart."
//     };

//     const subject = subjectMap[stage];
//     const headline = headlineMap[stage];
//     const subText = subTextMap[stage];

//     // Calculate total items and approximate total
//     const totalItems = user.cart.reduce((sum, item) => sum + item.quantity, 0);
//     const approximateTotal = user.cart.length > 0 ? "₹1,299+" : "₹0"; // You can calculate actual price if available

//     // Build cart items HTML with images
//     const cartItemsHtml = user.cart.map(item => {
//       const name = item.selectedVariant?.shadeName || "Selected Item";
//       const imageUrl = item.selectedVariant?.images ||
//         "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=300&h=300&fit=crop";

//       return `
//         <tr>
//           <td width="80" style="padding: 20px 0; vertical-align: top;">
//             <img src="${imageUrl}" 
//                  alt="${imageUrl}" 
//                  width="80" 
//                  height="80" 
//                  style="border-radius: 8px; object-fit: cover; border: 1px solid #f0f0f0;" />
//           </td>
//           <td style="padding: 20px 20px 20px 0; vertical-align: top;">
//             <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #333;">
//               ${name}
//             </h3>
//             <p style="margin: 0; font-size: 14px; color: #666;">
//               Quantity: ${item.quantity}
//             </p>
//             ${item.selectedVariant?.hex ? `
//             <div style="display: inline-block; margin-top: 8px; padding: 4px 12px; 
//                         background-color: ${item.selectedVariant.hex}; 
//                         border-radius: 20px; font-size: 12px; color: #fff;">
//               ${item.selectedVariant.shadeName}
//             </div>
//             ` : ''}
//           </td>
//         </tr>
//       `;
//     }).join("");

//     const html = `
// <!DOCTYPE html>
// <html>
// <head>
//   <meta charset="UTF-8" />
//   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//   <title>Complete Your Order</title>
//   <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
//   <style>
//     @media only screen and (max-width: 600px) {
//       .container { width: 100% !important; }
//       .header-img { height: 200px !important; }
//       .cta-button { width: 100% !important; }
//       .cart-table { width: 100% !important; }
//     }
//   </style>
// </head>
// <body style="margin: 0; padding: 0; background-color: #f8f8f8; font-family: 'Inter', Arial, sans-serif;">

// <!-- Main Container -->
// <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f8f8f8" style="padding: 40px 0;">
//   <tr>
//     <td align="center">
      
//       <!-- Email Card -->
//       <table width="600" cellpadding="0" cellspacing="0" border="0" 
//              style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
        
//         <!-- Header with Decorative Image -->
//         <tr>
//           <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
//             <div style="max-width: 120px; margin: 0 auto 20px;">
//               <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; font-family: 'Poppins', sans-serif;">
//                 JOYORY
//               </h1>
//             </div>
//             <h2 style="margin: 0 0 15px 0; color: #ffffff; font-size: 28px; font-weight: 600; font-family: 'Poppins', sans-serif;">
//               ${headline}
//             </h2>
//             <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 16px; line-height: 1.5;">
//               Hi ${user.name}, we noticed you left something special behind!
//             </p>
//           </td>
//         </tr>

//         <!-- Body Content -->
//         <tr>
//           <td style="padding: 40px 30px;">
            
//             <!-- Main Message -->
//             <table width="100%" cellpadding="0" cellspacing="0">
//               <tr>
//                 <td style="padding-bottom: 25px;">
//                   <p style="margin: 0 0 15px 0; font-size: 16px; color: #555; line-height: 1.6;">
//                     ${subText}
//                   </p>
                  
//                   ${stage === 3 ? `
//                   <div style="background: linear-gradient(to right, #ffeaa7, #fab1a0); 
//                               padding: 15px; border-radius: 12px; margin: 20px 0; text-align: center;">
//                     <p style="margin: 0; color: #d63031; font-weight: 600; font-size: 15px;">
//                       ⚠️ Final reminder — Your cart will expire in 24 hours!
//                     </p>
//                   </div>
//                   ` : ''}
//                 </td>
//               </tr>

//               <!-- Cart Summary -->
//               <tr>
//                 <td style="padding-bottom: 30px;">
//                   <div style="background: #f9f9ff; border-radius: 12px; padding: 20px;">
//                     <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #333; font-weight: 600;">
//                       Your Cart Summary
//                     </h3>
                    
//                     <table width="100%" cellpadding="0" cellspacing="0" class="cart-table">
//                       <tr>
//                         <td width="50%" style="padding-bottom: 10px;">
//                           <span style="color: #666; font-size: 14px;">Total Items:</span>
//                           <span style="color: #333; font-weight: 600; font-size: 16px; margin-left: 10px;">
//                             ${totalItems}
//                           </span>
//                         </td>
//                         <td width="50%" style="padding-bottom: 10px; text-align: right;">
//                           <span style="color: #666; font-size: 14px;">Approx. Total:</span>
//                           <span style="color: #6b5cf6; font-weight: 700; font-size: 20px; margin-left: 10px;">
//                             ${approximateTotal}
//                           </span>
//                         </td>
//                       </tr>
//                     </table>
//                   </div>
//                 </td>
//               </tr>

//               <!-- Cart Items -->
//               <tr>
//                 <td style="padding-bottom: 30px;">
//                   <h3 style="margin: 0 0 20px 0; font-size: 18px; color: #333; font-weight: 600;">
//                     Items in your cart:
//                   </h3>
                  
//                   <table width="100%" cellpadding="0" cellspacing="0" style="background: #fafafa; border-radius: 12px; padding: 20px;">
//                     ${cartItemsHtml}
//                   </table>
//                 </td>
//               </tr>

//               <!-- CTA Button -->
//               <tr>
//                 <td style="padding-bottom: 30px; text-align: center;">
//                   <a href="${cartUrl}" 
//                      class="cta-button"
//                      style="background: linear-gradient(135deg, #6b5cf6 0%, #8a7dff 100%); 
//                             color: #ffffff; text-decoration: none; padding: 16px 40px; 
//                             border-radius: 30px; font-size: 16px; font-weight: 600; 
//                             display: inline-block; box-shadow: 0 6px 20px rgba(107, 92, 246, 0.3);
//                             transition: all 0.3s ease;">
//                     Complete Your Order Now
//                   </a>
                  
//                   <p style="margin: 15px 0 0 0; color: #888; font-size: 14px;">
//                     <a href="${appUrl}ShopProduct" 
//                        style="color: #6b5cf6; text-decoration: underline;">
//                       Continue Shopping
//                     </a>
//                   </p>
//                 </td>
//               </tr>

//               <!-- Benefits -->
//               <tr>
//                 <td>
//                   <table width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid #eee; padding-top: 25px;">
//                     <tr>
//                       <td width="33%" align="center" style="padding: 10px;">
//                         <div style="color: #6b5cf6; font-size: 24px;">🚚</div>
//                         <p style="margin: 8px 0 0 0; font-size: 13px; color: #666;">
//                           Free Shipping<br><strong>Over ₹499</strong>
//                         </p>
//                       </td>
//                       <td width="33%" align="center" style="padding: 10px;">
//                         <div style="color: #6b5cf6; font-size: 24px;">↩️</div>
//                         <p style="margin: 8px 0 0 0; font-size: 13px; color: #666;">
//                           Easy Returns<br><strong>7 Days</strong>
//                         </p>
//                       </td>
//                       <td width="33%" align="center" style="padding: 10px;">
//                         <div style="color: #6b5cf6; font-size: 24px;">🔒</div>
//                         <p style="margin: 8px 0 0 0; font-size: 13px; color: #666;">
//                           Secure Payment<br><strong>100% Safe</strong>
//                         </p>
//                       </td>
//                     </tr>
//                   </table>
//                 </td>
//               </tr>
//             </table>

//           </td>
//         </tr>

//         <!-- Footer -->
//         <tr>
//           <td style="background: #1a1a2e; color: #aaa; padding: 30px; text-align: center;">
//             <p style="margin: 0 0 15px 0; font-size: 14px; color: #fff;">
//               Need help with your order?
//             </p>
//             <a href="mailto:joyory2025@gmail.com" 
//                style="color: #8a7dff; text-decoration: none; font-weight: 500;">
//               joyory2025@gmail.com
//             </a>
            
//             <p style="margin: 20px 0 0 0; font-size: 12px; color: #888;">
//               © ${new Date().getFullYear()} Joyory. All rights reserved.
//             </p>
            
//             <p style="margin: 10px 0 0 0; font-size: 12px; color: #888;">
//               <a href="${appUrl}/unsubscribe" style="color: #888; text-decoration: underline;">
//                 Unsubscribe
//               </a> | 
//               <a href="${appUrl}/privacy" style="color: #888; text-decoration: underline;">
//                 Privacy Policy
//               </a>
//             </p>
            
//             <!-- Social Media -->
//             <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
//               <tr>
//                 <td align="center">
//                   <a href="${appUrl}" style="text-decoration: none; margin: 0 8px;">
//                     <img src="https://cdn-icons-png.flaticon.com/512/2111/2111463.png" 
//                          alt="Instagram" width="24" height="24" 
//                          style="opacity: 0.7; transition: opacity 0.3s;">
//                   </a>
//                   <a href="${appUrl}" style="text-decoration: none; margin: 0 8px;">
//                     <img src="https://cdn-icons-png.flaticon.com/512/733/733547.png" 
//                          alt="Facebook" width="24" height="24" 
//                          style="opacity: 0.7; transition: opacity 0.3s;">
//                   </a>
//                   <a href="${appUrl}" style="text-decoration: none; margin: 0 8px;">
//                     <img src="https://cdn-icons-png.flaticon.com/512/733/733579.png" 
//                          alt="Twitter" width="24" height="24" 
//                          style="opacity: 0.7; transition: opacity 0.3s;">
//                   </a>
//                 </td>
//               </tr>
//             </table>
//           </td>
//         </tr>

//       </table>

//       <!-- Mobile Footer Note -->
//       <table width="600" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
//         <tr>
//           <td align="center">
//             <p style="margin: 0; font-size: 12px; color: #999;">
//               Can't see images? <a href="${cartUrl}" style="color: #6b5cf6;">View in browser</a>
//             </p>
//           </td>
//         </tr>
//       </table>

//     </td>
//   </tr>
// </table>

// </body>
// </html>
// `;

//     await sendEmail(user.email, subject, html);

//     console.log(`✅ Abandoned cart email (stage ${stage}) sent to ${user.email}`);
//     return true;
//   } catch (error) {
//     console.error("❌ Failed to send abandoned cart email:", error);
//     throw error;
//   }
// };