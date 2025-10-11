import axios from "axios";

const BASE = process.env.BASE_URL || "http://localhost:5000";

async function testEmojiDuplication() {
  try {
    // Login as GOAT
    const actorRes = await axios.post(`${BASE}/auth/login`, {
      username: "GOAT",
      password: "123456",
    });
    const actorToken = actorRes.data.token;
    console.log("✅ Actor logged in:", actorRes.data.user.id);

    // Login as billy
    const recipientRes = await axios.post(`${BASE}/auth/login`, {
      username: "billy",
      password: "hahaha12",
    });
    console.log("✅ Recipient logged in:", recipientRes.data.user.id);

    // Send message with multiple emojis including duplicates
    const message = await axios.post(
      `${BASE}/messages/send`,
      {
        toUserId: recipientRes.data.user.id,
        text: "ê ❤️❤️😍🤬",
        // No icon field sent - backend should extract from text only
      },
      { headers: { Authorization: `Bearer ${actorToken}` } }
    );

    console.log("📨 Send response:", message.status);
    console.log("📝 Persisted message:", {
      id: message.data.id,
      text: message.data.text,
      icon: message.data.icon,
    });

    console.log("🎨 Frontend will now render:");
    console.log(`  Display: "${message.data.text}"`);
    console.log(
      "Expected: Should show exactly what user typed, with no duplication!"
    );

    // Check if icon preserves order and duplicates
    if (Array.isArray(message.data.icon)) {
      const iconCount = message.data.icon.length;
      const uniqueIcons = [...new Set(message.data.icon)].length;
      console.log(
        `🔍 Icon analysis: ${iconCount} total, ${uniqueIcons} unique`
      );
      console.log(`📋 Icon array:`, message.data.icon);

      // Expected: ["❤️", "❤️", "😍", "🤬"] - 4 total, 3 unique
      const expected = ["❤️", "❤️", "😍", "🤬"];
      const matches =
        JSON.stringify(message.data.icon) === JSON.stringify(expected);

      if (matches) {
        console.log(
          "✅ SUCCESS: Icons preserved with correct order and duplicates!"
        );
      } else {
        console.log(
          "❌ MISMATCH: Expected",
          expected,
          "but got",
          message.data.icon
        );
      }
    } else {
      console.log("🔍 Icon is not an array:", typeof message.data.icon);
    }
  } catch (e) {
    console.error("❌ Test failed:", e.response?.data || e.message);
  }
}

testEmojiDuplication();
