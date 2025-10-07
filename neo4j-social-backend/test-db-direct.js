import driver from "./db/driver.js";

async function testDatabase() {
  console.log("🔍 Testing database connection and users...");

  const session = driver.session();

  try {
    // Test connection
    console.log("1. Testing connection...");
    const testResult = await session.run("RETURN 'Hello Neo4j' as message");
    console.log("✅ Connection OK:", testResult.records[0].get("message"));

    // Count users
    console.log("\n2. Counting users...");
    const countResult = await session.run(
      "MATCH (u:User) RETURN count(u) as count"
    );
    const userCount = countResult.records[0].get("count").toNumber();
    console.log(`📊 Total users: ${userCount}`);

    // List all users
    if (userCount > 0) {
      console.log("\n3. Listing users...");
      const usersResult = await session.run(
        "MATCH (u:User) RETURN u.username, u.email, u.id LIMIT 10"
      );
      usersResult.records.forEach((record, index) => {
        console.log(
          `${index + 1}. Username: ${record.get(
            "u.username"
          )}, Email: ${record.get("u.email")}, ID: ${record.get("u.id")}`
        );
      });
    } else {
      console.log("⚠️ No users found in database!");
      console.log("💡 You need to register a user first.");
    }
  } catch (error) {
    console.error("❌ Database error:", error);
  } finally {
    await session.close();
    await driver.close();
  }
}

testDatabase();
