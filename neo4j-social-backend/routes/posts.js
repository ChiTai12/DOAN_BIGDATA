import express from "express";
import multer from "multer";
import driver from "../db/driver.js";
import { verifyToken } from "../middleware/auth.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

console.log("📁 Posts routes loaded!");

// Lưu ảnh bài viết
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const upload = multer({ storage });

// Đăng bài
router.post("/", verifyToken, upload.single("image"), async (req, res) => {
  const { content } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";
  const postId = uuidv4();
  const session = driver.session();

  try {
    await session.run(
      `
      MATCH (u:User {id:$userId})
      CREATE (u)-[:POSTED]->(p:Post {
        id:$postId, content:$content, imageUrl:$imageUrl, createdAt:timestamp()
      })
      RETURN p
      `,
      { userId: req.userId, postId, content, imageUrl }
    );
    res.json({ message: "Post created successfully" });
  } finally {
    await session.close();
  }
});

// Lấy bài viết mới nhất
router.get("/feed", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (u:User)-[:POSTED]->(p:Post)
      OPTIONAL MATCH (p)<-[:LIKES]-(liker:User)
      WITH u, p, COUNT(liker) as likesCount
      RETURN u, p, likesCount ORDER BY p.createdAt DESC LIMIT 20
    `);
    const posts = result.records.map((r) => {
      const author = r.get("u").properties;
      delete author.passwordHash;
      return {
        author,
        post: {
          ...r.get("p").properties,
          likesCount: r.get("likesCount").toNumber(),
        },
      };
    });
    res.json(posts);
  } finally {
    await session.close();
  }
});

// Xóa bài viết - Route chính (chỉ author mới xóa được)
router.delete("/delete/:postId", verifyToken, async (req, res) => {
  console.log(
    "🔥 DELETE route hit! PostId:",
    req.params.postId,
    "UserId:",
    req.userId
  );
  const session = driver.session();
  try {
    // Kiểm tra user có phải author không
    const authorCheck = await session.run(
      `
      MATCH (u:User {id: $userId})-[:POSTED]->(p:Post {id: $postId})
      RETURN p.id as postId, u.username as username
      `,
      { userId: req.userId, postId: req.params.postId }
    );

    if (authorCheck.records.length === 0) {
      return res.status(403).json({
        error: "Bạn chỉ có thể xóa bài viết của chính mình!",
      });
    }

    const authorInfo = authorCheck.records[0];
    console.log(
      `✅ User ${authorInfo.get("username")} đang xóa post ${authorInfo.get(
        "postId"
      )}`
    );

    // Xóa post và tất cả relationships (likes, comments, etc.)
    await session.run(
      `
      MATCH (p:Post {id: $postId})
      DETACH DELETE p
      `,
      { postId: req.params.postId }
    );

    res.json({
      message: "✅ Đã xóa bài viết và tất cả relationships thành công!",
      postId: req.params.postId,
      deletedBy: authorInfo.get("username"),
    });
  } catch (error) {
    console.error("❌ Delete post error:", error);
    res.status(500).json({ error: "Lỗi khi xóa bài viết" });
  } finally {
    await session.close();
  }
});

// Like/Unlike post
router.post("/:postId/like", verifyToken, async (req, res) => {
  console.log(`❤️ LIKE request: userId=${req.userId}, postId=${req.params.postId}`);
  const session = driver.session();
  try {
    // Check if already liked
    const checkResult = await session.run(
      `
      MATCH (u:User {id:$userId}), (p:Post {id:$postId})
      OPTIONAL MATCH (u)-[r:LIKES]->(p)
      RETURN r
      `,
      { userId: req.userId, postId: req.params.postId }
    );

    console.log(`🔍 Check result: ${checkResult.records.length} records found`);
    const existingLike = checkResult.records[0].get("r");
    console.log(`🔍 Existing like relationship:`, existingLike ? "EXISTS" : "NOT_EXISTS");

    if (existingLike) {
      // Unlike
      console.log(`💔 Unliking post ${req.params.postId}`);
      await session.run(
        `
        MATCH (u:User {id:$userId})-[r:LIKES]->(p:Post {id:$postId})
        DELETE r
        `,
        { userId: req.userId, postId: req.params.postId }
      );
      console.log(`✅ Successfully unliked post ${req.params.postId}`);
      res.json({ liked: false, message: "Post unliked" });
    } else {
      // Like
      console.log(`❤️ Liking post ${req.params.postId}`);
      await session.run(
        `
        MATCH (u:User {id:$userId}), (p:Post {id:$postId})
        CREATE (u)-[:LIKES]->(p)
        `,
        { userId: req.userId, postId: req.params.postId }
      );
      console.log(`✅ Successfully created LIKES relationship`);
      
      // After liking, fetch post author and emit a socket notification
      try {
        const authorRes = await session.run(
          `MATCH (author:User)-[:POSTED]->(p:Post {id:$postId}) RETURN author.id AS authorId, author.username AS authorUsername LIMIT 1`,
          { postId: req.params.postId }
        );
        console.log(`🔍 Author query result: ${authorRes.records.length} records`);
        if (authorRes.records.length > 0) {
          const authorId = authorRes.records[0].get('authorId');
          const authorUsername = authorRes.records[0].get('authorUsername');
          console.log(`📧 Found post author: ${authorUsername} (${authorId})`);
          const io = req.app.locals.io;
          if (io && authorId) {
            io.to(authorId).emit('notification:new', {
              type: 'like',
              from: req.userId,
              postId: req.params.postId,
              message: `Someone liked your post`,
              timestamp: Date.now(),
            });
            console.log(`🔔 Emitted notification:new to user=${authorId} for post=${req.params.postId}`);
          } else {
            console.log(`⚠️ No io instance or authorId missing`);
          }
        } else {
          console.log(`⚠️ No author found for post ${req.params.postId}`);
        }
      } catch (err) {
        console.error('❌ Failed to fetch post author for notification', err);
      }
      res.json({ liked: true, message: "Post liked" });
    }
  } catch (error) {
    console.error("❌ Like/unlike error:", error);
    res.status(500).json({ error: "Failed to like/unlike post" });
  } finally {
    await session.close();
  }
});

export default router;
