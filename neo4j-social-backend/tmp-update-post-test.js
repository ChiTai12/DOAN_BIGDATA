import axios from "axios";

const BASE = process.env.BASE_URL || "http://localhost:5000";

async function run() {
  try {
    const login = await axios.post(`${BASE}/auth/login`, {
      username: "GOAT",
      password: "123456",
    });
    const token = login.data.token;
    console.log("Logged in as", login.data.user.id);

    const create = await axios.post(
      `${BASE}/posts`,
      { content: "Post init ê ❤️❤️😍🤬" },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log("create", create.status, create.data.message);

    // find new post
    const feed = await axios.get(`${BASE}/posts/feed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const post = feed.data.find(
      (p) => p.post && p.post.content && p.post.content.includes("Post init ê")
    );
    if (!post) return console.log("Cannot find created post");
    console.log("created post", post.post.id, post.post.icon);

    // update to fewer emojis
    const updatedContent = "Post edited ê ☺️";
    const upd = await axios.put(
      `${BASE}/posts/${post.post.id}`,
      { content: updatedContent },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log("updated", upd.status, upd.data.message);

    // fetch feed again
    const feed2 = await axios.get(`${BASE}/posts/feed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const post2 = feed2.data.find((p) => p.post && p.post.id === post.post.id);
    console.log("after update persisted:", post2.post.content, post2.post.icon);
  } catch (e) {
    console.error(
      "error",
      e.response ? e.response.data || e.response.status : e.message,
      e.stack
    );
  }
}

run();
