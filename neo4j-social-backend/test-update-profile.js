import axios from "axios";

// Test script để kiểm tra API update profile
const API_BASE_URL = "http://localhost:5000";

// Tạo user test và test update profile
async function testUpdateProfile() {
  console.log("🧪 Starting update profile test...");

  try {
    // 1. Đăng ký user test
    console.log("\n1️⃣ Creating test user...");
    const registerResponse = await axios.post(`${API_BASE_URL}/auth/register`, {
      username: "testuser" + Date.now(),
      password: "password123",
      fullName: "Test User",
      email: "test@example.com",
    });
    console.log("✅ User created:", registerResponse.data.user.username);

    // 2. Đăng nhập để lấy token
    console.log("\n2️⃣ Logging in...");
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      username: registerResponse.data.user.username,
      password: "password123",
    });
    const token = loginResponse.data.token;
    console.log("✅ Login successful, token:", token.substring(0, 20) + "...");

    // 3. Test update profile với username mới
    console.log("\n3️⃣ Testing profile update...");
    const newUsername = "updated_user_" + Date.now();
    const updatePayload = {
      username: newUsername,
    };

    console.log("📤 Sending update request:", updatePayload);

    const updateResponse = await axios.put(
      `${API_BASE_URL}/users/update`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Update successful!");
    console.log("📥 Response:", updateResponse.data);

    // 4. Test với username trống
    console.log("\n4️⃣ Testing empty username...");
    try {
      await axios.put(
        `${API_BASE_URL}/users/update`,
        { username: "" },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
    } catch (err) {
      console.log(
        "❌ Expected error for empty username:",
        err.response?.data?.error
      );
    }

    // 5. Test với avatar URL
    console.log("\n5️⃣ Testing avatar update...");
    const avatarUpdateResponse = await axios.put(
      `${API_BASE_URL}/users/update`,
      {
        username: newUsername,
        avatarUrl: "/uploads/test-avatar.jpg",
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    console.log("✅ Avatar update successful:", avatarUpdateResponse.data);
  } catch (error) {
    console.error("❌ Test failed:");
    console.error("Status:", error.response?.status);
    console.error("Error:", error.response?.data);
    console.error("Message:", error.message);

    if (error.code === "ECONNREFUSED") {
      console.error("🚨 Server không chạy! Hãy start server trước:");
      console.error("   cd neo4j-social-backend");
      console.error("   node server.js");
    }
  }
}

// Chạy test
testUpdateProfile();
