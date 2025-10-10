#!/usr/bin/env node
// Test script to verify notification read flow end-to-end
const axios = require("axios");
const base = process.env.BASE_URL || "http://localhost:5000";

async function testNotificationFlow() {
  console.log("=== Notification Read Flow Test ===\n");

  // First, get all notifications to see what exists
  try {
    const allRes = await axios.get(`${base}/notifications/all`);
    console.log("1. All notifications in system:");
    allRes.data.forEach((n) => {
      console.log(`- ID: ${n.id}`);
      console.log(`  Type: ${n.type}, Message: ${n.message}`);
      console.log(`  PostID: ${n.postId}, FromUser: ${n.fromUserId}`);
      console.log(`  Read: ${n.read}, HasRead: ${n.hasOwnProperty("read")}`);
      console.log(`  CreatedAt: ${JSON.stringify(n.createdAt)}\n`);
    });
    console.log(`Total notifications: ${allRes.data.length}\n`);

    // Quick fix: if any notifications don't have read property, let's fix them
    const needsReadProp = allRes.data.filter((n) => !n.hasOwnProperty("read"));
    if (needsReadProp.length > 0) {
      console.log(
        `${needsReadProp.length} notifications missing 'read' property`
      );
      console.log("This explains why they appear unread after reload.\n");
    }
  } catch (e) {
    console.error("Failed to get all notifications:", e.message);
    return;
  }

  // Check if we have a token for user-specific tests
  const token = process.argv[2] || process.env.TOKEN;
  if (!token) {
    console.log(
      "❌ No token provided. Run with: node test_notification_flow.cjs <JWT_TOKEN>\n"
    );
    console.log(
      'To get your token from browser console: copy(localStorage.getItem("token"))'
    );
    console.log("\n🔧 Quick fix recommendation:");
    console.log(
      "The notification(s) above likely don't have read property or HAS_NOTIFICATION relationship."
    );
    console.log(
      "When you view notifications in the UI, they should be marked as read."
    );
    console.log(
      "If the badge still shows after F5, run this script with your token to debug further."
    );
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    // Step 1: Get user notifications (before marking read)
    console.log("2. Getting user notifications (before mark-read):");
    const beforeRes = await axios.get(`${base}/notifications`, { headers });
    console.log("User notifications:");
    beforeRes.data.forEach((n) => {
      console.log(`- ${n.id}: ${n.message} (read: ${n.read})`);
    });
    console.log(`User notifications count: ${beforeRes.data.length}`);

    const unreadBefore = beforeRes.data.filter((n) => !n.read).length;
    console.log(`Unread notifications: ${unreadBefore}\n`);

    // Step 2: Mark all notifications as read
    console.log("3. Marking all notifications as read:");
    const markReadRes = await axios.post(
      `${base}/notifications/mark-read`,
      {},
      { headers }
    );
    console.log(
      "Mark-read response:",
      JSON.stringify(markReadRes.data, null, 2)
    );
    console.log(`Notifications marked as read: ${markReadRes.data.updated}\n`);

    // Step 3: Get user notifications again (after marking read)
    console.log("4. Getting user notifications (after mark-read):");
    const afterRes = await axios.get(`${base}/notifications`, { headers });
    console.log("User notifications after mark-read:");
    afterRes.data.forEach((n) => {
      console.log(`- ${n.id}: ${n.message} (read: ${n.read})`);
    });
    console.log(`User notifications count: ${afterRes.data.length}`);

    const unreadAfter = afterRes.data.filter((n) => !n.read).length;
    console.log(`Unread notifications: ${unreadAfter}\n`);

    // Step 4: Verify the expected behavior
    console.log("5. Test Results:");
    if (unreadAfter === 0 && markReadRes.data.updated > 0) {
      console.log("✅ SUCCESS: Notifications properly marked as read");
      console.log("✅ Badge should show 0 after reload");
    } else if (unreadAfter > 0) {
      console.log(
        `❌ ISSUE: ${unreadAfter} notifications still unread after mark-read`
      );
      console.log("This explains why badge shows count after F5");

      // Debug: show which notifications are still unread
      const stillUnread = afterRes.data.filter((n) => !n.read);
      console.log("Unread notifications:");
      stillUnread.forEach((n) => {
        console.log(`- ${n.id}: ${n.message} (read: ${n.read})`);
      });
    } else if (markReadRes.data.updated === 0) {
      console.log("❌ ISSUE: Mark-read updated 0 notifications");
      console.log(
        "This means notifications are not linked to user or query failed"
      );

      if (beforeRes.data.length > 0) {
        console.log(
          "\n💡 The notifications exist but are not linked to your user account."
        );
        console.log(
          "This happens when Notification nodes don't have HAS_NOTIFICATION relationship to the user."
        );
        console.log(
          "The updated GET /notifications should now find them via postId matching."
        );
      }
    }
  } catch (e) {
    if (e.response) {
      console.error(
        `❌ HTTP ${e.response.status}:`,
        JSON.stringify(e.response.data)
      );
    } else {
      console.error("❌ Request failed:", e.message);
    }
  }
}

testNotificationFlow();
