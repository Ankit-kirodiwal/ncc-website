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

// Enable trust proxy so Render/cloud reverse proxies pass the real client IP
app.set("trust proxy", 1);

// ==================== SECURITY HEADERS ====================
app.use(helmet({ contentSecurityPolicy: false }));

// ==================== CORS CONFIGURATION ====================
const corsOptions = {
  origin: ["https://ncc-project.onrender.com", "http://localhost:5000", "http://localhost:3000"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};
app.use(cors(corsOptions));

// ==================== MIDDLEWARE & STATIC FILES ====================
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Serve frontend static files freely (HTML, CSS, JS, images never rate limited)
app.use(express.static(path.join(__dirname, "public")));

// ==================== API RATE LIMITER ====================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000, // 2000 API calls per 15 mins per IP
  message: { message: "Too many API requests from this IP, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply API rate limiter ONLY to API endpoints
app.use("/api", apiLimiter);

// ==================== API ROUTES ====================
app.use("/api/auth", authRoutes);
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

