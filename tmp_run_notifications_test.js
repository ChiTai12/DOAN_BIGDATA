(async () => {
  const login = async (u) => {
    const res = await fetch("http://localhost:5000/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: "123456" }),
    });
    const j = await res.json();
    return j.token || j.accessToken || null;
  };
  const t1 = await login("tester1");
  const t2 = await login("tester2");
  console.log("t1", !!t1, "t2", !!t2);
  if (!t1 || !t2) return;
  const postRes = await fetch("http://localhost:5000/posts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + t1,
    },
    body: JSON.stringify({ content: "hello from tester1" }),
  });
  const postJson = await postRes.json();
  console.log("create post", postJson);
  const postId = postJson.post?.id || postJson.postId || postJson.id;
  const commentRes = await fetch(
    `http://localhost:5000/posts/${postId}/comments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + t2,
      },
      body: JSON.stringify({ content: "reply from tester2" }),
    }
  );
  console.log("comment status", commentRes.status, await commentRes.text());
})();
