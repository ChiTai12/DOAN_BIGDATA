import express from "express";
import jwt from "jsonwebtoken";
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
    // Try to decode optional Authorization token to know the viewing user id
    let viewerId = null;
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      const token = auth.split(" ")[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        viewerId = decoded.userId;
      } catch (e) {
        // ignore invalid token, proceed as anonymous
        viewerId = null;
      }
    }

    const q = `
      MATCH (u:User)-[:POSTED]->(p:Post)
      OPTIONAL MATCH (p)<-[:LIKES]-(liker:User)
      OPTIONAL MATCH (viewer:User {id:$viewerId})-[r:LIKES]->(p)
      WITH u, p, COUNT(liker) as likesCount, (r IS NOT NULL) AS liked
      RETURN u, p, likesCount, liked ORDER BY p.createdAt DESC LIMIT 20
    `;

    const result = await session.run(q, { viewerId });
    const posts = result.records.map((r) => {
      const author = r.get("u").properties;
      delete author.passwordHash;
      const likedVal = r.get("liked");
      return {
        author,
        post: {
          ...r.get("p").properties,
          likesCount: r.get("likesCount").toNumber(),
          liked: likedVal === null ? false : Boolean(likedVal),
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
  console.log(
    `❤️ LIKE request: userId=${req.userId}, postId=${req.params.postId}`
  );
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
    console.log(
      `🔍 Existing like relationship:`,
      existingLike ? "EXISTS" : "NOT_EXISTS"
    );

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
      // Also remove any Notification nodes created for this like and notify the post author
      try {
        // First, explicitly find notification ids to delete so we can log/debug
        const findQ = `
          // Find Notification nodes either linked via an ABOUT relationship to the post
          // or that have a postId property set to the post id. This covers older/orphan
          // notifications that weren't created with the ABOUT relationship.
          MATCH (n:Notification)
          OPTIONAL MATCH (n)-[:ABOUT]->(p:Post)
          WHERE n.fromUserId = $userId AND (p.id = $postId OR n.postId = $postId)
          RETURN n.id AS id, n.fromUserId AS fromUserId, n.fromName AS fromName, n.createdAt AS createdAt
        `;
        const findRes = await session.run(findQ, {
          userId: req.userId,
          postId: req.params.postId,
        });
        const idsArray = findRes.records.map((r) => r.get("id")) || [];
        if (idsArray.length > 0) {
          console.log(
            `🗑️ Deleting notifications for post=${req.params.postId} from user=${req.userId}:`,
            idsArray
          );
          await session.run(
            `MATCH (n:Notification) WHERE n.id IN $ids DETACH DELETE n`,
            { ids: idsArray }
          );

          // find post author to notify
          const authorQ = `MATCH (author:User)-[:POSTED]->(p:Post {id:$postId}) RETURN author.id AS authorId LIMIT 1`;
          const authorRes = await session.run(authorQ, {
            postId: req.params.postId,
          });
          const authorId = authorRes.records[0]
            ? authorRes.records[0].get("authorId")
            : null;

          const io = req.app.locals.io;
          if (io && authorId) {
            io.to(authorId).emit("notification:remove", {
              type: "like",
              fromUserId: req.userId,
              postId: req.params.postId,
              notifIds: idsArray,
            });
            console.log(
              `🔕 Emitted notification:remove to user=${authorId} removedIds=${JSON.stringify(
                idsArray
              )}`
            );
          } else {
            console.log(
              `⚠️ notification:remove - no io or authorId (authorId=${authorId})`
            );
          }
        } else {
          console.log(
            `ℹ️ No persisted notifications found for post=${req.params.postId} from user=${req.userId}`
          );
        }
      } catch (err) {
        console.error("❌ Failed to remove notification nodes on unlike", err);
      }
      // emit updated likes count so clients update UI immediately
      try {
        const likesRes = await session.run(
          `MATCH (p:Post {id:$postId})<-[:LIKES]-(l:User) RETURN COUNT(l) AS c`,
          { postId: req.params.postId }
        );
        const likesCount =
          likesRes.records && likesRes.records[0]
            ? likesRes.records[0].get("c").toNumber
              ? likesRes.records[0].get("c").toNumber()
              : likesRes.records[0].get("c")
            : 0;
        const ioAll = req.app.locals.io;
        if (ioAll) {
          // broadcast update so Feed/PostCard can refresh counts
          ioAll.emit("post:likes:update", {
            postId: req.params.postId,
            liked: false,
            fromUserId: req.userId,
            likesCount,
          });
        }
      } catch (err) {
        console.error("❌ Failed to emit post:likes:update on unlike", err);
      }
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

      // After liking, fetch post author and liker info then emit a socket notification
      try {
        const authorRes = await session.run(
          `MATCH (author:User)-[:POSTED]->(p:Post {id:$postId}) RETURN author.id AS authorId, author.username AS authorUsername LIMIT 1`,
          { postId: req.params.postId }
        );
        console.log(
          `🔍 Author query result: ${authorRes.records.length} records`
        );
        if (authorRes.records.length > 0) {
          const authorId = authorRes.records[0].get("authorId");
          const authorUsername = authorRes.records[0].get("authorUsername");
          console.log(`📧 Found post author: ${authorUsername} (${authorId})`);

          // If the liker is the post author, don't create or emit a notification for self-likes.
          if (authorId === req.userId) {
            console.log(
              `ℹ️ User ${req.userId} liked their own post ${req.params.postId}; skipping notification`
            );
            try {
              // Still emit likes count update so clients update UI immediately
              const likesRes2 = await session.run(
                `MATCH (p:Post {id:$postId})<-[:LIKES]-(l:User) RETURN COUNT(l) AS c`,
                { postId: req.params.postId }
              );
              const likesCount2 =
                likesRes2.records && likesRes2.records[0]
                  ? likesRes2.records[0].get("c").toNumber
                    ? likesRes2.records[0].get("c").toNumber()
                    : likesRes2.records[0].get("c")
                  : 0;
              const ioAll2 = req.app.locals.io;
              if (ioAll2) {
                ioAll2.emit("post:likes:update", {
                  postId: req.params.postId,
                  liked: true,
                  fromUserId: req.userId,
                  likesCount: likesCount2,
                });
              }
            } catch (err) {
              console.error(
                "❌ Failed to emit post:likes:update on self-like",
                err
              );
            }
          } else {
            // fetch liker info
            const likerRes = await session.run(
              `MATCH (u:User {id:$userId}) RETURN u.username AS likerUsername, u.displayName AS likerDisplayName LIMIT 1`,
              { userId: req.userId }
            );
            let likerName = "Someone";
            if (likerRes.records.length > 0) {
              const likerDisplayName =
                likerRes.records[0].get("likerDisplayName");
              const likerUsername = likerRes.records[0].get("likerUsername");
              likerName = likerDisplayName || likerUsername || "Someone";
            }

            // create or update a persisted Notification node so it shows up on reload
            try {
              const message = `${likerName} đã thích bài viết của bạn`;
              // Check if a notification from this liker for this post already exists
              const checkQ = `
                MATCH (author:User {id:$authorId})-[:HAS_NOTIFICATION]->(n:Notification)-[:ABOUT]->(p:Post {id:$postId})
                WHERE n.fromUserId = $fromUserId
                RETURN n.id AS id, n.createdAt AS createdAt
              `;
              const checkRes = await session.run(checkQ, {
                authorId,
                postId: req.params.postId,
                fromUserId: req.userId,
              });
              let notifId;
              let shouldEmit = true;
              if (checkRes.records.length > 0) {
                // existing notification: update timestamp and message
                notifId = checkRes.records[0].get("id");
                const existingCreated = checkRes.records[0].get("createdAt");
                const existingMs = existingCreated
                  ? existingCreated.toNumber()
                  : 0;
                await session.run(
                  `MATCH (n:Notification {id:$notifId}) SET n.createdAt = timestamp(), n.message = $message RETURN n.id`,
                  { notifId, message }
                );
                // rate-limit: if previous notification was created very recently, avoid emitting again
                if (Date.now() - existingMs < 5000) {
                  shouldEmit = false;
                }
              } else {
                notifId = uuidv4();
                const createNotifQ = `
                  MATCH (author:User {id:$authorId}), (p:Post {id:$postId})
                  CREATE (n:Notification {id:$notifId, type:$type, message:$message, fromUserId:$fromUserId, fromName:$fromName, createdAt:timestamp()})
                  CREATE (author)-[:HAS_NOTIFICATION]->(n)-[:ABOUT]->(p)
                  RETURN n.id AS id
                `;
                await session.run(createNotifQ, {
                  authorId,
                  postId: req.params.postId,
                  notifId,
                  type: "like",
                  message,
                  fromUserId: req.userId,
                  fromName: likerName,
                });
              }

              const io = req.app.locals.io;
              if (shouldEmit && io && authorId) {
                io.to(authorId).emit("notification:new", {
                  type: "like",
                  fromName: likerName,
                  fromUserId: req.userId,
                  postId: req.params.postId,
                  message,
                  notifId,
                  timestamp: Date.now(),
                });
                console.log(
                  `🔔 Emitted notification:new to user=${authorId} for post=${req.params.postId} from ${likerName} (notifId=${notifId})`
                );
              } else if (!shouldEmit) {
                console.log(
                  `ℹ️ Suppressed rapid duplicate notification for user=${authorId} from ${req.userId}`
                );
              } else {
                console.log(`⚠️ No io instance or authorId missing`);
              }
              // emit updated likes count after a like so clients update UI immediately
              try {
                const likesRes2 = await session.run(
                  `MATCH (p:Post {id:$postId})<-[:LIKES]-(l:User) RETURN COUNT(l) AS c`,
                  { postId: req.params.postId }
                );
                const likesCount2 =
                  likesRes2.records && likesRes2.records[0]
                    ? likesRes2.records[0].get("c").toNumber
                      ? likesRes2.records[0].get("c").toNumber()
                      : likesRes2.records[0].get("c")
                    : 0;
                const ioAll2 = req.app.locals.io;
                if (ioAll2) {
                  ioAll2.emit("post:likes:update", {
                    postId: req.params.postId,
                    liked: true,
                    fromUserId: req.userId,
                    likesCount: likesCount2,
                  });
                }
              } catch (err) {
                console.error(
                  "❌ Failed to emit post:likes:update on like",
                  err
                );
              }
            } catch (err) {
              console.error(
                "❌ Failed to create/persist notification node",
                err
              );
            }
          }
        } else {
          console.log(`⚠️ No author found for post ${req.params.postId}`);
        }
      } catch (err) {
        console.error("❌ Failed to fetch post author for notification", err);
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
