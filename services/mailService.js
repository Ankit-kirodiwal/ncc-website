const nodemailer = require("nodemailer");

function getMailConfigError() {
  if (!process.env.MAIL_HOST || !process.env.MAIL_PORT || !process.env.MAIL_USER || !(process.env.MAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS)) {
    return "Mail service is not configured. Please set MAIL_HOST, MAIL_PORT, MAIL_USER, and MAIL_PASS in .env.";
  }

  return null;
}

function createTransporter(overrideConfig = {}) {
  const configError = getMailConfigError();

  if (configError) {
    const error = new Error(configError);
    error.code = "MAIL_NOT_CONFIGURED";
    throw error;
  }

  const mailHost = process.env.MAIL_HOST || "";
  const isGmail = mailHost.includes("gmail") || process.env.MAIL_SERVICE === "gmail";

  let transportOptions = {
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    ...overrideConfig
  };

  if (!overrideConfig.host && !overrideConfig.service) {
    if (isGmail) {
      // For Gmail on cloud environments like Render, SSL port 465 or service:'gmail' avoids port 587 blocking
      if (Number(process.env.MAIL_PORT) === 465 || String(process.env.MAIL_SECURE).toLowerCase() === "true") {
        transportOptions.host = "smtp.gmail.com";
        transportOptions.port = 465;
        transportOptions.secure = true;
      } else {
        transportOptions.service = "gmail";
      }
    } else {
      transportOptions.host = process.env.MAIL_HOST;
      transportOptions.port = Number(process.env.MAIL_PORT) || 587;
      transportOptions.secure = String(process.env.MAIL_SECURE || "").toLowerCase() === "true" || Number(process.env.MAIL_PORT) === 465;
    }
  }

  return nodemailer.createTransport(transportOptions);
}

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendMailWithTransporter(transporter, mailOptions) {
  try {
    await transporter.verify();
  } catch (verifyErr) {
    console.error('SMTP verification failed:', verifyErr.message || verifyErr);
    throw verifyErr;
  }
  return await transporter.sendMail(mailOptions);
}

async function sendPasswordResetOtp({ toEmail, studentName, otp }) {
  const fromAddress = process.env.MAIL_FROM || process.env.MAIL_USER;
  const safeName = escapeHtml(studentName || "Cadet");
  const safeOtp = escapeHtml(String(otp || ""));

  const mailOptions = {
    from: fromAddress,
    to: toEmail,
    subject: "NCC Portal Password Reset OTP",
    text: [
      `Hello ${studentName || "Cadet"},`,
      "",
      `Your OTP for NCC portal password reset is: ${otp}`,
      "This OTP is valid for 10 minutes.",
      "If you did not request this reset, please report to admin."
    ].join("\n"),
    html: `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#15314f;line-height:1.6">
      <h2 style="margin-bottom:8px">NCC Portal Password Reset</h2>
      <p>Hello ${safeName},</p>
      <p>Your OTP for password reset is:</p>
      <div style="display:inline-block;padding:12px 18px;background:#edf4ff;border-radius:12px;font-size:28px;font-weight:800;letter-spacing:0.2em;color:#0f62d6">${safeOtp}</div>
      <p style="margin-top:16px">This OTP is valid for 10 minutes.</p>
      <p>If you did not request this reset, you can safely ignore this email.</p>
    </div>
  `
  };

  try {
    const primaryTransporter = createTransporter();
    await sendMailWithTransporter(primaryTransporter, mailOptions);
  } catch (primaryErr) {
    console.warn("Primary mail transport failed, attempting fallback transport...", primaryErr.message || primaryErr);

    // Fallback: If primary transport failed and target host is Gmail, try explicit SSL port 465 or service: 'gmail'
    const mailHost = process.env.MAIL_HOST || "";
    if (mailHost.includes("gmail") || process.env.MAIL_SERVICE === "gmail") {
      try {
        const fallbackTransporter = createTransporter({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          service: undefined
        });
        await sendMailWithTransporter(fallbackTransporter, mailOptions);
        return;
      } catch (fallbackErr) {
        console.error("Fallback mail transport also failed:", fallbackErr.message || fallbackErr);
      }
    }

    if (primaryErr && primaryErr.code === "EAUTH") {
      const authError = new Error("Gmail rejected the SMTP login. Use a Google App Password for MAIL_PASS (or MAIL_APP_PASSWORD/GMAIL_APP_PASSWORD) and keep 2-Step Verification enabled on the Gmail account.");
      authError.code = primaryErr.code;
      throw authError;
    }

    throw primaryErr;
  }
}

module.exports = {
  getMailConfigError,
  sendPasswordResetOtp
};
