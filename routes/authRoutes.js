const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
const authMiddleware = require("../middleware/authMiddleware");
const { getMailConfigError, sendPasswordResetOtp } = require("../services/mailService");

const router = express.Router();

function formatDateOnly(dateValue) {
  if (!dateValue) return null;

  if (typeof dateValue === "string") {
    const trimmed = dateValue.trim();
    // Standard YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Match YYYY-MM-DDTHH:mm:ss...
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    // Match MM/DD/YYYY or DD/MM/YYYY
    const parts = trimmed.split(/[\/\.-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
      }
      if (parts[2].length === 4) {
        // Assume MM/DD/YYYY or DD/MM/YYYY
        const y = parts[2];
        const p1 = Number(parts[0]);
        const p2 = Number(parts[1]);
        if (p1 <= 12) {
          return `${y}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
        }
        return `${y}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
      }
    }
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  try {
    return date.toISOString().slice(0, 10);
  } catch (e) {
    return null;
  }
}

function maskEmail(email) {
  if (!email || !email.includes("@")) {
    return "";
  }

  const [localPart, domain] = email.split("@");
  const visiblePart = localPart.slice(0, 2);
  return `${visiblePart}${"*".repeat(Math.max(localPart.length - 2, 1))}@${domain}`;
}

const crypto = require("crypto");

function generateNumericOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function sanitizeString(val, maxLen = 255) {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLen);
}

function validatePasswordLength(password) {
  if (typeof password !== "string") return "Password must be a valid string.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  if (password.length > 72) return "Password cannot exceed 72 characters.";
  return null;
}

// Rate Limiting Store for Logins (per 1 hour window)
const loginAttemptsMap = new Map();

// Periodic cleanup of expired timestamps (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  for (const [key, timestamps] of loginAttemptsMap.entries()) {
    const valid = timestamps.filter((t) => t > oneHourAgo);
    if (valid.length === 0) {
      loginAttemptsMap.delete(key);
    } else {
      loginAttemptsMap.set(key, valid);
    }
  }
}, 10 * 60 * 1000);

function checkLoginRateLimit(ip, loginId, role = "student") {
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxAttempts = role === "admin" ? 10 : 5;
  const key = `${ip}:${(loginId || "unknown").toLowerCase()}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  let timestamps = loginAttemptsMap.get(key) || [];
  timestamps = timestamps.filter((t) => t > windowStart);

  if (timestamps.length >= maxAttempts) {
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    const retryAfterMins = Math.ceil(retryAfterMs / (60 * 1000));
    return {
      allowed: false,
      maxAttempts,
      retryAfterMins,
      message: `Too many login attempts. ${role === "admin" ? "Admins" : "Normal users"} can only log in up to ${maxAttempts} times per hour. Please try again in ${retryAfterMins} minutes.`
    };
  }

  timestamps.push(now);
  loginAttemptsMap.set(key, timestamps);

  return { allowed: true };
}

// Student Register Route
router.post("/register", async (req, res) => {
  try {
    const normalizedRegimentalNo = sanitizeString(req.body.regimentalNo, 50).toUpperCase();
    const name = sanitizeString(req.body.name, 100);
    const fatherName = sanitizeString(req.body.fatherName, 100);
    const dob = sanitizeString(req.body.dob, 30);
    const normalizedEmail = sanitizeString(req.body.email, 150).toLowerCase();
    const rawPassword = req.body.password;

    if (!normalizedRegimentalNo || !name || !fatherName || !dob || !normalizedEmail || !rawPassword) {
      return res.status(400).json({ message: "All fields are required and must be valid text strings." });
    }

    const passwordError = validatePasswordLength(rawPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { regimentalNo: normalizedRegimentalNo }]
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists with this email or regimental number"
      });
    }

    const newUser = new User({
      regimentalNo: normalizedRegimentalNo,
      name,
      fatherName,
      dob,
      email: normalizedEmail,
      password: rawPassword,
      role: "student",
      status: "pending"
    });

    await newUser.save();
    res.status(201).json({
      message: "Registration successful. Wait for admin approval."
    });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// Student forgot password OTP request
router.post("/forgot-password/request-otp", async (req, res) => {
  try {
    const body = req.body || {};
    const rawLoginId = body.loginId || body.email || body.regimentalNo || "";
    const rawDob = body.dob || body.dateOfBirth || "";

    const normalizedLoginId = sanitizeString(String(rawLoginId || ""), 150);
    const normalizedDob = formatDateOnly(rawDob);
    const mailConfigError = getMailConfigError();

    if (mailConfigError) {
      return res.status(500).json({ message: mailConfigError });
    }

    console.log("POST /forgot-password/request-otp received for login ID:", maskEmail(normalizedLoginId) || normalizedLoginId);

    if (!normalizedLoginId) {
      const keys = Object.keys(body).join(", ") || "none";
      return res.status(400).json({ message: `Login ID (email or regimental number) is required. (Received payload keys: ${keys})` });
    }

    if (!normalizedDob) {
      return res.status(400).json({ message: "Please provide a valid date of birth." });
    }

    const user = await User.findOne({
      role: "student",
      $or: [{ email: normalizedLoginId.toLowerCase() }, { regimentalNo: normalizedLoginId.toUpperCase() }]
    });

    if (!user) {
      return res.status(404).json({ message: "Student not found with provided Email/Regimental No." });
    }

    const storedDob = formatDateOnly(user.dob);
    if (storedDob !== normalizedDob) {
      return res.status(403).json({ message: "Date of birth does not match our records." });
    }

    const now = new Date();
    if (user.passwordResetOtpSentAt && now.getTime() - user.passwordResetOtpSentAt.getTime() < 60 * 1000) {
      return res.status(429).json({ message: "Please wait 1 minute before requesting another OTP." });
    }

    const otp = generateNumericOtp();
    await sendPasswordResetOtp({
      toEmail: user.email,
      studentName: user.name,
      otp
    });

    user.passwordResetOtpHash = await bcrypt.hash(otp, 10);
    user.passwordResetOtpExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    user.passwordResetOtpSentAt = now;
    await user.save();

    res.status(200).json({
      message: "OTP sent to your registered email.",
      maskedEmail: maskEmail(user.email)
    });
  } catch (error) {
    console.error("Forgot Password OTP Request Error:", error);
    res.status(500).json({ message: error.message || "Server error while sending OTP" });
  }
});

// Verify OTP only (Step 2 of Forgot Password)
router.post("/forgot-password/verify-otp-only", async (req, res) => {
  try {
    const body = req.body || {};
    const normalizedLoginId = sanitizeString(body.loginId, 150);
    const normalizedDob = formatDateOnly(body.dob);
    const normalizedOtp = sanitizeString(String(body.otp || ""), 10);

    if (!normalizedLoginId || !normalizedDob || !normalizedOtp) {
      return res.status(400).json({ message: "Login ID, date of birth, and OTP are required." });
    }

    const user = await User.findOne({
      role: "student",
      $or: [{ email: normalizedLoginId.toLowerCase() }, { regimentalNo: normalizedLoginId.toUpperCase() }]
    });

    if (!user) {
      return res.status(404).json({ message: "Student not found." });
    }

    const storedDob = formatDateOnly(user.dob);
    if (storedDob !== normalizedDob) {
      return res.status(403).json({ message: "Date of birth does not match our records." });
    }

    if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      return res.status(400).json({ message: "Please request a fresh OTP first." });
    }

    if (user.passwordResetOtpExpiresAt.getTime() < Date.now()) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpiresAt = null;
      await user.save();
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    const isOtpValid = await bcrypt.compare(normalizedOtp, user.passwordResetOtpHash);
    if (!isOtpValid) {
      return res.status(400).json({ message: "Invalid OTP. Please check and try again." });
    }

    res.status(200).json({ message: "OTP verified successfully." });
  } catch (error) {
    console.error("Verify OTP Only Error:", error);
    res.status(500).json({ message: "Server error during OTP verification" });
  }
});

router.post("/forgot-password/verify-otp", async (req, res) => {
  try {
    const body = req.body || {};
    const normalizedLoginId = sanitizeString(body.loginId, 150);
    const normalizedDob = formatDateOnly(body.dob);
    const normalizedOtp = sanitizeString(String(body.otp || ""), 10);
    const newPassword = body.newPassword;

    if (!normalizedLoginId || !normalizedDob || !normalizedOtp || !newPassword) {
      return res.status(400).json({ message: "Login ID, date of birth, OTP, and new password are required." });
    }

    const passwordError = validatePasswordLength(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const user = await User.findOne({
      role: "student",
      $or: [{ email: normalizedLoginId.toLowerCase() }, { regimentalNo: normalizedLoginId.toUpperCase() }]
    });

    if (!user) {
      return res.status(404).json({ message: "Student not found." });
    }

    const storedDob = formatDateOnly(user.dob);
    if (storedDob !== normalizedDob) {
      return res.status(403).json({ message: "Date of birth does not match our records." });
    }

    if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      return res.status(400).json({ message: "Please request a fresh OTP first." });
    }

    if (user.passwordResetOtpExpiresAt.getTime() < Date.now()) {
      user.passwordResetOtpHash = null;
      user.passwordResetOtpExpiresAt = null;
      await user.save();
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    const isOtpValid = await bcrypt.compare(normalizedOtp, user.passwordResetOtpHash);
    if (!isOtpValid) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    user.password = newPassword;
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpiresAt = null;
    user.passwordResetOtpSentAt = null;
    await user.save();

    res.status(200).json({ message: "Password reset successful. Please log in with your new password." });
  } catch (error) {
    console.error("Forgot Password OTP Verify Error:", error);
    res.status(500).json({ message: "Server error during password reset" });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  try {
    const normalizedLoginId = sanitizeString(req.body.loginId, 150);
    const password = req.body.password;

    if (!normalizedLoginId || !password) {
      return res.status(400).json({ message: "Login ID and password are required" });
    }

    const passwordError = validatePasswordLength(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const user = await User.findOne({
      $or: [{ email: normalizedLoginId.toLowerCase() }, { regimentalNo: normalizedLoginId.toUpperCase() }]
    });

    const targetRole = user?.role === "admin" ? "admin" : "student";
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "127.0.0.1";

    const rateLimitResult = checkLoginRateLimit(clientIp, normalizedLoginId, targetRole);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({ message: rateLimitResult.message });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "student" && user.status !== "approved") {
      return res.status(403).json({
        message: "Your account is pending admin approval"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
        tokenVersion: user.tokenVersion,
        name: user.name,
        email: user.email,
        regimentalNo: user.regimentalNo
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        regimentalNo: user.regimentalNo,
        role: user.role,
        status: user.status,
        attendance: user.attendance
      }
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Fetch Profile Error:", error);
    res.status(500).json({ message: "Server error while fetching profile" });
  }
});

// get logged-in student attendance%
router.get("/my-attendance", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("regimentalNo name attendance");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const records = await Attendance.find({ regNo: user.regimentalNo });

    const total = records.length;
    const present = records.filter((r) => r.status === "present").length;

    const percentage = total === 0 ? 0 : Math.round((present / total) * 100);

    if (user.attendance !== percentage) {
      user.attendance = percentage;
      await user.save();
    }

    res.json({
      attendance: percentage,
      totalDays: total,
      presentDays: present
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching attendance" });
  }
});

// Self-service user account deletion route
router.delete("/delete-account", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Remove linked attendance records
    await Attendance.deleteMany({ regNo: user.regimentalNo });

    // Remove user document
    await User.findByIdAndDelete(user._id);

    res.status(200).json({ message: "Account and associated personal data deleted successfully." });
  } catch (error) {
    console.error("Delete Account Error:", error.message || error);
    res.status(500).json({ message: "Server error during account deletion." });
  }
});

module.exports = router;
