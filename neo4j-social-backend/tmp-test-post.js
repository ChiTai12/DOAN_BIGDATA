import axios from "axios";

const base = "http://localhost:5000";

async function run() {
  try {
    // register (ignore if exists)
    try {
      await axios.post(
        `${base}/auth/register`,
        {
          username: "testbot",
          email: "testbot@example.com",
          password: "123456",
          displayName: "Test Bot",
        },
        { timeout: 5000 }
      );
      console.log("Registered testbot");
    } catch (err) {
      console.log(
        "Register may have failed (exists?):",
        err.response?.data || err.message
      );
    }

    // login
    const login = await axios.post(`${base}/auth/login`, {
      username: "testbot",
      password: "123456",
    });
    const token = login.data.token;
    console.log("Got token:", token?.slice(0, 20) + "...");

    // post with icon
    const form = new URLSearchParams();
    form.append("content", "Test post with icon 😊🚀");
    form.append("icon", "😊");

    const postRes = await axios.post(`${base}/posts`, form.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${token}`,
      },
    });
    console.log("Post response:", postRes.data);

    // fetch feed
    const feed = await axios.get(`${base}/posts/feed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(
      "Latest posts count:",
      Array.isArray(feed.data) ? feed.data.length : "unknown"
    );
    const mine = feed.data.find(
      (p) => p.author && p.author.username === "testbot"
    );
    console.log("Found my post:", mine ? mine.post : "none");
  } catch (error) {
    console.error("Error test:", error.response?.data || error.message);
  }
}

run();
