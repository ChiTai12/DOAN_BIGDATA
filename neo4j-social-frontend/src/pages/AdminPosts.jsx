import React, { useEffect, useState, useRef } from "react";
import Swal from "sweetalert2";
import { fetchAdminPosts, hideAdminPost } from "../services/adminApi";
import ioClient from "socket.io-client";
import { SOCKET_URL } from "../config.js";

export default function AdminPosts() {
  const [q, setQ] = useState("");
  const [posts, setPosts] = useState([]);
  const [allPosts, setAllPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const selectedPostRef = useRef(null);
  const allPostsRef = useRef([]);
  const [alerts, setAlerts] = useState([]);
  const alertIdRef = useRef(1);
  const alertsRef = useRef([]);

  // Persist alerts in localStorage so they survive reloads
  useEffect(() => {
    try {
      const raw = localStorage.getItem("adminPostsAlerts");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAlerts(parsed);
          // restore id counter to avoid collisions
          const maxId = parsed.reduce(
            (m, it) => (it.id && it.id > m ? it.id : m),
            0
          );
          alertIdRef.current = maxId + 1;
        }
      }
    } catch (e) {
      console.warn("Failed to load adminPostsAlerts from localStorage", e);
    }
  }, []);

  // save alerts whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("adminPostsAlerts", JSON.stringify(alerts || []));
    } catch (e) {
      console.warn("Failed to save adminPostsAlerts", e);
    }
  }, [alerts]);

  // keep ref in sync with state so socket handlers can read latest value
  useEffect(() => {
    selectedPostRef.current = selectedPost;
  }, [selectedPost]);

  // keep a ref for the full posts list so realtime handlers can inspect current visibility
  useEffect(() => {
    allPostsRef.current = allPosts;
  }, [allPosts]);

  // helper to add or update a persistent alert (merge by postId to avoid duplicates)
  const addAlert = (title, text, postId = null) => {
    const now = Date.now();
    setAlerts((prev) => {
      if (postId) {
        const idx = prev.findIndex(
          (it) => it.postId && String(it.postId) === String(postId)
        );
        if (idx !== -1) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], title, text, ts: now };
          return copy;
        }
      }
      const id = alertIdRef.current++;
      return [{ id, postId, title, text, ts: now }, ...prev];
    });
  };

  const removeAlert = (id) => {
    setAlerts((s) => s.filter((a) => a.id !== id));
  };

  // keep alertsRef in sync for dedupe checks inside socket handlers
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  const openModal = (post) => setSelectedPost(post);
  const closeModal = () => setSelectedPost(null);

  const load = async (query) => {
    const qVal = query !== undefined ? query : q;
    setLoading(true);
    setError(null);
    try {
      // Always fetch the full list from the admin endpoint and apply filtering client-side.
      // Some backends may implement server-side search differently; client-side filter
      // keeps behavior predictable for the admin UI.
      const res = await fetchAdminPosts();
      // normalize various response shapes:
      // - axios response where res.data is an object { data: [...] }
      // - axios response where res.data is an array
      // - older shape res.data.posts
      const payload = res && res.data !== undefined ? res.data : res;
      let items = [];
      if (Array.isArray(payload)) items = payload;
      else if (Array.isArray(payload.data)) items = payload.data;
      else if (Array.isArray(payload.posts)) items = payload.posts;
      else items = [];
      setAllPosts(items);
      if (qVal && String(qVal).trim() !== "") {
        const term = String(qVal).toLowerCase().trim();
        const filtered = items.filter((p) => {
          const author =
            (p.authorName ||
              p.author?.displayName ||
              p.author?.username ||
              "") + "";
          const id = String(p.id || "");
          return (
            author.toLowerCase().includes(term) ||
            id.toLowerCase().includes(term)
          );
        });
        setPosts(filtered);
      } else {
        setPosts(items);
      }
      // Keep modal details in sync: if a post is currently open, update it from the
      // freshly fetched items. If the post no longer exists (deleted), close modal.
      try {
        if (selectedPost) {
          const updated = items.find(
            (it) => String(it.id) === String(selectedPost.id)
          );
          if (updated) setSelectedPost(updated);
          else setSelectedPost(null);
        }
      } catch (e) {}
    } catch (e) {
      const msg =
        e && e.response && e.response.data && e.response.data.error
          ? e.response.data.error
          : e.message || "Không thể tải danh sách bài viết";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Setup realtime updates so admin list refreshes when posts change
    try {
      const token = localStorage.getItem("token");
      if (token) {
        const socket = ioClient(SOCKET_URL, { auth: { token } });
        socket.on("connect", () =>
          console.log("AdminPosts socket connected", socket.id)
        );
        // helper to extract post object or id from different payload shapes
        const extractPost = (payload) => {
          if (!payload) return null;
          // payload may be { post }, { postId }, or full post object
          let post = null;
          if (payload.post) post = payload.post;
          else if (payload.post && payload.post.post) post = payload.post.post;
          else post = payload;
          // fallback id from postId or post.postId
          if ((!post || !post.id) && payload.postId) {
            post = { ...(post || {}), id: payload.postId };
          }
          if ((!post || !post.id) && payload.id) {
            post = { ...(post || {}), id: payload.id };
          }
          // attach author meta if provided
          if (payload.author && post) {
            post.author = payload.author;
            post.authorName =
              payload.author.displayName ||
              payload.author.fullName ||
              payload.author.username ||
              post.authorName;
          }
          return post;
        };

        socket.on("post:created", (payload) => {
          console.debug("AdminPosts received post:created", payload);
          try {
            const cur = selectedPostRef.current;
            const post = extractPost(payload);
            if (cur && post && String(post.id) === String(cur.id)) {
              setSelectedPost(post);
            }
          } catch (e) {}
          load();
        });

        socket.on("post:updated", (payload) => {
          console.debug("AdminPosts received post:updated", payload);
          try {
            const cur = selectedPostRef.current;
            const post = extractPost(payload);
            if (cur && post && String(post.id) === String(cur.id)) {
              setSelectedPost((prev) => ({ ...(prev || {}), ...post }));
            }
          } catch (e) {}
          // If the updated post exists in our current list and is hidden, show a small toast
          try {
            const post = extractPost(payload);
            const local =
              post && post.id
                ? allPostsRef.current.find(
                    (it) => String(it.id) === String(post.id)
                  )
                : null;
            if (local && local.hidden) {
              const fullId = (local.id || "").toString();
              // show transient toast
              Swal.fire({
                position: "top-end",
                toast: true,
                icon: "info",
                title: "Có bài ẩn đã được cập nhật",
                text: `${fullId}${
                  local.authorName ? ` — ${local.authorName}` : ""
                }`,
                showConfirmButton: false,
                timer: 3500,
              });
              // Persist after toast finishes to avoid overlapping duplicate visuals.
              // Also skip if an alert for this postId already exists.
              try {
                setTimeout(() => {
                  // delegate update-or-insert to addAlert which merges by postId
                  addAlert(
                    "Có bài ẩn đã được cập nhật",
                    `${fullId}${
                      local.authorName ? ` — ${local.authorName}` : ""
                    }`,
                    fullId
                  );
                }, 3600);
              } catch (e) {
                // ignore scheduling errors
              }
            }
          } catch (e) {}
          load();
        });

        socket.on("post:deleted", (payload) => {
          console.debug("AdminPosts received post:deleted", payload);
          try {
            const cur = selectedPostRef.current;
            const post = extractPost(payload);
            const deletedId =
              post && post.id
                ? post.id
                : payload &&
                  (payload.postId ||
                    payload.id ||
                    (payload.post && payload.post.id));
            if (cur && deletedId && String(deletedId) === String(cur.id)) {
              setSelectedPost(null);
            }
          } catch (e) {}
          load();
        });
        // cleanup
        return () => {
          try {
            socket.disconnect();
          } catch (e) {}
        };
      }
    } catch (e) {
      console.warn("AdminPosts: realtime init failed", e);
    }
  }, []);

  const onSearch = async (e) => {
    e && e.preventDefault && e.preventDefault();
    await load(q);
  };

  // Note: admin-level deletion has been disabled. Authors can still delete their own posts
  // via the existing author-only endpoint (server route /delete/:postId). We intentionally
  // do not expose any admin delete UI or call the admin delete API.

  const onHide = async (id) => {
    const ok = await Swal.fire({
      title: "Ẩn/hiện bài viết?",
      showCancelButton: true,
      confirmButtonText: "Có",
      cancelButtonText: "Không",
    });
    if (!ok.isConfirmed) return;
    try {
      const res = await hideAdminPost(id);
      // reload
      await load();
      try {
        // If API returned new visibility state, show appropriate message
        const isHidden = res && (res.data?.hidden ?? res.hidden ?? null);
        if (typeof isHidden === "boolean") {
          Swal.fire({
            position: "top-end",
            toast: true,
            showConfirmButton: false,
            timer: 1400,
            icon: "success",
            title: isHidden ? "Đã ẩn bài viết" : "Đã bỏ ẩn bài viết",
          });
        } else {
          Swal.fire({
            position: "top-end",
            toast: true,
            showConfirmButton: false,
            timer: 1400,
            icon: "success",
            title: "Thao tác thành công",
          });
        }
      } catch (e) {}
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Thất bại",
        text: "Thao tác thất bại",
      });
    }
  };

  return (
    <div className="p-6">
      <div className="sticky top-0 bg-white z-20 pb-4">
        <h2 className="text-4xl font-extrabold uppercase tracking-tight mb-4">
          QUẢN LÝ BÀI VIẾT
        </h2>

        <form onSubmit={onSearch} className="mb-4 flex gap-2">
          <div className="relative flex-1">
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
              placeholder="Tìm theo ID hoặc tên tác giả"
              className="w-full pl-11 pr-3 h-11 border border-gray-200 rounded-md text-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-lg">
            Tìm
          </button>
          <button
            type="button"
            onClick={async () => {
              setQ("");
              await load("");
            }}
            className="px-4 py-2 bg-gray-200 rounded-lg text-lg"
          >
            Xóa
          </button>
        </form>
      </div>

      {loading && <div>Đang tải...</div>}
      {error && <div className="text-red-600">{error}</div>}

      {/* Persistent admin alerts (dismissible) */}
      <div className="fixed top-16 right-6 z-50 w-80">
        {alerts.map((a) => (
          <div
            key={a.id}
            className="mb-3 bg-white border border-slate-200 rounded shadow-sm p-3 flex justify-between items-start"
          >
            <div>
              <div className="font-semibold text-sm">{a.title}</div>
              <div className="text-xs text-gray-600 mt-1">{a.text}</div>
              <div className="text-xxs text-gray-400 mt-1">
                {new Date(a.ts).toLocaleString()}
              </div>
            </div>
            <div>
              <button
                onClick={() => removeAlert(a.id)}
                className="ml-3 text-gray-400 hover:text-gray-700"
                aria-label="Dismiss alert"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded shadow p-4 overflow-hidden border border-slate-300">
        <table className="w-full table-fixed text-left">
          <thead>
            <tr>
              <th className="px-4 py-3 w-1/6 text-lg font-extrabold uppercase tracking-wide border-b border-slate-200">
                ID
              </th>
              <th className="px-4 py-3 w-36 text-lg font-extrabold uppercase tracking-wide border-b border-slate-200">
                Ảnh
              </th>
              <th className="px-4 py-3 w-1/4 text-lg font-extrabold uppercase tracking-wide border-b border-slate-200">
                Nội dung
              </th>
              <th className="px-4 py-3 w-1/6 text-lg font-extrabold uppercase tracking-wide border-b border-slate-200">
                Tác giả
              </th>
              <th className="px-4 py-3 text-lg font-extrabold uppercase tracking-wide w-36 pr-6 whitespace-nowrap border-b border-slate-200">
                Trạng thái
              </th>
              <th className="px-4 py-3 text-lg font-extrabold uppercase tracking-wide w-40 pl-4 whitespace-nowrap border-b border-slate-200">
                Hành động
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr
                key={p.id}
                className={`border-b hover:bg-gray-50 ${
                  p.hidden ? "opacity-70 bg-gray-50" : ""
                }`}
              >
                <td className="px-4 py-3 align-middle">
                  <div className="max-w-[200px] overflow-hidden whitespace-nowrap truncate flex items-center">
                    {p.id}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="max-w-[80px]">
                    {p.imageUrl ? (
                      <img
                        src={`http://localhost:5000${p.imageUrl}`}
                        alt="img"
                        className="w-16 h-10 object-cover rounded cursor-pointer hover:opacity-90"
                        onClick={() => openModal(p)}
                        onError={(e) => {
                          e.target.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-16 h-10 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">
                        No img
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="max-w-[260px] overflow-hidden whitespace-nowrap truncate flex items-center">
                    {p.title || p.content?.slice(0, 120)}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="max-w-[140px] overflow-hidden whitespace-nowrap truncate flex items-center">
                    {p.authorName || p.author?.displayName}
                  </div>
                </td>
                <td
                  className="px-4 py-3 align-middle w-36 pr-6 whitespace-nowrap"
                  title={p.hidden ? "Không hiển thị" : "Hiển thị"}
                >
                  {p.hidden ? (
                    <span
                      className="inline-block bg-gray-100 text-gray-700 px-2 py-1 rounded text-sm"
                      aria-label="Không hiển thị"
                    >
                      Không hiển thị
                    </span>
                  ) : (
                    <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                      Hiển thị
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 align-middle w-40 pl-4">
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => onHide(p.id)}
                      className="flex-1 min-w-[72px] px-3 py-1 bg-yellow-400 rounded text-sm"
                    >
                      {p.hidden ? "Bỏ ẩn" : "Ẩn"}
                    </button>
                    <button
                      onClick={() => openModal(p)}
                      className="px-3 py-1 bg-gray-800 text-white rounded text-sm"
                    >
                      Xem
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Modal for post details */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={closeModal}
          />
          <div className="relative bg-white rounded-lg shadow-lg max-w-5xl w-full mx-4 overflow-hidden">
            <div className="p-6 flex gap-6">
              <div className="w-1/2 flex-shrink-0">
                {selectedPost.imageUrl ? (
                  <img
                    src={`http://localhost:5000${selectedPost.imageUrl}`}
                    alt="post"
                    className="w-full h-[420px] object-cover rounded"
                  />
                ) : (
                  <div className="w-full h-[420px] bg-gray-100 rounded flex items-center justify-center text-gray-500">
                    No image
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold mb-2">
                  Chi tiết bài viết
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-700">
                  <div>
                    <div className="text-xs text-gray-400">Trạng thái</div>
                    <div className="mt-1">
                      {selectedPost.hidden ? "Ẩn" : "Hiển thị"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400">Tác giả</div>
                    <div className="mt-1">
                      {selectedPost.authorName ||
                        selectedPost.author?.displayName}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-gray-400">ID</div>
                    <div className="mt-1 break-words text-xs text-gray-600">
                      {selectedPost.id}
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-xs text-gray-400">Nội dung</div>
                  <div className="mt-2 text-gray-800 whitespace-pre-wrap">
                    {selectedPost.content || selectedPost.title}
                  </div>
                </div>

                {/* inner close removed — use bottom-right button */}
              </div>
            </div>
            {/* bottom-right close button inside modal card */}
            <div className="absolute bottom-4 right-4">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-black text-white rounded-lg shadow"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
