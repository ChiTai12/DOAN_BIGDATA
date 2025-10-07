import axios from "axios";

async function fullTest() {
  console.log("🚀 FULL UPDATE PROFILE TEST\n");

  const API_URL = "http://localhost:5000";

  try {
    // 1. Test server connection
    console.log("1️⃣ Testing server...");
    await axios.get(API_URL);
    console.log("✅ Server OK\n");

    // 2. Create test user
    console.log("2️⃣ Creating test user...");
    const testUser = {
      username: `testuser_${Date.now()}`,
      password: "password123",
      email: `test_${Date.now()}@test.com`,
      fullName: "Test User",
    };

    let token, userId;

    try {
      const regResponse = await axios.post(
        `${API_URL}/auth/register`,
        testUser
      );
      console.log("✅ User created:", regResponse.data.user.username);

      const loginResponse = await axios.post(`${API_URL}/auth/login`, {
        username: testUser.username,
        password: testUser.password,
      });

      token = loginResponse.data.token;
      userId = loginResponse.data.user.id;
      console.log("✅ Login OK, UserID:", userId);
      console.log("✅ Token:", token.substring(0, 30) + "...\n");
    } catch (authError) {
      console.log("❌ Auth failed:", authError.response?.data);
      console.log("Trying with hardcoded user...\n");

      // Try hardcoded login
      const loginResponse = await axios.post(`${API_URL}/auth/login`, {
        username: "admin",
        password: "admin123",
      });
      token = loginResponse.data.token;
      userId = loginResponse.data.user.id;
      console.log("✅ Hardcoded login OK");
    }

    // 3. Test update profile
    console.log("3️⃣ Testing UPDATE PROFILE...");
    const updateData = {
      displayName: "billybutcher_test_" + Date.now(),
    };

    console.log("📤 Request data:", updateData);
    console.log(
      "📤 Headers: Authorization: Bearer",
      token.substring(0, 20) + "..."
    );
    console.log("📤 URL:", `${API_URL}/users/update`);

    const updateResponse = await axios.put(
      `${API_URL}/users/update`,
      updateData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("\n🎉 UPDATE SUCCESS!");
    console.log("📥 Response Status:", updateResponse.status);
    console.log("📥 Response Data:", updateResponse.data);
  } catch (error) {
    console.log("\n💥 ERROR OCCURRED:");
    console.log("━".repeat(50));

    if (error.code === "ECONNREFUSED") {
      console.log("❌ Server not running on port 5000");
      return;
    }

    console.log("❌ Status Code:", error.response?.status);
    console.log("❌ Error Message:", error.response?.data);
    console.log("❌ URL:", error.config?.url);
    console.log("❌ Method:", error.config?.method);
    console.log("❌ Request Data:", error.config?.data);
    console.log("❌ Request Headers:", error.config?.headers);

    if (error.response?.status === 401) {
      console.log("\n🔐 TOKEN ISSUE - Invalid or expired token");
    }
    if (error.response?.status === 404) {
      console.log("\n🔍 ROUTE NOT FOUND - Check /users/update exists");
    }
    if (error.response?.status === 500) {
      console.log("\n💀 SERVER ERROR - Check server logs for details");
    }
  }
}

fullTest();
