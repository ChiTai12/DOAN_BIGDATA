import axios from "axios";

async function testUpdate() {
  console.log("Testing update API...");

  try {
    const response = await axios.get("http://localhost:5000");
    console.log("Server OK");

    // Test update với fake token để xem endpoint có tồn tại không
    try {
      await axios.put(
        "http://localhost:5000/users/update",
        { displayName: "test" },
        { headers: { Authorization: "Bearer fake_token" } }
      );
    } catch (err) {
      console.log("Status:", err.response?.status);
      console.log("Error:", err.response?.data);

      if (err.response?.status === 401) {
        console.log("✅ Endpoint exists, needs auth");
      } else if (err.response?.status === 404) {
        console.log("❌ Endpoint not found");
      }
    }
  } catch (error) {
    console.log("Server error:", error.message);
  }
}

testUpdate();
