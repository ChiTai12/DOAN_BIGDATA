// Quick test to create a message with emoji and check if icon is extracted
import fetch from "node-fetch";

async function testMessageWithEmoji() {
  try {
    // You'll need to replace these with actual user IDs and tokens from your system
    const authToken = "YOUR_AUTH_TOKEN_HERE";
    const toUserId = "TARGET_USER_ID_HERE";

    const response = await fetch("http://localhost:3000/api/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        toUserId: toUserId,
        text: "Test message with emoji 😠 should extract this!",
      }),
    });

    const result = await response.json();
    console.log("Message creation result:", result);
    console.log("Icon extracted:", result.icon);
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Uncomment to run test
// testMessageWithEmoji();

console.log("Test script created. Replace tokens and IDs to run actual test.");
