import axios from "axios";

const BASE = process.env.BASE_URL || "http://localhost:5000";
const USER = process.env.TEST_COMMENT_USER || "testcommentUser";
const PASSWORD = process.env.TEST_PASS || "password123";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureUser(username) {
  try {
    const res = await axios.post(`${BASE}/auth/login`, {
      username,
      password: PASSWORD,
    });
    return res.data;
  } catch (err) {
    if (err.response && err.response.status === 404) {
      console.log(`Registering ${username}...`);
      await axios.post(`${BASE}/auth/register`, {
        username,
        password: PASSWORD,
        displayName: username,
        email: `${username}@example.com`,
      });
      const login = await axios.post(`${BASE}/auth/login`, {
        username,
        password: PASSWORD,
      });
      return login.data;
    }
    throw err;
  }
}

async function main() {
  console.log("Starting comment persistence test...");
  try {
    const a = await ensureUser(USER);
    const token = a.token;
    console.log("User id:", a.user?.id);

    // Create post
    const content = `test-comment-post ${Date.now()}`;
    const createRes = await axios.post(
      `${BASE}/posts`,
      { content },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log("Post creation response status:", createRes.status);

    // wait briefly for DB/emit
    await delay(500);

    // fetch feed to find post
    const feedRes = await axios.get(`${BASE}/posts/feed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const posts = feedRes.data || [];
    const found = posts.find((p) => p.post && p.post.content === content);
    if (!found) {
      console.error("Could not find created post in feed.");
      process.exitCode = 2;
      return;
    }
    const postId = found.post.id;
    console.log("Found post id:", postId);

    // Create comment
    const commentContent = `auto-test-comment ${Date.now()}`;
    const commentRes = await axios.post(
      `${BASE}/posts/${postId}/comments`,
      { content: commentContent },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log("Comment create status:", commentRes.status);
    console.log("Comment create body:", commentRes.data);

    // fetch comments
    const listRes = await axios.get(`${BASE}/posts/${postId}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("Comments list status:", listRes.status);
    console.log("Comments:", JSON.stringify(listRes.data, null, 2));

    const foundComment = (listRes.data || []).find(
      (c) => c.comment && c.comment.content === commentContent
    );
    if (foundComment) {
      console.log("SUCCESS: Comment persisted and returned by API.");
      process.exitCode = 0;
    } else {
      console.error("FAIL: Comment not found in comments list.");
      process.exitCode = 3;
    }
  } catch (err) {
    console.error("Error during test:", err.stack || err);
    if (err && err.response) {
      console.error("Axios response data:", err.response.data);
      console.error("Axios status:", err.response.status);
    }
    process.exitCode = 4;
  }
}

main();
