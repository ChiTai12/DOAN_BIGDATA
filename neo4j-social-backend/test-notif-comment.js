import axios from "axios";
import { io } from "socket.io-client";

const BASE = process.env.BASE_URL || "http://localhost:5000";
const ACTOR = process.env.ACTOR_USER || "GOAT";
const RECIPIENT = process.env.RECIPIENT_USER || "HAHA";
const ACTOR_PASS =
  process.env.ACTOR_PASS || process.env.TEST_PASS || "password123";
const RECIPIENT_PASS =
  process.env.RECIPIENT_PASS || process.env.TEST_PASS || "password123";

async function login(username, password) {
  const res = await axios.post(`${BASE}/auth/login`, { username, password });
  return res.data;
}

async function main() {
  console.log("Starting notification test...");
  try {
    // Login recipient first and attach socket listener
    const recipient = await login(RECIPIENT, RECIPIENT_PASS);
    console.log("Recipient logged in:", recipient.user?.id);
    const recipientToken = recipient.token;

    const sock = io(BASE, { auth: { token: recipientToken } });
    sock.on("connect", () =>
      console.log("Recipient socket connected, id=", sock.id)
    );
    sock.on("notification:new", (payload) => {
      console.log("🔔 Recipient received notification:new ->", payload);
      // close socket and exit after a short delay
      setTimeout(() => {
        sock.disconnect();
        process.exit(0);
      }, 500);
    });
    sock.on("connect_error", (e) =>
      console.error("Recipient socket connect_error", e)
    );

    // Ensure recipient is the post author by creating a post as recipient
    const createPostRes = await axios.post(
      `${BASE}/posts`,
      { content: `notif-test-post ${Date.now()}` },
      { headers: { Authorization: `Bearer ${recipientToken}` } }
    );
    if (!createPostRes.data || !createPostRes.data.post) {
      // Some API versions return different shape; try to fallback by fetching feed
      console.warn(
        "Create post response unexpected, fetching feed to find a post by recipient"
      );
    }
    // Attempt to find the newly created post by fetching recipient's feed or recent posts
    const actor = await login(ACTOR, ACTOR_PASS);
    const actorToken = actor.token;
    const feedRes = await axios.get(`${BASE}/posts/feed`, {
      headers: { Authorization: `Bearer ${actorToken}` },
    });
    const posts = feedRes.data || [];
    // Prefer posts authored by RECIPIENT
    let target = posts.find(
      (p) =>
        p.post &&
        ((p.post.author &&
          (p.post.author.username === RECIPIENT ||
            p.post.author.displayName === RECIPIENT)) ||
          (p.post.authorName && p.post.authorName === RECIPIENT))
    );
    if (!target && posts.length > 0) target = posts[0];
    if (!target) {
      console.error(
        "No post found in feed to comment on - create a post manually first"
      );
      process.exit(2);
    }
    const postId = target.post.id;
    console.log("Actor will comment on post id=", postId);

    const commentContent = `auto-notif-test ${Date.now()}`;
    const commentRes = await axios.post(
      `${BASE}/posts/${postId}/comments`,
      { content: commentContent },
      { headers: { Authorization: `Bearer ${actorToken}` } }
    );
    console.log("Comment API response:", commentRes.status, commentRes.data);
    // fetch persisted notifications (dev helper) to inspect if DB entry exists
    try {
      const allNotifs = await axios.get(`${BASE}/notifications/all`);
      console.log(
        "Persisted Notification nodes (sample):",
        (allNotifs.data || []).slice(0, 10)
      );
      const related = (allNotifs.data || []).filter(
        (n) =>
          n.postId === postId ||
          n.fromUserId === actor.user?.id ||
          n.commentId ===
            (commentRes.data &&
              commentRes.data.comment &&
              commentRes.data.comment.id)
      );
      console.log("Related notifications for this post/comment:", related);
    } catch (e) {
      console.warn(
        "Failed to fetch persisted notifications:",
        e && e.response ? e.response.data : e.message || e
      );
    }

    // As an extra test, call debug endpoint to force-emit a notification to the recipient
    try {
      const payload = {
        type: "comment",
        fromName: actor.user?.displayName || actor.user?.username || ACTOR,
        fromUserId: actor.user?.id,
        postId,
        commentId:
          commentRes.data &&
          commentRes.data.comment &&
          commentRes.data.comment.id,
        message: `${
          actor.user?.displayName || actor.user?.username || ACTOR
        } đã bình luận về bài viết của bạn (debug emit)`,
        notifId: "debug-" + Date.now(),
        threadId:
          commentRes.data &&
          commentRes.data.comment &&
          commentRes.data.comment.threadId,
        timestamp: Date.now(),
      };
      console.log(
        "Calling debug emit endpoint toUserId=",
        recipient.user?.id,
        "payload=",
        payload
      );
      await axios.post(`${BASE}/debug/emit-notif`, {
        toUserId: recipient.user?.id,
        payload,
      });
    } catch (e) {
      console.warn(
        "Debug emit failed:",
        e && e.response ? e.response.data : e.message || e
      );
    }

    // wait up to 5s for socket event
    setTimeout(() => {
      console.error("Timed out waiting for notification");
      sock.disconnect();
      process.exit(3);
    }, 5000);
  } catch (err) {
    console.error(
      "Test failed:",
      err && err.response ? err.response.data : err
    );
    process.exit(4);
  }
}

main();
