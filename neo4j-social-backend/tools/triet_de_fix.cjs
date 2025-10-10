const neo4j = require("neo4j-driver");

const driver = neo4j.driver(
  "neo4j://localhost:7687",
  neo4j.auth.basic("neo4j", "password")
);

async function triethoDeFix() {
  const session = driver.session();

  try {
    console.log("🔥 TRIỆT ĐỂ FIX: Clear ALL notifications for billy...");

    // Step 1: Mark ALL notifications as read for billy user
    const markAllReadResult = await session.run(`
      MATCH (u:User {username: 'billy'})-[:HAS_NOTIFICATION]->(n:Notification)
      SET n.read = true
      RETURN count(n) as marked, collect(n.id) as ids
    `);

    const markedCount = markAllReadResult.records[0]?.get("marked") || 0;
    const markedIds = markAllReadResult.records[0]?.get("ids") || [];
    console.log(
      `   ✅ Marked ${markedCount} notifications as read:`,
      markedIds
    );

    // Step 2: Delete ALL like notifications from GOAT to billy
    const deleteResult = await session.run(`
      MATCH (n:Notification)
      WHERE n.fromUserId = '5651b602-74f2-4cc3-a1d8-0559fd6ba6a1' 
      AND n.type = 'like'
      DETACH DELETE n
      RETURN count(n) as deleted
    `);

    const deletedCount = deleteResult.records[0]?.get("deleted") || 0;
    console.log(`   🗑️ Deleted ${deletedCount} like notifications from GOAT`);

    // Step 3: Verify no unread notifications remain
    const verifyResult = await session.run(`
      MATCH (u:User {username: 'billy'})-[:HAS_NOTIFICATION]->(n:Notification)
      WHERE n.read IS NULL OR n.read = false
      RETURN count(n) as unread, collect(n.id) as unreadIds
    `);

    const unreadCount = verifyResult.records[0]?.get("unread") || 0;
    const unreadIds = verifyResult.records[0]?.get("unreadIds") || [];

    console.log(`\n📊 FINAL STATUS:`);
    console.log(`   - Unread notifications: ${unreadCount}`);
    console.log(
      `   - Unread IDs: ${unreadIds.length > 0 ? unreadIds : "NONE"}`
    );

    if (unreadCount === 0) {
      console.log("\n🎉 SUCCESS! Badge should now be 0 permanently!");
    } else {
      console.log("\n⚠️ Still have unread notifications");
    }
  } catch (error) {
    console.error("❌ Triệt để fix failed:", error);
  } finally {
    await session.close();
    await driver.close();
  }
}

triethoDeFix();
