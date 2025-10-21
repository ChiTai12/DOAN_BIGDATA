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

// --- Admin post management endpoints ---
// Note: these are exported in the same router file and are protected by verifyToken and admin role checks above

// GET /admin/posts?q=...  - list posts (admin view)
router.get("/posts", verifyToken, async (req, res) => {
  if (req.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const qParam = req.query.q || "";
  const session = driver.session();
  try {
    const q = `
        MATCH (author:User)-[:POSTED]->(p:Post)
        WHERE toLower(p.title) CONTAINS toLower($q) OR toLower(p.content) CONTAINS toLower($q)
        OPTIONAL MATCH (p)<-[:LIKES]-(liker:User)
        RETURN author, p, COUNT(liker) AS likesCount
        ORDER BY p.createdAt DESC LIMIT 200
      `;
    const result = await session.run(q, { q: qParam });
    const posts = result.records.map((r) => {
      const author = r.get("author").properties;
      delete author.passwordHash;
      const p = r.get("p").properties;
      return {
        id: p.id,
        title: p.title || "",
        content: p.content || "",
        imageUrl: p.imageUrl || "",
        authorName: author.displayName || author.username,
        hidden: p.hidden === true || p.hidden === "true",
        createdAt: p.createdAt,
      };
    });
    res.json({ data: posts });
  } catch (err) {
    console.error("[ADMIN /posts] Error:", err);
    res.status(500).json({ error: "Failed to fetch posts" });
  } finally {
    await session.close();
  }
});

// DEV-ONLY: public posts list for debugging admin UI (no auth) - remove in production
router.get("/posts/public", async (req, res) => {
  const qParam = req.query.q || "";
  const session = driver.session();
  try {
    const q = `
      MATCH (author:User)-[:POSTED]->(p:Post)
      WHERE toLower(p.title) CONTAINS toLower($q) OR toLower(p.content) CONTAINS toLower($q)
      OPTIONAL MATCH (p)<-[:LIKES]-(liker:User)
      RETURN author, p, COUNT(liker) AS likesCount
      ORDER BY p.createdAt DESC LIMIT 200
    `;
    const result = await session.run(q, { q: qParam });
    const posts = result.records.map((r) => {
      const author = r.get("author").properties;
      delete author.passwordHash;
      const p = r.get("p").properties;
      return {
        id: p.id,
        title: p.title || "",
        content: p.content || "",
        imageUrl: p.imageUrl || "",
        authorName: author.displayName || author.username,
        hidden: p.hidden === true || p.hidden === "true",
        createdAt: p.createdAt,
      };
    });
    res.json({ data: posts });
  } catch (err) {
    console.error("[ADMIN /posts/public] Error:", err);
    res.status(500).json({ error: "Failed to fetch posts" });
  } finally {
    await session.close();
  }
});

// DEV-ONLY: return all Post nodes (raw) for debugging - shows properties even if no POSTED relationship
router.get("/posts/all", async (req, res) => {
  const session = driver.session();
  try {
    const q = `
      MATCH (p:Post)
      OPTIONAL MATCH (author)-[:POSTED]->(p)
      RETURN p, author LIMIT 500
    `;
    const result = await session.run(q, {});
    const posts = result.records.map((r) => {
      const pnode = r.get("p");
      const authorNode = r.get("author");
      const p = pnode && pnode.properties ? pnode.properties : {};
      const author =
        authorNode && authorNode.properties ? authorNode.properties : null;
      if (author && author.passwordHash) delete author.passwordHash;
      return { post: p, author };
    });
    res.json({ data: posts });
  } catch (err) {
    console.error("[ADMIN /posts/all] Error:", err);
    res.status(500).json({ error: "Failed to fetch all posts" });
  } finally {
    await session.close();
  }
});

// DELETE /admin/posts/:postId - admin-level delete (force delete any post)
router.delete("/posts/:postId", verifyToken, async (req, res) => {
  // Admin deletions are intentionally disabled. Do not allow admins to forcibly delete
  // posts from the server-side. Authors who own posts may still delete their own posts
  // using the author-only endpoint under /posts/delete/:postId which enforces authorship.
  if (req.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  console.warn(
    `Admin delete attempt blocked: user=${req.userId}, ip=${req.ip}`
  );
  return res.status(403).json({
    error:
      "Admin-level deletion of posts has been disabled. Please use the hide/take-down feature instead.",
  });
});

// POST /admin/posts/:postId/hide - toggle hidden flag
router.post("/posts/:postId/hide", verifyToken, async (req, res) => {
  if (req.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { postId } = req.params;
  const { hidden } = req.body; // optional boolean to explicitly set
  const session = driver.session();
  try {
    let result = null;
    if (typeof hidden !== "undefined") {
      result = await session.run(
        `MATCH (author:User)-[:POSTED]->(p:Post {id:$postId}) SET p.hidden = $hidden RETURN author, p`,
        { postId, hidden }
      );
    } else {
      // toggle
      result = await session.run(
        `MATCH (author:User)-[:POSTED]->(p:Post {id:$postId}) SET p.hidden = coalesce(NOT p.hidden, true) RETURN author, p`,
        { postId }
      );
    }

    // Prepare realtime payload and emit so clients update immediately
    try {
      if (result && result.records && result.records.length > 0) {
        const rec = result.records[0];
        const authorNode = rec.get("author");
        const pNode = rec.get("p");
        const author =
          authorNode && authorNode.properties ? authorNode.properties : null;
        const p = pNode && pNode.properties ? pNode.properties : null;
        const payload = {
          postId: p ? p.id : postId,
          post: p || { id: postId },
          author: author || null,
        };
        const io = req.app && req.app.locals && req.app.locals.io;
        if (io) {
          try {
            io.emit("post:updated", payload);
            console.log(
              `[ADMIN HIDE POST] Emitted post:updated for post=${payload.postId}`
            );
          } catch (emitErr) {
            console.warn(
              "[ADMIN HIDE POST] Failed to emit post:updated",
              emitErr
            );
          }
        }
      } else {
        // Fallback: try to emit minimal payload with postId only
        const io = req.app && req.app.locals && req.app.locals.io;
        if (io) {
          try {
            io.emit("post:updated", {
              postId,
              post: {
                id: postId,
                hidden: typeof hidden !== "undefined" ? hidden : true,
              },
            });
            console.log(
              `[ADMIN HIDE POST] Emitted post:updated (fallback) for post=${postId}`
            );
          } catch (emitErr) {
            console.warn(
              "[ADMIN HIDE POST] Failed to emit fallback post:updated",
              emitErr
            );
          }
        }
      }
    } catch (emitOuter) {
      console.warn("[ADMIN HIDE POST] Realtime emit error:", emitOuter);
    }

    res.json({ message: "Updated hidden state" });
  } catch (err) {
    console.error("[ADMIN HIDE POST]", err);
    res.status(500).json({ error: "Failed to update post hidden state" });
  } finally {
    await session.close();
  }
});
