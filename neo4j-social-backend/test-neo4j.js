import driver from "./db/driver.js";

async function testNeo4j() {
  console.log("🔍 Testing Neo4j connection...");

  const session = driver.session();
  try {
    // Test connection
    await session.run("RETURN 1 as test");
    console.log("✅ Neo4j connected");

    // Check existing users
    const result = await session.run(
      "MATCH (u:User) RETURN u.username, u.id LIMIT 5"
    );
    console.log("👥 Existing users:");
    result.records.forEach((record) => {
      console.log(`  - ${record.get("u.username")} (${record.get("u.id")})`);
    });

    if (result.records.length > 0) {
      const firstUser = result.records[0];
      const userId = firstUser.get("u.id");
      console.log(`\n🧪 Testing UPDATE with user: ${userId}`);

      // Test update query directly
      const updateResult = await session.run(
        "MATCH (u:User {id:$id}) SET u.displayName=$displayName RETURN u",
        { id: userId, displayName: "test_update_" + Date.now() }
      );

      if (updateResult.records.length > 0) {
        const updatedUser = updateResult.records[0].get("u").properties;
        console.log("✅ Direct Neo4j update SUCCESS:");
        console.log(`  New displayName: ${updatedUser.displayName}`);
      } else {
        console.log("❌ No user found with that ID");
      }
    } else {
      console.log("⚠️ No users in database");
    }
  } catch (error) {
    console.log("❌ Neo4j error:", error.message);
  } finally {
    await session.close();
  }
}

testNeo4j();
