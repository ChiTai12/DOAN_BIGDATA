const neo4j = require("neo4j-driver");
const fs = require("fs");
(async () => {
  try {
    const env = fs.readFileSync(
      "d:/New folder (2)/neo4j-social-backend/.env",
      "utf8"
    );
    const uri = env.match(/^NEO4J_URI=(.*)$/m)[1].trim();
    const user = env.match(/^NEO4J_USER=(.*)$/m)[1].trim();
    const pass = env.match(/^NEO4J_PASSWORD=(.*)$/m)[1].trim();
    const driver = neo4j.driver(uri, neo4j.auth.basic(user, pass));
    await driver.verifyConnectivity();
    console.log("Connected to Neo4j");
    const session = driver.session();
    const userId = "b6299fa5-09d4-421a-b3e4-2b627c76bd0b";
    const q = `
  // Part A: notifications with HAS_NOTIFICATION relationship
  MATCH (me:User {id:$userId})
  OPTIONAL MATCH (me)-[:HAS_NOTIFICATION]->(n:Notification)-[:ABOUT]->(p:Post)
  OPTIONAL MATCH (from:User) WHERE n.fromUserId IS NOT NULL AND from.id = n.fromUserId
  WITH n, p, from
      // Exclude notifications that were created by the same user (self-notifications).
      // Also exclude cases where fromUserId is missing but fromName equals this user's displayName or username.
      WHERE n IS NOT NULL
        AND NOT (n.fromUserId IS NOT NULL AND n.fromUserId = $userId)
        AND NOT (coalesce(n.fromName, '') IN [coalesce(me.displayName, ''), coalesce(me.username, '')])
      RETURN n.id AS id, n.type AS type, n.message AS message,
        coalesce(n.fromName, from.displayName, from.username) AS fromName,
        n.fromUserId AS fromUserId, p.id AS postId, n.commentId AS commentId, n.threadId AS threadId, n.commentText AS commentText, n.createdAt AS createdAt,
        n.read AS read
      
      UNION

      // Part B: notifications that reference posts authored by the user but lack HAS_NOTIFICATION
      MATCH (me2:User {id:$userId})-[:POSTED]->(p2:Post)<-[:ABOUT]-(n2:Notification)
      OPTIONAL MATCH (from2:User) WHERE n2.fromUserId IS NOT NULL AND from2.id = n2.fromUserId
      // Exclude self-notifications here as well (by id or by name match)
      WHERE NOT (n2.fromUserId IS NOT NULL AND n2.fromUserId = $userId)
        AND NOT (coalesce(n2.fromName, '') IN [coalesce(me2.displayName, ''), coalesce(me2.username, '')])
      RETURN n2.id AS id, n2.type AS type, n2.message AS message,
        coalesce(n2.fromName, from2.displayName, from2.username) AS fromName,
        n2.fromUserId AS fromUserId, p2.id AS postId, n2.commentId AS commentId, n2.threadId AS threadId, n2.commentText AS commentText, n2.createdAt AS createdAt,
        n2.read AS read
      
      ORDER BY createdAt DESC
      LIMIT 100
    `;
    console.log("About to run query...");
    const res = await session.run(q, { userId });
    console.log("records", res.records.length);
    res.records.forEach((r) => console.log(r.keys, r.toObject()));
    await session.close();
    await driver.close();
  } catch (e) {
    console.error("CYTHER ERROR", e.stack || e);
  }
})();
