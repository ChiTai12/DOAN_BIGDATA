import axios from "axios";

async function testAuth() {
  console.log("🧪 Testing Auth Endpoints...\n");

  const API_URL = "http://localhost:5000";

  try {
    // 1. Test server
    console.log("1️⃣ Testing server...");
    await axios.get(API_URL);
    console.log("✅ Server OK\n");

    // 2. Test registration
    console.log("2️⃣ Testing Registration...");
    const testUser = {
      username: `testuser_${Date.now()}`,
      password: "password123",
      email: `test_${Date.now()}@test.com`,
      fullName: "Test User",
    };

    console.log("📤 Registration data:", testUser);

    const regResponse = await axios.post(`${API_URL}/auth/register`, testUser);
    console.log("✅ Registration SUCCESS");
    console.log("📥 Response:", regResponse.data);

    // 3. Test login
    console.log("\n3️⃣ Testing Login...");
    const loginData = {
      username: testUser.username,
      password: testUser.password,
    };

    console.log("📤 Login data:", loginData);

    const loginResponse = await axios.post(`${API_URL}/auth/login`, loginData);
    console.log("✅ Login SUCCESS");
    console.log(
      "📥 Token:",
      loginResponse.data.token?.substring(0, 30) + "..."
    );
    console.log("📥 User:", loginResponse.data.user);
  } catch (error) {
    console.log("\n❌ AUTH ERROR:");
    console.log("═".repeat(50));

    if (error.code === "ECONNREFUSED") {
      console.log("🚨 Server not running on port 5000");
      return;
    }

    console.log("Status:", error.response?.status);
    console.log("Error:", error.response?.data);
    console.log("URL:", error.config?.url);
    console.log("Method:", error.config?.method);
    console.log("Request Data:", error.config?.data);

    if (error.response?.status === 500) {
      console.log("\n💀 SERVER ERROR - Check these:");
      console.log("- Neo4j connection");
      console.log("- JWT_SECRET in .env");
      console.log("- bcrypt issues");
      console.log("- Database constraints");
    }
  }
}

testAuth();
