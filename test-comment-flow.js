const API = "http://localhost:5000";

// Use global fetch if available (Node 18+). If not, create a tiny fetch wrapper.
let _fetch = globalThis.fetch;
if (!_fetch) {
  const http = require("http");
  _fetch = (url, opts = {}) => {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const data = opts.body ? Buffer.from(opts.body) : null;
      const options = {
        method: opts.method || "GET",
        headers: opts.headers || {},
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + u.search,
      };
      const req = http.request(options, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: async () => text,
            json: async () => JSON.parse(text),
          });
        });
      });
      req.on("error", reject);
      if (data) req.write(data);
      req.end();
    });
  };
}
const fetch = _fetch;
const registerUser = async (username, password = "123456", displayName) => {
  try {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        displayName: displayName || username,
      }),
    });
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch (e) {
      return txt;
    }
  } catch (e) {
    return null;
  }
};

async function login(username, passwordList = ["123456", "password", "admin"]) {
  for (const pw of passwordList) {
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: pw }),
      });
      const text = await res.text();
      let j = {};
      try {
        j = JSON.parse(text);
      } catch (e) {}
      if (res.ok) {
        return j.token || j.accessToken || j.data?.token || j.token;
      }
    } catch (e) {
      // ignore and try next
    }
  }
  throw new Error("Login failed for " + username);
}

async function createPost(token, content) {
  const res = await fetch(`${API}/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error("createPost failed: " + JSON.stringify(j));
  return j.postId || j.id || j.post?.id;
}

async function comment(token, postId, content, parentId = null) {
  const res = await fetch(`${API}/posts/${postId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content, parentId }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error("comment failed: " + JSON.stringify(j));
  return j.comment?.id || null;
}

async function getNotifs(token) {
  const res = await fetch(`${API}/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  return j;
}

(async () => {
  try {
    console.log("Logging in GOAT...");
    console.log("Ensure GOAT exists...");
    await registerUser("GOAT", "123456", "GOAT");
    const goatToken = await login("GOAT");
    console.log("GOAT token len", goatToken?.length);

    console.log("Create post as GOAT");
    const postId = await createPost(
      goatToken,
      "Test post from GOAT " + Date.now()
    );
    console.log("postId", postId);

    console.log("Logging in billy...");
    console.log("Ensure billy exists...");
    await registerUser("billy", "123456", "billy butcher");
    const billyToken = await login("billy");
    console.log("billy token len", billyToken?.length);

    console.log("Billy comments on GOAT post");
    const commentRes = await fetch(`${API}/posts/${postId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${billyToken}`,
      },
      body: JSON.stringify({ content: "Hi from Billy " + Date.now() }),
    });
    const commentJson = await commentRes.json();
    console.log("Billy comment result", commentJson);

    console.log("Fetch notifications for GOAT");
    const goatNotifs1 = await getNotifs(goatToken);
    console.log("GOAT notifs after Billy comment:", goatNotifs1);

    // Find comment id to reply
    const commentId = commentJson.comment?.id || null;
    console.log("Replying as GOAT to commentId", commentId);
    const replyRes = await fetch(`${API}/posts/${postId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${goatToken}`,
      },
      body: JSON.stringify({ content: "Reply from GOAT", parentId: commentId }),
    });
    const replyJson = await replyRes.json();
    console.log("GOAT reply result", replyJson);

    console.log("Fetch notifications for billy");
    const billyNotifs = await getNotifs(billyToken);
    console.log("Billy notifs after GOAT reply:", billyNotifs);

    console.log("Fetch notifications for GOAT final");
    const goatNotifs2 = await getNotifs(goatToken);
    console.log("GOAT notifs final:", goatNotifs2);
  } catch (e) {
    console.error("Test flow failed", e);
  }
})();
