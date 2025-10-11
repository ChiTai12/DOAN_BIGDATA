import axios from "axios";

const BASE = process.env.BASE_URL || "http://localhost:5000";

async function testPostEmoji() {
  try {
    // Login as GOAT
    const actorRes = await axios.post(`${BASE}/auth/login`, {
      username: "GOAT",
      password: "123456",
    });
    const actorToken = actorRes.data.token;
    console.log("✅ Actor logged in:", actorRes.data.user.id);

    // Create a post with multiple emojis
    const content = "Bài thử emoji: ê ❤️❤️😍🤬";
    const createRes = await axios.post(
      `${BASE}/posts`,
      { content },
      { headers: { Authorization: `Bearer ${actorToken}` } }
    );
    console.log(
      "📨 Create post response:",
      createRes.status,
      createRes.data.message
    );

    // Fetch feed and find the created post
    const feedRes = await axios.get(`${BASE}/posts/feed`, {
      headers: { Authorization: `Bearer ${actorToken}` },
    });
    const posts = feedRes.data || [];
    const found = posts.find((p) => p.post && p.post.content === content);
    if (!found) {
      console.log(
        "❌ Không tìm thấy post vừa tạo trong feed (có thể do cache hoặc limit). Lấy bản mới nhất:"
      );
      if (posts.length > 0) console.log(posts[0]);
      else console.log("Feed rỗng");
      return;
    }

    console.log("📝 Persisted post:", {
      id: found.post.id,
      content: found.post.content,
      icon: found.post.icon,
    });

    if (Array.isArray(found.post.icon)) {
      console.log(
        `🔍 Icon array (${found.post.icon.length}):`,
        found.post.icon
      );
    } else {
      console.log(
        "🔍 Icon is not an array:",
        typeof found.post.icon,
        found.post.icon
      );
    }
  } catch (e) {
    console.error("❌ Test failed:", e.response?.data || e.message);
  }
}

testPostEmoji();
