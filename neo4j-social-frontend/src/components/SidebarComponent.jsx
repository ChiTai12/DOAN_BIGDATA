import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import api from "../services/api";

const SidebarComponent = () => {
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
        setFollowing(new Set(res.data.following));
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
        if (payload.followerId && payload.followerId === user?.id) {
          setFollowing((prev) => {
            const s = new Set(prev);
            if (payload.followingId) s.add(payload.followingId);
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
        if (payload.followerId && payload.followerId === user?.id) {
          setFollowing((prev) => {
            const s = new Set(prev);
            if (payload.followingId) s.delete(payload.followingId);
            return s;
          });
        }
      } catch (err) {
        console.warn("Sidebar failed to process app:user:unfollow", err);
      }
    };

    window.addEventListener("app:user:follow", onFollow);
    window.addEventListener("app:user:unfollow", onUnfollow);
    return () => {
      cancelled = true;
      controller.aborted = true;
      window.removeEventListener("app:user:follow", onFollow);
      window.removeEventListener("app:user:unfollow", onUnfollow);
    };
  }, [user?.id, updateTrigger]); // Re-fetch when updateTrigger changes

  const handleFollow = async (userId) => {
    // toggle follow/unfollow
    const isFollowing = following.has(userId);
    // optimistic
    setFollowing((prev) => {
      const s = new Set(prev);
      if (isFollowing) s.delete(userId);
      else s.add(userId);
      return s;
    });
    try {
      if (isFollowing) {
        await api.delete(`/users/follow/${userId}`);
      } else {
        await api.post(`/users/follow/${userId}`);
      }
      // dispatch local event so other components in the same tab update immediately
      try {
        const payload = { followerId: user?.id, followingId: userId };
        const evtName = isFollowing ? "app:user:unfollow" : "app:user:follow";
        window.dispatchEvent(new CustomEvent(evtName, { detail: payload }));
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error("Follow toggle failed", err);
      // rollback
      setFollowing((prev) => {
        const s = new Set(prev);
        if (isFollowing) s.add(userId);
        else s.delete(userId);
        return s;
      });
    }
  };

  // If not logged in, show prompt
  if (!user) {
    return (
      <div className="w-full">
        <div className="bg-white border border-gray-300 rounded-lg p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">Welcome to Pictogram</h3>
          <p className="text-gray-600 text-sm">
            Login to see posts and connect with friends!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="bg-white border border-gray-300 rounded-lg p-6">
        <div className="flex items-center gap-4" key={updateTrigger}>
          {user?.avatarUrl ? (
            <img
              src={`http://localhost:5000${user.avatarUrl}`}
              alt="Avatar"
              className="w-16 h-16 rounded-full object-cover shadow-avatar"
            />
          ) : (
            <div className="w-16 h-16 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-avatar">
              {(user?.displayName?.[0] || user?.username?.[0])?.toUpperCase() ||
                "U"}
            </div>
          )}
          <div>
            <div className="font-semibold text-lg text-gray-900">
              {user?.displayName || user?.username || "Unknown"}
            </div>
            <div className="text-sm text-gray-600">@{user?.username}</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-300 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          You Can Follow Them
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
                    {suggestion?.avatarUrl ? (
                      <img
                        src={`http://localhost:5000${suggestion.avatarUrl}`}
                        alt={suggestion.displayName || suggestion.username}
                        className="w-12 h-12 rounded-full object-cover shadow-avatar"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white font-bold shadow-avatar">
                        {suggestion.displayName?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">
                        {suggestion.displayName || suggestion.username}
                      </div>
                      <div className="text-sm text-gray-500">
                        @{suggestion.username}
                      </div>
                    </div>
                    {(() => {
                      const key = suggestion.id || suggestion.username;
                      const isFollowing = following.has(key);
                      return (
                        <button
                          onClick={() => handleFollow(key)}
                          onMouseEnter={() => setHovered(key)}
                          onMouseLeave={() => setHovered(null)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ease-in-out transform ${
                            isFollowing
                              ? "bg-gray-200 text-gray-800 hover:bg-red-500 hover:text-white hover:scale-105"
                              : "bg-blue-500 text-white hover:bg-blue-600"
                          }`}
                        >
                          {isFollowing
                            ? hovered === key
                              ? "Unfollow"
                              : "Following"
                            : "Follow"}
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
