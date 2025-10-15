import express from "express";
import driver from "../db/driver.js";
import multer from "multer";
import bcrypt from "bcrypt";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// Lưu ảnh đại diện admin
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const upload = multer({ storage });

// Cập nhật thông tin admin (chỉ cho phép cập nhật displayName, avatarUrl)
router.put("/update", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res
      .status(403)
      .json({ error: "Chỉ admin mới được cập nhật thông tin admin" });
  }
  const { displayName, avatarUrl } = req.body;
  console.log("[ADMIN UPDATE] Called with:", {
    displayName,
    avatarUrl,
    userId: req.userId,
  });
  const session = driver.session();
  try {
    const setParts = [];
    const params = { id: req.userId };
    if (displayName !== undefined && displayName !== null) {
      const trimmedDisplayName = displayName.trim();
      if (trimmedDisplayName.length === 0) {
        return res.status(400).json({ error: "Display name cannot be empty" });
      }
      setParts.push("u.displayName=$displayName");
      params.displayName = trimmedDisplayName;
    }
    if (avatarUrl) {
      setParts.push("u.avatarUrl=$avatarUrl");
      params.avatarUrl = avatarUrl;
    }
    if (setParts.length === 0) {
      console.log("[ADMIN UPDATE] No updatable fields provided");
      return res.status(400).json({ error: "No updatable fields provided" });
    }
    // Strict: only update Admin node
    console.log("[ADMIN UPDATE] Params:", params);
    const result = await session.run(
      `MATCH (u:Admin {id:$id}) SET ${setParts.join(", ")} RETURN u`,
      params
    );
    console.log("[ADMIN UPDATE] Result records:", result.records.length);
    if (result.records.length === 0) {
      return res.status(404).json({ error: "Admin not found" });
    }
    const user = result.records[0].get("u").properties;
    delete user.passwordHash;
    // Convert avatarUrl to absolute URL for client if it's a relative path
    try {
      if (user.avatarUrl && String(user.avatarUrl).startsWith("/")) {
        const full = `${req.protocol}://${req.get("host")}${user.avatarUrl}`;
        user.avatarUrl = full;
      }
    } catch (e) {
      // ignore
    }
    console.log("[ADMIN UPDATE] Updated user:", user);
    try {
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) io.emit("user:updated", { user });
    } catch (emitErr) {
      console.warn("Failed to emit user:updated after admin update", emitErr);
    }
    res.json(user);
  } catch (err) {
    console.error("[ADMIN UPDATE] Error:", err);
    res.status(500).json({ error: "Cập nhật thông tin admin thất bại" });
  } finally {
    await session.close();
  }
});

// Đổi mật khẩu admin
router.put("/change-password", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res
      .status(403)
      .json({ error: "Chỉ admin mới được đổi mật khẩu admin" });
  }
  const { currentPassword, newPassword } = req.body;
  const session = driver.session();
  try {
    // Strict: read Admin node only
    const userRes = await session.run("MATCH (u:Admin {id:$userId}) RETURN u", {
      userId: req.userId,
    });
    if (!userRes.records.length) {
      return res.status(404).json({ error: "Không tìm thấy user" });
    }
    const user = userRes.records[0].get("u").properties;
    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) {
      return res.status(400).json({ error: "Mật khẩu hiện tại không đúng" });
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    // Strict: update Admin node only
    await session.run(
      "MATCH (u:Admin {id:$userId}) SET u.passwordHash = $newHash RETURN u",
      { userId: req.userId, newHash }
    );
    res.json({ message: "Đổi mật khẩu admin thành công" });
  } catch (err) {
    res.status(500).json({ error: "Đổi mật khẩu admin thất bại" });
  } finally {
    await session.close();
  }
});

// Upload avatar admin
router.post(
  "/upload-avatar",
  verifyToken,
  upload.single("avatar"),
  async (req, res) => {
    if (req.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Chỉ admin mới được upload avatar admin" });
    }
    if (!req.file) return res.status(400).json({ error: "Không có file ảnh" });
    const avatarUrl = `/uploads/${req.file.filename}`;
    console.log("[ADMIN UPLOAD-AVATAR] Called with:", {
      avatarUrl,
      userId: req.userId,
    });
    const session = driver.session();
    try {
      // MATCH by id OR username to handle tokens that store username in `id` claim
      const params = { userId: req.userId, avatarUrl };
      console.log("[ADMIN UPLOAD-AVATAR] Params:", params);
      // Strict: update Admin node only
      const result = await session.run(
        `MATCH (u:Admin {id:$userId}) SET u.avatarUrl = $avatarUrl RETURN u`,
        params
      );
      console.log(
        "[ADMIN UPLOAD-AVATAR] Result records:",
        result.records.length
      );
      if (!result.records.length) {
        return res.status(404).json({ error: "Không tìm thấy user" });
      }
      const user = result.records[0].get("u").properties;
      delete user.passwordHash;
      // Convert avatarUrl to absolute URL for client
      try {
        if (user.avatarUrl && String(user.avatarUrl).startsWith("/")) {
          const full = `${req.protocol}://${req.get("host")}${user.avatarUrl}`;
          user.avatarUrl = full;
        }
      } catch (e) {}
      console.log("[ADMIN UPLOAD-AVATAR] Updated user:", user);
      try {
        const io = req.app && req.app.locals && req.app.locals.io;
        if (io) io.emit("user:updated", { user });
      } catch (emitErr) {
        console.warn(
          "Failed to emit user:updated after admin avatar upload",
          emitErr
        );
      }
      res.json({ avatarUrl, user });
    } catch (err) {
      console.error("[ADMIN UPLOAD-AVATAR] Error:", err);
      res.status(500).json({ error: "Upload avatar admin thất bại" });
    } finally {
      await session.close();
    }
  }
);

export default router;
