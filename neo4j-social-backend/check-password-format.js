import driver from "./db/driver.js";

async function checkPasswordFormat() {
  console.log("🔍 Checking password format in database...");

  const session = driver.session();

  try {
    // Check users and their password format
    const result = await session.run(
      "MATCH (u:User) RETURN u.username, u.password, u.passwordHash LIMIT 5"
    );

    result.records.forEach((record, index) => {
      console.log(`${index + 1}. Username: ${record.get("u.username")}`);
      console.log(`   Password: ${record.get("u.password")}`);
      console.log(`   PasswordHash: ${record.get("u.passwordHash")}`);
      console.log("   ---");
    });
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await session.close();
    await driver.close();
  }
}

checkPasswordFormat();
