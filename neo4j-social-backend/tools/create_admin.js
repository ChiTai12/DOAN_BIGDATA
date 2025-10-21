#!/usr/bin/env node
import driver from "../db/driver.js";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const argv = process.argv.slice(2);
  const username = argv[0] || process.env.ADMIN_USERNAME || "admin";
  const password = argv[1] || process.env.ADMIN_PASSWORD || "admin123";
  const displayName = argv[2] || process.env.ADMIN_DISPLAYNAME || "Admin";

  if (!username || !password) {
    console.error("Usage: create_admin.js <username> <password> [displayName]");
    process.exit(1);
  }

  const session = driver.session();
  try {
    // If a node with the username exists, update it to Admin and set plaintext password
    const id = uuidv4();
    const upsertRes = await session.run(
      `MERGE (n {username:$username})
       SET n:Admin, n.displayName = coalesce(n.displayName, $displayName), n.password = $password, n.avatarUrl = coalesce(n.avatarUrl, ''), n.role = 'admin', n.createdAt = coalesce(n.createdAt, timestamp()), n.id = coalesce(n.id, $id)
       REMOVE n.passwordHash
       RETURN n`,
      { username, password, displayName, id }
    );

    if (upsertRes.records.length) {
      const node = upsertRes.records[0].get("n");
      console.log("Admin upserted:", {
        id: node.properties.id,
        username: node.properties.username,
        displayName: node.properties.displayName,
      });
      process.exit(0);
    } else {
      console.error("Failed to upsert Admin node");
      process.exit(1);
    }
  } catch (err) {
    console.error("Error creating admin:", err);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
