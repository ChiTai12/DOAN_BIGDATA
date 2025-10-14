const http = require("http");
const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiNjI5OWZhNS0wOWQ0LTQyMWEtYjNlNC0yYjYyN2M3NmJkMGIiLCJpYXQiOjE3NjAzNjU2MjYsImV4cCI6MTc2MDM2OTIyNn0.CZTBoVrbtHt0oZuXPZncqw3tOSbK6kqX2PxXgQpTivg";
const options = {
  hostname: "localhost",
  port: 5000,
  path: "/notifications",
  method: "GET",
  headers: { Authorization: "Bearer " + token },
};
const req = http.request(options, (res) => {
  console.log("STATUS", res.statusCode);
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    console.log("BODY", data);
  });
});
req.on("error", (e) => console.error("ERROR", e));
req.end();
