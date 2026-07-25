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

    // Verify tokenVersion to instantly invalidate logged-out or reset tokens
    if (decoded.userId && decoded.tokenVersion !== undefined) {
      const user = await User.findById(decoded.userId).select("tokenVersion");
      if (!user || user.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({ message: "Token has been invalidated or expired. Please log in again." });
      }
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = authMiddleware;