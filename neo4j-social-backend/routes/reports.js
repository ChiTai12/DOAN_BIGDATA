import express from "express";
import { verifyToken } from "../middleware/auth.js";
import driver from "../db/driver.js";
import { v4 as uuidv4 } from "uuid";
import requireAdmin from "../middleware/requireAdmin.js";

const router = express.Router();

console.log("📁 Reports routes loaded!");

// Create a report for a post. Request body: { postId, reason }
router.post("/", verifyToken, async (req, res) => {
  const { postId, reason } = req.body || {};
  if (!postId) return res.status(400).json({ error: "postId is required" });
  const session = driver.session();
  try {
    // find post and author
    const q = `
      MATCH (author:User)-[:POSTED]->(p:Post {id:$postId})
      RETURN author, p LIMIT 1
    `;
    const r = await session.run(q, { postId });
    if (!r.records || r.records.length === 0)
      return res.status(404).json({ error: "Post not found" });

    const author = r.records[0].get("author").properties;
    // prevent reporting your own post
    if (String(author.id) === String(req.userId)) {
      return res
        .status(403)
        .json({ error: "Không thể báo cáo bài của chính bạn" });
    }

    // Prevent duplicate report from same user on same post
    const dupCheckQ = `
      MATCH (reporter:User {id:$reporterId})-[:REPORTED]->(rep:Report)-[:ON_POST]->(p:Post {id:$postId})
      RETURN rep LIMIT 1
    `;
    const dupRes = await session.run(dupCheckQ, {
      reporterId: req.userId,
      postId,
    });
    if (dupRes.records && dupRes.records.length > 0) {
      return res.status(409).json({ error: "Bạn đã báo cáo bài viết này rồi" });
    }

    const reportId = uuidv4();
    const createQ = `
      MATCH (reporter:User {id:$reporterId}), (p:Post {id:$postId})
      CREATE (rep:Report {id:$reportId, reason:coalesce($reason, ''), status:'pending', createdAt:timestamp()})
      CREATE (reporter)-[:REPORTED]->(rep)
      CREATE (rep)-[:ON_POST]->(p)
      RETURN rep
    `;
    await session.run(createQ, {
      reporterId: req.userId,
      postId,
      reportId,
      reason: reason || "",
    });

    // Optionally emit realtime event to admins or post author (not required here)
    try {
      const ioAll = req.app.locals.io;
      if (ioAll) {
        ioAll.emit("post:reported", {
          postId,
          reportId,
          reporterId: req.userId,
        });
      }
    } catch (e) {
      console.warn("Failed to emit post:reported", e);
    }

    return res.json({ ok: true, reportId });
  } catch (e) {
    console.error("/reports error", e);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    await session.close();
  }
});

// Admin: list reports with reporter and post info
router.get("/", requireAdmin, async (req, res) => {
  const session = driver.session();
  try {
    const q = `
      MATCH (reporter:User)-[:REPORTED]->(rep:Report)-[:ON_POST]->(p:Post)
      OPTIONAL MATCH (author:User)-[:POSTED]->(p)
  RETURN rep { .id, .reason, .createdAt }, reporter { id: reporter.id, username: reporter.username, displayName: reporter.displayName }, p { id: p.id, content: p.content, imageUrl: p.imageUrl }, author { id: author.id, username: author.username, displayName: author.displayName }
      ORDER BY rep.createdAt DESC
      LIMIT 500
    `;
    const r = await session.run(q);
    const reports = r.records.map((rec) => {
      const rep = rec.get("rep");
      const reporter = rec.get("reporter");
      const post = rec.get("p");
      const author = rec.get("author");
      return {
        id: rep.id,
        reason: rep.reason || "",
        status: rep.status || "pending",
        createdAt: rep.createdAt
          ? rep.createdAt.toNumber
            ? rep.createdAt.toNumber()
            : rep.createdAt
          : null,
        reporter: reporter
          ? {
              id: reporter.id,
              username: reporter.username,
              displayName: reporter.displayName || reporter.username,
            }
          : null,
        post: post || null,
        author: author
          ? {
              id: author.id,
              username: author.username,
              displayName: author.displayName || author.username,
            }
          : null,
      };
    });
    return res.json(reports);
  } catch (e) {
    console.error("GET /reports error", e);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    await session.close();
  }
});

// Admin: update report status (reviewed, ignored, pending)
router.patch("/:reportId", requireAdmin, async (req, res) => {
  const { reportId } = req.params;
  const { status } = req.body || {};
  const allowed = ["pending", "reviewed", "ignored"];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const session = driver.session();
  try {
    const q = `
      MATCH (rep:Report {id:$reportId})
      SET rep.status = $status
      RETURN rep
    `;
    const r = await session.run(q, { reportId, status });
    if (!r.records || r.records.length === 0) {
      return res.status(404).json({ error: "Report not found" });
    }
    const rep = r.records[0].get("rep");

    // emit update
    try {
      const ioAll = req.app.locals.io;
      if (ioAll) ioAll.emit("report:updated", { reportId, status });
    } catch (e) {
      console.warn("Failed to emit report:updated", e);
    }

    return res.json({
      ok: true,
      id: rep.properties ? rep.properties.id : reportId,
      status,
    });
  } catch (e) {
    console.error("PATCH /reports/:id error", e);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    await session.close();
  }
});

export default router;
