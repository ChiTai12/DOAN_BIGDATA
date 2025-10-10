import driver from "./db/driver.js";

console.log("🔍 Checking comment relationships in Neo4j...");

const session = driver.session();

async function checkRelationships() {
  try {
    // Check all comments and their relationships
    const q = `
      MATCH (c:Comment)
  OPTIONAL MATCH (c)-[:REPLAY]->(parent:Comment)
      OPTIONAL MATCH (author:User)-[:COMMENTED]->(c)
      OPTIONAL MATCH (parentAuthor:User)-[:COMMENTED]->(parent)
      RETURN 
        c.id AS commentId, 
        c.content AS content,
        c.parentId AS parentIdField,
        author.username AS author,
        parent.id AS parentId, 
        parent.content AS parentContent,
        parentAuthor.username AS parentAuthor
      ORDER BY c.createdAt ASC
    `;

    const result = await session.run(q);

    console.log("\n📊 Comment Relationships Analysis:");
    console.log("=====================================");

    if (result.records.length === 0) {
      console.log("❌ No comments found in database");
      return;
    }

    result.records.forEach((record, i) => {
      const commentId = record.get("commentId");
      const content = record.get("content");
      const parentIdField = record.get("parentIdField");
      const author = record.get("author");
      const parentId = record.get("parentId");
      const parentContent = record.get("parentContent");
      const parentAuthor = record.get("parentAuthor");

      console.log(`\n${i + 1}. Comment ID: ${commentId}`);
      console.log(`   Author: ${author}`);
      console.log(`   Content: "${content}"`);
      console.log(`   ParentId Field: ${parentIdField || "null"}`);

      if (parentId) {
        console.log(`   ✅ REPLY_TO Relationship Found!`);
        console.log(`   Parent Comment ID: ${parentId}`);
        console.log(`   Parent Author: ${parentAuthor}`);
        console.log(`   Parent Content: "${parentContent}"`);
      } else if (parentIdField) {
        console.log(
          `   ⚠️  ParentId field set but NO REPLY_TO relationship found!`
        );
      } else {
        console.log(`   💬 Root comment (no parent)`);
      }
    });

    // Count relationships
    const relationshipCount = await session.run(
      `MATCH ()-[r:REPLAY]->() RETURN COUNT(r) AS count`
    );
    const count = relationshipCount.records[0]?.get("count")?.toNumber() || 0;

    console.log(`\n📈 Total REPLY_TO relationships: ${count}`);
  } catch (error) {
    console.error("❌ Error checking relationships:", error);
  } finally {
    await session.close();
    await driver.close();
  }
}

checkRelationships();
