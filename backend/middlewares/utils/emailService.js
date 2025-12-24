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
                <strong>⚠️ Important:</strong> This OTP is valid for 10 minutes only.
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
