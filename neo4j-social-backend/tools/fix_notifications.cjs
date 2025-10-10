#!/usr/bin/env node
// Script để fix notification cũ - set read=false và tạo HAS_NOTIFICATION relationship
const axios = require("axios");
const base = process.env.BASE_URL || "http://localhost:5000";

async function fixNotifications() {
  console.log("=== Fix Notifications Script ===\n");

  try {
    // Step 1: Lấy danh sách tất cả notifications
    console.log("1. Kiểm tra notifications hiện tại:");
    const allRes = await axios.get(`${base}/notifications/all`);
    console.log(`Tổng số notifications: ${allRes.data.length}`);

    allRes.data.forEach((n) => {
      console.log(`- ID: ${n.id.substring(0, 8)}...`);
      console.log(`  Message: ${n.message}`);
      console.log(`  PostID: ${n.postId}`);
      console.log(`  FromUser: ${n.fromUserId}`);
      console.log(`  Có thuộc tính 'read': ${n.hasOwnProperty("read")}`);
      console.log(`  Giá trị read: ${n.read}\n`);
    });

    // Step 2: Fix thông qua API endpoint mới
    console.log("2. Đang fix notifications...");

    // Tạo endpoint tạm để fix
    const fixScript = `
      // Fix notifications qua Neo4j queries
      const fixQueries = [
        // Query 1: Set read=false cho notifications thiếu thuộc tính read
        \`MATCH (n:Notification) WHERE NOT EXISTS(n.read) SET n.read = false RETURN count(n) as readFixed\`,
        
        // Query 2: Tạo HAS_NOTIFICATION relationship cho notifications orphaned
        \`MATCH (n:Notification)
         MATCH (p:Post {id: n.postId})
         MATCH (author:User)-[:POSTED]->(p)
         WHERE NOT EXISTS((author)-[:HAS_NOTIFICATION]->(n))
         CREATE (author)-[:HAS_NOTIFICATION]->(n)
         RETURN count(n) as linked\`
      ];
      
      let results = { readFixed: 0, linked: 0 };
      
      // Chạy queries
      try {
        const session = global.neo4jDriver.session();
        
        // Fix read property
        const readResult = await session.run(fixQueries[0]);
        results.readFixed = readResult.records[0]?.get('readFixed')?.toNumber() || 0;
        
        // Link to users  
        const linkResult = await session.run(fixQueries[1]);
        results.linked = linkResult.records[0]?.get('linked')?.toNumber() || 0;
        
        await session.close();
        
        console.log('Fix results:', results);
        return results;
      } catch (err) {
        console.error('Fix failed:', err);
        throw err;
      }
    `;

    console.log("Đang thực hiện fix...");

    // Thay vì gọi API, tôi sẽ hướng dẫn bạn chạy trực tiếp
    console.log("\n⚠️  Cần chạy fix trực tiếp trên server:");
    console.log("Mở terminal khác và chạy:");
    console.log('cd "d:\\New folder (2)\\neo4j-social-backend"');
    console.log('node -e "');
    console.log('const driver = require(\\"./db/driver.js\\").default;');
    console.log("(async () => {");
    console.log("  const session = driver.session();");
    console.log("  try {");
    console.log(
      '    const r1 = await session.run(\\"MATCH (n:Notification) WHERE NOT EXISTS(n.read) SET n.read = false RETURN count(n) as c\\");'
    );
    console.log(
      '    const readFixed = r1.records[0]?.get(\\"c\\")?.toNumber() || 0;'
    );
    console.log(
      '    console.log(\\"Set read=false cho\\", readFixed, \\"notifications\\");'
    );
    console.log("    ");
    console.log(
      '    const r2 = await session.run(\\"MATCH (n:Notification) MATCH (p:Post {id: n.postId}) MATCH (author:User)-[:POSTED]->(p) WHERE NOT EXISTS((author)-[:HAS_NOTIFICATION]->(n)) CREATE (author)-[:HAS_NOTIFICATION]->(n) RETURN count(n) as c\\");'
    );
    console.log(
      '    const linked = r2.records[0]?.get(\\"c\\")?.toNumber() || 0;'
    );
    console.log(
      '    console.log(\\"Linked\\", linked, \\"notifications to users\\");'
    );
    console.log("  } finally { await session.close(); }");
    console.log('})().catch(console.error)"');

    console.log("\nSau khi chạy xong, test lại:");
    console.log("1. Mở browser");
    console.log("2. Click chuông notification");
    console.log("3. F5 reload");
    console.log("4. Badge phải về 0");
  } catch (err) {
    console.error("❌ Lỗi:", err.message);
  }
}

fixNotifications();
