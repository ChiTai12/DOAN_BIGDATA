import { verifyToken } from "./auth.js";

export default function requireUser(req, res, next) {
  // First ensure token is valid and req.role is attached
  verifyToken(req, res, () => {
    const role = req.role || "user";
    if (role === "admin")
      return res
        .status(403)
        .json({ error: "Admins are not allowed to use user APIs" });
    // req.userId and req.role are available
    next();
  });
}
