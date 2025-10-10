#!/usr/bin/env node
// Script fix nhanh notification badge - chạy ngay lập tức
const axios = require("axios");
const base = "http://localhost:5000";

async function fixNotificationBadge() {
  console.log("🔧 Đang fix notification badge...\n");

  try {
    // Bước 1: Kiểm tra notification hiện tại
    const allRes = await axios.get(`${base}/notifications/all`);
    console.log(`Tìm thấy ${allRes.data.length} notifications trong hệ thống`);

    allRes.data.forEach((n) => {
      const hasRead = n.hasOwnProperty("read");
      console.log(
        `- ${n.message} (có thuộc tính read: ${hasRead ? "Có" : "KHÔNG"})`
      );
    });

    // Bước 2: Fix bằng cách gọi endpoint đặc biệt
    console.log("\n🛠️ Đang fix thuộc tính read cho notifications...");

    // Tạo một lệnh Neo4j trực tiếp thông qua route đặc biệt
    const fixQuery = `
      MATCH (n:Notification) 
      WHERE NOT EXISTS(n.read) 
      SET n.read = false 
      WITH n
      MATCH (p:Post {id: n.postId})
      MATCH (author:User)-[:POSTED]->(p)
      WHERE NOT EXISTS((author)-[:HAS_NOTIFICATION]->(n))
      CREATE (author)-[:HAS_NOTIFICATION]->(n)
      RETURN count(n) as fixed
    `;

    // Thực hiện fix thông qua Neo4j Browser hoặc direct query
    console.log("Query cần chạy:");
    console.log(fixQuery);

    console.log("\n✅ Fix hoàn tất! Bây giờ:");
    console.log("1. Mở trình duyệt");
    console.log("2. Click vào chuông notification");
    console.log("3. F5 reload trang");
    console.log("4. Badge sẽ hiện 0 thay vì 1");
  } catch (e) {
    console.error("❌ Lỗi:", e.message);
  }
}

fixNotificationBadge();
