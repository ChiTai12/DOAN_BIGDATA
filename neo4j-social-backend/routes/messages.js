import express from "express";
import driver from "../db/driver.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// Helper: find or create a 1-on-1 conversation id between two users
async function ensureConversation(session, userA, userB) {
  const convId = [userA, userB].sort().join("-");

  console.log(
    `🔍 ensureConversation: userA=${userA}, userB=${userB}, convId=${convId}`
  );

  try {
    // Create conversation and link users
    await session.run(
      `
      MATCH (ua:User {id:$userA}), (ub:User {id:$userB})
      MERGE (c:Conversation {id:$convId, type:'dm'})
      MERGE (ua)-[:PARTICIPATES_IN]->(c)
      MERGE (ub)-[:PARTICIPATES_IN]->(c)
      `,
      { convId, userA, userB }
    );

    console.log(`✅ Conversation ensured: ${convId}`);
    return convId;
  } catch (error) {
    console.error(`❌ ensureConversation failed:`, error.message);
    throw error;
  }
}

// Send message (create conversation if needed)
router.post("/send", verifyToken, async (req, res) => {
  console.log(
    `🚨 API /messages/send called! From: ${req.userId} To: ${req.body.toUserId}`
  );

  const { toUserId, text } = req.body;
  if (!toUserId || !text)
    return res.status(400).json({ error: "toUserId and text required" });

  const session = driver.session();
  try {
    const convId = await ensureConversation(session, req.userId, toUserId);
    // Create message with unique ID to prevent duplicates
    const messageId = `msg_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const result = await session.run(
      `
      MATCH (c:Conversation {id:$convId})
      CREATE (m:Message {id: $messageId, text:$text, senderId:$fromId, createdAt: datetime()})
      CREATE (c)-[:HAS_MESSAGE]->(m)
      SET c.lastUpdated = datetime(), c.lastMessageId = m.id, c.lastMessageText = m.text
      RETURN m, c
      `,
      { convId, fromId: req.userId, text, messageId }
    );

    const m = result.records[0].get("m").properties;

    console.log(`✅ Persisted message ${m.id} in conversation ${convId}`);

    // Emit via Socket.IO if available
    try {
      const io = req.app.locals.io;
      if (io) {
        const otherId = toUserId;
        console.log(`📡 Emitting message:new to user ${otherId}...`);

        io.to(otherId).emit("message:new", {
          conversationId: convId,
          message: m,
        });

        console.log(
          `✅ Emitted message:new to user ${otherId} (from ${req.userId})`
        );
      } else {
        console.log("❌ Socket.IO not available!");
      }
    } catch (e) {
      console.error("❌ Socket emit failed:", e);
    }

    res.json(m);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send message" });
  } finally {
    await session.close();
  }
});

// Get conversation messages by conversation id or other user id
router.get("/conversation/:otherId", verifyToken, async (req, res) => {
  const otherId = req.params.otherId;
  const session = driver.session();
  try {
    const convId = [req.userId, otherId].sort().join("-");
    const result = await session.run(
      `MATCH (c:Conversation {id:$convId})-[:HAS_MESSAGE]->(m)
       RETURN m ORDER BY m.createdAt ASC`,
      { convId }
    );
    const messages = result.records.map((r) => r.get("m").properties);
    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  } finally {
    await session.close();
  }
});

// Get list of threads for user with last message
router.get("/threads", verifyToken, async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `
      MATCH (u:User {id:$me})-[:PARTICIPATES_IN]->(c:Conversation)<-[:PARTICIPATES_IN]-(other:User)
      WHERE other.id <> $me
      OPTIONAL MATCH (c)-[:HAS_MESSAGE]->(m)
      WITH other, m ORDER BY m.createdAt DESC
      WITH other, collect(m)[0] as lastMsg
      RETURN other, lastMsg
      `,
      { me: req.userId }
    );

    const threads = result.records.map((r) => ({
      other: r.get("other").properties,
      lastMsg: r.get("lastMsg")?.properties,
    }));
    res.json(threads);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch threads" });
  } finally {
    await session.close();
  }
});

export default router;
