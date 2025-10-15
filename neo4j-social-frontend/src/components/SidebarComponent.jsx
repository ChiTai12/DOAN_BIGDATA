import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import api from "../services/api";

const SidebarComponent = ({ onToggleAdmin }) => {
  const { user, updateTrigger } = useAuth();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [following, setFollowing] = useState(new Set());
  const [hovered, setHovered] = useState(null);
  // fetch suggestions (exposed so events can trigger refresh)
  const fetchSuggestions = async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/users/suggestions");
      const list = Array.isArray(res.data) ? res.data : [];
      // Remove current user from suggestions
      const filtered = list.filter((s) => {
        if (!s) return false;
        if (user?.id && s.id && s.id === user.id) return false;
        if (user?.username && s.username && s.username === user.username)
          return false;
        return true;
      });
      if (!signal?.aborted) setSuggestions(filtered);
    } catch (err) {
      console.error("Failed to load suggestions", err);
      if (!signal?.aborted) setError("Không thể tải gợi ý");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const fetchFollowing = async (signal) => {
    try {
      const res = await api.get("/users/following");
      if (!signal?.aborted && res.data && Array.isArray(res.data.following)) {
        // normalize keys to strings to avoid mismatches between id and username types
        setFollowing(new Set(res.data.following.map((v) => String(v))));
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    let cancelled = false;
    const controller = { aborted: false };
    fetchSuggestions(controller);
    fetchFollowing(controller);

    // Listen for follow/unfollow events. Only update local following Set when
    // the current user is the actor (payload.followerId === user.id). This
    // prevents reloading the entire sidebar when unrelated users follow/unfollow.
    const onFollow = (e) => {
      try {
        const payload = e.detail || {};
        console.log("sidebar onFollow event:", payload);
        if (
          payload.followerId &&
          String(payload.followerId) === String(user?.id)
        ) {
          setFollowing((prev) => {
            const s = new Set(prev);
            if (payload.followingId) s.add(String(payload.followingId));
            return s;
          });
        }
      } catch (err) {
        console.warn("Sidebar failed to process app:user:follow", err);
      }
    };

    const onUnfollow = (e) => {
      try {
        const payload = e.detail || {};
        console.log("sidebar onUnfollow event:", payload);
        if (
          payload.followerId &&
          String(payload.followerId) === String(user?.id)
        ) {
          setFollowing((prev) => {
            const s = new Set(prev);
            if (payload.followingId) s.delete(String(payload.followingId));
            return s;
          });
        }
      } catch (err) {
        console.warn("Sidebar failed to process app:user:unfollow", err);
      }
    };

    window.addEventListener("app:user:follow", onFollow);
    window.addEventListener("app:user:unfollow", onUnfollow);
    // Update suggestions and sidebar display when any user's profile is updated
    const onUserUpdated = (e) => {
      try {
        const payload = e.detail || e;
        if (!payload || !payload.user) return;
        const updated = payload.user;
        // Update suggestions list entries if the updated user appears there
        setSuggestions((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          return prev.map((s) => {
            try {
              if (!s) return s;
              if (s.id && updated.id && String(s.id) === String(updated.id)) {
                return { ...s, ...updated };
              }
              // also match by username fallback
              if (
                s.username &&
                updated.username &&
                String(s.username) === String(updated.username)
              ) {
                return { ...s, ...updated };
              }
            } catch (err) {}
            return s;
          });
        });
      } catch (err) {
        console.warn("Sidebar failed to process app:user:updated", err);
      }
    };
    // New user created elsewhere — prepend to suggestions if not current user
    const onUserCreated = (e) => {
      try {
        const payload = e.detail || e;
        if (!payload || !payload.user) return;
        const newUser = payload.user;
        console.log(
          "Sidebar received app:user:created:",
          newUser && newUser.username,
          newUser && newUser.id
        );
        // ignore if this is the current user
        if (user && newUser && String(newUser.id) === String(user.id)) return;
        // refresh suggestions from server so server-side filters/order are respected
        try {
          fetchSuggestions();
        } catch (err) {
          console.warn("Failed to refresh suggestions after user:created", err);
        }
      } catch (err) {
        console.warn("Sidebar failed to process app:user:created", err);
      }
    };
    window.addEventListener("app:user:updated", onUserUpdated);
    window.addEventListener("app:user:created", onUserCreated);
    return () => {
      cancelled = true;
      controller.aborted = true;
      window.removeEventListener("app:user:follow", onFollow);
      window.removeEventListener("app:user:unfollow", onUnfollow);
      window.removeEventListener("app:user:updated", onUserUpdated);
      window.removeEventListener("app:user:created", onUserCreated);
    };
  }, [user?.id, updateTrigger]); // Re-fetch when updateTrigger changes

  const handleFollow = async (userId) => {
    // normalize userId to string for consistent comparison
    const normalizedUserId = String(userId);
    const isFollowing = following.has(normalizedUserId);

    console.log("handleFollow:", {
      userId,
      normalizedUserId,
      isFollowing,
      following: Array.from(following),
    });

    // optimistic update
    setFollowing((prev) => {
      const s = new Set(prev);
      if (isFollowing) {
        s.delete(normalizedUserId);
      } else {
        s.add(normalizedUserId);
      }
      return s;
    });

    try {
      if (isFollowing) {
        await api.delete(`/users/follow/${normalizedUserId}`);
      } else {
        await api.post(`/users/follow/${normalizedUserId}`);
      }
      // dispatch local event so other components in the same tab update immediately
      try {
        const payload = { followerId: user?.id, followingId: normalizedUserId };
        const evtName = isFollowing ? "app:user:unfollow" : "app:user:follow";
        window.dispatchEvent(new CustomEvent(evtName, { detail: payload }));
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error("Follow toggle failed", err);
      // rollback optimistic update
      setFollowing((prev) => {
        const s = new Set(prev);
        if (isFollowing) {
          s.add(normalizedUserId);
        } else {
          s.delete(normalizedUserId);
        }
        return s;
      });
    }
  };

  // If not logged in, show prompt
  if (!user) {
    return (
      <div className="w-full">
        <div className="bg-white border border-gray-300 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">
            Chào mừng đến với mạng xã hội
          </h3>
          <p className="text-gray-600 text-sm">
            Đăng nhập để xem bài viết và kết nối với bạn bè!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Admin action - only visible to admin users */}
      {(user?.role === "admin" || String(user?.username) === "admin") && (
        <div className="bg-white border border-gray-300 rounded-lg p-4">
          <button
            onClick={() => (window.location.pathname = "/admin")}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium"
          >
            Open Admin Dashboard
          </button>
        </div>
      )}
      <div className="bg-white border border-gray-300 rounded-lg p-6">
        <div className="flex items-center gap-4" key={updateTrigger}>
          {user?.avatarUrl ? (
            <img
              src={`http://localhost:5000${user.avatarUrl}`}
              alt="Avatar"
              className="w-16 h-16 rounded-full object-cover shadow-avatar"
              onError={(e) => {
                try {
                  e.target.style.display = "none";
                } catch (err) {}
              }}
            />
          ) : (
            <div className="w-16 h-16 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-avatar">
              {(user?.displayName?.[0] || user?.username?.[0])?.toUpperCase() ||
                "U"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-lg text-gray-900 truncate">
              {user?.displayName || user?.username || "Unknown"}
            </div>
            <div className="text-sm text-gray-600 truncate">
              @{user?.username}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-300 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Gợi ý kết nối
        </h3>

        {loading ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : error ? (
          <div className="text-sm text-red-500">{error}</div>
        ) : (
          <div className="space-y-4">
            {suggestions.length === 0 ? (
              <div className="text-sm text-gray-500">
                No suggestions available.
              </div>
            ) : (
              // Only show suggestions that the user is NOT already following
              suggestions
                .filter((s) => {
                  const key = s.id || s.username;
                  return !following.has(key);
                })
                .map((suggestion) => (
                  <div
                    key={suggestion.id || suggestion.username}
                    className="flex items-center gap-4 p-2 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <div className="relative w-12 h-12">
                      {suggestion?.avatarUrl ? (
                        <>
                          <img
                            src={`http://localhost:5000${suggestion.avatarUrl}`}
                            alt={suggestion.displayName || suggestion.username}
                            className="w-12 h-12 rounded-full object-cover shadow-avatar"
                            onError={(e) => {
                              try {
                                e.target.style.display = "none";
                                // show fallback div
                                const fallback = e.target.nextElementSibling;
                                if (fallback) fallback.style.display = "flex";
                              } catch (err) {}
                            }}
                          />
                          <div
                            className="w-12 h-12 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white font-bold shadow-avatar absolute top-0 left-0"
                            style={{ display: "none" }}
                          >
                            {(
                              suggestion.displayName?.[0] ||
                              suggestion.username?.[0] ||
                              "U"
                            ).toUpperCase()}
                          </div>
                        </>
                      ) : (
                        <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white font-bold shadow-avatar">
                          {(
                            suggestion.displayName?.[0] ||
                            suggestion.username?.[0] ||
                            "U"
                          ).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">
                        {suggestion.displayName || suggestion.username}
                      </div>
                      <div className="text-sm text-gray-500 truncate">
                        @{suggestion.username}
                      </div>
                    </div>
                    {(() => {
                      const key = String(suggestion.id || suggestion.username);
                      const isFollowing = following.has(String(key));
                      return (
                        <button
                          onClick={() => handleFollow(key)}
                          onMouseEnter={() => setHovered(key)}
                          onMouseLeave={() => setHovered(null)}
                          className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ease-in-out transform min-w-[100px] ${
                            isFollowing
                              ? "bg-gray-200 text-gray-800 hover:bg-red-500 hover:text-white hover:scale-105"
                              : "bg-blue-500 text-white hover:bg-blue-600"
                          }`}
                        >
                          {isFollowing
                            ? hovered === key
                              ? "Bỏ theo dõi"
                              : "Đang theo dõi"
                            : "Theo dõi"}
                        </button>
                      );
                    })()}
                  </div>
                ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SidebarComponent;
