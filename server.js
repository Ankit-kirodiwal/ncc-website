const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const contentRoutes = require("./routes/contentRoutes");
const noteRoutes = require("./routes/noteRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");

// ==================== PROCESS SAFETY GUARDRAILS ====================
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err.message || err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

const app = express();

// ==================== SECURITY HEADERS & RATE LIMITING ====================
app.use(helmet({ contentSecurityPolicy: false }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per window for auth routes
  message: { message: "Too many authentication requests, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // 500 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false
});

app.use(generalLimiter);

// ==================== CORS CONFIGURATION ====================
const corsOptions = {
  origin: ["https://ncc-project.onrender.com", "http://localhost:5000", "http://localhost:3000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};
app.use(cors(corsOptions));

// ==================== MIDDLEWARE ====================
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Serve frontend files
app.use(express.static(path.join(__dirname, "public")));

// ==================== API ROUTES ====================
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/attendance", attendanceRoutes);

// ==================== TEST ROUTES ====================
app.get("/api/test", (req, res) => {
  res.json({ message: "Server is running properly 🚀" });
});

// ==================== GLOBAL ERROR HANDLING MIDDLEWARE ====================
app.use((err, req, res, next) => {
  console.error("❌ Global Error Handler Caught:", err.stack || err);
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || "Internal Server Error"
  });
});

// ==================== MONGODB CONNECTION ====================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Connection Error:", err));

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

