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
    const result = await session.run(
      `MATCH (u:User {username:$username}) RETURN u LIMIT 1`,
      { username }
    );
    if (result.records.length === 0)
      return res.status(404).json({ error: "User not found" });

    const user = result.records[0].get("u").properties;

    // So sánh plaintext password
    if (password !== user.password) {
      return res.status(401).json({ error: "Wrong password" });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
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
