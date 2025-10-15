import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Missing token" });
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    // Attach both userId and role so downstream middleware/routes can decide
    req.userId = decoded.userId || decoded.id;
    req.role = decoded.role || decoded.roleName || "user";
    // Debug: log decoded token payload to help trace auth/role issues
    try {
      console.log("[VERIFY TOKEN] decoded payload:", decoded);
    } catch (e) {
      // ignore logging errors
    }
    next();
  });
};
