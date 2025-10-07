import driver from "./db/driver.js";

async function quickTest() {
  console.log("🧪 QUICK PHANTOM USERS TEST");
  console.log("=".repeat(30));

  const session = driver.session();

  try {
    // 1. Clean database
    console.log("1️⃣ Cleaning database...");
    await session.run("MATCH (n) DETACH DELETE n");

    // 2. Create 2 users manually
    console.log("2️⃣ Creating 2 users manually...");

    await session.run(`
      CREATE (u1:User {
        id: 'user1-id',
        username: 'user1',
        displayName: 'User One',
        email: 'user1@test.com',
        password: '123456'
      })
      CREATE (u2:User {
        id: 'user2-id', 
        username: 'user2',
        displayName: 'User Two',
        email: 'user2@test.com',
        password: '123456'
      })
    `);

    // 3. Check users created
    const userCount = await session.run(
      "MATCH (u:User) RETURN count(u) as count"
    );
    console.log(`   Users created: ${userCount.records[0].get("count")}`);

    // 4. Simulate ensureConversation
    console.log("3️⃣ Creating conversation...");
    const convId = ["user1-id", "user2-id"].sort().join("-");

    await session.run(`MERGE (c:Conversation {id:$convId, type:'dm'})`, {
      convId,
    });

    // 5. Create message
    console.log("4️⃣ Creating message...");
    const messageId = `msg_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    await session.run(
      `
      MATCH (c:Conversation {id:$convId})
      CREATE (m:Message {id: $messageId, text: 'Test message', senderId: 'user1-id', createdAt: datetime()})
      CREATE (c)-[:HAS_MESSAGE]->(m)
      SET c.lastUpdated = datetime()
      `,
      { convId, messageId }
    );

    // 6. Check final state
    console.log("5️⃣ Final check...");

    const finalState = await session.run(`
      MATCH (n) 
      RETURN labels(n) as type, count(n) as count
      ORDER BY type
    `);

    console.log("📊 Final database state:");
    finalState.records.forEach((record) => {
      const type = record.get("type");
      const count = record.get("count").toString();
      console.log(`   - ${type}: ${count}`);
    });

    // 7. Check users specifically
    const users = await session.run(`
      MATCH (u:User) 
      RETURN u.displayName, u.username
      ORDER BY u.username
    `);

    console.log("👥 Users:");
    users.records.forEach((record, i) => {
      const displayName = record.get("u.displayName");
      const username = record.get("u.username");
      console.log(`   ${i + 1}. ${displayName} (@${username})`);
    });

    // 8. Final verdict
    const totalUsers = users.records.length;
    console.log("\n" + "=".repeat(30));
    if (totalUsers === 2) {
      console.log("✅ SUCCESS: No phantom users!");
    } else {
      console.log(`❌ FAILURE: Expected 2 users, got ${totalUsers}`);
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

quickTest();
