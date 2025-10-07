import React, { useState, useContext, useEffect } from "react";
import { useAuth } from "./AuthContext";
import api from "../services/api";

function PostCard({ post, author, onDelete }) {
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post?.likesCount || 0);
  const [isDeleting, setIsDeleting] = useState(false);
  const { user } = useAuth();

  // Check if current user has liked this post (optional: could be passed from parent)
  useEffect(() => {
    // For now, assume not liked initially. In a real app, you'd check with the server
    // or pass this info from the Feed component
    // attempt to infer liked from post.liked (if backend provides) or default false
    setLiked(Boolean(post?.liked));
    setLikesCount(post?.likesCount || 0);
  }, [post.id, post?.liked, post?.likesCount]);

  // Listen for real-time post updates
  useEffect(() => {
    function onPostUpdate(e) {
      const payload = e.detail;
      if (payload?.postId === post.id) {
        setLikesCount(payload.likesCount);
        // If this update is from the current user, update liked state
        if (payload.fromUserId === user?.id) {
          setLiked(payload.liked);
        }
        console.log(`🔄 PostCard updated post ${post.id} - liked: ${payload.liked}, count: ${payload.likesCount}`);
      }
    }

    window.addEventListener('app:post:likes:update', onPostUpdate);
    return () => {
      window.removeEventListener('app:post:likes:update', onPostUpdate);
    };
  }, [post.id, user?.id]);  const formatTime = (timestamp) => {
    // Neo4j may return an Integer-like object. Safely convert to number.
    let ts = timestamp;
    if (ts && typeof ts === "object" && typeof ts.toNumber === "function") {
      ts = ts.toNumber();
    } else {
      ts = Number(ts);
    }
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const handleDelete = async () => {
    if (!window.confirm("Bạn có chắc muốn xóa bài viết này?")) return;

    setIsDeleting(true);
    try {
      await api.delete(`/posts/delete/${post.id}`);
      alert("✅ Đã xóa bài viết thành công!");
      onDelete?.(post.id); // Callback để refresh feed
    } catch (error) {
      console.error("❌ Lỗi xóa bài viết:", error);
      alert("❌ Không thể xóa bài viết. Vui lòng thử lại!");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLike = async () => {
    console.log(`🔥 HandleLike called for post ${post.id}`);
    try {
      console.log(`📤 Sending like request to /posts/${post.id}/like`);
      const response = await api.post(`/posts/${post.id}/like`);
      console.log("✅ Like response received:", response.data);
      setLiked(response.data.liked);
      
      if (response.data.liked) {
        console.log(`❤️ Post ${post.id} is now liked`);
      } else {
        console.log(`💔 Post ${post.id} is now unliked`);
      }
    } catch (error) {
      console.error("❌ Lỗi like bài viết:", error);
      console.error("❌ Error details:", error.response?.data || error.message);
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
            className="w-8 h-8 rounded-full object-cover"
            onError={(e) => {
              // If image fails to load, hide it so fallback initial shows
              e.target.style.display = "none";
              // Optionally we could set a state to show fallback, but hiding is fine
            }}
          />
        ) : (
          <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold text-sm">
            {(author?.displayName?.[0] || author?.username?.[0] || "U").toUpperCase()}
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
        {/* Show delete button if user is author */}
        {isAuthor ? (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-red-400 hover:text-red-600 disabled:opacity-50"
            title="Xóa bài viết"
          >
            {isDeleting ? (
              <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
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

      {/* Post actions */}
      <div className="p-4">
        <div className="flex items-center gap-4 mb-3">
          <button
            onClick={handleLike}
            className={`hover:opacity-70 transition-opacity ${
              liked ? "text-red-500" : "text-gray-700"
            }`}
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
            <div className="text-sm text-gray-600">{likesCount} lượt thích</div>
          <button className="text-gray-700 hover:opacity-70 transition-opacity">
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
          <button className="text-gray-700 hover:opacity-70 transition-opacity">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16,6 12,2 8,6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
        </div>

        {/* Post content */}
        {post?.content && (
          <div className="text-sm text-gray-900 leading-relaxed">
            <span className="font-semibold">{author?.displayName || author?.username}</span>{" "}
            {post.content}
          </div>
        )}
      </div>
    </div>
  );
}

export default PostCard;
