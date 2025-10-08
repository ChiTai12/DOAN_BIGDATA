// Simple test to call like API
console.log("Testing like API...");

const testLike = async () => {
  try {
    // Simulate what frontend would do
    const response = await fetch(
      "http://localhost:5000/posts/some-post-id/like",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer some-token",
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Response status:", response.status);
    const data = await response.text();
    console.log("Response:", data);
  } catch (error) {
    console.log("Error:", error.message);
  }
};

testLike();
