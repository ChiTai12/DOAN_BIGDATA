import axios from "axios";
import { io } from "socket.io-client";

const BASE = process.env.BASE_URL || "http://localhost:5000";

const USER_A = process.env.TEST_USER_A || "testuserA";
const USER_B = process.env.TEST_USER_B || "testuserB";
const PASSWORD = process.env.TEST_PASS || "password123";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureUser(username) {
  // try login
  try {
    const res = await axios.post(`${BASE}/auth/login`, {
      username,
      password: PASSWORD,
    });
    return res.data;
  } catch (err) {
    // if not found, try register
    if (err.response && err.response.status === 404) {
      console.log(`User ${username} not found, registering...`);
      await axios.post(`${BASE}/auth/register`, {
        username,
        password: PASSWORD,
        displayName: username,
      });
      return (
        await axios.post(`${BASE}/auth/login`, {
          username,
          password: PASSWORD,
        })
      ).data;
    }
    throw err;
  }
}

async function main() {
  console.log("Test realtime delete script starting...");
  try {
    const a = await ensureUser(USER_A);
    const b = await ensureUser(USER_B);

    const tokenA = a.token;
    const tokenB = b.token;

    console.log(
      "Logged in:",
      USER_A,
      "->",
      a.user?.id,
      USER_B,
      "->",
      b.user?.id
    );

    // Connect socket for user B and listen for post:deleted
    const socketB = io(BASE, {
      auth: { token: tokenB },
      transports: ["websocket"],
    });

    let receivedDelete = null;
    const deletePromise = new Promise((resolve) => {
      socketB.on("connect", () => console.log("socketB connected", socketB.id));
      socketB.on("post:deleted", (payload) => {
        console.log("socketB received post:deleted", payload);
        receivedDelete = payload;
        resolve({ ok: true, payload });
      });
      socketB.on("connect_error", (err) =>
        console.error("socketB connect_error", err.message)
      );
    });

    // Create a post as user A
    const content = `realtime-delete-test ${Date.now()}`;
    console.log("Creating post as", USER_A, content);
    await axios.post(
      `${BASE}/posts`,
      { content },
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );

    // wait a bit for DB and emit
    await delay(800);

    // Fetch feed as A to find the post id
    const feedRes = await axios.get(`${BASE}/posts/feed`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const posts = feedRes.data || [];
    const found = posts.find(
      (p) =>
        p.post &&
        p.post.content === content &&
        p.author &&
        p.author.id === a.user?.id
    );
    if (!found) {
      console.error("Could not find created post in feed. Aborting.");
      process.exitCode = 2;
      socketB.disconnect();
      return;
    }
    const postId = found.post.id;
    console.log("Found created post id:", postId);

    // Delete the post as user A
    console.log("Deleting post as", USER_A, postId);
    await axios.delete(`${BASE}/posts/delete/${postId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });

    // wait for socketB to receive delete (timeout 8s)
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ ok: false }), 8000)
    );
    const result = await Promise.race([deletePromise, timeout]);
    if (result && result.ok) {
      console.log("SUCCESS: user B received post:deleted", result.payload);
      process.exitCode = 0;
    } else {
      console.error("FAIL: user B did NOT receive post:deleted within timeout");
      process.exitCode = 3;
    }

    socketB.disconnect();
  } catch (err) {
    try {
      console.error("Error during test:", err.stack || err);
      if (err && err.response) {
        console.error("Axios response data:", err.response.data);
        console.error("Axios status:", err.response.status);
      }
    } catch (logErr) {
      console.error("Failed to print error details", logErr);
    }
    process.exitCode = 4;
  }
}

main();
