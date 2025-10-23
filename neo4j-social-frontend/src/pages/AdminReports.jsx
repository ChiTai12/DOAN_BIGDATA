import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import ioClient from "socket.io-client";
import { SOCKET_URL } from "../config";
import { fetchAdminReports, updateReportStatus } from "../services/adminApi";
import Swal from "sweetalert2";

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openFor, setOpenFor] = useState(null);
  const [dropdownPos, setDropdownPos] = useState(null);
  const [q, setQ] = useState("");

  const load = async (query) => {
    setLoading(true);
    setError(null);
    try {
      const qVal = typeof query !== "undefined" ? query : q;

      // Always fetch the full list from the admin API then apply client-side filtering
      const res = await fetchAdminReports();
      const items = res.data || [];

      if (qVal && String(qVal).trim().length > 0) {
        const term = String(qVal).toLowerCase().trim();
        const filtered = items.filter((it) => {
          const id = String(it.id || "").toLowerCase();
          const reporterUsername =
            (it.reporter && (it.reporter.username || it.reporter.id)) || "";
          const reporter = String(reporterUsername).toLowerCase();
          const author = String(
            (it.author &&
              (it.author.displayName || it.author.username || it.author.id)) ||
              ""
          ).toLowerCase();
          const reason = String(it.reason || "").toLowerCase();
          return (
            id.includes(term) ||
            reporter.includes(term) ||
            author.includes(term) ||
            reason.includes(term)
          );
        });
        setReports(filtered);
      } else {
        setReports(items);
      }
    } catch (err) {
      console.error("fetchAdminReports error", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Realtime: listen for new reports, report updates, and post deletions so admin list stays in sync
  useEffect(() => {
    let socket;
    try {
      const token = localStorage.getItem("token");
      socket = ioClient(SOCKET_URL, { auth: { token } });
      socket.on("connect", () => {
        // console.log("AdminReports socket connected", socket.id);
      });

      // New report created (post reported)
      socket.on("post:reported", (payload) => {
        // payload contains { postId, reportId, reporterId }
        // Best-effort: fetch fresh list or insert a placeholder entry
        // We'll optimistically fetch the list to get full report details
        fetchAdminReports()
          .then((res) => setReports(res.data || []))
          .catch(() => {});
      });

      // Report status updated
      socket.on("report:updated", ({ reportId, status }) => {
        setReports((arr) =>
          arr.map((it) => (it.id === reportId ? { ...it, status } : it))
        );
      });

      // Post deleted: backend includes reportIds array in payload; remove any matching reports
      socket.on("post:deleted", (payload) => {
        try {
          const ids = payload && payload.reportIds ? payload.reportIds : [];
          if (Array.isArray(ids) && ids.length > 0) {
            setReports((arr) => arr.filter((it) => !ids.includes(it.id)));
          }
        } catch (e) {
          // fallback: refetch full list
          fetchAdminReports()
            .then((res) => setReports(res.data || []))
            .catch(() => {});
        }
      });
    } catch (e) {
      console.warn("AdminReports socket init failed", e);
    }

    return () => {
      try {
        if (socket) socket.disconnect();
      } catch (e) {}
    };
  }, []);

  const renderError = () => {
    if (!error) return null;
    const msg =
      error?.response?.data?.error || error?.message || "Lỗi không xác định";
    return (
      <div className="text-red-600 mb-4">
        Lỗi khi tải báo cáo: {String(msg)}
      </div>
    );
  };

  return (
    <div className="p-6">
      <h2 className="text-4xl font-extrabold uppercase tracking-tight mb-6">
        Báo cáo phản hồi
      </h2>
      {renderError()}
      {loading && <div>Đang tải...</div>}

      {!loading && reports.length === 0 && !error && (
        <div>Không có báo cáo</div>
      )}

      {!loading && reports.length > 0 && (
        <div className="bg-white rounded shadow p-6 overflow-hidden border border-slate-300">
          <div className="flex items-center gap-3 mb-4">
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
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    load(q);
                  }
                }}
                placeholder="Tìm theo mã, người báo cáo"
                className="pl-11 pr-3 h-10 w-96 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <button
              onClick={() => load(q)}
              className="px-4 h-10 flex items-center justify-center text-sm border border-transparent bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Tìm
            </button>
            <button
              onClick={async () => {
                setQ("");
                await load("");
              }}
              className="px-4 h-10 flex items-center justify-center text-sm border bg-white rounded-md hover:bg-gray-50"
            >
              Xóa
            </button>
          </div>
          <table className="w-full table-fixed divide-y divide-slate-200 text-base">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-1/6 px-4 py-4 text-left text-base font-extrabold uppercase tracking-wide border-b border-slate-200 whitespace-nowrap">
                  Mã báo cáo
                </th>
                <th className="w-1/6 px-4 py-4 text-left text-base font-extrabold uppercase tracking-wide border-b border-slate-200 whitespace-nowrap">
                  Người báo cáo
                </th>
                <th className="w-2/6 px-4 py-4 text-left text-base font-extrabold uppercase tracking-wide border-b border-slate-200 whitespace-nowrap">
                  Lý do báo cáo
                </th>
                <th className="w-0 px-4 py-4 text-left text-base font-extrabold uppercase tracking-wide border-b border-slate-200 whitespace-nowrap">
                  <span className="sr-only">Bài viết bị báo cáo</span>
                </th>
                <th className="w-1/6 px-4 py-4 text-left text-base font-extrabold uppercase tracking-wide border-b border-slate-200 whitespace-nowrap">
                  Mã bài viết
                </th>
                <th className="w-1/6 px-4 py-4 text-left text-base font-extrabold uppercase tracking-wide border-b border-slate-200 whitespace-nowrap">
                  Trạng thái xử lý
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-6 py-5 text-lg text-slate-700">
                    <div
                      title={r.id}
                      className="max-w-[200px] overflow-hidden whitespace-nowrap truncate font-mono text-base text-slate-700"
                    >
                      {r.id}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-lg">
                    {r.reporter?.username || r.reporter?.id}
                  </td>
                  <td className="px-6 py-5 text-lg">
                    <div
                      className="text-base text-slate-700 truncate"
                      title={r.reason || "(không có)"}
                    >
                      {r.reason || "(không có)"}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-lg">
                    {/* intentionally leave blank to give more space to 'Lý do báo cáo' */}
                  </td>
                  <td className="px-6 py-5 text-lg">
                    <div
                      title={r.post?.id || r.postId || "(unknown)"}
                      className="max-w-[200px] overflow-hidden whitespace-nowrap truncate font-mono text-base text-slate-700"
                    >
                      {r.post?.id || r.postId || "(unknown)"}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-base relative">
                    <div className="flex items-center gap-2">
                      <button
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded text-base ${
                          r.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : r.status === "reviewed"
                            ? "bg-green-100 text-green-800"
                            : r.status === "ignored"
                            ? "bg-red-100 text-red-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
                          setDropdownPos({
                            left: rect.left + window.scrollX,
                            top: rect.bottom + window.scrollY,
                            width: rect.width,
                          });
                          setOpenFor(openFor === r.id ? null : r.id);
                        }}
                      >
                        <span className="font-medium">
                          {r.status || "pending"}
                        </span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5 opacity-80"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.293l3.71-4.06a.75.75 0 011.08 1.04l-4.25 4.656a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>

                      {openFor === r.id &&
                        dropdownPos &&
                        createPortal(
                          <DropdownMenu
                            left={dropdownPos.left}
                            top={dropdownPos.top}
                            width={Math.max(140, dropdownPos.width)}
                            onChoose={async (s) => {
                              let prev;
                              try {
                                setOpenFor(null);
                                prev = r.status;
                                r.status = s;
                                setReports((sarr) => [...sarr]);
                                await updateReportStatus(r.id, s);
                                // show large centered SweetAlert2 modal with Vietnamese text
                                const labelMap = {
                                  pending: "Đang chờ duyệt",
                                  reviewed: "Đã xét duyệt",
                                  ignored: "Bỏ qua",
                                };
                                const title = `${labelMap[s] || s}`;
                                try {
                                  Swal.fire({
                                    icon: "success",
                                    title: title,
                                    showConfirmButton: false,
                                    timer: 1400,
                                    width: 520,
                                    padding: "2.5rem",
                                    // make the title visually larger
                                    customClass: {
                                      title: "text-2xl font-extrabold",
                                      popup: "rounded-md",
                                    },
                                  });
                                } catch (e) {}
                              } catch (e) {
                                console.error("update status failed", e);
                                // rollback
                                setReports((sarr) =>
                                  sarr.map((it) =>
                                    it.id === r.id
                                      ? { ...it, status: prev }
                                      : it
                                  )
                                );
                                try {
                                  Swal.fire({
                                    icon: "error",
                                    title: "Cập nhật thất bại",
                                    text: "Không thể cập nhật trạng thái báo cáo.",
                                  });
                                } catch (e) {}
                              }
                            }}
                            onClose={() => setOpenFor(null)}
                          />,
                          document.body
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DropdownMenu({ left, top, width, onChoose, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && ref.current.contains(e.target)) return; // inside -> ignore
      onClose && onClose();
    }
    function handleEsc(e) {
      if (e.key === "Escape") onClose && onClose();
    }
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ position: "absolute", left, top, minWidth: width, zIndex: 60 }}
      className="bg-white border rounded shadow"
    >
      <div className="flex flex-col">
        {["pending", "reviewed", "ignored"].map((s) => (
          <button
            key={s}
            className={`text-base px-4 py-2 text-left hover:bg-slate-50 ${
              s === "reviewed" ? "text-green-700" : ""
            }${s === "ignored" ? "text-red-700" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onChoose && onChoose(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
