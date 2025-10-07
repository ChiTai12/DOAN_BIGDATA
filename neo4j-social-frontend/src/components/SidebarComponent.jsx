import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import api from "../services/api";

const SidebarComponent = () => {
  const { user, updateTrigger } = useAuth();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [following, setFollowing] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    const fetchSuggestions = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get("/users/suggestions");
        if (!cancelled) {
          const list = Array.isArray(res.data) ? res.data : [];
          // Remove current user from suggestions
          const filtered = list.filter((s) => {
            if (!s) return false;
            if (user?.id && s.id && s.id === user.id) return false;
            if (user?.username && s.username && s.username === user.username)
              return false;
            return true;
          });
          setSuggestions(filtered);
        }
      } catch (err) {
        console.error("Failed to load suggestions", err);
        if (!cancelled) setError("Không thể tải gợi ý");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSuggestions();
    return () => {
      cancelled = true;
    };
  }, [user?.id, updateTrigger]); // Re-fetch when updateTrigger changes

  const handleFollow = async (userId) => {
    if (following.has(userId)) return;
    // Optimistic UI
    setFollowing((prev) => new Set(prev).add(userId));
    try {
      await api.post(`/users/follow/${userId}`);
    } catch (err) {
      console.error("Follow failed", err);
      // rollback
      setFollowing((prev) => {
        const s = new Set(prev);
        s.delete(userId);
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
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold text-lg">
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
              suggestions.map((suggestion) => (
                <div
                  key={suggestion.id || suggestion.username}
                  className="flex items-center gap-4 p-2 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {suggestion?.avatarUrl ? (
                    <img
                      src={`http://localhost:5000${suggestion.avatarUrl}`}
                      alt={suggestion.displayName || suggestion.username}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white font-bold">
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
                  <button
                    onClick={() =>
                      handleFollow(suggestion.id || suggestion.username)
                    }
                    disabled={following.has(
                      suggestion.id || suggestion.username
                    )}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      following.has(suggestion.id || suggestion.username)
                        ? "bg-gray-300 text-gray-700 cursor-not-allowed"
                        : "bg-blue-500 text-white hover:bg-blue-600"
                    }`}
                  >
                    {following.has(suggestion.id || suggestion.username)
                      ? "Following"
                      : "Follow"}
                  </button>
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
