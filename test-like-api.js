// Quick test script to verify like API works
import fetch from "node-fetch";

const API_BASE = "http://localhost:5000";

async function testLikeAPI() {
  try {
    // Test login first to get token
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "GOAT", password: "123456" }),
    });

    if (!loginRes.ok) {
      console.log("❌ Login failed:", await loginRes.text());
      return;
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log("✅ Login successful, token:", token.substring(0, 20) + "...");

    // Get posts to find a post ID
    const postsRes = await fetch(`${API_BASE}/posts/feed`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!postsRes.ok) {
      console.log("❌ Failed to get posts:", await postsRes.text());
      return;
    }

    const posts = await postsRes.json();
    console.log("📊 Found posts:", posts.length);

    if (posts.length === 0) {
      console.log("⚠️ No posts found to like");
      return;
    }

    const testPost = posts[0];
    const postId = testPost.post.id;
    console.log(
      "🎯 Testing like on post:",
      postId,
      "by author:",
      testPost.author.username
    );

    // Test like API
    const likeRes = await fetch(`${API_BASE}/posts/${postId}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!likeRes.ok) {
      console.log("❌ Like failed:", await likeRes.text());
      return;
    }

    const likeData = await likeRes.json();
    console.log("✅ Like API response:", likeData);
  } catch (error) {
    console.error("❌ Test error:", error);
  }
}

testLikeAPI();
