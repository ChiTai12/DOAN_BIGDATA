import fetch from "node-fetch";
import driver from "./db/driver.js";

async function testChatPhantom() {
  console.log("🧪 TESTING CHAT PHANTOM USERS BUG");
  console.log("=".repeat(40));

  const session = driver.session();

  try {
    // 1. Clean database
    console.log("1️⃣ Cleaning database...");
    await session.run("MATCH (n) DETACH DELETE n");

    const initialCount = await session.run(
      "MATCH (n) RETURN count(n) as count"
    );
    console.log(`   Initial nodes: ${initialCount.records[0].get("count")}`);

    // 2. Create 2 users via API (simulate register)
    console.log("\n2️⃣ Creating 2 users via API...");

    const user1Response = await fetch("http://localhost:5000/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "testuser1",
        displayName: "Test User 1",
        email: "test1@example.com",
        password: "123456",
      }),
    });

    const user2Response = await fetch("http://localhost:5000/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "testuser2",
        displayName: "Test User 2",
        email: "test2@example.com",
        password: "123456",
      }),
    });

    if (!user1Response.ok || !user2Response.ok) {
      throw new Error("Failed to create users");
    }

    console.log("   ✅ Users created successfully");

    // 3. Check users in database
    const userCount = await session.run(
      "MATCH (u:User) RETURN count(u) as count, collect(u) as users"
    );
    const count = userCount.records[0].get("count").toString();
    const users = userCount.records[0].get("users");

    console.log(`   📊 Users in DB: ${count}`);
    users.forEach((user, i) => {
      const props = user.properties;
      console.log(
        `   ${i + 1}. ${props.displayName} (@${props.username}) - ID: ${
          props.id
        }`
      );
    });

    if (count !== "2") {
      console.log(`   ❌ Expected 2 users, got ${count}!`);
      return;
    }

    // 4. Login both users to get tokens and IDs
    console.log("\n3️⃣ Logging in users...");

    const login1 = await fetch("http://localhost:5000/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser1", password: "123456" }),
    });

    const login2 = await fetch("http://localhost:5000/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser2", password: "123456" }),
    });

    const user1Data = await login1.json();
    const user2Data = await login2.json();

    console.log(
      `   User 1: ${user1Data.user.displayName} (ID: ${user1Data.user.id})`
    );
    console.log(
      `   User 2: ${user2Data.user.displayName} (ID: ${user2Data.user.id})`
    );

    // 5. Send ONE message from User1 to User2
    console.log("\n4️⃣ Sending ONE message from User1 to User2...");

    const messageResponse = await fetch("http://localhost:5000/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Data.token}`,
      },
      body: JSON.stringify({
        toUserId: user2Data.user.id,
        text: "Hello from Test User 1! 👋",
      }),
    });

    if (!messageResponse.ok) {
      const error = await messageResponse.json();
      console.log("   ❌ Message send failed:", error);
      return;
    }

    const messageResult = await messageResponse.json();
    console.log(`   ✅ Message sent: ${messageResult.text}`);

    // 6. Check database after sending message
    console.log("\n5️⃣ Checking database after message...");

    const finalCount = await session.run(`
      MATCH (n) 
      RETURN labels(n) as type, count(n) as count
      ORDER BY type
    `);

    console.log("   📊 Final database state:");
    finalCount.records.forEach((record) => {
      const type = record.get("type");
      const count = record.get("count").toString();
      console.log(`   - ${type}: ${count}`);
    });

    // 7. Detailed user analysis
    const detailedUsers = await session.run(`
      MATCH (u:User) 
      RETURN u.displayName, u.username, u.id
      ORDER BY u.createdAt
    `);

    console.log("\n   📋 Detailed users:");
    detailedUsers.records.forEach((record, i) => {
      const displayName = record.get("u.displayName") || "NO DISPLAY NAME";
      const username = record.get("u.username") || "NO USERNAME";
      const id = record.get("u.id");
      console.log(`   ${i + 1}. ${displayName} (@${username})`);
      console.log(`      ID: ${id}`);
    });

    // 8. Check conversations and messages
    const convs = await session.run(
      "MATCH (c:Conversation) RETURN count(c) as count"
    );
    const msgs = await session.run(
      "MATCH (m:Message) RETURN count(m) as count"
    );

    console.log(`\n   💬 Conversations: ${convs.records[0].get("count")}`);
    console.log(`   📨 Messages: ${msgs.records[0].get("count")}`);

    // 9. Final verdict
    const finalUserCount = detailedUsers.records.length;
    console.log("\n" + "=".repeat(40));
    if (finalUserCount === 2) {
      console.log("✅ SUCCESS: No phantom users created!");
    } else {
      console.log(`❌ FAILURE: Expected 2 users, got ${finalUserCount}`);
      console.log("   Phantom users detected!");
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

testChatPhantom();
