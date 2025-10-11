const BASE = process.env.BASE_URL || "http://localhost:5000";

async function run() {
  try {
    console.log("1) Login GOAT");
    let r = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "GOAT", password: "123456" }),
    });
    const goat = await r.json().catch(() => null);
    console.log("  status", r.status, "body", goat);
    if (!r.ok) return console.error("Login GOAT failed");
    const token = goat.token;

    console.log("2) Create post with 4 emojis");
    r = await fetch(`${BASE}/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: "Post init ê ❤️❤️😍🤬" }),
    });
    const create = await r.json().catch(() => null);
    console.log("  status", r.status, "body", create);

    console.log("3) Get feed and find created post");
    r = await fetch(`${BASE}/posts/feed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const feed = await r.json().catch(() => null);
    console.log(
      "  feed len",
      Array.isArray(feed) ? feed.length : "?",
      typeof feed
    );
    const post = Array.isArray(feed)
      ? feed.find(
          (p) =>
            p.post && p.post.content && p.post.content.includes("Post init ê")
        )
      : null;
    if (!post) return console.error("Cannot find created post in feed");
    console.log("  created post id", post.post.id, "icon", post.post.icon);

    console.log("4) Update post content to one emoji");
    r = await fetch(`${BASE}/posts/${post.post.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content: "Post edited ê ☺️" }),
    });
    const upd = await r.json().catch(() => null);
    console.log("  update status", r.status, "body", upd);

    console.log("5) Fetch feed again and check persisted icon");
    r = await fetch(`${BASE}/posts/feed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const feed2 = await r.json().catch(() => null);
    const post2 = Array.isArray(feed2)
      ? feed2.find((p) => p.post && p.post.id === post.post.id)
      : null;
    console.log(
      "  after update post:",
      post2
        ? {
            id: post2.post.id,
            content: post2.post.content,
            icon: post2.post.icon,
          }
        : "not found"
    );
  } catch (e) {
    console.error("ERROR", e && e.stack ? e.stack : e);
  }
}

run();
