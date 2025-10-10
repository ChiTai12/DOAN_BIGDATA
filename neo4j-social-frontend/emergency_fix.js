// EMERGENCY FIX: Clear notification badge nhưng giữ lại notification trong danh sách
// Chạy script này trong browser console của frontend

console.log("🚨 EMERGENCY FIX: Clearing notification badge...");

// 1. Clear localStorage notification cache
localStorage.removeItem("notificationUnreadCount");
localStorage.removeItem("notifications");
localStorage.removeItem("lastNotificationCheck");

// 2. Set notifications as READ but keep them visible
const forceReadNotifications = [
  {
    id: "61290492-aae1-48c0-a544-19eed43072b4",
    read: true, // IMPORTANT: Set to true để không hiện badge
    type: "like",
    message: "GOAT User đã thích bài viết của bạn",
    fromUserId: "5651b602-74f2-4cc3-a1d8-0559fd6ba6a1",
    postId: "c044015a-e5ba-4f56-8065-f2aa1ba918e9",
    createdAt: Date.now(),
  },
];

sessionStorage.setItem("notifications", JSON.stringify(forceReadNotifications));
sessionStorage.setItem("notificationUnreadCount", "0");

// 3. Dispatch custom event để update UI - notifications vẫn có nhưng đã read
window.dispatchEvent(
  new CustomEvent("notificationUpdate", {
    detail: {
      notifications: forceReadNotifications, // Giữ notifications nhưng read=true
      unreadCount: 0, // Badge = 0
    },
  })
);

// 4. Force update badge = 0 (ẩn luôn)
const badge =
  document.querySelector('[data-testid="notification-badge"]') ||
  document.querySelector(".notification-badge") ||
  document.querySelector(".badge");

if (badge) {
  badge.textContent = "0";
  badge.style.display = "none"; // Ẩn badge hoàn toàn
}

// 5. Mark notification as read via API để sync với backend
fetch("/api/notifications/mark-read", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token")}`,
  },
  body: JSON.stringify({
    notificationId: "61290492-aae1-48c0-a544-19eed43072b4",
  }),
})
  .then((response) => {
    if (response.ok) {
      console.log("✅ Notification marked as read via API");
    } else {
      console.log("⚠️ API call failed, but frontend cache fixed");
    }
  })
  .catch((err) => {
    console.log("⚠️ API call failed, but frontend cache fixed");
  });

console.log("✅ Fix completed! Notification vẫn hiện nhưng badge = 0");
console.log("📋 Notifications still visible in list but marked as read");
console.log("🔄 Reload để test persistence...");

// Auto-reload sau 2 seconds
setTimeout(() => {
  window.location.reload();
}, 2000);
