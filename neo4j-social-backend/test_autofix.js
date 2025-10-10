const axios = require("axios");

async function testAutoFix() {
  try {
    console.log("🧪 Testing auto-fix...");

    const response = await axios.get("http://localhost:5000/notifications/all");
    const notifications = response.data;

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
    if (error.response) {
      console.error("Response data:", error.response.data);
    }
  }
}

testAutoFix();
