import axios from "axios";

(async function () {
  try {
    const res = await axios.post(
      "http://localhost:5000/posts/d41e663c-6a57-422c-94bc-3b7eefb62be7/comments",
      { content: "script test from agent" },
      { headers: { Authorization: "Bearer INVALID" } }
    );
    console.log("status", res.status, res.data);
  } catch (err) {
    if (err.response) {
      console.error("response status", err.response.status, err.response.data);
    } else {
      console.error("error", err.message);
    }
    console.error(err.stack);
  }
})();
