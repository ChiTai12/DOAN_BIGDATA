import axios from "axios";

const BASE = "http://localhost:5000";

async function simpleUpdateTest() {
  try {
    const login = await axios.post(`${BASE}/auth/login`, {
      username: "GOAT",
      password: "123456",
    });
    const token = login.data.token;
    console.log("✅ Logged in");

    // Update existing post
    const postId = "bf16cfab-1c11-4176-bf5a-7c1af606f34a";
    const newContent = "Test update with emojis 😄😄😍🤬";

    console.log("Updating post with content:", newContent);

    const update = await axios.put(
      `${BASE}/posts/${postId}`,
      { content: newContent },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log("✅ Update response:", update.status, update.data);
  } catch (e) {
    console.error(
      "❌ Error:",
      e.response?.status,
      e.response?.data || e.message
    );
  }
}

simpleUpdateTest();
