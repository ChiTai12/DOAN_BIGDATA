#!/usr/bin/env node
// Debug notification flow - kiểm tra toàn bộ luồng
const axios = require("axios");
const base = "http://localhost:5000";

async function debugNotificationFlow() {
  console.log("🔍 DEBUG: Kiểm tra toàn bộ luồng notification...\n");

  try {
    // 1. Kiểm tra tất cả notifications trong hệ thống
    console.log("1️⃣ Kiểm tra notifications trong database:");
    const allRes = await axios.get(`${base}/notifications/all`);
    console.log(`Tổng số notifications: ${allRes.data.length}`);
    allRes.data.forEach((n, i) => {
      console.log(`   [${i + 1}] ID: ${n.id}`);
      console.log(`       Message: ${n.message}`);
      console.log(`       Read: ${n.read} (type: ${typeof n.read})`);
      console.log(`       PostId: ${n.postId}`);
      console.log(`       FromUserId: ${n.fromUserId}`);
      console.log("");
    });

    // 2. Test với token giả để xem GET /notifications trả gì
    console.log("2️⃣ Test GET /notifications endpoint:");
    const testToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test"; // fake token
    try {
      const userRes = await axios.get(`${base}/notifications`, {
        headers: { Authorization: `Bearer ${testToken}` },
      });
      console.log("✅ GET /notifications response:");
      console.log(JSON.stringify(userRes.data, null, 2));
    } catch (e) {
      if (e.response && e.response.status === 401) {
        console.log("⚠️ Cần token hợp lệ để test user notifications");
      } else {
        console.log("❌ Error:", e.response?.data || e.message);
      }
    }

    // 3. Kiểm tra xem có user nào có relationship HAS_NOTIFICATION không
    console.log("3️⃣ Kiểm tra relationships trong Neo4j:");
    console.log("Cần chạy query này trong Neo4j Browser:");
    console.log(`
MATCH (u:User)-[:HAS_NOTIFICATION]->(n:Notification)
RETURN u.username, n.id, n.message, n.read
LIMIT 10
    `);

    console.log(
      "\n🔧 Nếu query trên không trả kết quả nào, đó là nguyên nhân!"
    );
    console.log("Nghĩa là notification không được link tới user nào cả.");
  } catch (e) {
    console.error("❌ Debug failed:", e.message);
  }
}

debugNotificationFlow();
