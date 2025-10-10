#!/usr/bin/env node
// Backfill script to fix orphaned notifications and add missing read properties
const driver = require("neo4j-driver").default;

const NEO4J_URI = process.env.NEO4J_URI || "bolt://localhost:7687";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "password";

const neo4jDriver = driver.driver(
  NEO4J_URI,
  driver.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
);

async function backfillNotifications() {
  const session = neo4jDriver.session();

  try {
    console.log("=== Notification Backfill Script ===\n");

    // Step 1: Find notifications without read property and set read=false
    console.log(
      "1. Setting read=false for notifications missing read property..."
    );
    const setReadResult = await session.run(`
      MATCH (n:Notification) 
      WHERE NOT EXISTS(n.read) 
      SET n.read = false 
      RETURN count(n) as updated
    `);
    const readUpdated =
      setReadResult.records[0]?.get("updated")?.toNumber() || 0;
    console.log(`Updated ${readUpdated} notifications with read=false\n`);

    // Step 2: Find orphaned notifications and link them to users
    console.log("2. Linking orphaned notifications to post authors...");
    const linkResult = await session.run(`
      MATCH (n:Notification)
      MATCH (p:Post {id: n.postId})
      MATCH (author:User)-[:POSTED]->(p)
      WHERE NOT EXISTS((author)-[:HAS_NOTIFICATION]->(n))
      CREATE (author)-[:HAS_NOTIFICATION]->(n)
      RETURN count(n) as linked
    `);
    const linked = linkResult.records[0]?.get("linked")?.toNumber() || 0;
    console.log(`Linked ${linked} orphaned notifications to users\n`);

    // Step 3: Verify current state
    console.log("3. Current notification state:");
    const checkResult = await session.run(`
      MATCH (n:Notification)
      OPTIONAL MATCH (user:User)-[:HAS_NOTIFICATION]->(n)
      OPTIONAL MATCH (p:Post {id: n.postId})
      OPTIONAL MATCH (author:User)-[:POSTED]->(p)
      RETURN n.id as id, n.type as type, n.message as message, 
             n.read as read, n.fromUserId as fromUserId, n.postId as postId,
             user.username as linkedToUser, author.username as postAuthor
      ORDER BY n.createdAt DESC
    `);

    console.log("All notifications:");
    checkResult.records.forEach((record) => {
      console.log(`- ${record.get("id")}: ${record.get("message")}`);
      console.log(`  read: ${record.get("read")}, type: ${record.get("type")}`);
      console.log(
        `  linkedToUser: ${record.get(
          "linkedToUser"
        )}, postAuthor: ${record.get("postAuthor")}`
      );
      console.log(
        `  fromUserId: ${record.get("fromUserId")}, postId: ${record.get(
          "postId"
        )}\n`
      );
    });

    // Step 4: Check user notification counts
    console.log("4. User notification counts:");
    const userCountResult = await session.run(`
      MATCH (user:User)
      OPTIONAL MATCH (user)-[:HAS_NOTIFICATION]->(n:Notification)
      WITH user, count(n) as totalNotifs, count(CASE WHEN n.read = false THEN 1 END) as unreadNotifs
      WHERE totalNotifs > 0
      RETURN user.username as username, user.id as userId, totalNotifs, unreadNotifs
    `);

    userCountResult.records.forEach((record) => {
      const username = record.get("username");
      const userId = record.get("userId");
      const total = record.get("totalNotifs")?.toNumber() || 0;
      const unread = record.get("unreadNotifs")?.toNumber() || 0;
      console.log(`${username} (${userId}): ${total} total, ${unread} unread`);
    });

    console.log("\n✅ Backfill completed successfully");
  } catch (error) {
    console.error("❌ Backfill failed:", error);
  } finally {
    await session.close();
    await neo4jDriver.close();
  }
}

// Only run if called directly (not imported)
if (require.main === module) {
  backfillNotifications().catch(console.error);
}

module.exports = { backfillNotifications };
