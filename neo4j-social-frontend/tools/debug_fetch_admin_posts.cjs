const axios = require("axios");
const API = "http://localhost:5000";
(async () => {
  try {
    const res = await axios.get(`${API}/admin/posts/public`);
    const payload = res && res.data !== undefined ? res.data : res;
    let items = [];
    if (Array.isArray(payload)) items = payload;
    else if (Array.isArray(payload.data)) items = payload.data;
    else if (Array.isArray(payload.posts)) items = payload.posts;
    console.log("items.length =", items.length);
    console.log(JSON.stringify(items, null, 2));
  } catch (e) {
    console.error("ERR", e && e.response ? e.response.data : e.message);
    process.exit(1);
  }
})();
