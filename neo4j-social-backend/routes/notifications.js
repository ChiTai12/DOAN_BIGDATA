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
            , n.read AS read
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
        read: r.get("read") === true,
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

// POST /notifications/mark-read - mark notifications as read
router.post("/mark-read", verifyToken, async (req, res) => {
  const session = driver.session();
  try {
    const userId = req.userId; // Fix: use req.userId not req.user.userId
    const { notificationId } = req.body;

    let query, params;

    if (notificationId) {
      // Mark specific notification as read
      query = `
        MATCH (u:User {id: $userId})-[:HAS_NOTIFICATION]->(n:Notification {id: $notificationId})
        SET n.read = true
        RETURN count(n) as updated
      `;
      params = { userId, notificationId };
    } else {
      // Mark all notifications as read for user
      query = `
        MATCH (u:User {id: $userId})-[:HAS_NOTIFICATION]->(n:Notification)
        SET n.read = true
        RETURN count(n) as updated
      `;
      params = { userId };
    }

    const result = await session.run(query, params);
    const updated = result.records[0]?.get("updated") || 0;

    // Additionally: handle orphaned notifications that reference posts authored by user
    // Some notifications may not have HAS_NOTIFICATION relationship but have postId
    try {
      const orphanQ = `
        MATCH (u:User {id: $userId})-[:POSTED]->(p:Post)
        MATCH (n:Notification {postId: p.id})
        WHERE n.read IS NULL OR n.read = false
        SET n.read = true
        WITH count(n) as orphanUpdated, collect(n.id) as ids
        RETURN orphanUpdated, ids
      `;
      const orphanRes = await session.run(orphanQ, { userId });
      const orphanUpdated = orphanRes.records[0]?.get("orphanUpdated") || 0;
      if (orphanUpdated > 0) {
        console.log(
          `Also marked ${orphanUpdated} orphaned notifications as read for user=${userId}`
        );
      }
    } catch (e) {
      console.warn("Failed to mark orphaned notifications as read", e);
    }

    console.log(`Marked ${updated} notifications as read for user=${userId}`);

    res.json({
      success: true,
      updated: updated.toNumber ? updated.toNumber() : updated,
    });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    res.status(500).json({ error: "Failed to mark notifications as read" });
  } finally {
    await session.close();
  }
});

// POST /notifications/clear-all - triệt để clear all notifications for user
router.post("/clear-all", verifyToken, async (req, res) => {
  const session = driver.session();
  try {
    const userId = req.userId;

    console.log(
      `🔥 TRIỆT ĐỂ CLEAR: Clearing all notifications for user=${userId}`
    );

    // Step 1: Mark ALL notifications as read for this user
    const markAllResult = await session.run(
      `
      MATCH (u:User {id: $userId})-[:HAS_NOTIFICATION]->(n:Notification)
      SET n.read = true
      RETURN count(n) as marked
    `,
      { userId }
    );

    const markedCount = markAllResult.records[0]?.get("marked") || 0;

    // Step 2: Delete ALL notifications to prevent future issues
    const deleteResult = await session.run(
      `
      MATCH (u:User {id: $userId})-[:HAS_NOTIFICATION]->(n:Notification)
      DETACH DELETE n
      RETURN count(n) as deleted
    `,
      { userId }
    );

    const deletedCount = deleteResult.records[0]?.get("deleted") || 0;

    console.log(`✅ Marked ${markedCount} notifications as read`);
    console.log(`🗑️ Deleted ${deletedCount} notifications`);

    res.json({
      success: true,
      marked: markedCount.toNumber ? markedCount.toNumber() : markedCount,
      deleted: deletedCount.toNumber ? deletedCount.toNumber() : deletedCount,
      message: "All notifications cleared successfully",
    });
  } catch (error) {
    console.error("Error clearing notifications:", error);
    res.status(500).json({ error: "Failed to clear notifications" });
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
