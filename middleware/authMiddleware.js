const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Validate active session tokenVersion against MongoDB user record
    if (decoded && decoded.userId) {
      const user = await User.findById(decoded.userId).select("tokenVersion role status");

      if (!user) {
        return res.status(401).json({ message: "User account not found." });
      }

      if (user.role === "student" && user.status !== "approved") {
        return res.status(403).json({ message: "Account pending admin approval." });
      }

      // Check if user logged in on another device (which incremented tokenVersion)
      if (typeof decoded.tokenVersion === "number" && user.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({
          code: "SESSION_OVERRIDDEN",
          message: "Session expired because your account was logged into on another device."
        });
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = authMiddleware;