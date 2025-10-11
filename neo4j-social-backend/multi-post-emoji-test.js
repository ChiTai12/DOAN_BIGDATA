import axios from "axios";

const BASE = process.env.BASE_URL || "http://localhost:5000";

const cases = [
  { name: "no emoji", content: "Bài không emoji" },
  { name: "single emoji", content: "Vui quá 😄" },
  { name: "multiple emojis duplicates", content: "ê ❤️❤️😍🤬" },
  { name: "mixed text and emojis", content: "hello 😮😮 world ❤️" },
];

async function run() {
  try {
    const actorRes = await axios.post(`${BASE}/auth/login`, {
      username: "GOAT",
      password: "123456",
    });
    const token = actorRes.data.token;
    console.log("✅ Logged in as:", actorRes.data.user.id);

    for (const c of cases) {
      try {
        const createRes = await axios.post(
          `${BASE}/posts`,
          { content: c.content },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log(
          `\n📨 Case: ${c.name} -> ${createRes.status} ${createRes.data.message}`
        );

        const feedRes = await axios.get(`${BASE}/posts/feed`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const posts = feedRes.data || [];
        const found = posts.find((p) => p.post && p.post.content === c.content);
        if (!found) {
          console.log("❌ Not found in feed; recent post:", posts[0] || null);
          continue;
        }
        console.log("📝 Persisted:", {
          id: found.post.id,
          content: found.post.content,
          icon: found.post.icon,
        });
        console.log(
          "🔍 icon type:",
          Array.isArray(found.post.icon) ? "array" : typeof found.post.icon,
          found.post.icon
        );
      } catch (err) {
        console.error(
          `❌ Case ${c.name} failed:`,
          err.response?.data || err.message
        );
      }
    }
  } catch (e) {
    console.error("❌ Setup/login failed:", e.response?.data || e.message);
  }
}

run();
