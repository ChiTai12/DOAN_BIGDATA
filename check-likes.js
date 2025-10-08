// Script to check Neo4j for LIKES relationships
import driver from "./neo4j-social-backend/db/driver.js";

async function checkLikesRelationships() {
  const session = driver.session();
  try {
    console.log("🔍 Checking for LIKES relationships in Neo4j...");

    // Check all LIKES relationships
    const likesResult = await session.run(`
      MATCH (u:User)-[r:LIKES]->(p:Post)
      RETURN u.username as liker, p.id as postId, r
      LIMIT 10
    `);

    console.log(`📊 Found ${likesResult.records.length} LIKES relationships:`);
    likesResult.records.forEach((record) => {
      console.log(
        `  ❤️ ${record.get("liker")} liked post ${record.get("postId")}`
      );
    });

    // Check posts and their authors
    const postsResult = await session.run(`
      MATCH (author:User)-[:POSTED]->(p:Post)
      RETURN author.username as author, p.id as postId, p.content as content
      LIMIT 5
    `);

    console.log(`\n📋 Recent posts:`);
    postsResult.records.forEach((record) => {
      console.log(
        `  📝 ${record.get("author")}: "${record.get(
          "content"
        )}" (ID: ${record.get("postId")})`
      );
    });
  } catch (error) {
    console.error("❌ Error checking relationships:", error);
  } finally {
    await session.close();
    await driver.close();
  }
}

checkLikesRelationships();
