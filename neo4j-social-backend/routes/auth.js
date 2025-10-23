import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import driver from "../db/driver.js";

const router = express.Router();

// Test route
router.get("/test", (req, res) => {
  res.json({ message: "Auth routes working" });
});

// Đăng ký
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, displayName, fullName } = req.body;

    // Sử dụng displayName làm fullName nếu không có fullName
    const finalDisplayName = displayName || fullName || username;
    const finalFullName = fullName || displayName || username;

    console.log("📝 Registration request:", {
      username,
      email,
      displayName: finalDisplayName,
      fullName: finalFullName,
    });

    if (!username || !password) {
      return res.status(400).json({ error: "Missing username or password" });
    }

    const session = driver.session();
    const id = uuidv4();

    try {
      await session.run(
        `
        CREATE (u:User {
          id:$id,
          username:$username,
          email:$email,
          password:$password,
          displayName:$displayName,
          fullName:$fullName,
          avatarUrl:'',
          bio:'',
          status:$status,
          createdAt: timestamp()
        })
        RETURN u
        `,
        {
          id,
          username,
          email,
          password,
          displayName: finalDisplayName,
          fullName: finalFullName,
          status: "active",
        }
      );

      console.log("✅ User registered successfully:", username);
      // Build returned user object (avoid sensitive fields)
      const newUser = {
        id,
        username,
        email,
        displayName: finalDisplayName,
        fullName: finalFullName,
        avatarUrl: "",
        status: "active",
      };

      // Emit real-time event so other clients can update suggestions immediately
      try {
        const io = req.app && req.app.locals && req.app.locals.io;
        if (io) {
          console.log(
            "Emitting user:created for new user:",
            newUser.username,
            newUser.id
          );
          io.emit("user:created", { user: newUser });
          // Also notify dashboards to refresh stats (new user count)
          try {
            io.emit("stats:update");
          } catch (e) {
            console.warn("Failed to emit stats:update after user:created", e);
          }
        }
      } catch (emitErr) {
        console.warn(
          "Failed to emit user:created from register route",
          emitErr
        );
      }

      res.json({ message: "User registered successfully", user: newUser });
    } catch (dbErr) {
      console.error("❌ Database error:", dbErr);
      res.status(500).json({ error: "Database error: " + dbErr.message });
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ error: "Registration failed: " + err.message });
  }
});

// Đăng nhập
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  console.log("🔑 Login request:", { username });
  const session = driver.session();

  try {
    // Prefer Admin node when username exists on both labels.
    // First try Admin, then fallback to User.
    let result = await session.run(
      `MATCH (u:Admin {username:$username}) RETURN u LIMIT 1`,
      { username }
    );
    if (result.records.length === 0) {
      result = await session.run(
        `MATCH (u:User {username:$username}) RETURN u LIMIT 1`,
        { username }
      );
    }

    console.log("🔍 Auth query result records:", result.records.length);
    if (result.records.length === 0) {
      console.warn(`Auth: user not found for username=${username}`);
      return res.status(404).json({ error: "User not found" });
    }

    const node = result.records[0].get("u");
    try {
      console.log(
        "🔍 Auth: found node labels:",
        node.labels,
        "properties:",
        node.properties
      );
    } catch (e) {
      // some driver versions return plain object
      console.log("🔍 Auth: found node (raw):", node);
    }

    const user = node.properties || {};
    const labels = node.labels || [];
    // Ưu tiên property role nếu có, fallback về label
    let role = "user";
    if (user.role && String(user.role).toLowerCase() === "admin") {
      role = "admin";
    } else if (labels.includes("Admin")) {
      role = "admin";
    }

    // Plaintext password comparison (kept for compatibility with current DB)
    if (password !== user.password) {
      return res.status(401).json({ error: "Wrong password" });
    }

    // Check account status
    if (user.status && String(user.status).toLowerCase() !== "active") {
      console.warn(
        `Auth: login attempt for non-active user=${user.id} status=${user.status}`
      );
      return res.status(403).json({ error: "Account is not active" });
    }

    const token = jwt.sign({ userId: user.id, role }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Sanity check: decode the token we just created and ensure it contains
    // the expected userId/role before returning it to the client.
    try {
      const verified = jwt.verify(token, process.env.JWT_SECRET);
      console.log("Auth: token payload after sign:", verified);
      if (String(verified.userId) !== String(user.id)) {
        console.error(
          "Auth: token userId does not match user.id — aborting login",
          { tokenPayload: verified, userId: user.id }
        );
        return res.status(500).json({ error: "Token generation mismatch" });
      }
    } catch (verifyErr) {
      console.error("Auth: failed to verify token after signing:", verifyErr);
      return res.status(500).json({ error: "Token verification failed" });
    }

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  } finally {
    await session.close();
  }
});

export default router;
