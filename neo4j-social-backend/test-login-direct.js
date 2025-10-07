import driver from "./db/driver.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

async function testLogin() {
  console.log("🔑 Testing login functionality...");
  
  const session = driver.session();
  const username = "GOAT";
  const password = "123456";
  
  try {
    console.log(`Attempting to login with username: ${username}`);
    
    // Mimic the login logic from auth.js
    const result = await session.run(
      `MATCH (u:User {username:$username}) RETURN u LIMIT 1`,
      { username }
    );
    
    if (result.records.length === 0) {
      console.log("❌ User not found");
      return;
    }
    
    const user = result.records[0].get("u").properties;
    console.log("✅ User found in database:");
    console.log("- Username:", user.username);
    console.log("- Stored password:", user.password);
    console.log("- Input password:", password);
    
    // Check password (plaintext comparison)
    if (password !== user.password) {
      console.log("❌ Password mismatch!");
      return;
    }
    
    console.log("✅ Password matches!");
    
    // Generate token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    
    console.log("✅ Token generated successfully!");
    console.log("Token:", token.substring(0, 50) + "...");
    
    console.log("\n🎉 Login would be successful!");
    console.log("User data that would be returned:");
    console.log({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    });
    
  } catch (error) {
    console.error("❌ Login test failed:", error);
  } finally {
    await session.close();
    await driver.close();
  }
}

testLogin();
