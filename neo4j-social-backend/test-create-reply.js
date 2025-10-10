import driver from "./db/driver.js";
import { v4 as uuidv4 } from "uuid";

(async () => {
  const session = driver.session();
  try {
    const parentId = "10577552-3a2d-4bc9-83bb-76a3410c9384"; // existing comment from your DB
    const authorUsername = "billy"; // existing user
    const commentId = uuidv4();
    const content = "Test reply created directly in DB";

    const q = `
      MATCH (author:User {username:$authorUsername}), (parent:Comment {id:$parentId})-[:ABOUT]->(p:Post)
      CREATE (author)-[:COMMENTED]->(c:Comment {id:$commentId, content:$content, parentId:$parentId, threadId:coalesce(parent.threadId, parent.id, $commentId), createdAt:timestamp()})-[:ABOUT]->(p)
      CREATE (c)-[:REPLAY]->(parent)
      WITH c, parent
      OPTIONAL MATCH (parentAuthor:User)-[:COMMENTED]->(parent)
      MERGE (author)-[:REPLIED_TO]->(parentAuthor)
      RETURN c.id AS id, parent.id AS parentId, parentAuthor.username AS parentAuthor
    `;

    const res = await session.run(q, {
      authorUsername,
      parentId,
      commentId,
      content,
    });
    console.log(
      "Created reply:",
      res.records.map((r) => r.toObject())
    );
  } catch (err) {
    console.error("Error creating reply:", err);
  } finally {
    await session.close();
    await driver.close();
  }
})();
