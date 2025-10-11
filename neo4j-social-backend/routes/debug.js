import express from "express";

const router = express.Router();

// DEV ONLY: emit a notification to a given user id (no auth)
router.post("/emit-notif", (req, res) => {
  try {
    const io = req.app && req.app.locals && req.app.locals.io;
    if (!io) return res.status(500).json({ error: "No io present" });
    const { toUserId, payload } = req.body;
    if (!toUserId || !payload)
      return res.status(400).json({ error: "toUserId and payload required" });
    io.to(toUserId).emit("notification:new", payload);
    return res.json({ success: true });
  } catch (e) {
    console.error("Debug emit failed", e);
    return res.status(500).json({ error: "emit failed" });
  }
});

export default router;
