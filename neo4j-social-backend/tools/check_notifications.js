#!/usr/bin/env node
const axios = require("axios");
const base = process.env.BASE_URL || "http://localhost:5000";
const token = process.argv[2] || process.env.TOKEN;
const headers = token ? { Authorization: `Bearer ${token}` } : {};

function normalizeNeoInt(v) {
  try {
    if (v && typeof v === "object" && typeof v.toNumber === "function")
      return v.toNumber();
    return Number(v);
  } catch (e) {
    return v;
  }
}

async function getAll() {
  try {
    const r = await axios.get(`${base}/notifications/all`);
    console.log("\n--- /notifications/all (persisted nodes) ---");
    console.log(`status: ${r.status}`);
    console.log(JSON.stringify(r.data, null, 2));
  } catch (e) {
    console.error(
      "GET /notifications/all error",
      e.response
        ? `${e.response.status} ${JSON.stringify(e.response.data)}`
        : e.message
    );
  }
}

async function getUser() {
  if (!token) {
    console.log(
      "\nNo token provided - skipping GET /notifications (provide token as arg or set TOKEN env var)"
    );
    return;
  }
  try {
    const r = await axios.get(`${base}/notifications`, { headers });
    console.log("\n--- GET /notifications (user view) ---");
    console.log(`status: ${r.status}`);
    console.log(JSON.stringify(r.data, null, 2));
  } catch (e) {
    console.error(
      "GET /notifications error",
      e.response
        ? `${e.response.status} ${JSON.stringify(e.response.data)}`
        : e.message
    );
  }
}

async function markRead(ids) {
  if (!token) {
    console.log(
      "\nNo token provided - skipping POST /notifications/mark-read (provide token as arg or set TOKEN env var)"
    );
    return;
  }
  try {
    const body = ids && Array.isArray(ids) ? { ids } : {};
    const r = await axios.post(`${base}/notifications/mark-read`, body, {
      headers,
    });
    console.log("\n--- POST /notifications/mark-read ---");
    console.log(`status: ${r.status}`);
    try {
      console.log(JSON.stringify(r.data, null, 2));
    } catch (e) {
      console.log(r.data);
    }
  } catch (e) {
    console.error(
      "POST /notifications/mark-read error",
      e.response
        ? `${e.response.status} ${JSON.stringify(e.response.data)}`
        : e.message
    );
  }
}

(async function main() {
  console.log("Checking notifications persistence against", base);
  await getAll();
  await getUser();
  console.log("\nAttempting to mark notifications read (server-side)");
  await markRead();
  // give server a moment
  await new Promise((r) => setTimeout(r, 600));
  await getUser();
  console.log(
    "\nFinished.\nNotes: Run with a token to test user-scoped endpoints:\n  node tools/check_notifications.js <YOUR_TOKEN>\nOr set env var TOKEN before running."
  );
})();
