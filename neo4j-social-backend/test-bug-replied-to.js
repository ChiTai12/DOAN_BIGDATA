import axios from "axios";
import driver from "./db/driver.js";

const BASE = "http://localhost:5000";

async function testRepliedToBug() {
  console.log("🧪 Testing REPLIED_TO cleanup bug...");

  const session = driver.session();
  try {
    // 1. Đăng nhập 2 users
    const billyLogin = await axios.post(`${BASE}/auth/login`, {
      username: "billy",
      password: "password123",
    });
    const goatLogin = await axios.post(`${BASE}/auth/login`, {
      username: "GOAT",
      password: "password123",
    });

    const billyToken = billyLogin.data.token;
    const goatToken = goatLogin.data.token;
    console.log("✅ Đăng nhập Billy và GOAT thành công");

    // 2. Billy tạo 2 posts
    const post1 = await axios.post(
      `${BASE}/posts`,
      { content: "Post 1 - Test REPLIED_TO cleanup" },
      { headers: { Authorization: `Bearer ${billyToken}` } }
    );
    const post2 = await axios.post(
      `${BASE}/posts`,
      { content: "Post 2 - Test REPLIED_TO cleanup" },
      { headers: { Authorization: `Bearer ${billyToken}` } }
    );

    const post1Id = post1.data.post.id;
    const post2Id = post2.data.post.id;
    console.log(`✅ Billy tạo Post 1: ${post1Id}`);
    console.log(`✅ Billy tạo Post 2: ${post2Id}`);

    // 3. GOAT comment vào Post 1
    await axios.post(
      `${BASE}/posts/${post1Id}/comments`,
      { content: "GOAT comment trong Post 1" },
      { headers: { Authorization: `Bearer ${goatToken}` } }
    );
    console.log("✅ GOAT comment vào Post 1");

    // 4. GOAT comment vào Post 2
    await axios.post(
      `${BASE}/posts/${post2Id}/comments`,
      { content: "GOAT comment trong Post 2" },
      { headers: { Authorization: `Bearer ${goatToken}` } }
    );
    console.log("✅ GOAT comment vào Post 2");

    // 5. Kiểm tra REPLIED_TO relationship trước khi xóa
    const beforeDelete = await session.run(`
      MATCH (billy:User {username:'billy'})-[r:REPLIED_TO]->(goat:User {username:'GOAT'})
      RETURN count(r) as repliedToCount
    `);
    const repliedToCountBefore = beforeDelete.records[0]
      .get("repliedToCount")
      .toNumber();
    console.log(
      `🔍 REPLIED_TO relationships trước xóa: ${repliedToCountBefore}`
    );

    // 6. Kiểm tra comments của GOAT trước xóa
    const commentsBefore = await session.run(`
      MATCH (goat:User {username:'GOAT'})-[:COMMENTED]->(c:Comment)
      RETURN count(c) as commentCount
    `);
    const commentCountBefore = commentsBefore.records[0]
      .get("commentCount")
      .toNumber();
    console.log(`🔍 Comments của GOAT trước xóa: ${commentCountBefore}`);

    // 7. Billy xóa Post 1
    console.log("🗑️ Billy xóa Post 1...");
    await axios.delete(`${BASE}/posts/delete/${post1Id}`, {
      headers: { Authorization: `Bearer ${billyToken}` },
    });
    console.log("✅ Đã xóa Post 1");

    // 8. Kiểm tra REPLIED_TO relationship sau khi xóa
    const afterDelete = await session.run(`
      MATCH (billy:User {username:'billy'})-[r:REPLIED_TO]->(goat:User {username:'GOAT'})
      RETURN count(r) as repliedToCount
    `);
    const repliedToCountAfter = afterDelete.records[0]
      .get("repliedToCount")
      .toNumber();
    console.log(`🔍 REPLIED_TO relationships sau xóa: ${repliedToCountAfter}`);

    // 9. Kiểm tra comments của GOAT sau xóa
    const commentsAfter = await session.run(`
      MATCH (goat:User {username:'GOAT'})-[:COMMENTED]->(c:Comment)
      RETURN count(c) as commentCount
    `);
    const commentCountAfter = commentsAfter.records[0]
      .get("commentCount")
      .toNumber();
    console.log(`🔍 Comments của GOAT sau xóa: ${commentCountAfter}`);

    // 10. Kết luận
    console.log("\n📊 KẾT QUẢ:");
    console.log(
      `REPLIED_TO trước: ${repliedToCountBefore}, sau: ${repliedToCountAfter}`
    );
    console.log(
      `Comments của GOAT trước: ${commentCountBefore}, sau: ${commentCountAfter}`
    );

    if (repliedToCountAfter === 0 && commentCountAfter > 0) {
      console.log(
        "❌ BUG: REPLIED_TO bị xóa nhầm dù GOAT vẫn còn comment trong Post 2!"
      );
    } else if (repliedToCountAfter === repliedToCountBefore) {
      console.log("✅ OK: REPLIED_TO được giữ lại đúng");
    } else {
      console.log("⚠️ Kết quả khác dự đoán, cần kiểm tra thêm");
    }

    // Cleanup: xóa Post 2
    await axios.delete(`${BASE}/posts/delete/${post2Id}`, {
      headers: { Authorization: `Bearer ${billyToken}` },
    });
    console.log("🧹 Đã cleanup Post 2");
  } catch (error) {
    console.error("❌ Lỗi test:", error.message);
    if (error.response) {
      console.error("Response:", error.response.data);
    }
  } finally {
    await session.close();
  }
}

testRepliedToBug();
