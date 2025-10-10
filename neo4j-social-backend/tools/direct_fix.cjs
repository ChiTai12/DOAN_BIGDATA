const neo4j = require("neo4j-driver");

const driver = neo4j.driver(
  "neo4j://localhost:7687",
  neo4j.auth.basic("neo4j", "password")
);

async function directFix() {
  const session = driver.session();

  try {
    console.log("🔧 DIRECT FIX: Applying notification fixes...");

    // Step 1: Fix missing read property
    console.log("\n1️⃣ Setting read=false for notifications with null read...");
    const fixReadResult = await session.run(`
      MATCH (n:Notification)
      WHERE n.read IS NULL
      SET n.read = false
      RETURN count(n) as fixed, collect(n.id) as ids
    `);

    const fixedCount = fixReadResult.records[0]?.get("fixed") || 0;
    const fixedIds = fixReadResult.records[0]?.get("ids") || [];
    console.log(`   Fixed ${fixedCount} notifications:`, fixedIds);

    // Step 2: Create missing HAS_NOTIFICATION relationships
    console.log("\n2️⃣ Creating missing HAS_NOTIFICATION relationships...");
    const linkResult = await session.run(`
      MATCH (n:Notification)
      MATCH (p:Post {id: n.postId})
      MATCH (author:User)-[:POSTED]->(p)
      WHERE NOT EXISTS((author)-[:HAS_NOTIFICATION]->(n))
      CREATE (author)-[:HAS_NOTIFICATION]->(n)
      RETURN count(*) as linked, collect(author.username + ' -> ' + n.id) as links
    `);

    const linkedCount = linkResult.records[0]?.get("linked") || 0;
    const links = linkResult.records[0]?.get("links") || [];
    console.log(`   Created ${linkedCount} relationships:`, links);

    // Step 3: Verify the specific problematic notification
    console.log("\n3️⃣ Verifying specific notification...");
    const verifyResult = await session.run(`
      MATCH (n:Notification {id: '61290492-aae1-48c0-a544-19eed43072b4'})
      OPTIONAL MATCH (u:User)-[:HAS_NOTIFICATION]->(n)
      RETURN n.read as read, u.username as linkedUser
    `);

    if (verifyResult.records.length > 0) {
      const read = verifyResult.records[0].get("read");
      const linkedUser = verifyResult.records[0].get("linkedUser");
      console.log(
        `   Notification read status: ${read} (type: ${typeof read})`
      );
      console.log(`   Linked to user: ${linkedUser || "NONE"}`);
    } else {
      console.log("   ❌ Notification not found!");
    }

    console.log("\n✅ Direct fix completed!");
  } catch (error) {
    console.error("❌ Direct fix failed:", error);
  } finally {
    await session.close();
    await driver.close();
  }
}

directFix();
