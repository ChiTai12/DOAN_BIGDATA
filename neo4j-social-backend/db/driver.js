import neo4j from "neo4j-driver";
import dotenv from "dotenv";
dotenv.config();

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

// Test connection on startup
driver
  .verifyConnectivity()
  .then(() => console.log("✅ Neo4j connected successfully"))
  .catch((error) => console.error("❌ Neo4j connection failed:", error));

export default driver;
