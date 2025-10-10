import React, { useState, useContext, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import api from "../services/api";
import feelings from "../data/feelings";
import EditPostModal from "./EditPostModal";

// Normalize different shapes of comment payloads from API / realtime events
const normalizeComment = (raw) => {
  if (!raw) return null;
  const toPrimitiveId = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object" && typeof v.toNumber === "function")
      return String(v.toNumber());
    return String(v);
  };
  // already in { comment: {...}, author: {...} } - coerce ids
  if (raw.comment && raw.author) {
    const inner = raw.comment;
    return {
      comment: {
        id: toPrimitiveId(
          inner.id ||
            inner.commentId ||
            inner._id ||
            inner.identity ||
            inner.identity?.toNumber?.()
        ),
        content: inner.content,
        createdAt: inner.createdAt,
        parentId: toPrimitiveId(inner.parentId || inner.parent || null),
        icon: inner.icon || "",
      },
      author: raw.author,
      parent: raw.parent || null, // Backend trả về parent info
    };
  }
  // shape: comment object that includes author as nested property
  if (raw.id && raw.content) {
    // raw is the inner comment (possibly with raw.author)
    const author = raw.author || {};
    return {
      comment: {
        id: toPrimitiveId(raw.id),
        content: raw.content,
        createdAt: raw.createdAt,
        parentId: toPrimitiveId(raw.parentId || raw.parent || null),
        icon: raw.icon || "",
      },
      author,
    };
  }
  // shape: { comment: { id, content, createdAt, author? } }
  if (raw.comment && raw.comment.id) {
    const inner = raw.comment;
    if (inner.author)
      return {
        comment: {
          id: toPrimitiveId(inner.id),
          content: inner.content,
          createdAt: inner.createdAt,
          parentId: toPrimitiveId(inner.parentId || inner.parent || null),
          icon: inner.icon || "",
        },
        author: inner.author,
      };
    return {
      comment: {
        id: toPrimitiveId(inner.id),
        content: inner.content,
        createdAt: inner.createdAt,
        parentId: toPrimitiveId(inner.parentId || inner.parent || null),
      },
      author: {},
    };
  }
  return null;
};

// Inline composer component - module scope so CommentNode can render it
function InlineComposer({ postId, parentId, onPosted, onCancel }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [pickerOpenLocal, setPickerOpenLocal] = useState(false);
  const [selectedIconLocal, setSelectedIconLocal] = useState("");
  const ref = useRef(null);
  const inlineButtonRef = useRef(null);
  const [pickerPosLocal, setPickerPosLocal] = useState(null);
  const inlinePickerRef = useRef(null);

  const insertEmoji = (sym) => {
    setSelectedIconLocal(sym);
    if (ref.current && typeof ref.current.selectionStart === "number") {
      const s = ref.current.selectionStart;
      const e = ref.current.selectionEnd;
      const nt = text.slice(0, s) + sym + text.slice(e);
      setText(nt);
      requestAnimationFrame(() => {
        try {
          ref.current.focus();
          const pos = s + sym.length;
          ref.current.setSelectionRange(pos, pos);
        } catch (e) {}
      });
    } else setText((t) => t + sym);
  };

  useEffect(() => {
    try {
      if (ref.current) ref.current.focus();
    } catch (e) {}
  }, []);

  useEffect(() => {
    function onDocClick(e) {
      if (
        inlinePickerRef.current &&
        !inlinePickerRef.current.contains(e.target)
      ) {
        setPickerOpenLocal(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  return (
    <form
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!text.trim()) return;
        setPosting(true);
        try {
          const payload = { content: text };
          if (parentId) payload.parentId = parentId;
          if (selectedIconLocal) payload.icon = selectedIconLocal;
          const res = await api.post(`/posts/${postId}/comments`, payload);
          if (res.data && res.data.comment) {
            const normalized = normalizeComment(res.data.comment);
            if (normalized) onPosted(normalized);
          }
          setText("");
          setSelectedIconLocal("");
          onCancel?.();
        } catch (err) {
          console.error("Failed to post inline comment", err);
        } finally {
          setPosting(false);
        }
      }}
      className="mt-2"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 flex-shrink-0">
          {user?.avatarUrl ? (
            <img
              src={`http://localhost:5000${user.avatarUrl}`}
              alt={user.displayName || user.username}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700">
              {(
                user?.displayName?.[0] ||
                user?.username?.[0] ||
                "U"
              ).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 flex gap-2 items-center">
          <input
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Viết bình luận..."
            className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none"
          />
          <div className="relative overflow-visible">
            <button
              ref={inlineButtonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // toggle if already open
                if (pickerOpenLocal) {
                  setPickerOpenLocal(false);
                  return;
                }
                try {
                  const r = inlineButtonRef.current.getBoundingClientRect();
                  const width = Math.min(384, window.innerWidth * 0.9);
                  let left = r.left;
                  // keep inside viewport
                  if (left + width > window.innerWidth)
                    left = window.innerWidth - width - 8;
                  const top = r.bottom + 8;
                  setPickerPosLocal({ top, left, width });
                  setPickerOpenLocal(true);
                } catch (err) {
                  setPickerOpenLocal((s) => !s);
                }
              }}
              className="px-2 py-1 rounded-full hover:bg-gray-100"
              title="Chọn cảm xúc"
            >
              {selectedIconLocal || "😊"}
            </button>
            {pickerOpenLocal && pickerPosLocal && (
              <div
                ref={inlinePickerRef}
                className="fixed bg-white border border-gray-200 rounded-md shadow-lg p-3"
                style={{
                  top: pickerPosLocal.top + "px",
                  left: pickerPosLocal.left + "px",
                  width: pickerPosLocal.width + "px",
                  maxHeight: "60vh",
                  zIndex: 9999,
                }}
              >
                <div className="text-sm font-medium text-gray-700 mb-2">
                  Chọn cảm xúc
                </div>
                <div className="max-h-60 overflow-y-auto overflow-x-hidden pr-6">
                  <div className="grid grid-cols-8 gap-2">
                    {feelings.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          insertEmoji(f.symbol);
                        }}
                        className="w-12 h-12 rounded-md flex items-center justify-center text-2xl transition-colors hover:bg-gray-100"
                        title={f.label}
                      >
                        {f.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={!text.trim() || posting}
            className="bg-blue-500 text-white px-3 py-1 rounded-sm text-sm disabled:opacity-60"
          >
            {posting ? "..." : "Gửi"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              try {
                setText("");
              } catch (err) {}
              try {
                setSelectedIconLocal("");
              } catch (err) {}
              try {
                setPickerOpenLocal(false);
              } catch (err) {}
              onCancel?.();
            }}
            className="text-sm text-gray-700 ml-2 px-2 py-1 hover:bg-gray-100 rounded-sm transition-colors"
          >
            Hủy
          </button>
        </div>
      </div>
    </form>
  );
}

function PostCard({ post, author, onDelete }) {
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likesCount || 0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState("");
  const commentInputRef = useRef(null);
  const bottomPickerRef = useRef(null);
  const bottomButtonRef = useRef(null);
  const [pickerPos, setPickerPos] = useState(null);
  const [showComments, setShowComments] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null); // { id, authorName }
  const [inlineReplyTarget, setInlineReplyTarget] = useState(null); // comment id for inline composer
  const [replyCanceled, setReplyCanceled] = useState(false);

  // Normalize different shapes of comment payloads from API / realtime events
  const normalizeComment = (raw) => {
    if (!raw) return null;
    const toPrimitiveId = (v) => {
      if (v === null || v === undefined) return "";
      if (typeof v === "object" && typeof v.toNumber === "function")
        return String(v.toNumber());
      return String(v);
    };
    // already in { comment: {...}, author: {...} } - coerce ids
    if (raw.comment && raw.author) {
      const inner = raw.comment;
      return {
        comment: {
          id: toPrimitiveId(
            inner.id ||
              inner.commentId ||
              inner._id ||
              inner.identity ||
              inner.identity?.toNumber?.()
          ),
          content: inner.content,
          createdAt: inner.createdAt,
          parentId: toPrimitiveId(inner.parentId || inner.parent || null),
          icon: inner.icon || "",
        },
        author: raw.author,
        parent: raw.parent || null, // Backend trả về parent info
      };
    }
    // shape: comment object that includes author as nested property
    if (raw.id && raw.content) {
      // raw is the inner comment (possibly with raw.author)
      const author = raw.author || {};
      return {
        comment: {
          id: toPrimitiveId(raw.id),
          content: raw.content,
          createdAt: raw.createdAt,
          parentId: toPrimitiveId(raw.parentId || raw.parent || null),
          icon: raw.icon || "",
        },
        author,
      };
    }
    // shape: { comment: { id, content, createdAt, author? } }
    if (raw.comment && raw.comment.id) {
      const inner = raw.comment;
      if (inner.author)
        return {
          comment: {
            id: toPrimitiveId(inner.id),
            content: inner.content,
            createdAt: inner.createdAt,
            parentId: toPrimitiveId(inner.parentId || inner.parent || null),
            icon: inner.icon || "",
          },
          author: inner.author,
        };
      return {
        comment: {
          id: toPrimitiveId(inner.id),
          content: inner.content,
          createdAt: inner.createdAt,
          parentId: toPrimitiveId(inner.parentId || inner.parent || null),
        },
        author: {},
      };
    }
    return null;
  };

  // Build a tree from flat comments array using parentId
  const buildCommentTree = (flatComments) => {
    const map = new Map();
    const roots = [];
    // clone, coerce ids to string, and ensure children array
    flatComments.forEach((c) => {
      const node = { ...c, children: [] };
      // coerce id and parentId to string primitives for consistent lookup
      node.comment = {
        ...node.comment,
        id: String(node.comment.id ?? ""),
        parentId:
          node.comment.parentId == null ? "" : String(node.comment.parentId),
      };

      // Backend đã trả về parent info, dùng luôn
      if (node.parent) {
        node.parent = {
          ...node.parent,
          comment: {
            ...node.parent.comment,
            id: String(node.parent.comment.id ?? ""),
          },
        };
      }

      map.set(node.comment.id, node);
    });

    map.forEach((node) => {
      const pid = node.comment.parentId;
      if (pid) {
        const parent = map.get(String(pid));
        if (parent) {
          parent.children.push(node);
          // nếu backend chưa trả parent info, attach từ map
          if (!node.parent) {
            node.parent = parent;
          }
        } else {
          // parent not found (orphan) -> treat as root
          console.warn(
            `Parent comment ${pid} not found for comment ${node.comment.id}`
          );
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });
    // sort children by createdAt asc for each node
    const sortRec = (arr) => {
      arr.sort(
        (a, b) =>
          Number(a.comment.createdAt || 0) - Number(b.comment.createdAt || 0)
      );
      arr.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
  };

  // Check if current user has liked this post (optional: could be passed from parent)
  useEffect(() => {
    // Initialize liked state from server-provided flag when available
    setLiked(Boolean(post.liked));
    setLikesCount(post.likesCount || 0);
    // load comments for this post
    (async () => {
      try {
        const res = await api.get(`/posts/${post.id}/comments`);
        if (Array.isArray(res.data)) setComments(res.data);
      } catch (err) {
        console.warn("Failed to load comments", err);
      }
    })();
  }, [post.id, post.liked]);

  useEffect(() => {
    function onPostLikesUpdate(e) {
      const payload = e.detail || e;
      if (!payload || payload.postId !== post.id) return;
      // update likes count and liked state if the update is from current user
      setLikesCount(payload.likesCount ?? ((c) => c));
      if (payload.fromUserId === (user && user.id)) {
        setLiked(Boolean(payload.liked));
      }
    }
    window.addEventListener("app:post:likes:update", onPostLikesUpdate);
    // Listen for comment events for this post
    const onComment = (e) => {
      const payload = e.detail || e;
      if (!payload || payload.postId !== post.id) return;
      const normalized = normalizeComment(payload.comment);
      if (!normalized) return;
      setComments((prev) => [...prev, normalized]);
    };
    window.addEventListener("app:post:commented", onComment);
    // Listen for user profile updates so we can patch author info in comments
    const onUserUpdated = (e) => {
      const payload = e.detail || e;
      if (!payload || !payload.user) return;
      const updated = payload.user;
      setComments((prev) =>
        prev.map((c) => {
          try {
            if (c.author && c.author.id === updated.id) {
              return { ...c, author: { ...c.author, ...updated } };
            }
          } catch (err) {}
          return c;
        })
      );
    };
    window.addEventListener("app:user:updated", onUserUpdated);
    return () => {
      window.removeEventListener("app:post:likes:update", onPostLikesUpdate);
      window.removeEventListener("app:post:commented", onComment);
      window.removeEventListener("app:user:updated", onUserUpdated);
    };
  }, [post.id, user]);

  // close bottom picker when clicking outside
  useEffect(() => {
    function onDocClick(e) {
      if (
        bottomPickerRef.current &&
        !bottomPickerRef.current.contains(e.target)
      ) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const formatTime = (timestamp) => {
    // Neo4j may return an Integer-like object. Safely convert to number.
    let ts = timestamp;
    if (ts && typeof ts === "object" && typeof ts.toNumber === "function") {
      ts = ts.toNumber();
    } else {
      ts = Number(ts);
    }
    const date = new Date(ts);
    if (!date || Number.isNaN(date.getTime())) return ""; // invalid -> return empty string (don't show Invalid Date)
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return "Vừa xong";
    if (hours < 24) return `${hours}h`; // shorter format
    return date.toLocaleDateString();
  };

  // helper: clear reply state and inline composers with feedback
  const clearReply = () => {
    try {
      setReplyTarget(null);
      setCommentText("");
      setSelectedIcon("");
      setPickerOpen(false);
      setComments((prev) =>
        prev.map((c) => ({ ...c, _showInlineComposer: false }))
      );
      setReplyCanceled(true);
      setTimeout(() => setReplyCanceled(false), 1800);
    } catch (err) {
      console.warn("clearReply failed", err);
    }
  };

  // keyboard shortcut: Esc to cancel reply
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        clearReply();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleDelete = async () => {
    if (!window.confirm("Bạn có chắc muốn xóa bài viết này?")) return;

    setIsDeleting(true);
    try {
      await api.delete(`/posts/delete/${post.id}`);
      try {
        if (window.appToast) window.appToast("✅ Đã xóa bài viết thành công!");
        else alert("✅ Đã xóa bài viết thành công!");
      } catch (e) {}
      onDelete?.(post.id); // Callback để refresh feed
    } catch (error) {
      console.error("❌ Lỗi xóa bài viết:", error);
      try {
        if (window.appToast)
          window.appToast("❌ Không thể xóa bài viết. Vui lòng thử lại!");
        else alert("❌ Không thể xóa bài viết. Vui lòng thử lại!");
      } catch (e) {}
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLike = async () => {
    try {
      const response = await api.post(`/posts/${post.id}/like`);
      setLiked(response.data.liked);
      console.log("Like response:", response.data);
    } catch (error) {
      console.error("❌ Lỗi like bài viết:", error);
    }
  };

  // Kiểm tra user có phải author không
  const isAuthor = user && author && user.username === author.username;

  return (
    <div className="bg-white border border-gray-300 rounded-lg overflow-hidden">
      {/* Post header */}
      <div className="flex items-center gap-3 p-4">
        {author?.avatarUrl ? (
          <img
            src={`http://localhost:5000${author.avatarUrl}`}
            alt={author?.displayName || author?.username}
            className="w-8 h-8 rounded-full object-cover shadow-avatar"
            onError={(e) => {
              // If image fails to load, hide it so fallback initial shows
              e.target.style.display = "none";
              // Optionally we could set a state to show fallback, but hiding is fine
            }}
          />
        ) : (
          <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-avatar">
            {(
              author?.displayName?.[0] ||
              author?.username?.[0] ||
              "U"
            ).toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <div className="font-semibold text-sm text-gray-900">
            {author?.displayName || author?.username || "Unknown User"}
          </div>
          <div className="text-xs text-gray-500">
            {formatTime(post?.createdAt)}
          </div>
        </div>
        {/* post.icon intentionally not shown in header */}
        {/* Show edit and delete buttons if user is author */}
        {isAuthor ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="text-gray-400 hover:text-blue-600 transition-colors"
              title="Chỉnh sửa bài viết"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors"
              title="Xóa bài viết"
            >
              {isDeleting ? (
                <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          </div>
        ) : (
          <button className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
        )}
      </div>

      {/* Post image */}
      {post?.imageUrl && (
        <div className="w-full bg-gray-100" style={{ height: "500px" }}>
          <img
            src={`http://localhost:5000${post.imageUrl}`}
            alt="Post content"
            className="w-full h-full object-cover"
            onLoad={() => console.log("✅ Image loaded:", post.imageUrl)}
            onError={(e) => {
              console.error("❌ Image failed to load:", post.imageUrl, e);
              e.target.style.display = "none";
            }}
          />
        </div>
      )}

      {/* Post content - Now above action icons */}
      <div className="px-4 pt-4">
        {post?.content && (
          <div className="text-sm text-gray-900 leading-relaxed mb-3">
            <span className="font-semibold">
              {author?.displayName || author?.username}
            </span>{" "}
            {post.content}
          </div>
        )}
      </div>

      {/* Post actions */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-4 mb-3">
          <button
            onClick={handleLike}
            className={`hover:opacity-70 transition-opacity ${
              liked ? "text-red-500" : "text-gray-700"
            }`}
            title="Thích"
          >
            {liked ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            ) : (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            className={`hover:opacity-70 transition-opacity ${
              showComments ? "text-blue-600" : "text-gray-700"
            }`}
            title="Bình luận"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <button
            className="text-gray-700 hover:opacity-70 transition-opacity"
            title="Chia sẻ"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15,3 21,3 21,9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        </div>

        <div className="text-sm text-gray-700 mb-2">
          {likesCount} lượt thích
        </div>
      </div>

      {/* Comments section - Only show when showComments is true */}
      {showComments && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <div className="space-y-3">
            {comments.length === 0 ? (
              <div className="text-sm text-gray-500">
                Chưa có bình luận nào.
              </div>
            ) : (
              // render comment tree
              buildCommentTree(comments).map((node) => {
                return (
                  <CommentNode
                    key={node.comment.id}
                    node={node}
                    depth={0}
                    postId={post.id}
                    onReply={(n) =>
                      setReplyTarget({
                        id: n.comment.id,
                        authorName: n.author?.displayName || n.author?.username,
                      })
                    }
                    onInlineReplyRequest={(commentId) => {
                      // toggle inline composer on that specific node
                      setComments((prev) =>
                        prev.map((c) => {
                          try {
                            if (c.comment && c.comment.id === commentId) {
                              return { ...c, _showInlineComposer: true };
                            }
                            // clear other inline composers
                            return { ...c, _showInlineComposer: false };
                          } catch (e) {
                            return c;
                          }
                        })
                      );
                    }}
                    formatTime={formatTime}
                    onPosted={(normalized) => {
                      // append normalized comment and clear inline composer flags
                      setComments((prev) => {
                        const next = prev.map((c) => ({
                          ...c,
                          _showInlineComposer: false,
                        }));
                        return [...next, normalized];
                      });
                    }}
                  />
                );
              })
            )}
          </div>

          {user && (
            <form
              onSubmit={async (ev) => {
                ev.preventDefault();
                if (!commentText.trim()) return;
                setPostingComment(true);
                try {
                  const payload = { content: commentText };
                  if (selectedIcon) payload.icon = selectedIcon;
                  if (replyTarget && replyTarget.id) {
                    payload.parentId = replyTarget.id;
                    console.log(
                      "🔗 Sending reply with parentId:",
                      replyTarget.id
                    );
                  }
                  console.log("📤 Comment payload:", payload);
                  const res = await api.post(
                    `/posts/${post.id}/comments`,
                    payload
                  );
                  if (res.data && res.data.comment) {
                    const normalized = normalizeComment(res.data.comment);
                    if (normalized) {
                      setComments((p) => [...p, normalized]);
                      setCommentText("");
                      setSelectedIcon("");
                      setReplyTarget(null);
                    }
                  }
                } catch (err) {
                  console.error("Failed to post comment", err);
                } finally {
                  setPostingComment(false);
                }
              }}
              className="mt-4"
            >
              {replyTarget && (
                <div className="mb-2 text-xs text-gray-600 flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <div>Đang trả lời</div>
                    <span className="font-semibold">
                      {replyTarget.authorName}
                    </span>
                  </div>
                  <div className="ml-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearReply();
                      }}
                      className="relative z-20 text-sm bg-white text-red-600 px-3 py-1 border border-red-200 hover:bg-red-50 rounded-sm shadow-sm transition-colors"
                    >
                      Hủy
                    </button>
                  </div>
                  {replyCanceled && (
                    <div className="ml-2 text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full border border-green-100">
                      Đã hủy
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex-shrink-0">
                  {user?.avatarUrl ? (
                    <img
                      src={`http://localhost:5000${user.avatarUrl}`}
                      alt={user.displayName || user.username}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700">
                      {(
                        user?.displayName?.[0] ||
                        user?.username?.[0] ||
                        "U"
                      ).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 flex gap-2">
                  <input
                    ref={commentInputRef}
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Viết bình luận..."
                    className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-200"
                  />

                  <div className="relative overflow-visible">
                    <button
                      ref={bottomButtonRef}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // toggle picker
                        if (pickerOpen) {
                          setPickerOpen(false);
                          return;
                        }
                        try {
                          const r =
                            bottomButtonRef.current.getBoundingClientRect();
                          const width = Math.min(384, window.innerWidth * 0.9);
                          let left = r.left;
                          if (left + width > window.innerWidth)
                            left = window.innerWidth - width - 8;
                          const top = r.bottom + 8;
                          setPickerPos({ top, left, width });
                          setPickerOpen(true);
                        } catch (err) {
                          setPickerOpen((s) => !s);
                        }
                      }}
                      className="px-2 py-1 rounded-full hover:bg-gray-100"
                      title="Chọn cảm xúc"
                    >
                      {selectedIcon || "😊"}
                    </button>

                    {pickerOpen && pickerPos && (
                      <div
                        ref={bottomPickerRef}
                        className="fixed bg-white border border-gray-200 rounded-md shadow-lg p-3"
                        style={{
                          top: pickerPos.top + "px",
                          left: pickerPos.left + "px",
                          width: pickerPos.width + "px",
                          maxHeight: "60vh",
                          zIndex: 9999,
                        }}
                      >
                        <div className="text-sm font-medium text-gray-700 mb-2">
                          Chọn cảm xúc
                        </div>
                        <div className="max-h-60 overflow-y-auto overflow-x-hidden pr-6">
                          <div className="grid grid-cols-8 gap-2">
                            {feelings.map((f) => (
                              <button
                                key={f.key}
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  try {
                                    if (
                                      commentInputRef.current &&
                                      typeof commentInputRef.current
                                        .selectionStart === "number"
                                    ) {
                                      const el = commentInputRef.current;
                                      const s = el.selectionStart;
                                      const e = el.selectionEnd;
                                      const nt =
                                        commentText.slice(0, s) +
                                        f.symbol +
                                        commentText.slice(e);
                                      setCommentText(nt);
                                      requestAnimationFrame(() => {
                                        try {
                                          el.focus();
                                          const pos = s + f.symbol.length;
                                          el.setSelectionRange(pos, pos);
                                        } catch (err) {}
                                      });
                                    } else {
                                      setCommentText((t) => t + f.symbol);
                                    }
                                  } catch (err) {
                                    setCommentText((t) => t + f.symbol);
                                  }
                                  setSelectedIcon(f.symbol);
                                }}
                                className="w-12 h-12 rounded-md flex items-center justify-center text-2xl transition-colors hover:bg-gray-100"
                                title={f.label}
                              >
                                {f.symbol}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={postingComment || !commentText.trim()}
                    className="bg-blue-500 text-white px-4 py-2 rounded-sm text-sm font-medium hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {postingComment ? "..." : "Gửi"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Edit Post Modal */}
      <EditPostModal
        post={post}
        author={author}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onPostUpdated={() => {
          // Dispatch event để Feed component có thể cập nhật
          window.dispatchEvent(
            new CustomEvent("app:post:updated", {
              detail: { postId: post.id },
            })
          );
        }}
      />
    </div>
  );
}

export default PostCard;

// Recursive renderer for comment nodes
function CommentNode({
  node,
  depth = 0,
  onReply,
  formatTime,
  onInlineReplyRequest,
  onPosted,
  postId,
}) {
  // We don't shift the avatar per-depth. Children are placed inside a wrapper
  // that has a fixed left offset so deeper replies don't accumulate indentation.
  const indent = 0;
  return (
    <div className="mb-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 flex-shrink-0">
          {node.author?.avatarUrl ? (
            <img
              src={`http://localhost:5000${node.author.avatarUrl}`}
              alt={node.author?.displayName || node.author?.username}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700">
              {(
                (node.author?.displayName || node.author?.username || "U")[0] ||
                "U"
              ).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="bg-gray-50 rounded-2xl px-3 py-2">
            {node.parent ? (
              <div>
                {/* Header hiển thị quan hệ trả lời rõ ràng */}
                <div className="text-xs text-blue-600 mb-2 font-medium bg-blue-50 px-2 py-1 rounded">
                  <span className="font-semibold">
                    {node.author?.displayName || node.author?.username}
                  </span>
                  <span className="mx-1">→</span>
                  <span className="font-semibold">
                    {node.parent.author?.displayName ||
                      node.parent.author?.username}
                  </span>
                </div>
                {/* Hiển thị snippet của parent comment */}
                <div className="text-xs text-gray-500 mb-2 border-l-2 border-gray-300 pl-2 italic">
                  "{node.parent.comment?.content?.substring(0, 50)}
                  {node.parent.comment?.content?.length > 50 ? "..." : ""}"
                </div>
                {/* Nội dung reply */}
                <div className="text-sm text-gray-800 font-medium flex items-center gap-2">
                  {node.comment?.icon ? (
                    <span className="text-lg">{node.comment.icon}</span>
                  ) : null}
                  <div>{node.comment?.content}</div>
                </div>
                <div className="mt-2 text-xs text-gray-400 flex items-center gap-3">
                  {(() => {
                    const t = formatTime(node.comment?.createdAt);
                    return t ? <div>{t}</div> : null;
                  })()}
                  <div>
                    <button
                      onClick={() => onInlineReplyRequest(node.comment.id)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Trả lời
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div className="text-sm text-gray-800 flex items-center gap-2">
                  {node.comment?.icon ? (
                    <span className="text-lg">{node.comment.icon}</span>
                  ) : null}
                  <div>
                    <span className="font-semibold mr-2">
                      {node.author?.displayName || node.author?.username}
                    </span>
                    <span>{node.comment?.content}</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-400 flex items-center gap-3">
                  {(() => {
                    const t = formatTime(node.comment?.createdAt);
                    return t ? <div>{t}</div> : null;
                  })()}
                  <div>
                    <button
                      onClick={() => onInlineReplyRequest(node.comment.id)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Trả lời
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* end content box */}
        </div>
      </div>

      {/* children wrapper - render outside the content so deeper replies don't accumulate extra indent */}
      {(() => {
        const avatarWidth = 32; // px (w-8)
        const gap = 12; // px approx for gap-3
        const replyOffset = avatarWidth + gap; // px
        const wrapperMargin = depth === 0 ? replyOffset : 0; // only offset children of top-level comments
        return (
          <div style={{ marginLeft: wrapperMargin }} className="mt-2">
            {node.children &&
              node.children.map((ch) => (
                <CommentNode
                  key={ch.comment.id}
                  node={ch}
                  depth={depth + 1}
                  onReply={onReply}
                  formatTime={formatTime}
                  onInlineReplyRequest={onInlineReplyRequest}
                  onPosted={onPosted}
                  postId={postId}
                />
              ))}

            {/* Inline composer inserted directly under this node when requested */}
            {node.comment && node._showInlineComposer ? (
              <InlineComposer
                postId={postId}
                parentId={node.comment.id}
                onPosted={(normalized) => {
                  try {
                    // forward to parent handler to append comment and clear flags
                    onPosted && onPosted(normalized);
                  } catch (e) {
                    console.error("onPosted handler failed", e);
                  }
                }}
                onCancel={() => {
                  // Clear the inline composer immediately by telling parent to
                  // close any inline composer (passing null clears all)
                  try {
                    onInlineReplyRequest && onInlineReplyRequest(null);
                  } catch (e) {
                    console.warn("Failed to cancel inline composer", e);
                  }
                }}
              />
            ) : null}
          </div>
        );
      })()}
    </div>
  );
}
