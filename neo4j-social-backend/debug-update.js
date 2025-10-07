import axios from "axios";

async function debugUpdateProfile() {
  console.log("🔍 DEBUGGING UPDATE PROFILE ISSUE...\n");

  try {
    // 1. Test server connection
    console.log("1️⃣ Testing server connection...");
    const serverTest = await axios.get("http://localhost:5000");
    console.log("✅ Server responding");

    // 2. Test create a user first
    console.log("\n2️⃣ Creating test user...");
    const timestamp = Date.now();
    const testUser = {
      username: `debuguser${timestamp}`,
      password: "password123",
      email: `debug${timestamp}@test.com`,
      fullName: "Debug User",
    };

    let token, userId;
    try {
      const registerResponse = await axios.post(
        "http://localhost:5000/auth/register",
        testUser
      );
      console.log("✅ User created:", registerResponse.data.user?.username);

      // Login to get token
      const loginResponse = await axios.post(
        "http://localhost:5000/auth/login",
        {
          username: testUser.username,
          password: testUser.password,
        }
      );
      token = loginResponse.data.token;
      userId = loginResponse.data.user.id;
      console.log("✅ Login successful, user ID:", userId);
    } catch (regError) {
      console.log("❌ Registration failed, trying with existing user...");
      console.log("Registration error:", regError.response?.data);

      // Try with dummy credentials
      try {
        const loginResponse = await axios.post(
          "http://localhost:5000/auth/login",
          {
            username: "billy",
            password: "password123", // Try common password
          }
        );
        token = loginResponse.data.token;
        userId = loginResponse.data.user.id;
        console.log("✅ Login with existing user successful");
      } catch (loginError) {
        console.log("❌ Login also failed:", loginError.response?.data);
        return;
      }
    }

    // 3. Test update profile
    console.log("\n3️⃣ Testing profile update...");
    const updatePayload = {
      displayName: "billybutcher_debug",
    };

    console.log("📤 Sending update request...");
    console.log("Token:", token.substring(0, 20) + "...");
    console.log("Payload:", updatePayload);
    console.log("User ID:", userId);

    const updateResponse = await axios.put(
      "http://localhost:5000/users/update",
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ UPDATE SUCCESSFUL!");
    console.log("📥 Response:", updateResponse.data);
  } catch (error) {
    console.error("\n❌ DETAILED ERROR ANALYSIS:");
    console.error("═".repeat(50));

    if (error.code === "ECONNREFUSED") {
      console.error("🚨 SERVER NOT RUNNING");
      return;
    }

    console.error("HTTP Status:", error.response?.status);
    console.error("Error Data:", error.response?.data);
    console.error("Request URL:", error.config?.url);
    console.error("Request Method:", error.config?.method);
    console.error("Request Headers:", error.config?.headers);
    console.error("Request Data:", error.config?.data);

    if (error.response?.headers) {
      console.error("Response Headers:", error.response.headers);
    }

    // Additional debugging
    if (error.response?.status === 401) {
      console.error("🔐 AUTHENTICATION ISSUE - Invalid or missing token");
    }
    if (error.response?.status === 404) {
      console.error("🔍 ENDPOINT NOT FOUND - Check route exists");
    }
    if (error.response?.status === 500) {
      console.error("💥 SERVER ERROR - Check server logs");
    }
  }
}

debugUpdateProfile();
