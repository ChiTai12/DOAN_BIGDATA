import express from "express";
import driver from "../db/driver.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// GET /notifications - return notifications for the logged in user
router.get("/", verifyToken, async (req, res) => {
  const session = driver.session();
  try {
    // Try to return persisted Notification nodes (if any). If Notification.fromName is missing
    // we resolve it from the user node.
    const q = `
      MATCH (me:User {id:$userId})
      OPTIONAL MATCH (me)-[:HAS_NOTIFICATION]->(n:Notification)-[:ABOUT]->(p:Post)
      OPTIONAL MATCH (from:User) WHERE n.fromUserId IS NOT NULL AND from.id = n.fromUserId
      WITH n, p, from
      WHERE n IS NOT NULL
      RETURN n.id AS id, n.type AS type, n.message AS message,
             coalesce(n.fromName, from.displayName, from.username) AS fromName,
             n.fromUserId AS fromUserId, p.id AS postId, n.createdAt AS createdAt
      ORDER BY n.createdAt DESC
      LIMIT 100
    `;

    const result = await session.run(q, { userId: req.userId });
    if (result.records.length > 0) {
      const notifications = result.records.map((r) => ({
        id: r.get("id"),
        type: r.get("type"),
        message: r.get("message"),
        fromName: r.get("fromName"),
        fromUserId: r.get("fromUserId"),
        postId: r.get("postId"),
        createdAt: r.get("createdAt") || Date.now(),
      }));
      return res.json(notifications);
    }

    // Fallback: if there are no persisted Notification nodes, synthesize notifications
    // from recent likes on the user's posts (so the UI still shows names).
    const fallbackQ = `
      MATCH (me:User {id:$userId})<-[:POSTED]-(p:Post)<-[:LIKES]-(liker:User)
      RETURN liker.id AS fromUserId, coalesce(liker.displayName, liker.username) AS fromName, p.id AS postId, timestamp() AS createdAt
      ORDER BY createdAt DESC
      LIMIT 100
    `;
    const fb = await session.run(fallbackQ, { userId: req.userId });
    const synthetic = fb.records.map((r) => ({
      id: `${r.get("fromUserId")}-${r.get("postId")}`,
      type: "like",
      message: `${r.get("fromName")} liked your post`,
      fromName: r.get("fromName"),
      fromUserId: r.get("fromUserId"),
      postId: r.get("postId"),
      createdAt: r.get("createdAt") || Date.now(),
    }));
    return res.json(synthetic);
  } catch (err) {
    console.error("Failed to load notifications", err);
    res.status(500).json({ error: "Failed to load notifications" });
  } finally {
    await session.close();
  }
});

// DEV helper: list all Notification nodes (no auth) to help debug persisted data
router.get("/all", async (req, res) => {
  const session = driver.session();
  try {
    const q = `MATCH (n:Notification) OPTIONAL MATCH (n)-[:ABOUT]->(p:Post) RETURN n, p LIMIT 200`;
    const result = await session.run(q);
    const list = result.records.map((r) => ({
      ...r.get("n").properties,
      postId: r.get("p") ? r.get("p").properties.id : null,
    }));
    res.json(list);
  } catch (err) {
    console.error("Failed to fetch all notifications", err);
    res.status(500).json({ error: "failed" });
  } finally {
    await session.close();
  }
});

export default router;
