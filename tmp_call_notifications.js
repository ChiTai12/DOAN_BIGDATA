const fs = require("fs");
const crypto = require("crypto");
const fetch = global.fetch || require("node-fetch");

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

try {
  const env = fs.readFileSync(
    "d:/New folder (2)/neo4j-social-backend/.env",
    "utf8"
  );
  const m = env.match(/^JWT_SECRET=(.*)$/m);
  const secret = m ? m[1].trim() : "secret";
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    userId: "b6299fa5-09d4-421a-b3e4-2b627c76bd0b",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const unsigned =
    b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(unsigned)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const token = unsigned + "." + sig;

  // call notifications
  (async () => {
    try {
      const res = await fetch("http://localhost:5000/notifications", {
        headers: { Authorization: "Bearer " + token },
      });
      const text = await res.text();
      console.log("STATUS:", res.status);
      console.log(
        "HEADERS:",
        JSON.stringify(Object.fromEntries(res.headers.entries()))
      );
      console.log("BODY:", text);
    } catch (err) {
      console.error("FETCH ERROR:", err);
    }
  })();
} catch (err) {
  console.error("SCRIPT ERROR:", err);
}
