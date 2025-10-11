import axios from "axios";

async function run() {
  try {
    const res = await axios.post("http://localhost:5000/auth/login", {
      username: "billy",
      password: "hahaha12",
    });
    console.log("LOGIN_OK", res.data);
  } catch (e) {
    console.error(
      "LOGIN_ERR",
      e && e.response ? e.response.status : e.message,
      e && e.response ? e.response.data : "no response"
    );
    process.exit(1);
  }
}

run();
