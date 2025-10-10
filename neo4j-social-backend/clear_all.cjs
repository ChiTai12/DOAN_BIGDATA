const http = require("http");

// Billy's token (lấy từ localStorage trong browser)
const token =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiYzdjZWNlOGItODAzNi00NjA4LTlhODEtMTlhNGI0NDFhMGE1IiwidXNlcm5hbWUiOiJiaWxseSIsImlhdCI6MTc2MDAwMDU3OSwiZXhwIjoxNzYwMDg2OTc5fQ.VRO8K1hnKJvY4mjEOyTnI8sJ0XzP6uqHHmwXV2rIqeE";

async function clearAllNotifications() {
  try {
    console.log("🔥 CALLING /notifications/clear-all...");

    const postData = JSON.stringify({});

    const options = {
      hostname: "localhost",
      port: 5000,
      path: "/notifications/clear-all",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const response = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Invalid JSON response: " + data));
          }
        });
      });

      req.on("error", reject);
      req.write(postData);
      req.end();
    });

    console.log("✅ CLEAR-ALL RESPONSE:", response);
    console.log(
      "🎉 All notifications cleared! Badge should now be 0 permanently!"
    );
  } catch (error) {
    console.error("❌ Clear-all failed:", error.message);
  }
}

clearAllNotifications();
