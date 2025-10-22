import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import ioClient from "socket.io-client";
import { SOCKET_URL } from "../config";
import { fetchAdminReports, updateReportStatus } from "../services/adminApi";

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openFor, setOpenFor] = useState(null);
  const [dropdownPos, setDropdownPos] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchAdminReports()
      .then((res) => {
        if (!mounted) return;
        setReports(res.data || []);
      })
      .catch((err) => {
        console.error("fetchAdminReports error", err);
        if (mounted) setError(err);
      })
      .finally(() => mounted && setLoading(false));
    return () => (mounted = false);
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
  <h2 className="text-4xl font-extrabold uppercase tracking-tight mb-6">Báo cáo phản hồi</h2>
      {renderError()}
      {loading && <div>Đang tải...</div>}

      {!loading && reports.length === 0 && !error && (
        <div>Không có báo cáo</div>
      )}

      {!loading && reports.length > 0 && (
        <div className="bg-white rounded shadow p-4 overflow-hidden border border-slate-300">
          <table className="w-full table-fixed divide-y divide-slate-200 text-base">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-xl font-extrabold uppercase tracking-wide break-words border-b border-slate-200">
                  Mã báo cáo
                </th>
                <th className="px-6 py-4 text-left text-xl font-extrabold uppercase tracking-wide break-words border-b border-slate-200">
                  Người báo cáo
                </th>
                <th className="px-6 py-4 text-left text-xl font-extrabold uppercase tracking-wide break-words border-b border-slate-200">
                  Lý do báo cáo
                </th>
                <th className="px-6 py-4 text-left text-xl font-extrabold uppercase tracking-wide break-words border-b border-slate-200">
                  Bài viết bị báo cáo
                </th>
                <th className="px-6 py-4 text-left text-xl font-extrabold uppercase tracking-wide break-words border-b border-slate-200">
                  Tác giả bài viết
                </th>
                <th className="px-6 py-4 text-left text-xl font-extrabold uppercase tracking-wide break-words border-b border-slate-200">
                  Trạng thái xử lý
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-base text-slate-700">{r.id}</td>
                  <td className="px-6 py-4 text-base">
                    {r.reporter?.username || r.reporter?.id}
                  </td>
                  <td className="px-6 py-4 text-base">
                    <div
                      className="text-sm text-slate-700 truncate max-w-xs"
                      title={r.reason || "(không có)"}
                    >
                      {r.reason || "(không có)"}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-base max-w-xl">
                    {r.post?.content ? (
                      <div
                        className="text-sm text-slate-700 truncate max-w-xl"
                        title={r.post.content}
                      >
                        {r.post.content}
                      </div>
                    ) : (
                      <span className="text-slate-500">(no content)</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-base">
                    {r.author?.username || r.author?.id || "(unknown)"}
                  </td>
                  <td className="px-6 py-4 text-base relative">
                    <div className="flex items-center gap-2">
                      <button
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded text-sm ${
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
                          className="h-4 w-4 opacity-80"
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
                              try {
                                setOpenFor(null);
                                const prev = r.status;
                                r.status = s;
                                setReports((sarr) => [...sarr]);
                                await updateReportStatus(r.id, s);
                              } catch (e) {
                                console.error("update status failed", e);
                                setReports((sarr) =>
                                  sarr.map((it) =>
                                    it.id === r.id
                                      ? { ...it, status: prev }
                                      : it
                                  )
                                );
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
