import express from "express";
import multer from "multer";
import path from "path";
import driver from "../db/driver.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// Get all users (for messenger dropdown)
router.get("/", verifyToken, async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `
      MATCH (u:User)
      RETURN u
      ORDER BY u.username
      `
    );

    const users = result.records.map((r) => {
      const user = r.get("u").properties;
      delete user.passwordHash;
      return user;
    });

    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  } finally {
    await session.close();
  }
});

// Lưu ảnh vào thư mục uploads/
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const upload = multer({ storage });

// Get suggested users to follow
router.get("/suggestions", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `
      MATCH (other:User)
      RETURN other
      LIMIT 10
      `
    );

    const suggestions = result.records.map((r) => {
      const user = r.get("other").properties;
      delete user.passwordHash;
      return user;
    });

    res.json(suggestions);
  } finally {
    await session.close();
  }
});

// Lấy thông tin người dùng
router.get("/:id", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User {id:$id}) RETURN u LIMIT 1`,
      { id: req.params.id }
    );
    if (result.records.length === 0)
      return res.status(404).json({ error: "User not found" });

    const user = result.records[0].get("u").properties;
    delete user.passwordHash;
    res.json(user);
  } finally {
    await session.close();
  }
});

// TEST ROUTE - Temporary for debugging (remove later)
router.put("/test-update/:userId", async (req, res) => {
  const { username, avatarUrl } = req.body;
  const userId = req.params.userId;
  console.log("🧪 TEST UPDATE:", { username, avatarUrl, userId });

  const session = driver.session();
  try {
    // Build SET clause
    const setParts = [];
    const params = { id: userId };

    if (username !== undefined && username !== null) {
      const trimmedUsername = username.trim();
      if (trimmedUsername.length === 0) {
        return res.status(400).json({ error: "Username cannot be empty" });
      }
      setParts.push("u.username=$username");
      params.username = trimmedUsername;
    }
    if (avatarUrl) {
      setParts.push("u.avatarUrl=$avatarUrl");
      params.avatarUrl = avatarUrl;
    }

    if (setParts.length === 0) {
      return res.status(400).json({ error: "No updatable fields provided" });
    }

    const query = `MATCH (u:User {id:$id}) SET ${setParts.join(", ")} RETURN u`;
    console.log("🔍 Query:", query);
    console.log("🔍 Params:", params);

    const result = await session.run(query, params);
    console.log("📊 Records:", result.records.length);

    if (result.records.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.records[0].get("u").properties;
    delete user.passwordHash;
    console.log("✅ Updated user:", user);
    res.json(user);
  } catch (error) {
    console.error("❌ Test update error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Cập nhật hồ sơ
router.put("/update", verifyToken, async (req, res) => {
  // Accept displayName and avatarUrl per spec
  const { displayName, avatarUrl } = req.body;
  console.log("🔧 PUT /users/update called:", {
    displayName,
    avatarUrl,
    userId: req.userId,
    body: req.body,
  });
  const session = driver.session();
  try {
    // Build SET clause only for allowed fields
    const setParts = [];
    const params = { id: req.userId };

    // Allow displayName update
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
      console.log("❌ No fields to update");
      return res.status(400).json({ error: "No updatable fields provided" });
    }

    const result = await session.run(
      `MATCH (u:User {id:$id}) SET ${setParts.join(", ")} RETURN u`,
      params
    );
    console.log(
      "✅ Cypher executed:",
      `MATCH (u:User {id:$id}) SET ${setParts.join(", ")} RETURN u`
    );
    console.log("📊 Query result records:", result.records.length);

    if (result.records.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.records[0].get("u").properties;
    delete user.passwordHash;
    console.log("🎯 Returning updated user:", user);
    res.json(user);
  } catch (error) {
    console.error("❌ Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  } finally {
    await session.close();
  }
});

// Đổi mật khẩu
router.put("/change-password", verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "Current password and new password are required" });
  }

  if (newPassword.length < 5) {
    return res
      .status(400)
      .json({ error: "New password must be at least 5 characters" });
  }

  const session = driver.session();
  try {
    // Get current user
    const userResult = await session.run(`MATCH (u:User {id:$id}) RETURN u`, {
      id: req.userId,
    });

    if (userResult.records.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.records[0].get("u").properties;

    // Verify current password (hiện tại lưu plaintext)
    // TODO: Sau này nên hash password khi đăng ký
    if (currentPassword !== user.password) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    // Update password (vẫn lưu plaintext để consistency)
    // TODO: Nên hash password trong tương lai
    await session.run(`MATCH (u:User {id:$id}) SET u.password=$password`, {
      id: req.userId,
      password: newPassword,
    });

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  } finally {
    await session.close();
  }
});

// Upload avatar
router.post(
  "/upload-avatar",
  verifyToken,
  upload.single("avatar"),
  async (req, res) => {
    const filePath = `/uploads/${req.file.filename}`;
    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (u:User {id:$id}) SET u.avatarUrl=$avatarUrl RETURN u`,
        { id: req.userId, avatarUrl: filePath }
      );

      if (result.records.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = result.records[0].get("u").properties;
      delete user.passwordHash;
      res.json({ avatarUrl: filePath, user });
    } finally {
      await session.close();
    }
  }
);

// Follow user
router.post("/follow/:userId", verifyToken, async (req, res) => {
  const session = driver.session();
  try {
    await session.run(
      `
      MATCH (a:User {id:$followerId}), (b:User {id:$followingId})
      WHERE a <> b
      MERGE (a)-[:FOLLOWS]->(b)
      `,
      { followerId: req.userId, followingId: req.params.userId }
    );
    res.json({ message: "User followed successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to follow user" });
  } finally {
    await session.close();
  }
});

// Unfollow user
router.delete("/follow/:userId", verifyToken, async (req, res) => {
  const session = driver.session();
  try {
    await session.run(
      `
      MATCH (a:User {id:$followerId})-[r:FOLLOWS]->(b:User {id:$followingId})
      DELETE r
      `,
      { followerId: req.userId, followingId: req.params.userId }
    );
    res.json({ message: "User unfollowed successfully" });
  } finally {
    await session.close();
  }
});

export default router;
