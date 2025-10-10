const http = require("http");

async function testAutoFix() {
  try {
    console.log("🧪 Testing auto-fix...");

    const response = await new Promise((resolve, reject) => {
      const req = http.get("http://localhost:5000/notifications/all", (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Invalid JSON response"));
          }
        });
      });

      req.on("error", reject);
    });

    const notifications = response;

    console.log(`📊 Total notifications: ${notifications.length}`);

    const targetNotification = notifications.find(
      (n) => n.id === "61290492-aae1-48c0-a544-19eed43072b4"
    );

    if (targetNotification) {
      console.log(`🎯 Target notification found:`);
      console.log(`   ID: ${targetNotification.id}`);
      console.log(`   Message: ${targetNotification.message}`);
      console.log(
        `   Read: ${
          targetNotification.read
        } (type: ${typeof targetNotification.read})`
      );
      console.log(`   PostId: ${targetNotification.postId}`);
    } else {
      console.log("❌ Target notification not found!");
    }

    const unreadCount = notifications.filter((n) => !n.read).length;
    console.log(`📈 Unread notifications: ${unreadCount}`);
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

testAutoFix();
