import axios from "axios";

async function registerTestUser() {
  console.log("🔧 Creating test user...");

  try {
    const userData = {
      username: "GOAT",
      email: "goat@test.com",
      password: "123456",
      displayName: "GOAT User",
      fullName: "GOAT Test User",
    };

    console.log("📤 Sending registration request...");
    const response = await axios.post(
      "http://localhost:5000/auth/register",
      userData
    );

    console.log("✅ User registered successfully!");
    console.log("User data:", response.data);

    // Test login
    console.log("\n🔑 Testing login...");
    const loginResponse = await axios.post("http://localhost:5000/auth/login", {
      username: userData.username,
      password: userData.password,
    });

    console.log("✅ Login successful!");
    console.log("Token:", loginResponse.data.token);
    console.log("User:", loginResponse.data.user);
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

registerTestUser();
