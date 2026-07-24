const nodemailer = require("nodemailer");
const dnsPromises = require("dns").promises;

async function resolveIpv4Host(targetHost) {
  if (!targetHost) return "smtp.gmail.com";
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(targetHost)) {
    return targetHost;
  }
  try {
    const addresses = await dnsPromises.resolve4(targetHost);
    if (addresses && addresses.length > 0) {
      console.log(`Resolved ${targetHost} to IPv4 address: ${addresses[0]}`);
      return addresses[0];
    }
  } catch (err) {
    console.warn(`DNS resolve4 failed for ${targetHost}:`, err.message);
  }
  return targetHost;
}

function getMailConfigError() {
  if (!process.env.MAIL_HOST || !process.env.MAIL_PORT || !process.env.MAIL_USER || !(process.env.MAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS)) {
    return "Mail service is not configured. Please set MAIL_HOST, MAIL_PORT, MAIL_USER, and MAIL_PASS in .env.";
  }

  return null;
}

async function createTransporter(overrideConfig = {}) {
  const configError = getMailConfigError();

  if (configError) {
    const error = new Error(configError);
    error.code = "MAIL_NOT_CONFIGURED";
    throw error;
  }

  const mailHost = process.env.MAIL_HOST || "smtp.gmail.com";
  const isGmail = mailHost.includes("gmail") || process.env.MAIL_SERVICE === "gmail";
  const targetHost = isGmail ? "smtp.gmail.com" : mailHost;

  const resolvedIp = await resolveIpv4Host(targetHost);

  let port = 465;
  let secure = true;

  if (overrideConfig.port !== undefined) {
    port = overrideConfig.port;
    secure = overrideConfig.secure !== undefined ? overrideConfig.secure : (port === 465);
  } else if (!isGmail && process.env.MAIL_PORT) {
    port = Number(process.env.MAIL_PORT);
    secure = String(process.env.MAIL_SECURE).toLowerCase() === "true" || port === 465;
  }

  let transportOptions = {
    host: resolvedIp,
    port: port,
    secure: secure,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS
    },
    tls: {
      servername: targetHost,
      rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    ...overrideConfig
  };

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

  // Attempt 1: Port 465 SSL (IPv4 direct)
  try {
    const primaryTransporter = await createTransporter({ port: 465, secure: true });
    await sendMailWithTransporter(primaryTransporter, mailOptions);
    return;
  } catch (primaryErr) {
    console.warn("Port 465 SSL transport failed, trying Port 587 STARTTLS...", primaryErr.message || primaryErr);
  }

  // Attempt 2: Port 587 STARTTLS (IPv4 direct)
  try {
    const fallbackTransporter587 = await createTransporter({ port: 587, secure: false });
    await sendMailWithTransporter(fallbackTransporter587, mailOptions);
    return;
  } catch (err587) {
    console.warn("Port 587 transport failed, trying Nodemailer service:'gmail'...", err587.message || err587);
  }

  // Attempt 3: Nodemailer standard Gmail service
  try {
    const gmailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS
      },
      connectionTimeout: 10000
    });
    await sendMailWithTransporter(gmailTransporter, mailOptions);
    return;
  } catch (gmailErr) {
    console.error("All mail transports failed:", gmailErr.message || gmailErr);
    if (gmailErr && gmailErr.code === "EAUTH") {
      const authError = new Error("Gmail rejected the SMTP login. Use a Google App Password for MAIL_PASS and keep 2-Step Verification enabled.");
      authError.code = gmailErr.code;
      throw authError;
    }
    throw gmailErr;
  }
}

module.exports = {
  getMailConfigError,
  sendPasswordResetOtp
};
