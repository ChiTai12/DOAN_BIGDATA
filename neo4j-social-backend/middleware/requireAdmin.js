import { verifyToken } from "./auth.js";

export default function requireAdmin(req, res, next) {
  // Validate token and attach req.role
  verifyToken(req, res, () => {
    const role = req.role || req.payload?.role || "user";
    if (role !== "admin") return res.status(403).json({ error: "Forbidden" });
    next();
  });
}
