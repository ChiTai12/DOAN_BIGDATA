import axios from "axios";

const BASE = process.env.BASE_URL || "http://localhost:5000";
(async function () {
  try {
    const username = "qa_" + Date.now();
    const password = "pass123";
    console.log("BASE", BASE);

    // register
    console.log("Registering", username);
    await axios.post(
      `${BASE}/auth/register`,
      { username, password, displayName: username, email: `${username}@x.com` },
      { timeout: 10000 }
    );
    console.log("Registered");

    // login
    const login = await axios.post(
      `${BASE}/auth/login`,
      { username, password },
      { timeout: 10000 }
    );
    console.log("Login response", login.status, login.data);
    const token = login.data.token;

    // create post
    const content = "qa-post-" + Date.now();
    const createPost = await axios.post(
      `${BASE}/posts`,
      { content },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    );
    console.log("Create post", createPost.status, createPost.data);

    // fetch feed
    const feed = await axios.get(`${BASE}/posts/feed`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const found = feed.data.find((p) => p.post && p.post.content === content);
    if (!found) {
      console.error("post not found in feed");
      process.exit(2);
    }
    const postId = found.post.id;
    console.log("postId", postId);

    // create comment
    const commentContent = "qa-comment-" + Date.now();
    const commentRes = await axios.post(
      `${BASE}/posts/${postId}/comments`,
      { content: commentContent },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
    );
    console.log("Comment response", commentRes.status, commentRes.data);
  } catch (err) {
    console.error("Flow error", err && err.message);
    if (err.response)
      console.error("Response data", err.response.status, err.response.data);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
})();
