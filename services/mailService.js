const nodemailer = require("nodemailer");

function getMailConfigError() {
  if (!process.env.MAIL_HOST || !process.env.MAIL_PORT || !process.env.MAIL_USER || !(process.env.MAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS)) {
    return "Mail service is not configured. Please set MAIL_HOST, MAIL_PORT, MAIL_USER, and MAIL_PASS in .env.";
  }

  return null;
}

function createTransporter() {
  const configError = getMailConfigError();

  if (configError) {
    const error = new Error(configError);
    error.code = "MAIL_NOT_CONFIGURED";
    throw error;
  }

  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT),
    secure: String(process.env.MAIL_SECURE || "").toLowerCase() === "true" || Number(process.env.MAIL_PORT) === 465,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS
    }
  });
}

async function sendPasswordResetOtp({ toEmail, studentName, otp }) {
  const transporter = createTransporter();
  const fromAddress = process.env.MAIL_FROM || process.env.MAIL_USER;

  try {
    await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject: "NCC Portal Password Reset OTP",
      text: [
        `Hello ${studentName || "Cadet"},`,
        "",
        `Your OTP for NCC portal password reset is: ${otp}`,
        "This OTP is valid for 10 minutes.",
        "If you did not request this reset, please ignore this email."
      ].join("\n"),
      html: `
      <div style="font-family:Segoe UI,Arial,sans-serif;color:#15314f;line-height:1.6">
        <h2 style="margin-bottom:8px">NCC Portal Password Reset</h2>
        <p>Hello ${studentName || "Cadet"},</p>
        <p>Your OTP for password reset is:</p>
        <div style="display:inline-block;padding:12px 18px;background:#edf4ff;border-radius:12px;font-size:28px;font-weight:800;letter-spacing:0.2em;color:#0f62d6">${otp}</div>
        <p style="margin-top:16px">This OTP is valid for 10 minutes.</p>
        <p>If you did not request this reset, you can safely ignore this email.</p>
      </div>
    `
    });
  } catch (error) {
    if (error && error.code === "EAUTH") {
      const authError = new Error("Gmail rejected the SMTP login. Use a Google App Password for MAIL_PASS (or MAIL_APP_PASSWORD/GMAIL_APP_PASSWORD) and keep 2-Step Verification enabled on the Gmail account.");
      authError.code = error.code;
      throw authError;
    }

    throw error;
  }
}

module.exports = {
  getMailConfigError,
  sendPasswordResetOtp
};
