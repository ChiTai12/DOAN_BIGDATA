import http from "http";

function req(opts, body) {
  return new Promise((res, rej) => {
    const r = http.request(opts, (resp) => {
      let d = "";
      resp.on("data", (c) => (d += c));
      resp.on("end", () => res({ status: resp.statusCode, body: d }));
    });
    r.on("error", (e) => rej(e));
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  try {
    const g = await req({
      host: "127.0.0.1",
      port: 5000,
      path: "/",
      method: "GET",
      timeout: 5000,
    });
    console.log("GET", g.status, g.body);
    const body = JSON.stringify({ username: "GOAT", password: "123456" });
    const p = await req(
      {
        host: "127.0.0.1",
        port: 5000,
        path: "/auth/login",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      body
    );
    console.log("POST GOAT", p.status, p.body);
    const body2 = JSON.stringify({ username: "billy", password: "hahaha12" });
    const p2 = await req(
      {
        host: "127.0.0.1",
        port: 5000,
        path: "/auth/login",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body2),
        },
      },
      body2
    );
    console.log("POST BILLY", p2.status, p2.body);
  } catch (e) {
    console.error("ERR", e.message, e.stack);
  }
})();
