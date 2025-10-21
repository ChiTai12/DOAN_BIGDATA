const BASE = "http://localhost:5000";

async function req(path) {
  const res = await fetch(BASE + path);
  const data = await res.json();
  return data;
}

(async () => {
  try {
    const all = await req("/notifications/all");
    console.log(
      "Notifications count:",
      Array.isArray(all) ? all.length : "N/A"
    );
    console.log(JSON.stringify(all, null, 2));
  } catch (e) {
    console.error("Failed to fetch notifications/all", e);
  }
})();
