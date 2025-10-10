import axios from "axios";

const base = "http://localhost:5000";

(async function () {
  try {
    const login = await axios.post(`${base}/auth/login`, {
      username: "testbot",
      password: "123456",
    });
    const token = login.data.token;
    console.log("token ok", !!token);

    const body = new URLSearchParams();
    body.append("content", "One-off test post with emoji 😎");
    body.append("icon", "😎");

    const res = await axios.post(`${base}/posts`, body.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${token}`,
      },
    });
    console.log("post response", res.data);

    const feed = await axios.get(`${base}/posts/feed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("feed length", feed.data.length);
    console.log("latest post", feed.data[0]);
  } catch (err) {
    console.error("err", err.response?.data || err.message);
  }
})();
