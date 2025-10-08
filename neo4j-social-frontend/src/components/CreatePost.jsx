import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import api from "../services/api";

function CreatePost({ onPostCreated }) {
  const { user } = useAuth();
  const [content, setContent] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);

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
      if (image) {
        formData.append("image", image);
      }

      await api.post("/posts", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setContent("");
      setImage(null);
      setImagePreview(null);
      onPostCreated?.();
    } catch (error) {
      console.error("Error creating post:", error);
      alert("Failed to create post");
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
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What's on your mind?"
                id="composer-textarea"
                className="w-full resize-none bg-transparent outline-none text-gray-900 placeholder-gray-500 text-sm min-h-[72px] max-h-72"
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
                  Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={(!content.trim() && !image) || loading}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default CreatePost;
