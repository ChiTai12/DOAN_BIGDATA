import axios from "axios";

async function createAndTestUser() {
  console.log("🧪 Create user and test update...");

  try {
    const timestamp = Date.now();
    const testUsername = `testuser${timestamp}`;
    const testPassword = "password123";

    console.log("\n1️⃣ Creating user:", testUsername);

    // Tạo user mới
    const createResponse = await axios.post(
      "http://localhost:5000/auth/register",
      {
        username: testUsername,
        password: testPassword,
        email: `test${timestamp}@example.com`,
        fullName: "Test User",
      }
    );

    console.log("✅ User created successfully");

    // Login
    console.log("\n2️⃣ Logging in...");
    const loginResponse = await axios.post("http://localhost:5000/auth/login", {
      username: testUsername,
      password: testPassword,
    });

    const token = loginResponse.data.token;
    console.log("✅ Login successful");

    // Test update
    console.log("\n3️⃣ Testing update...");
    const newUsername = `updated_${timestamp}`;

    const updateResponse = await axios.put(
      "http://localhost:5000/users/update",
      { username: newUsername },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log("✅ Update successful!");
    console.log("📥 Updated user:", updateResponse.data);
  } catch (error) {
    console.error("❌ Error details:");
    console.error("Status:", error.response?.status);
    console.error("Data:", error.response?.data);
    console.error("URL:", error.config?.url);
    console.error("Method:", error.config?.method);
    console.error("Payload:", error.config?.data);

    // Chi tiết lỗi để debug
    if (error.response) {
      console.error("\n🔍 Response Headers:", error.response.headers);
      console.error("🔍 Request Headers:", error.config?.headers);
    }
  }
}

createAndTestUser();
