import React, { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import api from "../services/api";
import feelings from "../data/feelings";
import emojiRegex from "emoji-regex";

function EditPostModal({ post, author, isOpen, onClose, onPostUpdated }) {
  const [content, setContent] = useState(post?.content || "");
  const [selectedIcon, setSelectedIcon] = useState(post?.icon || "");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(
    post?.imageUrl ? `http://localhost:5000${post.imageUrl}` : null
  );
  const [removeImage, setRemoveImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showFeelings, setShowFeelings] = useState(false);
  const fileInputRef = useRef(null);
  const feelingsRef = useRef(null);
  const feelingsButtonRef = useRef(null);
  const contentRef = useRef(null);
  const modalRef = useRef(null);
  const [popupStyle, setPopupStyle] = useState({ top: 0, left: 0, width: 320 });
  const scrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

  // Reset form when post changes
  useEffect(() => {
    if (post) {
      setContent(post.content || "");
      setSelectedIcon(post.icon || "");
      setImagePreview(
        post.imageUrl ? `http://localhost:5000${post.imageUrl}` : null
      );
      setImageFile(null);
      setRemoveImage(false);
    }
  }, [post]);

  // Also reset whenever the modal is opened to avoid stale/unsaved state
  useEffect(() => {
    if (!isOpen) return;
    if (post) {
      setContent(post.content || "");
      setSelectedIcon(post.icon || "");
      setImagePreview(
        post.imageUrl ? `http://localhost:5000${post.imageUrl}` : null
      );
      setImageFile(null);
      setRemoveImage(false);
    }
  }, [isOpen, post]);

  // NO automatic outside click closing - only manual close button
  // This prevents any accidental closing from scrolling, dragging, or small touches

  // Position popup and constrain width so it never exceeds viewport and
  // computes columns for wrapping (prevents horizontal scrollbar).
  useEffect(() => {
    if (!showFeelings || !feelingsButtonRef.current) return;

    // compute popup position using viewport coordinates (getBoundingClientRect)
    // For a fixed-position popup we must NOT add window.scrollX/Y — rect is
    // already relative to the viewport. Using scrollX/Y causes the popup to
    // drift during internal modal scrolling.
    const compute = () => {
      const rect = feelingsButtonRef.current.getBoundingClientRect();
      const margin = 16; // keep some space from window edges
      const maxAllowed = Math.max(200, window.innerWidth - margin * 2);
      // Start with a reasonable preferred width
      let preferred = Math.min(420, maxAllowed);
      // If modal is available, match the popup width to the modal's width
      if (modalRef.current) {
        const mrect = modalRef.current.getBoundingClientRect();
        // subtract some padding so popup doesn't touch modal edges
        const modalBased = Math.max(200, mrect.width - 32);
        preferred = Math.min(preferred, modalBased);
      }
      // center the popup relative to the modal when possible, otherwise anchor to the button
      let left = rect.left;
      if (modalRef.current) {
        const mrect = modalRef.current.getBoundingClientRect();
        left = mrect.left + Math.max(8, (mrect.width - preferred) / 2);
      }
      // if overflowing right, shift left
      if (left + preferred > window.innerWidth - margin) {
        left = window.innerWidth - margin - preferred;
      }
      if (left < margin) left = margin;

      // Decide whether to place below or above based on available space
      const spaceBelow = window.innerHeight - rect.bottom - 8; // px
      const spaceAbove = rect.top - 8;
      // estimate desired popup height (clamped) - increase to show more rows
      const desiredHeight = Math.min(
        420,
        Math.max(180, Math.floor((feelings.length / 8) * 40))
      );

      // Choose placement and compute effective height so popup fits viewport
      let height = desiredHeight;
      let top;
      let place = "below";

      if (spaceBelow >= desiredHeight + margin) {
        // plenty of room below
        place = "below";
        height = desiredHeight;
        top = rect.bottom + 8;
      } else if (spaceAbove >= desiredHeight + margin) {
        // plenty of room above
        place = "above";
        height = desiredHeight;
        top = rect.top - 8 - height;
      } else {
        // not enough room either side - pick the side with more space and shrink height
        if (spaceBelow >= spaceAbove) {
          place = "below";
          height = Math.max(120, spaceBelow - margin);
          top = rect.bottom + 8;
        } else {
          place = "above";
          height = Math.max(120, spaceAbove - margin);
          top = rect.top - 8 - height;
        }
      }

      // final clamp: ensure popup fully inside viewport
      const minTop = margin;
      const maxTop = window.innerHeight - margin - height;
      if (top < minTop) top = minTop;
      if (top > maxTop) top = maxTop;

      setPopupStyle({ top, left, width: preferred, place, maxHeight: height });
    };

    compute();
    // Unified scroll handler with debouncing
    // Use rAF for smooth updates while scrolling
    const rafRef = { id: null };
    const onScroll = () => {
      // Mark as scrolling and prevent clicks during scroll
      scrollingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        scrollingRef.current = false;
      }, 300);

      if (rafRef.id) cancelAnimationFrame(rafRef.id);
      rafRef.id = requestAnimationFrame(() => {
        compute();
        rafRef.id = null;
      });
    };

    window.addEventListener("resize", compute);
    window.addEventListener("scroll", onScroll, { passive: true });

    // Also listen for scroll events on the modal container (internal scrolling)
    if (modalRef.current) {
      modalRef.current.addEventListener("scroll", onScroll, { passive: true });
    }

    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", onScroll);
      if (modalRef.current) {
        modalRef.current.removeEventListener("scroll", onScroll);
      }
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (rafRef.id) cancelAnimationFrame(rafRef.id);
    };
  }, [showFeelings]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setRemoveImage(false);

      const reader = new FileReader();
      reader.onload = (event) => {
        setImagePreview(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Extract emojis from content preserving order and duplicates
  const computedIcons = useMemo(() => {
    try {
      if (!content) return [];
      const rx = emojiRegex();
      const m = content.match(rx);
      return Array.isArray(m) ? m : [];
    } catch (e) {
      return [];
    }
  }, [content]);

  // Helper to render a compact emoji strip with overflow indicator
  const renderPreviewIcons = (icons, limit = 4) => {
    if (!icons || icons.length === 0) return null;
    const visible = icons.slice(0, limit);
    const remaining = icons.length - visible.length;
    return (
      <div className="flex items-center gap-1 ml-3">
        {visible.map((s, i) => (
          <span key={i} className="text-lg leading-none">
            {s}
          </span>
        ))}
        {remaining > 0 && (
          <span className="text-xs text-gray-500 ml-1">+{remaining}</span>
        )}
      </div>
    );
  };

  // choose a single icon to show on the Feelings button: prefer live computed icon from content
  const displayFeelIcon =
    computedIcons && computedIcons.length > 0
      ? computedIcons[0]
      : selectedIcon || "😊";

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("content", content);
      // Do NOT append icon on update. Backend will extract emojis from content.

      if (imageFile) {
        formData.append("image", imageFile);
      }

      if (removeImage) {
        formData.append("removeImage", "true");
      }

      // Let axios set the multipart headers (it will include the correct boundary)
      const response = await api.put(`/posts/${post.id}`, formData);

      console.log("✅ Post updated:", response.data);

      // Dispatch event for real-time updates
      window.dispatchEvent(
        new CustomEvent("app:post:updated", {
          detail: {
            postId: post.id,
            content,
            // icon intentionally omitted so listeners read from server
            imageUrl: imageFile
              ? "new-image"
              : removeImage
              ? ""
              : post.imageUrl,
          },
        })
      );

      onPostUpdated?.();
      onClose();
    } catch (error) {
      console.error("❌ Error updating post:", error, error?.response?.data);
      const serverMsg =
        error?.response?.data?.error || error?.response?.data?.message;
      try {
        alert(serverMsg || error.message || "Lỗi khi cập nhật bài viết!");
      } catch (e) {}
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              Chỉnh sửa bài viết
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
            >
              ×
            </button>
          </div>

          {/* Author info */}
          <div className="flex items-center gap-3 mb-4">
            {author?.avatarUrl ? (
              <img
                src={`http://localhost:5000${author.avatarUrl}`}
                alt={author?.displayName || author?.username}
                className="w-10 h-10 rounded-full object-cover shadow-avatar"
              />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold shadow-avatar">
                {(
                  author?.displayName?.[0] ||
                  author?.username?.[0] ||
                  "U"
                ).toUpperCase()}
              </div>
            )}
            <div>
              <div className="font-semibold text-gray-900">
                {author?.displayName || author?.username || "Unknown User"}
              </div>
              <div className="text-sm text-gray-500">Chỉnh sửa bài viết</div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Content input */}
            <div className="mb-4">
              <textarea
                ref={contentRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Bạn đang nghĩ gì?"
                className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="4"
                required
              />
            </div>

            {/* Live emoji preview is rendered inline with action buttons below */}

            {/* Image preview */}
            {imagePreview && (
              <div className="mb-4 relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-64 object-cover rounded-lg border"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 mb-4">
              {/* Image upload */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-blue-500 hover:text-blue-600"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                    clipRule="evenodd"
                  />
                </svg>
                Ảnh
              </button>

              {/* Live emoji preview (shows up to 4 with +N overflow) */}
              <div className="ml-2 mr-1 flex items-center">
                {renderPreviewIcons(computedIcons, 4)}
              </div>

              {/* Feelings */}
              <div className="relative">
                <button
                  ref={feelingsButtonRef}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFeelings((s) => !s);
                  }}
                  className="flex items-center gap-2 text-blue-500 hover:text-blue-600"
                >
                  Cảm xúc
                </button>
              </div>
            </div>

            {/* Submit buttons */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading || !content.trim()}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                {loading ? "Đang cập nhật..." : "Cập nhật"}
              </button>
            </div>
          </form>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Emoji picker portal - rendered outside modal DOM */}
      {showFeelings &&
        feelingsButtonRef.current &&
        createPortal(
          <div
            ref={feelingsRef}
            className="fixed bg-white border border-gray-200 rounded-md shadow-lg p-4"
            style={{
              position: "fixed",
              zIndex: 99999,
              top:
                typeof popupStyle.top === "number"
                  ? `${popupStyle.top}px`
                  : popupStyle.top,
              left:
                typeof popupStyle.left === "number"
                  ? `${popupStyle.left}px`
                  : popupStyle.left,
              width: popupStyle.width,
              maxWidth: "calc(100% - 48px)",
              maxHeight: popupStyle.maxHeight || 420,
              overflow: "hidden",
              boxShadow: "0 8px 30px rgba(2,6,23,0.2)",
            }}
            aria-hidden={!showFeelings}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-700">
                Chọn cảm xúc
              </div>
              <button
                type="button"
                onClick={() => setShowFeelings(false)}
                className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 text-sm font-bold"
                title="Đóng"
              >
                ×
              </button>
            </div>

            <div
              className="overflow-y-auto overflow-x-hidden pr-3"
              style={{ maxHeight: (popupStyle.maxHeight || 420) - 64 }}
            >
              <div
                className="grid auto-rows-min gap-2"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(40px, 1fr))`,
                }}
              >
                {feelings.map(({ key, symbol, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      // Insert emoji at caret position in the textarea
                      try {
                        const ta = contentRef.current;
                        if (ta && typeof ta.selectionStart === "number") {
                          const start = ta.selectionStart;
                          const end = ta.selectionEnd;
                          const newContent =
                            content.slice(0, start) +
                            symbol +
                            content.slice(end);
                          setContent(newContent);
                          // keep focus and place caret after inserted emoji
                          setTimeout(() => {
                            ta.focus();
                            const pos = start + symbol.length;
                            ta.selectionStart = ta.selectionEnd = pos;
                          }, 0);
                        } else {
                          // fallback: append
                          setContent((c) => c + symbol);
                        }
                      } catch (e) {
                        setContent((c) => c + symbol);
                      }
                    }}
                    className={`w-10 h-10 rounded-md flex items-center justify-center text-2xl transition-colors hover:bg-gray-100`}
                    title={label}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default EditPostModal;
