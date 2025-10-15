import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import driver from "../db/driver.js";
import emojiRegex from "emoji-regex";
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
  // Determine icon array: use provided icon when present (array or JSON string),
  // otherwise extract emojis from content preserving order and duplicates.
  let icon = [];
  try {
    const rawIcon = req.body.icon;
    // If client provided an array, use it directly
    if (Array.isArray(rawIcon)) {
      icon = rawIcon.filter(Boolean);
    }
    // If client provided a string, try to parse JSON array first; otherwise prefer extracting from content when available
    else if (typeof rawIcon === "string" && rawIcon !== "") {
      try {
        const parsed = JSON.parse(rawIcon);
        if (Array.isArray(parsed)) {
          icon = parsed.filter(Boolean);
        } else {
          // prefer extracting from content if present, else fall back to rawIcon matches
          icon =
            content && typeof content === "string"
              ? content.match(emojiRegex()) || []
              : rawIcon.match(emojiRegex()) || [];
        }
      } catch (e) {
        icon =
          content && typeof content === "string"
            ? content.match(emojiRegex()) || []
            : rawIcon.match(emojiRegex()) || [];
      }
    }
    // No rawIcon provided - extract from content
    else if (content && typeof content === "string") {
      icon = content.match(emojiRegex()) || [];
    }
  } catch (e) {
    console.warn("🪪 post icon extraction failed", e);
    icon = [];
  }

  console.log("🔍 Post creation debug:", {
    content,
    icon,
    rawIcon: req.body.icon,
  });

  // normalize icon: ensure it's always an array (avoid empty string persisted)
  try {
    if (!Array.isArray(icon)) {
      if (typeof icon === "string") {
        // try parse JSON array or extract emojis from string
        try {
          const parsed = JSON.parse(icon);
          icon = Array.isArray(parsed)
            ? parsed.filter(Boolean)
            : icon.match(emojiRegex()) || [];
        } catch (e) {
          icon = icon.match(emojiRegex()) || [];
        }
      } else if (icon == null) {
        icon = [];
      } else {
        // unexpected type, coerce to empty array
        icon = [];
      }
    }
  } catch (e) {
    icon = [];
  }

  const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";
  const postId = uuidv4();
  const session = driver.session();

  try {
    const createRes = await session.run(
      `
      MATCH (u:User {id:$userId})
      CREATE (u)-[:POSTED]->(p:Post {
        id:$postId, content:$content, imageUrl:$imageUrl, icon:coalesce($icon, []), createdAt:timestamp()
      })
      RETURN p
      `,
      { userId: req.userId, postId, content, imageUrl, icon }
    );

    // Try to fetch the created post with author info so we can emit real-time event
    try {
      const q = `
        MATCH (author:User)-[:POSTED]->(p:Post {id:$postId})
        OPTIONAL MATCH (p)<-[:LIKES]-(liker:User)
        WITH author, p, COUNT(liker) AS likesCount
        RETURN author, p, likesCount LIMIT 1
      `;
      const result = await session.run(q, { postId });
      if (result.records && result.records.length > 0) {
        const rec = result.records[0];
        const author = rec.get("author").properties;
        delete author.passwordHash;
        const p = rec.get("p").properties;
        const likesCount = rec.get("likesCount")
          ? rec.get("likesCount").toNumber
            ? rec.get("likesCount").toNumber()
            : rec.get("likesCount")
          : 0;
        const payload = {
          author,
          post: {
            ...p,
            likesCount,
            liked: false,
          },
        };
        const ioAll = req.app.locals.io;
        if (ioAll) {
          ioAll.emit("post:created", payload);
          ioAll.emit("stats:update"); // Thông báo dashboard cập nhật realtime
          console.log(`🔊 Emitted post:created for post=${postId}`);
        }
      }
    } catch (emitErr) {
      console.error("❌ Failed to emit post:created", emitErr);
    }

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
    // XÓA TOÀN BỘ: comments, notifications, likes và mọi relationships liên quan đến post này
    let deletedNotifIds = [];
    let deletedCommentIds = [];

    try {
      console.log(
        `🔥 COMPREHENSIVE DELETE for post ${req.params.postId} - removing ALL related data`
      );

      // 1. Tìm và xóa TẤT CẢ Comment nodes liên quan đến post (bao gồm cả replies)
      const commentFindQ = `
        MATCH (c:Comment)-[:ABOUT]->(p:Post {id:$postId})
        RETURN c.id AS id
      `;
      const commentRes = await session.run(commentFindQ, {
        postId: req.params.postId,
      });
      deletedCommentIds = commentRes.records.map((r) => r.get("id")) || [];

      if (deletedCommentIds.length > 0) {
        console.log(
          `🗑️ Deleting ${deletedCommentIds.length} Comment nodes for post ${req.params.postId}`
        );
        // DETACH DELETE sẽ xóa comment nodes và tất cả relationships (COMMENTED, REPLAY, etc.)
        await session.run(
          `MATCH (c:Comment) WHERE c.id IN $ids DETACH DELETE c`,
          { ids: deletedCommentIds }
        );
      }

      // 2. Tìm và xóa TẤT CẢ Notification nodes liên quan đến post HOẶC comments của post
      const notifFindQ = `
        MATCH (n:Notification)
        WHERE exists((n)-[:ABOUT]->(:Post {id:$postId}))
           OR coalesce(n.postId, '') = $postId
           OR (n.commentId IS NOT NULL AND n.commentId IN $commentIds)
        RETURN DISTINCT n.id AS id
      `;
      // ensure commentIds is an array (empty array allowed)
      const notifRes = await session.run(notifFindQ, {
        postId: req.params.postId,
        commentIds: Array.isArray(deletedCommentIds) ? deletedCommentIds : [],
      });
      deletedNotifIds = notifRes.records.map((r) => r.get("id")) || [];

      if (deletedNotifIds.length > 0) {
        console.log(
          `🗑️ Deleting ${deletedNotifIds.length} Notification nodes for post ${req.params.postId}`
        );
        // DETACH DELETE sẽ xóa notification nodes và tất cả relationships (HAS_NOTIFICATION, ABOUT, etc.)
        await session.run(
          `MATCH (n:Notification) WHERE n.id IN $ids DETACH DELETE n`,
          { ids: deletedNotifIds }
        );
      }

      // 3. Xóa TẤT CẢ relationships LIKES từ users đến post này
      const likesDeleteRes = await session.run(
        `
        MATCH (u:User)-[r:LIKES]->(p:Post {id:$postId})
        DELETE r
        RETURN count(r) AS deletedLikes
      `,
        { postId: req.params.postId }
      );
      const deletedLikes = likesDeleteRes.records[0]
        ? likesDeleteRes.records[0].get("deletedLikes").toNumber()
        : 0;
      if (deletedLikes > 0) {
        console.log(
          `🗑️ Deleted ${deletedLikes} LIKES relationships for post ${req.params.postId}`
        );
      }

      // 4. Xóa các relationships REPLIED_TO liên quan đến comments đã xóa
      if (deletedCommentIds.length > 0) {
        try {
          // Xóa REPLIED_TO nếu cả 2 user không còn comment nào trong post này
          const repliedToCleanup = await session.run(
            `
            MATCH (u1:User)-[r:REPLIED_TO]->(u2:User)
            WHERE NOT EXISTS((u1)-[:COMMENTED]->(:Comment)-[:ABOUT]->(:Post {id:$postId}))
              AND NOT EXISTS((u2)-[:COMMENTED]->(:Comment)-[:ABOUT]->(:Post {id:$postId}))
            DELETE r
            RETURN count(r) as deletedCount
          `,
            { postId: req.params.postId }
          );

          const deletedRepliedTo =
            repliedToCleanup.records[0]?.get("deletedCount")?.toNumber() || 0;
          if (deletedRepliedTo > 0) {
            console.log(
              `🗑️ Cleaned up ${deletedRepliedTo} REPLIED_TO relationships for post ${req.params.postId}`
            );
          }
        } catch (e) {
          console.warn("Failed to clean REPLIED_TO relationships", e);
        }
      }

      // 5. Cuối cùng xóa Post node và mọi relationships còn lại
      await session.run(
        `
        MATCH (p:Post {id: $postId})
        DETACH DELETE p
      `,
        { postId: req.params.postId }
      );

      console.log(
        `✅ COMPLETELY DELETED post ${req.params.postId} and ALL related data`
      );
    } catch (e) {
      console.error(
        "❌ Failed comprehensive delete for post",
        req.params.postId,
        e && e.stack ? e.stack : e
      );
      throw e; // Re-throw để báo lỗi cho client
    }

    // emit real-time post deleted event so clients can remove it from their feeds
    try {
      const ioAll = req.app && req.app.locals && req.app.locals.io;
      if (ioAll) {
        const deletedPayload = {
          postId: req.params.postId,
          deletedBy: req.userId,
          deletedByUsername: authorInfo ? authorInfo.get("username") : null,
          deletedAt: Date.now(),
          notifIds: deletedNotifIds,
        };
        ioAll.emit("post:deleted", deletedPayload);
        ioAll.emit("stats:update"); // Thông báo dashboard cập nhật realtime
        console.log(
          `🔊 Emitted post:deleted for post=${req.params.postId}`,
          deletedPayload
        );

        // Also emit notification:remove to relevant users so their notification lists clear immediately
        try {
          if (Array.isArray(deletedNotifIds) && deletedNotifIds.length > 0) {
            // Best-effort: broadcast notification:remove with notifIds so clients can remove them locally
            ioAll.emit("notification:remove", { notifIds: deletedNotifIds });
            console.log(
              `🔕 Emitted notification:remove for notifIds=${JSON.stringify(
                deletedNotifIds
              )}`
            );
          }
        } catch (emitErr2) {
          console.warn(
            "Failed to emit notification:remove after post delete",
            emitErr2
          );
        }
      }
    } catch (emitErr) {
      console.warn("Failed to emit post:deleted", emitErr);
    }

    res.json({
      message: "✅ Đã xóa HOÀN TOÀN bài viết và TẤT CẢ dữ liệu liên quan!",
      postId: req.params.postId,
      deletedBy: authorInfo.get("username"),
      deleted: {
        comments: deletedCommentIds.length,
        notifications: deletedNotifIds.length,
        post: 1,
      },
    });
  } catch (error) {
    console.error(
      "❌ Delete post error:",
      error && error.stack ? error.stack : error
    );
    const safeMessage =
      process.env.NODE_ENV === "production"
        ? "Lỗi khi xóa bài viết"
        : error && error.message
        ? error.message
        : "Unknown error";
    const payload = { error: safeMessage };
    if (process.env.NODE_ENV !== "production") {
      payload.details = error && error.stack ? error.stack : error;
    }
    res.status(500).json(payload);
  } finally {
    await session.close();
  }
});

// Cập nhật bài viết - chỉ author mới sửa được
router.put(
  "/:postId",
  verifyToken,
  upload.single("image"),
  async (req, res) => {
    const { postId } = req.params;
    const { content, removeImage } = req.body;
    // parse icon similar to create: prefer provided array/string
    // if client did NOT provide icon, we'll re-extract from the updated content later
    let icon = [];
    try {
      const rawIcon = req.body.icon;
      if (
        typeof rawIcon !== "undefined" &&
        rawIcon !== null &&
        rawIcon !== ""
      ) {
        if (Array.isArray(rawIcon)) icon = rawIcon.filter(Boolean);
        else if (typeof rawIcon === "string") {
          try {
            const parsed = JSON.parse(rawIcon);
            if (Array.isArray(parsed)) icon = parsed.filter(Boolean);
            else icon = rawIcon.match(emojiRegex()) || [];
          } catch (e) {
            icon = rawIcon.match(emojiRegex()) || [];
          }
        }
      }
    } catch (e) {
      icon = [];
    }
    const session = driver.session();

    try {
      // Kiểm tra user có phải author không
      const authorCheck = await session.run(
        `
      MATCH (u:User {id: $userId})-[:POSTED]->(p:Post {id: $postId})
      RETURN p, u.username as username
      `,
        { userId: req.userId, postId }
      );

      if (authorCheck.records.length === 0) {
        return res.status(403).json({
          error: "Bạn chỉ có thể chỉnh sửa bài viết của chính mình!",
        });
      }

      const currentPost = authorCheck.records[0].get("p").properties;
      const username = authorCheck.records[0].get("username");

      // Xử lý ảnh
      let newImageUrl = currentPost.imageUrl || "";

      // Nếu có ảnh mới upload
      if (req.file) {
        newImageUrl = `/uploads/${req.file.filename}`;
      }
      // Nếu yêu cầu xóa ảnh
      else if (removeImage === "true") {
        newImageUrl = "";
      }

      // For post updates: ALWAYS re-extract icons from content to match messenger behavior
      // Ignore any provided icon and extract fresh from the new content
      let finalIcon = [];
      try {
        const effectiveContent =
          typeof content !== "undefined" && content !== null
            ? content
            : currentPost.content;
        if (effectiveContent && typeof effectiveContent === "string") {
          finalIcon = effectiveContent.match(emojiRegex()) || [];
        }
        console.log("🔍 Post update - extracted icon from content:", {
          postId,
          effectiveContent,
          finalIcon,
          originalRawIcon: req.body.icon,
        });
      } catch (e) {
        console.warn("🔍 Icon extraction failed:", e);
        finalIcon = [];
      }

      console.log("🔍 About to update with finalIcon:", finalIcon);

      // Cập nhật bài viết
      const updateRes = await session.run(
        `
      MATCH (p:Post {id: $postId})
      SET p.content = $content,
          p.imageUrl = $imageUrl,
          p.icon = $icon,
          p.updatedAt = timestamp()
      RETURN p
      `,
        {
          postId,
          content: content || currentPost.content,
          imageUrl: newImageUrl,
          icon: finalIcon,
        }
      );

      console.log(
        "🔍 Update result:",
        updateRes.records.length > 0
          ? updateRes.records[0].get("p").properties
          : "No records"
      );

      // Fetch updated post with author info for real-time event
      try {
        const q = `
        MATCH (author:User)-[:POSTED]->(p:Post {id:$postId})
        OPTIONAL MATCH (p)<-[:LIKES]-(liker:User)
        OPTIONAL MATCH (viewer:User {id:$viewerId})-[r:LIKES]->(p)
        WITH author, p, COUNT(liker) AS likesCount, (r IS NOT NULL) AS liked
        RETURN author, p, likesCount, liked LIMIT 1
      `;
        const result = await session.run(q, { postId, viewerId: req.userId });

        if (result.records && result.records.length > 0) {
          const rec = result.records[0];
          const author = rec.get("author").properties;
          delete author.passwordHash;
          const p = rec.get("p").properties;
          const likesCount = rec.get("likesCount")
            ? rec.get("likesCount").toNumber
              ? rec.get("likesCount").toNumber()
              : rec.get("likesCount")
            : 0;
          const liked = rec.get("liked");

          const payload = {
            author,
            post: {
              ...p,
              likesCount,
              liked: liked === null ? false : Boolean(liked),
            },
          };

          const ioAll = req.app.locals.io;
          if (ioAll) {
            ioAll.emit("post:updated", payload);
            ioAll.emit("stats:update"); // Thông báo dashboard cập nhật realtime
            console.log(`🔊 Emitted post:updated for post=${postId}`);
          }
        }
      } catch (emitErr) {
        console.error("❌ Failed to emit post:updated", emitErr);
      }

      res.json({
        message: "Bài viết đã được cập nhật thành công",
        postId,
        updatedBy: username,
      });
    } catch (error) {
      console.error("❌ Update post error:", error);
      res.status(500).json({ error: "Lỗi khi cập nhật bài viết" });
    } finally {
      await session.close();
    }
  }
);

// Tạo comment cho bài viết (hỗ trợ reply bằng parentId)
router.post("/:postId/comments", verifyToken, async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;
  // normalize parentId: treat empty/undefined as null
  let parentId =
    req.body && typeof req.body.parentId !== "undefined"
      ? req.body.parentId
      : null;
  if (parentId === "" || parentId === null || parentId === undefined)
    parentId = null;
  // coerce parentId to string when present to avoid surprising types from client
  if (parentId) parentId = String(parentId);
  // icon is optional feeling/emoji attached to comment - parse into array
  let icon = [];
  try {
    const rawIcon = req.body.icon;
    if (typeof rawIcon !== "undefined" && rawIcon !== null && rawIcon !== "") {
      if (Array.isArray(rawIcon)) {
        icon = rawIcon.filter(Boolean);
      } else if (typeof rawIcon === "string") {
        try {
          const parsed = JSON.parse(rawIcon);
          if (Array.isArray(parsed)) icon = parsed.filter(Boolean);
          else icon = rawIcon.match(emojiRegex()) || [];
        } catch (e) {
          icon = rawIcon.match(emojiRegex()) || [];
        }
      }
    } else if (content && typeof content === "string") {
      // fallback: extract emojis from content
      icon = content.match(emojiRegex()) || [];
    }
  } catch (e) {
    icon = [];
  }
  console.log("📥 Received comment request:", {
    postId,
    content,
    parentId,
    userId: req.userId,
    icon,
  });

  if (!content || !String(content).trim())
    return res.status(400).json({ error: "Nội dung bình luận trống" });
  const session = driver.session();
  const commentId = uuidv4();
  try {
    // Verify post exists
    const postCheck = await session.run(
      `MATCH (p:Post {id:$postId}) RETURN p LIMIT 1`,
      { postId }
    );
    if (!postCheck.records || postCheck.records.length === 0) {
      console.warn(`Post not found for id=${postId}`);
      return res.status(404).json({ error: "Bài viết không tồn tại" });
    }

    console.log(
      `✔ Post exists for id=${postId}, proceeding to create comment (parentId=${parentId})`
    );

    // If parentId provided, verify parent exists; if not, treat as top-level comment
    if (parentId) {
      try {
        const parentCheck = await session.run(
          `MATCH (parent:Comment {id:$parentId}) RETURN parent LIMIT 1`,
          { parentId }
        );
        if (!parentCheck.records || parentCheck.records.length === 0) {
          console.warn(
            `Parent comment id=${parentId} not found - creating top-level comment instead`
          );
          parentId = null;
        }
      } catch (pe) {
        console.warn("Parent check failed", pe);
        parentId = null;
      }
    }

    // create comment node and attach ABOUT relationship to post
    // set threadId based on parent.threadId or parent.id, or fallback to commentId
    const q = `
      MATCH (author:User {id:$userId}), (p:Post {id:$postId})
      OPTIONAL MATCH (parent:Comment {id:$parentId})
      WITH author, p, parent
      CREATE (author)-[:COMMENTED]->(c:Comment {
  id:$commentId,
  content:$content,
  parentId: coalesce($parentId, ''),
  threadId: coalesce(parent.threadId, parent.id, $commentId),
  icon: coalesce($icon, []),
  createdAt: timestamp()
      })-[:ABOUT]->(p)
      FOREACH (_ IN CASE WHEN parent IS NOT NULL THEN [1] ELSE [] END |
        CREATE (c)-[:REPLAY]->(parent)
      )
      RETURN author, c, parent
    `;
    const result = await session.run(q, {
      userId: req.userId,
      postId,
      commentId,
      content,
      parentId,
      icon,
    });
    console.log(
      "✔ Comment create query executed, records:",
      result.records.length
    );
    if (result.records.length === 0)
      return res.status(500).json({ error: "Failed to create comment" });
    const rec = result.records[0];
    // Defensive extraction: some driver returns nulls or missing fields in edge cases
    let author = { id: req.userId, username: "unknown" };
    try {
      if (rec.has && rec.has("author")) {
        const aNode = rec.get("author");
        if (aNode && aNode.properties) author = aNode.properties;
      } else if (rec.get && rec.get("author")) {
        const aNode = rec.get("author");
        if (aNode && aNode.properties) author = aNode.properties;
      }
    } catch (e) {
      console.warn(
        "Warning: failed to extract author from result record",
        e && e.stack ? e.stack : e
      );
    }
    try {
      delete author.passwordHash;
    } catch (e) {}

    let c = {};
    try {
      if (rec.has && rec.has("c")) {
        const cNode = rec.get("c");
        if (cNode && cNode.properties) c = cNode.properties;
      } else if (rec.get && rec.get("c")) {
        const cNode = rec.get("c");
        if (cNode && cNode.properties) c = cNode.properties;
      }
    } catch (e) {
      console.warn(
        "Warning: failed to extract comment node from result record",
        e && e.stack ? e.stack : e
      );
    }

    let parentNode = null;
    try {
      if (rec.has && rec.has("parent")) parentNode = rec.get("parent");
      else if (rec.get) parentNode = rec.get("parent");
    } catch (e) {
      parentNode = null;
    }
    const parent =
      parentNode && parentNode.properties ? parentNode.properties : null;

    // If parent exists (reply case): ensure REPLIED_TO relationship and notify parent author (skip self)
    if (parent && parent.id) {
      try {
        await session.run(
          `MATCH (u:User {id:$userId}), (parentAuthor:User)-[:COMMENTED]->(parent:Comment {id:$parentId}) MERGE (u)-[:REPLIED_TO]->(parentAuthor) RETURN u, parentAuthor`,
          { userId: req.userId, parentId }
        );
        console.log(`✅ Created/ensured REPLIED_TO relationship for users`);

        const threadId = c.threadId || parent.id || commentId;
        const replierName =
          (author && (author.displayName || author.username)) || "Someone";
        const message = `${replierName} đã trả lời bình luận của bạn`;

        // Find parent author id
        const parentAuthorQ = `MATCH (parentAuthor:User)-[:COMMENTED]->(parent:Comment {id:$parentId}) RETURN parentAuthor.id AS id LIMIT 1`;
        const parentRes = await session.run(parentAuthorQ, { parentId });
        const parentAuthorIdRaw = parentRes.records[0]
          ? parentRes.records[0].get("id")
          : null;
        const parentAuthorId =
          parentAuthorIdRaw && parentAuthorIdRaw.toString
            ? parentAuthorIdRaw.toString()
            : parentAuthorIdRaw;

        if (parentAuthorId) {
          const recipientId =
            parentAuthorId && parentAuthorId.toString
              ? parentAuthorId.toString()
              : parentAuthorId;
          const actorId =
            req.userId && req.userId.toString
              ? req.userId.toString()
              : req.userId;
          if (recipientId !== actorId) {
            const notifId = uuidv4();
            try {
              await session.run(
                `MATCH (pa:User {id:$parentAuthorId}), (p:Post {id:$postId})
                 CREATE (n:Notification {id:$notifId, type:$type, message:$message, fromUserId:$fromUserId, fromName:$fromName, threadId:$threadId, createdAt:timestamp(), commentId:$commentId, commentText:$commentText, read:false})
                 CREATE (pa)-[:HAS_NOTIFICATION]->(n)-[:ABOUT]->(p)
                 RETURN n.id AS id`,
                {
                  parentAuthorId,
                  postId,
                  notifId,
                  type: "reply",
                  message,
                  fromUserId: req.userId,
                  fromName: replierName,
                  threadId,
                  commentId,
                  commentText: content,
                }
              );

              try {
                const io = req.app && req.app.locals && req.app.locals.io;
                const userSockets =
                  req.app && req.app.locals && req.app.locals.userSockets;
                if (io) {
                  // If we have userSockets map, send to recipient sockets except actor sockets
                  if (userSockets && userSockets.has(parentAuthorId)) {
                    const recipientSockets = Array.from(
                      userSockets.get(parentAuthorId)
                    );
                    const actorSockets = new Set(
                      userSockets.get(req.userId) || []
                    );
                    recipientSockets.forEach((sId) => {
                      if (!actorSockets.has(sId)) {
                        const emitTs = Date.now();
                        io.to(sId).emit("notification:new", {
                          type: "reply",
                          fromName: replierName,
                          fromUserId: req.userId,
                          postId,
                          commentId,
                          message,
                          commentText: content,
                          notifId,
                          threadId,
                          timestamp: emitTs,
                          timeString: new Date(emitTs).toLocaleString("vi-VN"),
                        });
                      }
                    });
                  } else {
                    // fallback to room emit
                    const emitTs = Date.now();
                    io.to(parentAuthorId).emit("notification:new", {
                      type: "reply",
                      fromName: replierName,
                      fromUserId: req.userId,
                      postId,
                      commentId,
                      message,
                      commentText: content,
                      notifId,
                      threadId,
                      timestamp: emitTs,
                      timeString: new Date(emitTs).toLocaleString("vi-VN"),
                    });
                  }
                  console.log(
                    `🔔 Emitted notification:new (reply) to user=${parentAuthorId} (notifId=${notifId})`
                  );
                }
              } catch (emitErr) {
                console.warn(
                  "Failed to emit notification:new (reply)",
                  emitErr
                );
              }
            } catch (createErr) {
              console.warn(
                "Failed to create notification node for reply",
                createErr
              );
            }
          } else {
            console.log(
              `Skipping notification for reply because recipient (parentAuthor=${recipientId}) is the actor`
            );
          }
        }
      } catch (err) {
        console.warn(
          "Failed to handle parent reply/notification",
          err && err.stack ? err.stack : err
        );
      }
    }

    // Top-level comment: notify post author (skip self)
    if (!parent || !parent.id) {
      try {
        const commenterName =
          (author && (author.displayName || author.username)) || "Someone";
        const message = `${commenterName} đã bình luận trên bài viết của bạn`;
        const threadId = c.threadId || commentId;

        const authorQ = `MATCH (author:User)-[:POSTED]->(p:Post {id:$postId}) RETURN author.id AS id LIMIT 1`;
        const authorRes = await session.run(authorQ, { postId });
        const authorIdRaw = authorRes.records[0]
          ? authorRes.records[0].get("id")
          : null;
        const postAuthorId =
          authorIdRaw && authorIdRaw.toString
            ? authorIdRaw.toString()
            : authorIdRaw;

        if (postAuthorId) {
          const recipientId =
            postAuthorId && postAuthorId.toString
              ? postAuthorId.toString()
              : postAuthorId;
          const actorId =
            req.userId && req.userId.toString
              ? req.userId.toString()
              : req.userId;
          if (recipientId !== actorId) {
            const notifId = uuidv4();
            try {
              await session.run(
                `MATCH (a:User {id:$authorId}), (p:Post {id:$postId})
                 CREATE (n:Notification {id:$notifId, type:$type, message:$message, fromUserId:$fromUserId, fromName:$fromName, threadId:$threadId, createdAt:timestamp(), commentId:$commentId, commentText:$commentText, read:false})
                 CREATE (a)-[:HAS_NOTIFICATION]->(n)-[:ABOUT]->(p)
                 RETURN n.id AS id`,
                {
                  authorId: postAuthorId,
                  postId,
                  notifId,
                  type: "comment",
                  message,
                  fromUserId: req.userId,
                  fromName: commenterName,
                  threadId,
                  commentId,
                  commentText: content,
                }
              );

              try {
                const io = req.app && req.app.locals && req.app.locals.io;
                const userSockets =
                  req.app && req.app.locals && req.app.locals.userSockets;
                if (io) {
                  if (userSockets && userSockets.has(postAuthorId)) {
                    const recipientSockets = Array.from(
                      userSockets.get(postAuthorId)
                    );
                    const actorSockets = new Set(
                      userSockets.get(req.userId) || []
                    );
                    recipientSockets.forEach((sId) => {
                      if (!actorSockets.has(sId)) {
                        const emitTs = Date.now();
                        io.to(sId).emit("notification:new", {
                          type: "comment",
                          fromName: commenterName,
                          fromUserId: req.userId,
                          postId,
                          commentId,
                          message,
                          commentText: content,
                          notifId,
                          threadId,
                          timestamp: emitTs,
                          timeString: new Date(emitTs).toLocaleString("vi-VN"),
                        });
                      }
                    });
                  } else {
                    const emitTs = Date.now();
                    io.to(postAuthorId).emit("notification:new", {
                      type: "comment",
                      fromName: commenterName,
                      fromUserId: req.userId,
                      postId,
                      commentId,
                      message,
                      commentText: content,
                      notifId,
                      threadId,
                      timestamp: emitTs,
                      timeString: new Date(emitTs).toLocaleString("vi-VN"),
                    });
                  }
                  console.log(
                    `🔔 Emitted notification:new (comment) to user=${postAuthorId} (notifId=${notifId})`
                  );
                }
              } catch (emitErr) {
                console.warn(
                  "Failed to emit notification:new (comment)",
                  emitErr
                );
              }
            } catch (createErr) {
              console.warn(
                "Failed to create notification node for comment",
                createErr
              );
            }
          } else {
            console.log(
              `Skipping notification for comment because recipient (postAuthor=${recipientId}) is the actor`
            );
          }
        }
      } catch (err) {
        console.warn(
          "Failed to handle top-level comment notification",
          err && err.stack ? err.stack : err
        );
      }
    }

    const payload = { postId, comment: { ...c, author } };
    try {
      const ioAll = req.app && req.app.locals && req.app.locals.io;
      if (ioAll) {
        ioAll.emit("post:commented", payload);
        ioAll.emit("stats:update"); // Thông báo dashboard cập nhật realtime
        console.log("🔊 Emitted post:commented", payload);
      }
    } catch (emitErr) {
      console.warn("Failed to emit post:commented", emitErr);
    }

    res.json({ message: "Comment created", comment: payload.comment });
  } catch (err) {
    // Surface detailed error in server logs and return useful info in non-production
    console.error(
      "❌ Comment create error:",
      err && err.stack ? err.stack : err
    );
    const safeMessage =
      process.env.NODE_ENV === "production"
        ? "Lỗi khi tạo bình luận"
        : err && err.message
        ? err.message
        : "Unknown error";
    res.status(500).json({ error: safeMessage });
  } finally {
    await session.close();
  }
});

// Lấy danh sách comment cho 1 post (bao gồm cả parent comment info)
router.get("/:postId/comments", async (req, res) => {
  const { postId } = req.params;
  const session = driver.session();
  try {
    const q = `
      MATCH (author:User)-[:COMMENTED]->(c:Comment)-[:ABOUT]->(p:Post {id:$postId})
    OPTIONAL MATCH (c)-[:REPLAY]->(parent:Comment)<-[:COMMENTED]-(parentAuthor:User)
      RETURN author, c, parent, parentAuthor 
      ORDER BY c.createdAt ASC
    `;
    const result = await session.run(q, { postId });
    const comments = result.records.map((r) => {
      const author = r.get("author").properties;
      delete author.passwordHash;
      const comment = r.get("c").properties;

      // Lấy thông tin parent comment nếu có
      const parent = r.get("parent");
      const parentAuthor = r.get("parentAuthor");
      let parentInfo = null;

      if (parent && parentAuthor) {
        const parentAuthorProps = parentAuthor.properties;
        delete parentAuthorProps.passwordHash;
        parentInfo = {
          comment: parent.properties,
          author: parentAuthorProps,
        };
      }

      return {
        comment: comment,
        author: author,
        parent: parentInfo,
      };
    });
    res.json(comments);
  } catch (err) {
    console.error("❌ Failed to load comments", err);
    res.status(500).json({ error: "Lỗi khi tải bình luận" });
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
          // Find Notification nodes of type 'like' either linked via an ABOUT relationship to the post
          // or that have a postId property set to the post id. Restrict to type 'like' so we don't remove
          // comment notifications when someone unlikes a post.
          MATCH (n:Notification)
          OPTIONAL MATCH (n)-[:ABOUT]->(p:Post)
          WHERE n.fromUserId = $userId AND n.type = 'like' AND (p.id = $postId OR n.postId = $postId)
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
          // Also notify dashboards to refresh summary stats (likes count)
          try {
            ioAll.emit("stats:update");
          } catch (e) {
            console.warn("Failed to emit stats:update after unlike", e);
          }
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
      // After creating a like, also emit stats:update so dashboards update
      try {
        const ioAll = req.app.locals.io;
        if (ioAll) ioAll.emit("stats:update");
      } catch (e) {
        console.warn("Failed to emit stats:update after like", e);
      }
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
                WHERE n.fromUserId = $fromUserId AND n.type = 'like'
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
                  `MATCH (n:Notification {id:$notifId}) SET n.createdAt = timestamp(), n.message = $message, n.type = $type RETURN n.id`,
                  { notifId, message, type: "like" }
                );
                // rate-limit: if previous notification was created very recently, avoid emitting again
                if (Date.now() - existingMs < 5000) {
                  shouldEmit = false;
                }
              } else {
                notifId = uuidv4();
                const createNotifQ = `
                  MATCH (author:User {id:$authorId}), (p:Post {id:$postId})
                  CREATE (n:Notification {id:$notifId, type:$type, message:$message, fromUserId:$fromUserId, fromName:$fromName, createdAt:timestamp(), read:false})
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
                const emitTs = Date.now();
                io.to(authorId).emit("notification:new", {
                  type: "like",
                  fromName: likerName,
                  fromUserId: req.userId,
                  postId: req.params.postId,
                  message,
                  notifId,
                  timestamp: emitTs,
                  timeString: new Date(emitTs).toLocaleString("vi-VN"),
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
