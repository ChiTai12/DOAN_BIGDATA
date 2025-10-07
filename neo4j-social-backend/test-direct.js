import axios from "axios";

async function testDirectUpdate() {
  console.log("🧪 Testing direct update without auth...");

  try {
    // Test với user ID giả
    const testUserId = "user_123"; // Thay bằng ID thật nếu biết
    const newUsername = "test_update_" + Date.now();

    console.log(`📤 Testing update for user ID: ${testUserId}`);
    console.log(`📤 New username: ${newUsername}`);

    const response = await axios.put(
      `http://localhost:5000/users/test-update/${testUserId}`,
      {
        username: newUsername,
      }
    );

    console.log("✅ Update successful!");
    console.log("📥 Response:", response.data);
  } catch (error) {
    console.error("❌ Error:");
    console.error("Status:", error.response?.status);
    console.error("Data:", error.response?.data);

    // Test với empty username
    console.log("\n🧪 Testing empty username...");
    try {
      const response2 = await axios.put(
        `http://localhost:5000/users/test-update/user_123`,
        {
          username: "",
        }
      );
    } catch (err2) {
      console.log(
        "❌ Expected error for empty username:",
        err2.response?.data?.error
      );
    }

    // Test với no fields
    console.log("\n🧪 Testing no fields...");
    try {
      const response3 = await axios.put(
        `http://localhost:5000/users/test-update/user_123`,
        {}
      );
    } catch (err3) {
      console.log(
        "❌ Expected error for no fields:",
        err3.response?.data?.error
      );
    }
  }
}

testDirectUpdate();
