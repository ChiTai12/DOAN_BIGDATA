import express from "express";
import multer from "multer";
import path from "path";
import driver from "../db/driver.js";
import requireUser from "../middleware/requireUser.js";
import { verifyToken } from "../middleware/auth.js";
import requireAdmin from "../middleware/requireAdmin.js";

const router = express.Router();

// Get all users (for messenger dropdown / admin list)
// Use verifyToken so both regular users and admins (for admin UI) can access this endpoint.
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
      LIMIT 50
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

// Get current authenticated user
router.get("/me", requireUser, async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User {id:$id}) RETURN u LIMIT 1`,
      { id: req.userId }
    );
    if (result.records.length === 0)
      return res.status(404).json({ error: "User not found" });

    const user = result.records[0].get("u").properties;
    // strip sensitive fields
    delete user.passwordHash;
    delete user.password;
    res.json(user);
  } catch (error) {
    console.error("Failed to fetch current user:", error);
    res.status(500).json({ error: "Failed to fetch current user" });
  } finally {
    await session.close();
  }
});

// Get list of user ids that the current user is following
router.get("/following", requireUser, async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User {id:$id})-[:FOLLOWS]->(f:User) RETURN f.id AS id`,
      { id: req.userId }
    );
    const ids = result.records.map((r) => r.get("id"));
    res.json({ following: ids });
  } catch (error) {
    console.error("Failed to fetch following list", error);
    res.status(500).json({ error: "Failed to fetch following list" });
  } finally {
    await session.close();
  }
});

// Get list of user ids that follow the current user
router.get("/followers", requireUser, async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (f:User)-[:FOLLOWS]->(u:User {id:$id}) RETURN f.id AS id`,
      { id: req.userId }
    );
    const ids = result.records.map((r) => r.get("id"));
    res.json({ followers: ids });
  } catch (error) {
    console.error("Failed to fetch followers list", error);
    res.status(500).json({ error: "Failed to fetch followers list" });
  } finally {
    await session.close();
  }
});

// Get full profile objects for both following and followers (for Connections UI)
router.get("/connections", requireUser, async (req, res) => {
  const session = driver.session();
  try {
    // Users the current user is following
    const followingResult = await session.run(
      `MATCH (u:User {id:$id})-[:FOLLOWS]->(f:User) RETURN f ORDER BY f.username`,
      { id: req.userId }
    );

    const following = followingResult.records.map((r) => {
      const user = r.get("f").properties;
      // Remove sensitive/internal fields
      delete user.passwordHash;
      delete user.password;
      return user;
    });

    // Users who follow the current user
    const followersResult = await session.run(
      `MATCH (f:User)-[:FOLLOWS]->(u:User {id:$id}) RETURN f ORDER BY f.username`,
      { id: req.userId }
    );

    const followers = followersResult.records.map((r) => {
      const user = r.get("f").properties;
      delete user.passwordHash;
      delete user.password;
      return user;
    });

    res.json({ following, followers });
  } catch (error) {
    console.error("Failed to fetch connections", error);
    res.status(500).json({ error: "Failed to fetch connections" });
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
router.put("/test-update/:userId", requireUser, async (req, res) => {
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
    // Emit user:updated so other clients receive the change in real-time (useful for testing)
    try {
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) io.emit("user:updated", { user });
    } catch (emitErr) {
      console.warn(
        "Failed to emit user:updated from test-update route",
        emitErr
      );
    }

    res.json(user);
  } catch (error) {
    console.error("❌ Test update error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.close();
  }
});

// Cập nhật hồ sơ
router.put("/update", requireUser, async (req, res) => {
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
    // Emit real-time update so other connected clients can refresh cached profiles
    try {
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) {
        io.emit("user:updated", { user });
      }
    } catch (emitErr) {
      console.warn("Failed to emit user:updated", emitErr);
    }

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
router.put("/change-password", requireUser, async (req, res) => {
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
  requireUser,
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
      // Emit user update so other connected clients refresh profile in real-time
      try {
        const io = req.app && req.app.locals && req.app.locals.io;
        if (io) io.emit("user:updated", { user });
      } catch (emitErr) {
        console.warn(
          "Failed to emit user:updated after avatar upload",
          emitErr
        );
      }

      res.json({ avatarUrl: filePath, user });
    } finally {
      await session.close();
    }
  }
);

// Follow user
router.post("/follow/:userId", requireUser, async (req, res) => {
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
    // emit socket events to notify both parties (if socket is configured)
    try {
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) {
        // notify the followed user that they have a new follower
        io.to(req.params.userId).emit("user:follow", {
          followerId: req.userId,
          followingId: req.params.userId,
        });
        // also send a full connections update for the followed user so their UI
        // can update immediately without having to re-query
        try {
          const conRes1 = await session.run(
            `MATCH (u:User {id:$id})-[:FOLLOWS]->(f:User) RETURN f ORDER BY f.username`,
            { id: req.params.userId }
          );
          const followingList = conRes1.records.map((r) => {
            const userObj = r.get("f").properties;
            delete userObj.passwordHash;
            delete userObj.password;
            return userObj;
          });
          const conRes2 = await session.run(
            `MATCH (f:User)-[:FOLLOWS]->(u:User {id:$id}) RETURN f ORDER BY f.username`,
            { id: req.params.userId }
          );
          const followersList = conRes2.records.map((r) => {
            const userObj = r.get("f").properties;
            delete userObj.passwordHash;
            delete userObj.password;
            return userObj;
          });
          io.to(req.params.userId).emit("connections:update", {
            targetId: req.params.userId,
            following: followingList,
            followers: followersList,
          });
        } catch (qErr) {
          console.warn("Failed to build connections payload for follow", qErr);
        }
        // notify the actor that their following list changed
        io.to(req.userId).emit("user:follow:ack", {
          followerId: req.userId,
          followingId: req.params.userId,
        });
      }
    } catch (emitErr) {
      console.warn("Failed to emit follow socket event", emitErr);
    }

    res.json({ message: "User followed successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to follow user" });
  } finally {
    await session.close();
  }
});

// Unfollow user
router.delete("/follow/:userId", requireUser, async (req, res) => {
  const session = driver.session();
  try {
    await session.run(
      `
      MATCH (a:User {id:$followerId})-[r:FOLLOWS]->(b:User {id:$followingId})
      DELETE r
      `,
      { followerId: req.userId, followingId: req.params.userId }
    );
    try {
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) {
        // notify the user who was unfollowed
        io.to(req.params.userId).emit("user:unfollow", {
          followerId: req.userId,
          followingId: req.params.userId,
        });
        // also send full connections update for the user who was unfollowed
        try {
          const conRes1 = await session.run(
            `MATCH (u:User {id:$id})-[:FOLLOWS]->(f:User) RETURN f ORDER BY f.username`,
            { id: req.params.userId }
          );
          const followingList = conRes1.records.map((r) => {
            const userObj = r.get("f").properties;
            delete userObj.passwordHash;
            delete userObj.password;
            return userObj;
          });
          const conRes2 = await session.run(
            `MATCH (f:User)-[:FOLLOWS]->(u:User {id:$id}) RETURN f ORDER BY f.username`,
            { id: req.params.userId }
          );
          const followersList = conRes2.records.map((r) => {
            const userObj = r.get("f").properties;
            delete userObj.passwordHash;
            delete userObj.password;
            return userObj;
          });
          io.to(req.params.userId).emit("connections:update", {
            targetId: req.params.userId,
            following: followingList,
            followers: followersList,
          });
        } catch (qErr) {
          console.warn(
            "Failed to build connections payload for unfollow",
            qErr
          );
        }
        // notify the actor that their following list changed
        io.to(req.userId).emit("user:unfollow:ack", {
          followerId: req.userId,
          followingId: req.params.userId,
        });
      }
    } catch (emitErr) {
      console.warn("Failed to emit unfollow socket event", emitErr);
    }

    res.json({ message: "User unfollowed successfully" });
  } finally {
    await session.close();
  }
});

// Remove a follower (delete relation from :userId -> current user)
router.delete("/remove-follower/:userId", requireUser, async (req, res) => {
  const session = driver.session();
  try {
    await session.run(
      `MATCH (a:User {id:$followerId})-[r:FOLLOWS]->(b:User {id:$currentId}) DELETE r`,
      { followerId: req.params.userId, currentId: req.userId }
    );

    // emit events to notify both parties and provide updated connections
    try {
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) {
        // notify the removed follower that they were unfollowed (they no longer follow current user)
        io.to(req.params.userId).emit("user:unfollow", {
          followerId: req.params.userId,
          followingId: req.userId,
        });

        // send connections update to the removed follower
        try {
          const conResA = await session.run(
            `MATCH (u:User {id:$id})-[:FOLLOWS]->(f:User) RETURN f ORDER BY f.username`,
            { id: req.params.userId }
          );
          const followingListA = conResA.records.map((r) => {
            const userObj = r.get("f").properties;
            delete userObj.passwordHash;
            delete userObj.password;
            return userObj;
          });
          const conResB = await session.run(
            `MATCH (f:User)-[:FOLLOWS]->(u:User {id:$id}) RETURN f ORDER BY f.username`,
            { id: req.params.userId }
          );
          const followersListA = conResB.records.map((r) => {
            const userObj = r.get("f").properties;
            delete userObj.passwordHash;
            delete userObj.password;
            return userObj;
          });
          io.to(req.params.userId).emit("connections:update", {
            targetId: req.params.userId,
            following: followingListA,
            followers: followersListA,
          });
        } catch (qErr) {
          console.warn(
            "Failed to build connections payload for removed follower",
            qErr
          );
        }

        // send connections update to current user as well
        try {
          const conRes1 = await session.run(
            `MATCH (u:User {id:$id})-[:FOLLOWS]->(f:User) RETURN f ORDER BY f.username`,
            { id: req.userId }
          );
          const followingList = conRes1.records.map((r) => {
            const userObj = r.get("f").properties;
            delete userObj.passwordHash;
            delete userObj.password;
            return userObj;
          });
          const conRes2 = await session.run(
            `MATCH (f:User)-[:FOLLOWS]->(u:User {id:$id}) RETURN f ORDER BY f.username`,
            { id: req.userId }
          );
          const followersList = conRes2.records.map((r) => {
            const userObj = r.get("f").properties;
            delete userObj.passwordHash;
            delete userObj.password;
            return userObj;
          });
          io.to(req.userId).emit("connections:update", {
            targetId: req.userId,
            following: followingList,
            followers: followersList,
          });
        } catch (qErr) {
          console.warn(
            "Failed to build connections payload for current user after removing follower",
            qErr
          );
        }
      }
    } catch (emitErr) {
      console.warn("Failed to emit remove-follower socket event", emitErr);
    }

    res.json({ message: "Follower removed successfully" });
  } catch (error) {
    console.error("Failed to remove follower", error);
    res.status(500).json({ error: "Failed to remove follower" });
  } finally {
    await session.close();
  }
});

export default router;

// Admin endpoint: update a user's status (active|locked)
// Example: PATCH /users/status/7b955a62-6f1c-4623-a3cf-a4b5be44045a { status: 'locked' }
router.patch("/status/:userId", requireAdmin, async (req, res) => {
  const { status } = req.body;
  const allowed = ["active", "locked"];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User {id:$id}) SET u.status=$status RETURN u`,
      { id: req.params.userId, status }
    );
    if (result.records.length === 0)
      return res.status(404).json({ error: "User not found" });

    const user = result.records[0].get("u").properties;
    delete user.passwordHash;
    delete user.password;

    // emit event
    try {
      const io = req.app && req.app.locals && req.app.locals.io;
      if (io) io.emit("user:status:updated", { userId: user.id, status });
    } catch (e) {
      console.warn("Failed to emit user:status:updated", e);
    }

    res.json({ user });
  } catch (error) {
    console.error("Failed to update user status", error);
    res.status(500).json({ error: "Failed to update status" });
  } finally {
    await session.close();
  }
});
