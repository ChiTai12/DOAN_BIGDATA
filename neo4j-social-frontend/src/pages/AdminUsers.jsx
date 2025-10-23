import React, { useEffect, useState, useRef, useMemo } from "react";
import { getAllUsers } from "../services/api";
import { updateUserStatus } from "../services/adminApi";
import ioClient from "socket.io-client";
import { SOCKET_URL } from "../config";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 6;
  const socketRef = useRef(null);
  const [filterName, setFilterName] = useState("");
  const [sortDirection, setSortDirection] = useState("none"); // 'none' | 'asc' | 'desc'

  const load = async () => {
    setLoading(true);
    try {
      const res = await getAllUsers();
      const payload = res && res.data !== undefined ? res.data : res;
      const items = Array.isArray(payload) ? payload : [];
      setUsers(items);
      return items;
    } catch (e) {
      console.error("Failed to load users", e);
    } finally {
      setLoading(false);
    }
  };
  // Helper to reload users but ensure current page remains valid
  async function awaitReload() {
    const items = await load();
    const totalPages = Math.max(1, Math.ceil((items?.length || 0) / PAGE_SIZE));
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }

  useEffect(() => {
    load();
    try {
      const token = localStorage.getItem("token");
      const socket = ioClient(SOCKET_URL, { auth: { token } });
      socketRef.current = socket;
      socket.on("connect", () =>
        console.debug("AdminUsers socket connected", socket.id)
      );
      socket.on("user:created", (payload) => {
        // simple approach: reload list
        console.debug("user:created", payload);
        awaitReload();
      });
      socket.on("user:updated", (payload) => {
        console.debug("user:updated", payload);
        awaitReload();
      });
      socket.on("user:status:updated", ({ userId, status }) => {
        console.debug("user:status:updated", userId, status);
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, status } : u))
        );
      });

      return () => {
        try {
          socket.disconnect();
        } catch (e) {}
      };
    } catch (e) {
      console.warn("Realtime init failed for AdminUsers", e);
    }
  }, []);

  return (
    <div className="p-8">
      <h2 className="text-3xl font-extrabold mb-6">QUẢN LÝ NGƯỜI DÙNG</h2>

      <div className="bg-white rounded shadow p-6 border border-slate-200">
        {loading ? (
          <div>Đang tải...</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  >
                    <path
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"
                    />
                  </svg>
                  <input
                    value={filterName}
                    onChange={(e) => {
                      setFilterName(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Tìm theo tên hoặc mã"
                    aria-label="Tìm theo tên hoặc mã"
                    className="pl-11 pr-3 h-10 w-96 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <button
                  onClick={() => {
                    setSortDirection((s) => (s === "asc" ? "desc" : "asc"));
                  }}
                  className="px-4 h-10 flex items-center justify-center text-sm border border-transparent bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Sắp xếp theo tên{" "}
                  {sortDirection === "asc"
                    ? "▲"
                    : sortDirection === "desc"
                    ? "▼"
                    : ""}
                </button>
                <button
                  onClick={async () => {
                    // clear search and reload list
                    setFilterName("");
                    setCurrentPage(1);
                    try {
                      await awaitReload();
                    } catch (e) {
                      console.error("Failed to reload users after clear", e);
                    }
                  }}
                  title="Xóa bộ lọc"
                  className="ml-2 px-3 h-10 flex items-center justify-center text-sm border bg-white rounded-md hover:bg-gray-50"
                >
                  Xóa
                </button>
              </div>
              <div className="text-sm text-gray-500">Tổng: {users.length}</div>
            </div>

            <table className="w-full table-fixed text-left text-sm">
              <thead>
                <tr>
                  <th className="px-6 py-4 font-semibold text-base w-72">
                    MÃ NGƯỜI DÙNG
                  </th>
                  <th className="px-6 py-4 font-semibold text-base">
                    TÊN HIỂN THỊ
                  </th>
                  <th className="px-6 py-4 font-semibold text-base w-40">
                    HÌNH ẢNH
                  </th>
                  <th className="px-6 py-4 font-semibold text-base w-40">
                    TRẠNG THÁI
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const processedUsers = (function () {
                    const term = String(filterName || "")
                      .trim()
                      .toLowerCase();
                    let arr = users.slice();
                    if (term) {
                      arr = arr.filter((u) => {
                        const name = String(
                          u.displayName || u.username || ""
                        ).toLowerCase();
                        const id = String(u.id || "").toLowerCase();
                        return (
                          name.indexOf(term) !== -1 || id.indexOf(term) !== -1
                        );
                      });
                    }
                    if (sortDirection === "asc" || sortDirection === "desc") {
                      arr.sort((a, b) => {
                        const na = String(
                          a.displayName || a.username || ""
                        ).toLowerCase();
                        const nb = String(
                          b.displayName || b.username || ""
                        ).toLowerCase();
                        if (na < nb) return sortDirection === "asc" ? -1 : 1;
                        if (na > nb) return sortDirection === "asc" ? 1 : -1;
                        return 0;
                      });
                    }
                    return arr;
                  })();
                  const pageSlice = processedUsers.slice(
                    (currentPage - 1) * PAGE_SIZE,
                    currentPage * PAGE_SIZE
                  );
                  return pageSlice.map((u) => (
                    <tr key={u.id} className="border-t hover:bg-gray-50">
                      <td className="px-6 py-5 align-middle max-w-[420px] overflow-hidden whitespace-nowrap truncate">
                        {u.id}
                      </td>
                      <td className="px-6 py-5 align-middle">
                        {u.displayName || u.username || "-"}
                      </td>
                      <td className="px-6 py-5 align-middle">
                        {u.avatarUrl ? (
                          <img
                            src={
                              u.avatarUrl.startsWith("/")
                                ? `http://localhost:5000${u.avatarUrl}`
                                : u.avatarUrl
                            }
                            alt="avatar"
                            className="w-16 h-16 object-cover rounded"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center text-sm text-gray-500">
                            Không có ảnh
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-5 align-middle">
                        <div className="flex items-center gap-3">
                          <span
                            className={`px-3 py-1.5 rounded text-sm ${
                              u.status === "locked"
                                ? "bg-red-100 text-red-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {u.status === "locked" ? "Bị khóa" : "Hoạt động"}
                          </span>
                          <button
                            onClick={async () => {
                              const newStatus =
                                u.status === "locked" ? "active" : "locked";
                              // optimistic update
                              setUsers((prev) =>
                                prev.map((x) =>
                                  x.id === u.id
                                    ? { ...x, status: newStatus }
                                    : x
                                )
                              );
                              try {
                                await updateUserStatus(u.id, newStatus);
                                try {
                                  // show success toast
                                  import("sweetalert2").then((Swal) =>
                                    Swal.default.fire({
                                      position: "top-end",
                                      toast: true,
                                      showConfirmButton: false,
                                      timer: 1400,
                                      icon: "success",
                                      title:
                                        newStatus === "locked"
                                          ? "Đã chặn thành công"
                                          : "Mở khóa thành công",
                                    })
                                  );
                                } catch (e) {}
                              } catch (err) {
                                console.error(
                                  "Failed to update user status",
                                  err
                                );
                                // rollback on error
                                setUsers((prev) =>
                                  prev.map((x) =>
                                    x.id === u.id
                                      ? { ...x, status: u.status }
                                      : x
                                  )
                                );
                                import("sweetalert2").then((Swal) =>
                                  Swal.default.fire({
                                    icon: "error",
                                    title: "Cập nhật thất bại",
                                    text:
                                      (err &&
                                        err.response &&
                                        err.response.data &&
                                        err.response.data.error) ||
                                      "Cập nhật trạng thái thất bại",
                                  })
                                );
                              }
                            }}
                            className="text-sm px-3 py-1 border rounded bg-white hover:bg-gray-50"
                          >
                            {u.status === "locked" ? "Mở khóa" : "Chặn"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
            {/* Pagination controls */}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Hiển thị{" "}
                {users.length === 0
                  ? 0
                  : Math.min(
                      users.length,
                      (currentPage - 1) * PAGE_SIZE + 1
                    )}{" "}
                - {Math.min(users.length, currentPage * PAGE_SIZE)} trên{" "}
                {users.length}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 rounded border bg-white disabled:opacity-50"
                >
                  Trước
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({
                    length: Math.max(1, Math.ceil(users.length / PAGE_SIZE)),
                  }).map((_, i) => {
                    const page = i + 1;
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1 rounded ${
                          currentPage === page
                            ? "bg-blue-600 text-white"
                            : "bg-white border"
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() =>
                    setCurrentPage((p) =>
                      Math.min(Math.ceil(users.length / PAGE_SIZE) || 1, p + 1)
                    )
                  }
                  disabled={
                    currentPage === Math.ceil(users.length / PAGE_SIZE) ||
                    users.length === 0
                  }
                  className="px-3 py-1 rounded border bg-white disabled:opacity-50"
                >
                  Tiếp
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
