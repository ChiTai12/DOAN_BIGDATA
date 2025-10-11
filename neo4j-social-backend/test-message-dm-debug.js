import axios from "axios";
import { io } from "socket.io-client";

const BASE = process.env.BASE_URL || "http://localhost:5000";
const ACTOR = process.env.ACTOR_USER || "GOAT";
const RECIPIENT = process.env.RECIPIENT_USER || "billy";
const ACTOR_PASS = process.env.ACTOR_PASS || "123456";
const RECIPIENT_PASS = process.env.RECIPIENT_PASS || "hahaha12";

async function login(username, password) {
  const res = await axios.post(`${BASE}/auth/login`, { username, password });
  return res.data;
}

async function main() {
  try {
    const recipient = await login(RECIPIENT, RECIPIENT_PASS);
    const recipientToken = recipient.token;
    console.log("Recipient logged in", recipient.user.id);

    const sock = io(BASE, { auth: { token: recipientToken } });
    sock.on("connect", () =>
      console.log("Recipient socket connected", sock.id)
    );
    sock.on("message:new", (payload) => {
      console.log("Recipient message:new payload ->", payload);
      setTimeout(() => {
        sock.disconnect();
        process.exit(0);
      }, 500);
    });

    const actor = await login(ACTOR, ACTOR_PASS);
    const actorToken = actor.token;
    console.log("Actor logged in", actor.user.id);

    // Send emoji pair to test icon extraction
    const post = await axios.post(
      `${BASE}/messages/send`,
      { toUserId: recipient.user.id, text: "😭😠", icon: "" },
      { headers: { Authorization: `Bearer ${actorToken}` } }
    );
    console.log("Send response", post.status, post.data);

    setTimeout(() => {
      console.error("Timed out waiting for message:new");
      sock.disconnect();
      process.exit(2);
    }, 5000);
  } catch (e) {
    console.error("Test failed full error:", e);
    if (e && e.response) {
      console.error("Response status:", e.response.status);
      console.error("Response data:", e.response.data);
    }
    process.exit(3);
  }
}

main();
