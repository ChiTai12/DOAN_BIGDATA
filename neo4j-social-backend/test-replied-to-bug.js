// Test để show bug của REPLIED_TO cleanup
import driver from "./db/driver.js";

async function testReplyToBug() {
  const session = driver.session();

  try {
    console.log("🧪 Test REPLIED_TO cleanup bug...");

    // 1. Tạo data test
    console.log("1. Tạo users và posts...");
    await session.run(`
      // Xóa data cũ nếu có
      MATCH (u:User {username: 'testUserA'}) DETACH DELETE u;
      MATCH (u:User {username: 'testUserB'}) DETACH DELETE u;
      MATCH (p:Post) WHERE p.content STARTS WITH 'TEST POST' DETACH DELETE p;
      MATCH (c:Comment) WHERE c.content STARTS WITH 'TEST COMMENT' DETACH DELETE c;
      MATCH (n:Notification) WHERE n.message STARTS WITH 'TEST' DETACH DELETE n;
    `);

    await session.run(`
      CREATE (userA:User {id: 'testA', username: 'testUserA', displayName: 'Test A'});
      CREATE (userB:User {id: 'testB', username: 'testUserB', displayName: 'Test B'});
      CREATE (post1:Post {id: 'testPost1', content: 'TEST POST 1'});
      CREATE (post2:Post {id: 'testPost2', content: 'TEST POST 2'});
      CREATE (userA)-[:POSTED]->(post1);
      CREATE (userA)-[:POSTED]->(post2);
    `);

    // 2. UserB comment vào cả 2 posts
    console.log("2. UserB comment vào cả 2 posts...");
    await session.run(`
      MATCH (userB:User {id: 'testB'}), (post1:Post {id: 'testPost1'}), (post2:Post {id: 'testPost2'});
      CREATE (comment1:Comment {id: 'testComment1', content: 'TEST COMMENT 1'});
      CREATE (comment2:Comment {id: 'testComment2', content: 'TEST COMMENT 2'});
      CREATE (comment1)-[:ABOUT]->(post1);
      CREATE (comment2)-[:ABOUT]->(post2);
      CREATE (userB)-[:COMMENTED]->(comment1);
      CREATE (userB)-[:COMMENTED]->(comment2);
    `);

    // 3. Tạo REPLIED_TO relationship (giả sử từ việc reply)
    console.log("3. Tạo REPLIED_TO relationship...");
    await session.run(`
      MATCH (userA:User {id: 'testA'}), (userB:User {id: 'testB'});
      MERGE (userA)-[:REPLIED_TO]->(userB);
    `);

    // 4. Kiểm tra trạng thái trước khi xóa
    console.log("4. Trạng thái TRƯỚC khi xóa post1:");
    const beforeResult = await session.run(`
      MATCH (userA:User {id: 'testA'})-[r:REPLIED_TO]->(userB:User {id: 'testB'}) 
      RETURN count(r) as replyToCount
    `);
    console.log(
      `   REPLIED_TO relationships: ${beforeResult.records[0].get(
        "replyToCount"
      )}`
    );

    const commentsResult = await session.run(`
      MATCH (userB:User {id: 'testB'})-[:COMMENTED]->(c:Comment) 
      RETURN count(c) as commentCount
    `);
    console.log(
      `   UserB comments: ${commentsResult.records[0].get("commentCount")}`
    );

    // 5. Xóa post1 và comments của nó (giống logic hiện tại)
    console.log("5. Xóa post1 và comments...");
    await session.run(`
      MATCH (c:Comment)-[:ABOUT]->(p:Post {id: 'testPost1'}) DETACH DELETE c;
      MATCH (p:Post {id: 'testPost1'}) DETACH DELETE p;
    `);

    // 6. Kiểm tra UserB còn comment gì không
    const afterDeleteComments = await session.run(`
      MATCH (userB:User {id: 'testB'})-[:COMMENTED]->(c:Comment) 
      RETURN count(c) as commentCount
    `);
    console.log(
      `6. Sau khi xóa post1, UserB còn comments: ${afterDeleteComments.records[0].get(
        "commentCount"
      )}`
    );

    // 7. Chạy query cleanup HIỆN TẠI (có bug)
    console.log("7. Chạy query cleanup HIỆN TẠI...");
    const cleanupResult = await session.run(`
      MATCH (u1:User)-[r:REPLIED_TO]->(u2:User)
      WHERE NOT EXISTS((u1)-[:COMMENTED]->(:Comment)) OR NOT EXISTS((u2)-[:COMMENTED]->(:Comment))
      RETURN count(r) as willBeDeleted
    `);
    console.log(
      `   REPLIED_TO sẽ bị xóa: ${cleanupResult.records[0].get(
        "willBeDeleted"
      )}`
    );

    // Thực tế xóa để test
    await session.run(`
      MATCH (u1:User)-[r:REPLIED_TO]->(u2:User)
      WHERE NOT EXISTS((u1)-[:COMMENTED]->(:Comment)) OR NOT EXISTS((u2)-[:COMMENTED]->(:Comment))
      DELETE r
    `);

    // 8. Kiểm tra kết quả
    const afterCleanup = await session.run(`
      MATCH (userA:User {id: 'testA'})-[r:REPLIED_TO]->(userB:User {id: 'testB'}) 
      RETURN count(r) as replyToCount
    `);
    console.log(
      `8. Sau cleanup, REPLIED_TO còn lại: ${afterCleanup.records[0].get(
        "replyToCount"
      )}`
    );

    // 9. Kết luận
    if (afterCleanup.records[0].get("replyToCount") === 0) {
      console.log(
        "❌ BUG: REPLIED_TO bị xóa nhầm! UserB vẫn còn comment ở post2 mà!"
      );
    } else {
      console.log("✅ OK: REPLIED_TO được giữ lại đúng");
    }
  } catch (error) {
    console.error("❌ Lỗi test:", error);
  } finally {
    await session.close();
  }
}

testReplyToBug();
