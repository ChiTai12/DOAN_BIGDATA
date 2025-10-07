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

      // Try to notify author to remove the notification (if client shows live list)
      try {
        const authorRes = await session.run(
          `MATCH (author:User)-[:POSTED]->(p:Post {id:$postId}) RETURN author.id AS authorId LIMIT 1`,
          { postId: req.params.postId }
        );
        if (authorRes.records.length > 0) {
          const authorId = authorRes.records[0].get('authorId');
          const io = req.app.locals.io;
          if (io && authorId) {
            // find persistent notification ids that match
            let notifIds = [];
            try {
              const idRes = await session.run(
                `MATCH (author:User {id:$authorId})-[:HAS_NOTIFICATION]->(n:Notification {postId:$postId, fromUserId:$fromUserId}) RETURN n.id AS nid`,
                { authorId, postId: req.params.postId, fromUserId: req.userId }
              );
              notifIds = idRes.records.map(r => r.get('nid'));
              if (notifIds.length > 0) {
                // delete them
                await session.run(
                  `MATCH (author:User {id:$authorId})-[:HAS_NOTIFICATION]->(n:Notification) WHERE n.id IN $ids DETACH DELETE n`,
                  { authorId, ids: notifIds }
                );
                console.log(`🗑️ Deleted ${notifIds.length} persistent notification(s) for post=${req.params.postId} fromUser=${req.userId}`);
              }
            } catch (err) {
              console.error('❌ Failed to delete persistent notification', err);
            }

            io.to(authorId).emit('notification:remove', {
              type: 'like',
              fromUserId: req.userId,
              postId: req.params.postId,
              notifIds
            });
            console.log(`🔕 Emitted notification:remove to user=${authorId} for post=${req.params.postId} notifIds=${notifIds}`);
          }
        }
      } catch (err) {
        console.error('❌ Failed to fetch post author for remove-notification', err);
      }

      // compute likesCount
      const countRes = await session.run(
        `MATCH (p:Post {id:$postId}) OPTIONAL MATCH (p)<-[:LIKES]-(:User) RETURN COUNT(*) as likesCount`,
        { postId: req.params.postId }
      );
      const likesCount = countRes.records[0].get('likesCount').toNumber
        ? countRes.records[0].get('likesCount').toNumber()
        : Number(countRes.records[0].get('likesCount'));

      // Emit post update event to all clients for real-time likes count update
      try {
        const io = req.app.locals.io;
        if (io) {
          io.emit('post:likes:update', {
            postId: req.params.postId,
            liked: false,
            fromUserId: req.userId,
            likesCount
          });
          console.log(`📡 Emitted post:likes:update (unlike) for post=${req.params.postId}`);
        }
      } catch (err) {
        console.error('❌ Failed to emit post:likes:update on unlike', err);
      }

      res.json({ liked: false, message: 'Post unliked', likesCount });
    } else {
      // Like (idempotent)
      console.log(`❤️ Liking post ${req.params.postId}`);
      await session.run(
        `
        MATCH (u:User {id:$userId}), (p:Post {id:$postId})
        MERGE (u)-[:LIKES]->(p)
        `,
        { userId: req.userId, postId: req.params.postId }
      );
      console.log(`✅ Successfully created/merged LIKES relationship`);

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

          // Get liker's username/displayName
          const likerRes = await session.run(
            `MATCH (u:User {id:$userId}) RETURN u.username AS likerUsername, u.displayName AS likerDisplayName LIMIT 1`,
            { userId: req.userId }
          );

          let likerName = 'Someone';
          if (likerRes.records.length > 0) {
            const likerDisplayName = likerRes.records[0].get('likerDisplayName');
            const likerUsername = likerRes.records[0].get('likerUsername');
            likerName = likerDisplayName || likerUsername || 'Someone';
          }

          const io = req.app.locals.io;
          if (io && authorId) {
            // persist notification node and link to author and post
            const notifId = uuidv4();
            try {
              await session.run(
                `MATCH (author:User {id:$authorId}), (p:Post {id:$postId})
                 CREATE (n:Notification {id:$notifId, type:$type, message:$message, fromUserId:$fromUserId, postId:$postId, createdAt:timestamp()})
                 CREATE (author)-[:HAS_NOTIFICATION]->(n)
                 CREATE (n)-[:ABOUT]->(p)
                 RETURN n`,
                {
                  authorId,
                  postId: req.params.postId,
                  notifId,
                  type: 'like',
                  message: `${likerName} đã thích bài viết của bạn`,
                  fromUserId: req.userId,
                }
              );

              io.to(authorId).emit('notification:new', {
                type: 'like',
                from: likerName,
                fromUserId: req.userId,
                postId: req.params.postId,
                notifId,
                message: `${likerName} đã thích bài viết của bạn`,
                timestamp: Date.now(),
              });
              console.log(`🔔 Emitted persistent notification:new to user=${authorId} for post=${req.params.postId} from ${likerName} notifId=${notifId}`);
            } catch (err) {
              console.error('❌ Failed to create persistent notification', err);
            }
          } else {
            console.log(`⚠️ No io instance or authorId missing`);
          }
        } else {
          console.log(`⚠️ No author found for post ${req.params.postId}`);
        }
      } catch (err) {
        console.error('❌ Failed to fetch post author for notification', err);
      }

      // compute likesCount
      const countRes = await session.run(
        `MATCH (p:Post {id:$postId}) OPTIONAL MATCH (p)<-[:LIKES]-(:User) RETURN COUNT(*) as likesCount`,
        { postId: req.params.postId }
      );
      const likesCount = countRes.records[0].get('likesCount').toNumber
        ? countRes.records[0].get('likesCount').toNumber()
        : Number(countRes.records[0].get('likesCount'));

      // Emit post update event to all clients for real-time likes count update
      try {
        const io = req.app.locals.io;
        if (io) {
          io.emit('post:likes:update', {
            postId: req.params.postId,
            liked: true,
            fromUserId: req.userId,
            likesCount
          });
          console.log(`📡 Emitted post:likes:update (like) for post=${req.params.postId}`);
        }
      } catch (err) {
        console.error('❌ Failed to emit post:likes:update on like', err);
      }

      res.json({ liked: true, message: 'Post liked', likesCount });
    }
  } catch (error) {
    console.error("❌ Like/unlike error:", error);
    res.status(500).json({ error: "Failed to like/unlike post" });
  } finally {
    await session.close();
  }
});

export default router;
