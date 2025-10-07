import driver from "./db/driver.js";
import { v4 as uuidv4 } from "uuid";

async function createUserDirectly() {
  console.log("🔧 Creating user directly in Neo4j database...");

  const session = driver.session();
  const id = uuidv4();

  try {
    const result = await session.run(
      `
      CREATE (u:User {
        id: $id,
        username: $username,
        email: $email,
        password: $password,
        displayName: $displayName,
        fullName: $fullName,
        avatarUrl: '',
        bio: '',
        createdAt: timestamp()
      })
      RETURN u
      `,
      {
        id,
        username: "GOAT",
        email: "goat@test.com",
        password: "123456", // Plain text như trong code
        displayName: "GOAT User",
        fullName: "GOAT Test User",
      }
    );

    console.log("✅ User created successfully!");
    console.log("User ID:", id);
    console.log("Username: GOAT");
    console.log("Password: 123456");

    // Verify user exists
    const verifyResult = await session.run(
      "MATCH (u:User {username: $username}) RETURN u",
      { username: "GOAT" }
    );

    if (verifyResult.records.length > 0) {
      const user = verifyResult.records[0].get("u").properties;
      console.log("\n✅ User verified in database:");
      console.log("- Username:", user.username);
      console.log("- Email:", user.email);
      console.log("- Display Name:", user.displayName);
    }
  } catch (error) {
    console.error("❌ Error creating user:", error);
  } finally {
    await session.close();
    await driver.close();
  }
}

createUserDirectly();
