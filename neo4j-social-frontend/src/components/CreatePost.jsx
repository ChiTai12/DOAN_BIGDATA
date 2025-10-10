import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "./AuthContext";
import api from "../services/api";
import feelings from "../data/feelings";

function CreatePost({ onPostCreated }) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState(null);
  // feelings list imported from data/feelings.js
  // Keep feelings in local state so we can merge/import packs at runtime
  const [emojiSet, setEmojiSet] = useState(feelings);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);
  const composerRef = useRef(null);

  // Insert emoji at cursor position in textarea (or append)
  const insertEmojiIntoContent = (symbol) => {
    // keep last selected for compatibility
    setSelectedIcon(symbol);
    const el = composerRef.current;
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newText = content.slice(0, start) + symbol + content.slice(end);
      setContent(newText);
      // place caret after inserted emoji
      requestAnimationFrame(() => {
        try {
          el.focus();
          const pos = start + symbol.length;
          el.setSelectionRange(pos, pos);
        } catch (e) {
          // ignore
        }
      });
    } else {
      setContent((c) => c + symbol);
    }
  };

  // Close picker when clicking outside
  useEffect(() => {
    function onDocClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() && !image) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("content", content);
      if (selectedIcon) formData.append("icon", selectedIcon);
      if (image) {
        formData.append("image", image);
      }

      await api.post("/posts", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setContent("");
      setImage(null);
      setImagePreview(null);
      setSelectedIcon(null);
      onPostCreated?.();
    } catch (error) {
      console.error("Error creating post:", error);
      try {
        if (window.appToast)
          window.appToast("Không thể tạo bài viết. Vui lòng thử lại.");
        else alert("Failed to create post");
      } catch (e) {}
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="bg-white border border-gray-300 rounded-lg p-6 mb-6">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col items-start text-left">
          {/* Avatar on top-left */}
          {user?.avatarUrl ? (
            <img
              src={`http://localhost:5000${user.avatarUrl}`}
              alt={user?.displayName || user?.username}
              className="w-14 h-14 rounded-full object-cover mb-3 self-start shadow-avatar"
            />
          ) : (
            <div className="w-14 h-14 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold mb-3 self-start shadow-avatar">
              {(user?.displayName?.[0] || user?.username?.[0])?.toUpperCase()}
            </div>
          )}

          <div className="w-full">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 focus-within:ring-2 focus-within:ring-blue-200 transition">
              <textarea
                ref={composerRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Bạn đang nghĩ gì?"
                id="composer-textarea"
                className="w-full resize-none bg-transparent outline-none text-gray-900 placeholder-gray-400 text-base min-h-[96px] max-h-72 p-0 leading-relaxed"
                rows="3"
              />

              {imagePreview && (
                <div className="mt-3 relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full max-h-64 rounded-md object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImage(null);
                      setImagePreview(null);
                    }}
                    className="absolute top-2 right-2 bg-gray-800 bg-opacity-50 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-opacity-70"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mt-3">
              <div className="flex items-center gap-4">
                <label className="cursor-pointer text-blue-500 hover:text-blue-600 flex items-center gap-2">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21,15 16,10 5,21" />
                  </svg>
                  Ảnh
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
                {/* Feeling (emoji) picker — stores emoji symbol into `icon` */}
                <div className="relative" ref={pickerRef}>
                  {/* Feeling button (shows selected icon + label) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPickerOpen((s) => !s);
                    }}
                    className="flex items-center gap-2 px-2 py-1 rounded-md text-sm bg-transparent hover:bg-gray-50"
                    title={selectedIcon ? "Thay đổi cảm xúc" : "Thêm cảm xúc"}
                  >
                    <span className="text-lg">{selectedIcon || "😊"}</span>
                    <span className="text-sm text-gray-700">Cảm xúc</span>
                    {selectedIcon && (
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelectedIcon(null);
                        }}
                        className="ml-2 text-xs text-gray-500 hover:text-gray-700"
                        title="Xóa cảm xúc"
                      >
                        ×
                      </button>
                    )}
                  </button>

                  {/* Picker popup */}
                  {pickerOpen && (
                    <div className="absolute z-40 mt-2 w-80 md:w-96 bg-white border border-gray-200 rounded-md shadow-lg p-4">
                      <div className="flex items-center mb-2">
                        <div className="text-sm font-medium text-gray-700">
                          Chọn cảm xúc
                        </div>
                      </div>

                      <div className="max-h-60 overflow-y-auto overflow-x-hidden pr-3">
                        <div className="grid grid-cols-8 gap-2">
                          {emojiSet.map(({ key, symbol, label }) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                // insert emoji into the composer; keep picker open for multiple
                                insertEmojiIntoContent(symbol);
                              }}
                              className={`w-12 h-12 rounded-md flex items-center justify-center text-2xl transition-colors hover:bg-gray-100`}
                              title={label}
                            >
                              {symbol}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* import removed — only built-in emojis are shown */}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={(!content.trim() && !image) || loading}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Đang đăng..." : "Đăng"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default CreatePost;
