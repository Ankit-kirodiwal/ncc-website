const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
const authMiddleware = require("../middleware/authMiddleware");
const { getMailConfigError, sendPasswordResetOtp } = require("../services/mailService");

const router = express.Router();

function formatDateOnly(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function maskEmail(email) {
  if (!email || !email.includes("@")) {
    return "";
  }

  const [localPart, domain] = email.split("@");
  const visiblePart = localPart.slice(0, 2);
  return `${visiblePart}${"*".repeat(Math.max(localPart.length - 2, 1))}@${domain}`;
}

function generateNumericOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
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
    console.log("Saved user:", newUser);
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
    const normalizedLoginId = sanitizeString(req.body.loginId, 150);
    const normalizedDob = formatDateOnly(req.body.dob);
    const mailConfigError = getMailConfigError();

    if (mailConfigError) {
      return res.status(500).json({ message: mailConfigError });
    }

    if (!normalizedLoginId || !normalizedDob) {
      return res.status(400).json({ message: "Login ID and date of birth are required." });
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

router.post("/forgot-password/verify-otp", async (req, res) => {
  try {
    const normalizedLoginId = sanitizeString(req.body.loginId, 150);
    const normalizedDob = formatDateOnly(req.body.dob);
    const normalizedOtp = sanitizeString(String(req.body.otp || ""), 10);
    const newPassword = req.body.newPassword;

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

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
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

module.exports = router;
