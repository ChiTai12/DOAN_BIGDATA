import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import postRoutes from "./routes/posts.js";
import messageRoutes from "./routes/messages.js";
import notificationRoutes from "./routes/notifications.js";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import driver from "./db/driver.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Add simple logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// Cho phép truy cập ảnh trong thư mục uploads/
app.use("/uploads", express.static("uploads"));

app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/posts", postRoutes);
app.use("/messages", messageRoutes);
app.use("/notifications", notificationRoutes);

app.get("/", (req, res) => res.send("✅ Neo4j social backend running"));

// Endpoint test kết nối Neo4j
app.get("/test-db", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      "RETURN 'Kết nối Neo4j thành công!' as message, datetime() as timestamp"
    );
    const record = result.records[0];
    res.json({
      status: "success",
      message: record.get("message"),
      timestamp: record.get("timestamp").toString(),
      neo4j_uri: process.env.NEO4J_URI,
    });
  } catch (error) {
    console.error("Neo4j connection error:", error);
    res.status(500).json({
      status: "error",
      message: "Không thể kết nối Neo4j",
      error: error.message,
    });
  } finally {
    await session.close();
  }
});

const PORT = process.env.PORT || 5000;

// Create HTTP server and attach Socket.IO
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
});

// Simple auth for sockets via token in query
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error("Authentication error"));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.userId || payload.id;
    return next();
  } catch (err) {
    return next(new Error("Authentication error"));
  }
});

// Map userId -> socket ids (in-memory)
const userSockets = new Map();

io.on("connection", (socket) => {
  const uid = socket.userId;
  if (!userSockets.has(uid)) userSockets.set(uid, new Set());
  userSockets.get(uid).add(socket.id);
  // join room for userId for easy emits
  socket.join(uid);
  console.log(`Socket connected: user=${uid} socketId=${socket.id}`);

  socket.on("disconnect", () => {
    const set = userSockets.get(uid);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) userSockets.delete(uid);
    }
    console.log(`Socket disconnected: user=${uid} socketId=${socket.id}`);
  });

  // allow emitting to a user
  socket.on("message:send", (payload, ack) => {
    // payload: {convId?, toUserId, text}
    // We'll let routes/messages handle persistence; emit event here for quick prototyping
    // In production, you'd persist then emit.
    if (payload.toUserId) {
      // emit to room named by user id
      io.to(payload.toUserId).emit("message:new", payload);
      console.log(
        `Emitted message:new to user=${payload.toUserId} from=${socket.userId}`
      );
    }
    if (ack) ack({ status: "ok" });
  });
});

// expose io so routes can emit
app.locals.io = io;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server successfully running on http://localhost:${PORT}`);
});

httpServer.on("error", (err) => {
  console.error("❌ Server error:", err);
});
