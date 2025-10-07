import axios from "axios";

// Script test đơn giản - dùng user hiện có
const API_BASE_URL = "http://localhost:5000";

async function testUpdateExistingUser() {
  console.log("🧪 Testing update with existing user...");

  // Dùng credentials của user hiện có (billy)
  const username = "billy";
  const password = "password123"; // hoặc password gì bạn dùng

  try {
    // 1. Đăng nhập
    console.log("\n1️⃣ Logging in with existing user...");
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      username: username,
      password: password,
    });
    const token = loginResponse.data.token;
    console.log("✅ Login successful");

    // 2. Test update profile
    console.log("\n2️⃣ Testing profile update...");
    const updatePayload = {
      username: "billyads", // Đổi tên mới
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
  } catch (error) {
    console.error("❌ Test failed:");
    console.error("Status:", error.response?.status);
    console.error("Error:", error.response?.data);
    console.error("Headers:", error.response?.headers);
    console.error("Request URL:", error.config?.url);
    console.error("Request Method:", error.config?.method);
    console.error("Request Data:", error.config?.data);

    if (error.code === "ECONNREFUSED") {
      console.error("🚨 Server không chạy! Start server:");
      console.error("   node server.js");
    }
  }
}

testUpdateExistingUser();
