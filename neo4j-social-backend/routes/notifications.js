import express from "express";
import driver from "../db/driver.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// GET /notifications - return notifications for the logged in user
router.get("/", verifyToken, async (req, res) => {
  console.log(`🔔 GET /notifications requested by user=${req.userId}`);
  const session = driver.session();
  try {
    // Try to return persisted Notification nodes (if any). If Notification.fromName is missing
    // we resolve it from the user node.
    // Return notifications linked directly to the user via HAS_NOTIFICATION
    // and also include "orphaned" notifications that reference this user's posts
    // (some Notification nodes in the wild may not have HAS_NOTIFICATION relationships)
    // Simpler approach: run two smaller queries and combine in JS to avoid union parsing issues
    try {
      const params = { userId: req.userId };
      console.log("Running notifications queries with params:", params);

      const qA = `
        MATCH (me:User {id:$userId})-[:HAS_NOTIFICATION]->(n:Notification)
        OPTIONAL MATCH (n)-[:ABOUT]->(p:Post)
        OPTIONAL MATCH (from:User) WHERE n.fromUserId IS NOT NULL AND from.id = n.fromUserId
        WITH me, n, p, from
        WHERE n IS NOT NULL
          AND NOT (n.fromUserId IS NOT NULL AND n.fromUserId = $userId)
          AND NOT (coalesce(n.fromName, '') IN [coalesce(me.displayName, ''), coalesce(me.username, '')])
        RETURN n.id AS id, n.type AS type, n.message AS message,
          coalesce(n.fromName, from.displayName, from.username) AS fromName,
          n.fromUserId AS fromUserId, p.id AS postId, n.commentId AS commentId, n.threadId AS threadId, n.commentText AS commentText, n.createdAt AS createdAt,
          n.read AS read
      `;

      const qB = `
        MATCH (me2:User {id:$userId})-[:POSTED]->(p2:Post)<-[:ABOUT]-(n2:Notification)
        OPTIONAL MATCH (from2:User) WHERE n2.fromUserId IS NOT NULL AND from2.id = n2.fromUserId
        WITH me2, n2, p2, from2
        WHERE NOT (n2.fromUserId IS NOT NULL AND n2.fromUserId = $userId)
          AND NOT (coalesce(n2.fromName, '') IN [coalesce(me2.displayName, ''), coalesce(me2.username, '')])
        RETURN n2.id AS id, n2.type AS type, n2.message AS message,
          coalesce(n2.fromName, from2.displayName, from2.username) AS fromName,
          n2.fromUserId AS fromUserId, p2.id AS postId, n2.commentId AS commentId, n2.threadId AS threadId, n2.commentText AS commentText, n2.createdAt AS createdAt,
          n2.read AS read
      `;

      const resA = await session.run(qA, params);
      const resB = await session.run(qB, params);

      const records = [...resA.records, ...resB.records];
      if (records.length > 0) {
        const notifications = records.map((r) => {
          const rawCreated = r.get("createdAt");
          let ts = null;
          try {
            if (
              rawCreated != null &&
              typeof rawCreated === "object" &&
              typeof rawCreated.toNumber === "function"
            ) {
              ts = rawCreated.toNumber();
            } else if (rawCreated != null) {
              const num = Number(rawCreated);
              if (!Number.isNaN(num) && Number.isFinite(num)) ts = num;
            }
          } catch (e) {
            ts = null;
          }
          return {
            id: r.get("id"),
            type: r.get("type"),
            message: r.get("message"),
            fromName: r.get("fromName"),
            fromUserId: r.get("fromUserId"),
            postId: r.get("postId"),
            commentId: r.get("commentId"),
            threadId: r.get("threadId"),
            commentText: r.get("commentText"),
            createdAt: rawCreated == null ? null : rawCreated,
            timestamp: ts,
            timeString: ts ? new Date(ts).toLocaleString("vi-VN") : null,
            read: r.get("read") === true,
          };
        });

        notifications.sort((a, b) => {
          if (a.timestamp == null && b.timestamp == null) return 0;
          if (a.timestamp == null) return 1;
          if (b.timestamp == null) return -1;
          return Number(b.timestamp) - Number(a.timestamp);
        });

        return res.json(notifications.slice(0, 100));
      }
    } catch (qerr) {
      console.error("Notifications queries failed");
      try {
        console.error("Query error:", qerr.stack || qerr);
      } catch (e) {}
      throw qerr;
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
      commentId: null,
      threadId: null,
      commentText: null,
      createdAt: r.get("createdAt") || null,
    }));
    const normalized = synthetic.map((n) => ({
      ...n,
      timestamp: n.createdAt
        ? typeof n.createdAt === "object" &&
          typeof n.createdAt.toNumber === "function"
          ? n.createdAt.toNumber()
          : Number(n.createdAt)
        : null,
    }));
    normalized.sort(
      (a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0)
    );
    return res.json(normalized.slice(0, 100));
  } catch (err) {
    console.error("Failed to load notifications", err);
    try {
      console.error(err.stack || err);
    } catch (e) {}
    // For debugging return error details (temporary)
    return res.status(500).json({
      error: "Failed to load notifications",
      detail: err.stack || err.message || String(err),
    });
  } finally {
    await session.close();
  }
});

// POST /notifications/mark-read - mark notifications as read
router.post("/mark-read", verifyToken, async (req, res) => {
  const session = driver.session();
  try {
    const userId = req.userId; // Fix: use req.userId not req.user.userId
    const { notificationId, notificationIds } = req.body;

    let query, params;

    if (Array.isArray(notificationIds) && notificationIds.length > 0) {
      // Mark specific notifications by id (array)
      query = `
        MATCH (u:User {id: $userId})-[:HAS_NOTIFICATION]->(n:Notification)
        WHERE n.id IN $ids
        SET n.read = true
        RETURN count(n) as updated
      `;
      params = { userId, ids: notificationIds };
    } else if (notificationId) {
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
    let updated = result.records[0]?.get("updated") || 0;

    // If we didn't update any via HAS_NOTIFICATION, try to mark the specific
    // notification(s) by id if they reference a post authored by this user.
    try {
      const prevUpdated =
        updated && (updated.toNumber ? updated.toNumber() : updated);
      if (
        (prevUpdated === 0 || !prevUpdated) &&
        (notificationId ||
          (Array.isArray(notificationIds) && notificationIds.length > 0))
      ) {
        // build list of ids to try matching by post author
        const idsToTry = notificationId ? [notificationId] : notificationIds;
        const orphanByIdsQ = `
          MATCH (u:User {id: $userId})-[:POSTED]->(p:Post)
          MATCH (n:Notification)
          WHERE n.id IN $ids AND n.postId = p.id
          SET n.read = true
          RETURN count(n) AS updated
        `;
        const orphanRes = await session.run(orphanByIdsQ, {
          userId,
          ids: idsToTry,
        });
        const orphanUpdated = orphanRes.records[0]?.get("updated") || 0;
        const orphanCount =
          (orphanUpdated &&
            (orphanUpdated.toNumber
              ? orphanUpdated.toNumber()
              : orphanUpdated)) ||
          0;
        updated = (prevUpdated || 0) + orphanCount;
        if (orphanCount > 0) {
          console.log(
            `Also marked ${orphanCount} orphaned notifications as read for user=${userId} (by ids)`
          );
        }
      }
    } catch (e) {
      console.warn("Failed to mark orphaned notification by id as read", e);
    }

    const updatedCount =
      (updated && (updated.toNumber ? updated.toNumber() : updated)) || 0;
    console.log(
      `Marked ${updatedCount} notifications as read for user=${userId}`
    );

    res.json({
      success: true,
      updated: updatedCount,
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
