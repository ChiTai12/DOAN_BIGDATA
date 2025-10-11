import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import CreatePost from "./CreatePost";
import PostCard from "./PostCard";
import api from "../services/api";

function Feed() {
  const { user, updateTrigger } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPosts();

    const onNavigateHome = () => {
      // refresh posts when Home is clicked (user is already on home page)
      fetchPosts();
    };
    window.addEventListener("app:navigate:home", onNavigateHome);
    // real-time: listen for new posts created by other users
    const onPostCreated = (e) => {
      const payload = e.detail || e;
      if (!payload || !payload.post) return;
      // avoid duplicates: if already present, skip
      setPosts((prev) => {
        const exists = prev.some((p) => p.post.id === payload.post.id);
        if (exists) return prev;
        return [payload, ...prev];
      });
    };
    window.addEventListener("app:post:created", onPostCreated);

    // handle deletions broadcasted by server
    const onPostDeleted = (e) => {
      const payload = e.detail || e;
      console.debug("Feed received app:post:deleted", payload);
      if (!payload) return;
      const postId =
        payload.postId || payload.id || (payload.post && payload.post.id);
      if (!postId) return;
      // optional: log who deleted and when for debugging/UX
      if (payload.deletedBy || payload.deletedByUsername) {
        console.debug(
          `Post ${postId} deleted by ${
            payload.deletedByUsername || payload.deletedBy
          }`
        );
      }
      if (payload.deletedAt) {
        console.debug(
          `deletedAt: ${new Date(payload.deletedAt).toISOString()}`
        );
      }
      setPosts((prev) => prev.filter((item) => item.post.id !== postId));
    };

    // handle updates broadcasted by server
    const onPostUpdated = (e) => {
      const payload = e.detail || e;
      console.debug("Feed received app:post:updated", payload);
      if (!payload) return;
      // accept multiple payload shapes: { postId }, { post: { id } }, { id }
      const postId =
        payload.postId || (payload.post && payload.post.id) || payload.id || null;
      if (!postId) {
        // no post id provided — conservatively refresh feed
        fetchPosts();
        return;
      }
      // If update references a specific post, refresh the feed so UI shows latest
      fetchPosts();
    };

    window.addEventListener("app:post:deleted", onPostDeleted);
    window.addEventListener("app:post:updated", onPostUpdated);

    // ensure initial app launch also triggers the same behavior
    window.dispatchEvent(new CustomEvent("app:navigate:home"));
    return () => {
      window.removeEventListener("app:navigate:home", onNavigateHome);
      window.removeEventListener("app:post:created", onPostCreated);
      window.removeEventListener("app:post:deleted", onPostDeleted);
      window.removeEventListener("app:post:updated", onPostUpdated);
    };
  }, [user, updateTrigger]); // Re-fetch when user or updateTrigger changes

  const fetchPosts = async () => {
    try {
      const response = await api.get("/posts/feed");
      console.debug("fetchPosts: server response:", response.data);
      setPosts(response.data);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewPost = () => {
    fetchPosts();
  };

  const handleDeletePost = (deletedPostId) => {
    setPosts((prevPosts) =>
      prevPosts.filter((item) => item.post.id !== deletedPostId)
    );
  };

  if (loading) {
    return (
      <div className="w-full">
        <div className="animate-pulse space-y-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-gray-300 rounded-lg p-4"
            >
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-96 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div id="home-feed" className="w-full">
      {user && <CreatePost onPostCreated={handleNewPost} />}

      <div className="space-y-6">
        {posts.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-md ring-1 ring-gray-100">
            <div className="mx-auto max-w-md">
              <div className="flex items-center justify-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-12 h-12 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.72 9.72 0 01-4-.84L3 20l1.16-4.16A7.72 7.72 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                Hiện chưa có bài viết
              </h3>
              <p className="text-gray-500 mb-4">
                Hãy là người đầu tiên chia sẻ điều gì đó với cộng đồng.
              </p>
              {user ? (
                <div>
                  <button
                    onClick={() => {
                      try {
                        // focus composer textarea if present
                        const ta = document.getElementById("composer-textarea");
                        if (ta) {
                          ta.focus();
                          // place caret at end
                          const len = ta.value ? ta.value.length : 0;
                          try {
                            ta.setSelectionRange(len, len);
                          } catch (e) {}
                        }
                        // also dispatch app event for compatibility
                        window.dispatchEvent(
                          new CustomEvent("app:focus:create")
                        );
                        // scroll composer into view
                        const el = document.getElementById("home-feed");
                        if (el)
                          el.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      } catch (e) {}
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 transition"
                  >
                    Tạo bài viết
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          posts.map((item) => (
            <PostCard
              key={item.post.id}
              post={item.post}
              author={item.author}
              onDelete={handleDeletePost}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default Feed;
