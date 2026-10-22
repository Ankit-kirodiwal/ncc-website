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
  // Option 1: Brevo HTTPS API (Recommended for Render free tier over HTTPS Port 443)
  if (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY) {
    const sender = process.env.BREVO_SENDER_EMAIL || process.env.MAIL_FROM || process.env.MAIL_USER;
    if (!sender) {
      return "Brevo API key is set, but sender email is missing. Please set BREVO_SENDER_EMAIL or MAIL_FROM in your environment variables.";
    }
    return null;
  }

  // Option 2: Resend HTTPS API
  if (process.env.RESEND_API_KEY) {
    return null;
  }

  // Option 3: Brevo SMTP relay or standard SMTP
  const host = process.env.MAIL_HOST || (process.env.BREVO_SMTP_KEY ? "smtp-relay.brevo.com" : null);
  const user = process.env.MAIL_USER || process.env.BREVO_USER;
  const pass = process.env.BREVO_SMTP_KEY || process.env.MAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS;

  if (!host || !user || !pass) {
    return "Mail service is not configured. For Render free tier, set BREVO_API_KEY and BREVO_SENDER_EMAIL (or MAIL_FROM), or configure Brevo SMTP (MAIL_HOST=smtp-relay.brevo.com, MAIL_USER, MAIL_PASS).";
  }

  return null;
}

async function createTransporter(overrideConfig = {}) {
  const mailHost = process.env.MAIL_HOST || (process.env.BREVO_SMTP_KEY ? "smtp-relay.brevo.com" : "smtp.gmail.com");
  const isGmail = mailHost.includes("gmail") || process.env.MAIL_SERVICE === "gmail";
  const isBrevo = mailHost.includes("brevo") || mailHost.includes("sendinblue");
  const targetHost = isGmail ? "smtp.gmail.com" : (isBrevo ? "smtp-relay.brevo.com" : mailHost);

  const resolvedIp = await resolveIpv4Host(targetHost);

  let port = 587;
  let secure = false;

  if (overrideConfig.port !== undefined) {
    port = overrideConfig.port;
    secure = overrideConfig.secure !== undefined ? overrideConfig.secure : (port === 465);
  } else if (!isGmail && process.env.MAIL_PORT) {
    port = Number(process.env.MAIL_PORT);
    secure = String(process.env.MAIL_SECURE).toLowerCase() === "true" || port === 465;
  } else if (isGmail) {
    port = 465;
    secure = true;
  }

  const user = process.env.MAIL_USER || process.env.BREVO_USER;
  const pass = process.env.BREVO_SMTP_KEY || process.env.MAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS;

  let transportOptions = {
    host: resolvedIp,
    port: port,
    secure: secure,
    auth: {
      user: user,
      pass: pass
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
  const fromEmail = process.env.BREVO_SENDER_EMAIL || process.env.MAIL_FROM || process.env.MAIL_USER || "noreply@bkbietncc.in";
  const fromName = process.env.MAIL_FROM_NAME || "NCC Portal";
  const safeName = escapeHtml(studentName || "Cadet");
  const safeOtp = escapeHtml(String(otp || ""));

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
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

  // Method 1: Brevo HTTPS API (Port 443 - Recommended for Render free tier where raw SMTP is blocked)
  const brevoApiKey = process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY;
  if (brevoApiKey) {
    try {
      console.log(`[Brevo API] Sending OTP to ${toEmail} using sender: ${fromEmail}...`);
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": brevoApiKey
        },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: toEmail, name: studentName || "Cadet" }],
          subject: "NCC Portal Password Reset OTP",
          htmlContent: mailOptions.html,
          textContent: mailOptions.text
        })
      });

      const responseBody = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`✅ [Brevo API] OTP email delivered to ${toEmail}! MessageId: ${responseBody.messageId || "ok"}`);
        return;
      }

      console.error(`❌ [Brevo API] Error ${res.status}:`, responseBody);
      if (responseBody && responseBody.message) {
        console.warn(`[Brevo API] Details: ${responseBody.message}`);
      }
    } catch (apiErr) {
      console.error("[Brevo API] Network request error:", apiErr.message || apiErr);
    }
  }

  // Method 2: Resend HTTPS API (Port 443 fallback)
  if (process.env.RESEND_API_KEY) {
    try {
      console.log(`[Resend API] Sending OTP email to ${toEmail}...`);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM || "NCC Portal <onboarding@resend.dev>",
          to: [toEmail],
          subject: "NCC Portal Password Reset OTP",
          html: mailOptions.html,
          text: mailOptions.text
        })
      });

      if (res.ok) {
        console.log(`✅ [Resend API] OTP email delivered to ${toEmail}!`);
        return;
      }
      const errRes = await res.json().catch(() => ({}));
      console.warn("Resend API error response:", errRes);
    } catch (apiErr) {
      console.warn("Resend API request failed:", apiErr.message || apiErr);
    }
  }

  // Method 3: SMTP Transports (Brevo SMTP relay / Gmail SMTP / Custom SMTP)
  const mailHost = process.env.MAIL_HOST || (process.env.BREVO_SMTP_KEY ? "smtp-relay.brevo.com" : "smtp.gmail.com");
  const isBrevo = mailHost.includes("brevo") || mailHost.includes("sendinblue");

  // SMTP Attempt 1: Port 587 STARTTLS (standard for Brevo SMTP and Gmail)
  try {
    const transporter587 = await createTransporter({ port: 587, secure: false });
    await sendMailWithTransporter(transporter587, mailOptions);
    console.log(`✅ OTP email delivered via SMTP port 587 (${mailHost}) to ${toEmail}`);
    return;
  } catch (err587) {
    console.warn(`SMTP Port 587 failed on ${mailHost}:`, err587.message || err587);
  }

  // SMTP Attempt 2: If Brevo SMTP, try Port 2525 (Brevo official alternate port)
  if (isBrevo) {
    try {
      const transporter2525 = await createTransporter({ port: 2525, secure: false });
      await sendMailWithTransporter(transporter2525, mailOptions);
      console.log(`✅ OTP email delivered via Brevo SMTP port 2525 to ${toEmail}`);
      return;
    } catch (err2525) {
      console.warn("Brevo SMTP Port 2525 failed:", err2525.message || err2525);
    }
  }

  // SMTP Attempt 3: Port 465 SSL
  try {
    const transporter465 = await createTransporter({ port: 465, secure: true });
    await sendMailWithTransporter(transporter465, mailOptions);
    console.log(`✅ OTP email delivered via SMTP port 465 SSL (${mailHost}) to ${toEmail}`);
    return;
  } catch (primaryErr) {
    console.warn(`SMTP Port 465 failed on ${mailHost}:`, primaryErr.message || primaryErr);
  }

  // SMTP Attempt 4: Nodemailer standard Gmail service (if Gmail host)
  if (mailHost.includes("gmail") || process.env.MAIL_SERVICE === "gmail") {
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
      console.log(`✅ OTP email delivered via Nodemailer Gmail service to ${toEmail}`);
      return;
    } catch (gmailErr) {
      console.error("Gmail service transport failed:", gmailErr.message || gmailErr);
      if (gmailErr && gmailErr.code === "EAUTH") {
        const authError = new Error("Gmail rejected the SMTP login. Use a Google App Password for MAIL_PASS and keep 2-Step Verification enabled.");
        authError.code = gmailErr.code;
        throw authError;
      }
    }
  }

  const renderError = new Error(
    "Failed to send email. Render free tier blocks outbound SMTP ports (465 & 587). " +
    "To send OTP emails reliably on Render, set BREVO_API_KEY and BREVO_SENDER_EMAIL (or MAIL_FROM) in your Render environment variables to send via HTTPS (Port 443)."
  );
  renderError.code = "RENDER_SMTP_BLOCKED";
  throw renderError;
}

module.exports = {
  getMailConfigError,
  sendPasswordResetOtp
};
