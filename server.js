const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
require("dotenv").config();

// ==================== FAIL-FAST ENV VALIDATION ====================
function validateRequiredEnv() {
  const missing = [];
  if (!process.env.MONGO_URI) missing.push("MONGO_URI");
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");

  if (missing.length > 0) {
    console.error(`❌ FATAL: Missing required environment variables: ${missing.join(", ")}. Server refusing to start.`);
    process.exit(1);
  }
}
validateRequiredEnv();

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

// ==================== SECURITY HEADERS (HELMET) ====================
app.use(
  helmet({
    noSniff: true,
    frameguard: { action: "deny" },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://cdn.tailwindcss.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
        connectSrc: ["'self'", "https://cdn.tailwindcss.com", "https://api.resend.com", "https://api.brevo.com"]
      }
    }
  })
);

// ==================== CORS CONFIGURATION ====================
const defaultAllowedOrigins = [
  "https://bkbietncc.in",
  "https://www.bkbietncc.in",
  "https://ncc-project.onrender.com",
  "http://localhost:5000",
  "http://localhost:3000"
];

const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...envOrigins])];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    const isAllowed = allowedOrigins.some((allowed) => {
      if (origin === allowed) return true;
      try {
        const originHost = new URL(origin).hostname;
        const allowedHost = new URL(allowed).hostname;
        if (originHost === allowedHost || originHost.endsWith("." + allowedHost)) {
          return true;
        }
      } catch (_) {}
      return false;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy violation: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};
app.use(cors(corsOptions));

// ==================== BODY PARSER MIDDLEWARE ====================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Disable ETags globally so server never generates 304 Not Modified
app.disable("etag");

// Strip conditional request headers and disable caching for ALL requests
app.use((req, res, next) => {
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Serve all frontend static files with 304 completely disabled (always return 200 OK)
app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    lastModified: false
  })
);

// ==================== API RATE LIMITERS ====================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000, // 2000 API calls per 15 mins per IP
  message: { message: "Too many API requests from this IP, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false
});

// Dedicated rate limiters for Auth Endpoints
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // 5 attempts per minute per IP
  message: { message: "Too many login attempts. Please try again in 1 minute." },
  standardHeaders: true,
  legacyHeaders: false
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour per IP
  message: { message: "Too many password reset requests. Please try again in 1 hour." },
  standardHeaders: true,
  legacyHeaders: false
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registration attempts per hour per IP
  message: { message: "Too many registration attempts from this IP. Please try again in 1 hour." },
  standardHeaders: true,
  legacyHeaders: false
});

// Apply API rate limiter to all API endpoints
app.use("/api", apiLimiter);

// Apply dedicated rate limiters to specific auth endpoints
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/register", registerLimiter);
app.use("/api/auth/forgot-password/request-otp", passwordResetLimiter);
app.use("/api/auth/forgot-password/verify-otp", passwordResetLimiter);
app.use("/api/auth/forgot-password/verify-otp-only", passwordResetLimiter);

// ==================== API ROUTES ====================
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/attendance", attendanceRoutes);

// ==================== HEALTH CHECK ROUTE ====================
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==================== GLOBAL ERROR HANDLING MIDDLEWARE ====================
app.use((err, req, res, next) => {
  const correlationId = crypto.randomUUID();
  console.error(`❌ [CorrelationID: ${correlationId}] Global Error Handler Caught:`, err.stack || err);
  
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    message: statusCode === 500 ? "Internal Server Error" : (err.message || "An unexpected error occurred"),
    correlationId
  });
});

// ==================== MONGODB CONNECTION ====================
mongoose
  .connect(process.env.MONGO_URI, {
    autoIndex: false,
    serverSelectionTimeoutMS: 5000
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err.message || "Failed to connect to DB"));

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
