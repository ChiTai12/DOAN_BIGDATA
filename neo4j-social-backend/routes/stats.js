import express from "express";
import driver from "../db/driver.js";

const router = express.Router();

// Endpoint lấy số liệu thống kê
router.get("/", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`
      CALL {
        MATCH (u:User)
        RETURN count(u) AS users
      }
      CALL {
        MATCH (p:Post)
        RETURN count(p) AS posts
      }
      CALL {
        MATCH (c:Comment)
        RETURN count(c) AS comments
      }
      CALL {
        MATCH (m:Message)
        RETURN count(m) AS messages
      }
      CALL {
        MATCH ()-[l:LIKES]->()
        RETURN count(l) AS likes
      }

      // Top users: prefer users who actually have followers (>0).
      // Also gather a fallback list of most active users (by post count) so we can fill to 3
      CALL {
        MATCH (u:User)
        OPTIONAL MATCH (u)<-[:FOLLOWS]-(f:User)
        WITH u, count(f) AS followers
        WHERE followers > 0
        ORDER BY followers DESC
        LIMIT 3
        RETURN collect({id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, followers: followers}) AS topUsers
      }

      // Fallback users ordered by activity (number of posts) and then followers
      CALL {
        MATCH (u:User)
        OPTIONAL MATCH (u)-[:POSTED]->(p:Post)
        OPTIONAL MATCH (u)<-[:FOLLOWS]-(f2:User)
        WITH u, count(DISTINCT p) AS postsCount, count(DISTINCT f2) AS followers
        ORDER BY postsCount DESC, followers DESC
        LIMIT 6
        RETURN collect({id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, followers: followers, posts: postsCount}) AS fallbackUsers
      }

      // Top 2 posts by interactions (likes + comments) and include author info
      CALL {
        MATCH (p:Post)
        OPTIONAL MATCH (p)<-[:LIKES]-(l:User)
        OPTIONAL MATCH (c:Comment)-[:ABOUT]->(p)
        OPTIONAL MATCH (author:User)-[:POSTED]->(p)
        WITH p, count(DISTINCT l) AS likesCount, count(DISTINCT c) AS commentsCount, author
        WITH p, likesCount, commentsCount, author, (likesCount + commentsCount) AS interactions
        ORDER BY interactions DESC
        LIMIT 2
  RETURN collect({id: p.id, title: coalesce(p.title, p.content, ''), interactions: interactions, likes: likesCount, comments: commentsCount, authorId: author.id, authorName: coalesce(author.displayName, author.username)}) AS topPosts
      }

  RETURN users, posts, likes, comments, messages, topUsers, fallbackUsers, topPosts
    `);
    if (result.records.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Không tìm thấy dữ liệu trong cơ sở dữ liệu",
      });
    }
    const record = result.records[0];
    // Helper to convert potential Neo4j Integer to JS number
    const toNumber = (v) => {
      if (v === undefined || v === null) return 0;
      if (v && typeof v === "object" && typeof v.toNumber === "function")
        return v.toNumber();
      if (typeof v === "object" && typeof v.low === "number") return v.low;
      return typeof v === "number" ? v : 0;
    };

    // topUsers, fallbackUsers and topPosts come back as arrays of maps (or null)
    const rawTopUsers = record.get("topUsers") || [];
    const rawFallback = record.get("fallbackUsers") || [];

    const parsedTopUsers = (rawTopUsers || []).map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      followers: toNumber(u.followers),
    }));

    const parsedFallback = (rawFallback || []).map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      followers: toNumber(u.followers),
      posts: toNumber(u.posts),
    }));

    // Merge: prefer parsedTopUsers (those with followers>0), then fill from parsedFallback
    const seen = new Set();
    const finalTopUsers = [];
    for (const u of parsedTopUsers) {
      if (!u || !u.id) continue;
      seen.add(u.id);
      finalTopUsers.push(u);
    }
    for (const u of parsedFallback) {
      if (finalTopUsers.length >= 3) break;
      if (!u || !u.id) continue;
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      finalTopUsers.push(u);
    }

    const rawTopPosts = record.get("topPosts") || [];
    const topPosts = (rawTopPosts || []).map((p) => ({
      id: p.id,
      title: p.title,
      interactions: toNumber(p.interactions),
      likes: toNumber(p.likes),
      comments: toNumber(p.comments),
    }));

    res.json({
      users: toNumber(record.get("users")),
      posts: toNumber(record.get("posts")),
      likes: toNumber(record.get("likes")),
      comments: toNumber(record.get("comments")),
      messages: toNumber(record.get("messages")),
      topUsers: finalTopUsers,
      topPosts,
    });
    // NOTE: Do NOT emit stats:update from the GET handler to avoid a feedback loop
    // Emitting should be done by routes that change data (posts, likes, etc.)
  } catch (error) {
    console.error("Neo4j query error:", error);
    res.status(500).json({
      status: "error",
      message: "Không thể lấy số liệu thống kê",
      error: error.message,
    });
  } finally {
    await session.close();
  }
});

export default router;

// Registrations per day endpoint (last N days)
router.get("/registrations", async (req, res) => {
  const session = driver.session();
  try {
    const days = Math.max(1, parseInt(req.query.days, 10) || 7);

    const result = await session.run(
      `MATCH (u:User) RETURN u.createdAt AS createdAt`
    );

    // Normalize createdAt values and bucket by local date (YYYY-MM-DD)
    const counts = new Map();

    const now = new Date();
    // prepare keys for the last `days` days (inclusive)
    const dayKeys = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      dayKeys.push(key);
      counts.set(key, 0);
    }

    // helper to extract numeric timestamp in milliseconds
    const extractTs = (raw) => {
      if (raw == null) return null;
      let num = null;
      // Neo4j Integer object
      if (typeof raw === "object" && raw !== null && typeof raw.toNumber === "function") {
        num = raw.toNumber();
      } else if (typeof raw === "object" && raw !== null && typeof raw.low === "number") {
        num = raw.low;
      } else if (typeof raw === "number") {
        num = raw;
      } else if (typeof raw === "string") {
        // try ISO parse first (returns ms)
        const parsed = Date.parse(raw);
        if (!isNaN(parsed)) return parsed;
        // try numeric string
        const n = Number(raw);
        if (!isNaN(n)) num = n;
      }

      if (num == null) return null;
      // Heuristic: if value looks like seconds (<= 1e11), convert to ms
      // (1e11 ~= 1973-03-03 in ms; epoch seconds are ~1e9. Use 1e11 to be safe.)
      if (Math.abs(num) < 1e11) return num * 1000;
      return num;
    };

    for (const r of result.records) {
      const raw = r.get("createdAt");
      const ts = extractTs(raw);
      if (ts == null) continue;
      const d = new Date(ts);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      if (counts.has(key)) counts.set(key, counts.get(key) + 1);
    }

    const out = dayKeys.map((k) => ({ date: k, users: counts.get(k) || 0 }));
    res.json(out);
  } catch (error) {
    console.error("/registrations error", error);
    res
      .status(500)
      .json({
        status: "error",
        message: "Không thể lấy danh sách đăng ký",
        error: error.message,
      });
  } finally {
    await session.close();
  }
});

// Alias endpoint used by frontend: /stats/trends?type=users&days=N
router.get("/trends", async (req, res) => {
  const type = req.query.type || "users";
  if (type !== "users") {
    return res.status(400).json({ status: "error", message: "Unsupported trend type" });
  }

  // Reuse the same logic as /registrations
  const session = driver.session();
  try {
    const days = Math.max(1, parseInt(req.query.days, 10) || 7);
    const result = await session.run(`MATCH (u:User) RETURN u.createdAt AS createdAt`);

    const counts = new Map();
    const now = new Date();
    const dayKeys = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      dayKeys.push(key);
      counts.set(key, 0);
    }

    const extractTs = (raw) => {
      if (raw == null) return null;
      let num = null;
      if (typeof raw === "object" && raw !== null && typeof raw.toNumber === "function") {
        num = raw.toNumber();
      } else if (typeof raw === "object" && raw !== null && typeof raw.low === "number") {
        num = raw.low;
      } else if (typeof raw === "number") {
        num = raw;
      } else if (typeof raw === "string") {
        const parsed = Date.parse(raw);
        if (!isNaN(parsed)) return parsed;
        const n = Number(raw);
        if (!isNaN(n)) num = n;
      }
      if (num == null) return null;
      if (Math.abs(num) < 1e11) return num * 1000;
      return num;
    };

    for (const r of result.records) {
      const raw = r.get("createdAt");
      const ts = extractTs(raw);
      if (ts == null) continue;
      const d = new Date(ts);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      if (counts.has(key)) counts.set(key, counts.get(key) + 1);
    }

    const out = dayKeys.map((k) => ({ date: k, users: counts.get(k) || 0 }));
    res.json(out);
  } catch (error) {
    console.error("/trends error", error);
    res.status(500).json({ status: "error", message: "Không thể lấy trends", error: error.message });
  } finally {
    await session.close();
  }
});
