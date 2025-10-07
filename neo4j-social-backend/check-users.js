import axios from "axios";

async function checkUsers() {
  console.log("🔍 Checking existing users...");

  try {
    // Get all users (không cần auth)
    const response = await axios.get("http://localhost:5000/users");
    console.log("✅ Users found:", response.data.length);

    response.data.forEach((user, index) => {
      console.log(`${index + 1}. Username: ${user.username}, ID: ${user.id}`);
    });

    if (response.data.length > 0) {
      const firstUser = response.data[0];
      console.log(`\n🎯 Test với user đầu tiên: ${firstUser.username}`);

      // Test update trực tiếp với user ID (bypass login)
      console.log("\n📤 Testing direct update...");

      // Giả sử chúng ta có token hợp lệ, tạo payload update
      const testPayload = {
        username: firstUser.username + "_updated",
      };

      console.log("💡 Để test thật, cần:");
      console.log("1. Login với password đúng của user");
      console.log("2. Hoặc tạo user mới");
      console.log("3. Payload sẽ gửi:", testPayload);
    }
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);

    if (error.code === "ECONNREFUSED") {
      console.error("🚨 Server không chạy!");
    }
  }
}

checkUsers();
