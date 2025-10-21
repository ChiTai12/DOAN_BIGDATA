import React from "react";
// import { useAdminNotifications } from "../contexts/AdminNotificationsContext";

export default function AdminMessages() {
  // AdminNotificationsContext removed; use local placeholders so this page still renders
  const reports = [];
  const unread = 0;
  const markAllRead = () => {};
  const clearReports = () => {};

  return (
    <div className="p-4 bg-white rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Quản lý Tin Nhắn / Báo cáo</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={markAllRead}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
          >
            Đánh dấu đã đọc
          </button>
          <button
            onClick={clearReports}
            className="px-3 py-1 bg-gray-200 text-gray-800 rounded text-sm"
          >
            Xóa tất cả
          </button>
        </div>
      </div>

      <div className="mb-3 text-sm text-gray-600">Chưa đọc: {unread}</div>

      {reports.length === 0 ? (
        <div className="text-sm text-gray-500">Chưa có báo cáo nào</div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id || Math.random()} className="p-3 border rounded">
              <div className="text-sm font-medium">Bài: {r.postId}</div>
              <div className="text-xs text-gray-600">
                Người báo cáo: {r.reporterId}
              </div>
              <div className="mt-2 text-sm">
                Lý do: {r.reason || "(không có)"}
              </div>
              <div className="mt-2 text-xs text-gray-400">{r.createdAt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
