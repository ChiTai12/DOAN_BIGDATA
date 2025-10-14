import React, { useState, useEffect } from "react";
import api from "../services/api";
import { useAuth } from "./AuthContext";

export default function ChatSidebar({ onSelect }) {
  const { user, updateTrigger } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchThreads = async () => {
      setLoading(true);
      try {
        const res = await api.get("/messages/threads");
        if (!cancelled) setThreads(res.data || []);
      } catch (err) {
        console.error("Failed to load threads", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (user) fetchThreads();
    return () => (cancelled = true);
  }, [user, updateTrigger]);

  // Update threads and suggestions when any user's profile is updated elsewhere
  useEffect(() => {
    function onUserUpdated(e) {
      const payload = e.detail || e;
      if (!payload || !payload.user) return;
      const updated = payload.user;
      try {
        setThreads((prev) =>
          prev.map((t) => {
            try {
              if (
                t &&
                t.other &&
                (String(t.other.id) === String(updated.id) ||
                  (t.other.username &&
                    updated.username &&
                    String(t.other.username) === String(updated.username)))
              ) {
                return { ...t, other: { ...t.other, ...updated } };
              }
            } catch (err) {}
            return t;
          })
        );
      } catch (err) {}

      try {
        setSuggestions((prev) =>
          prev.map((s) => {
            try {
              if (!s) return s;
              if (s.id && updated.id && String(s.id) === String(updated.id))
                return { ...s, ...updated };
              if (
                s.username &&
                updated.username &&
                String(s.username) === String(updated.username)
              )
                return { ...s, ...updated };
            } catch (err) {}
            return s;
          })
        );
      } catch (err) {}
    }

    window.addEventListener("app:user:updated", onUserUpdated);
    return () => window.removeEventListener("app:user:updated", onUserUpdated);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchSuggestions = async () => {
      console.log("🔍 Loading user suggestions...");
      setLoadingSuggestions(true);

      try {
        const res = await api.get("/users/suggestions");
        console.log("📊 Suggestions response:", res.data);
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
        console.error("❌ Failed to load suggestions:", err);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    };

    if (user && !loading) {
      fetchSuggestions();
    }

    return () => (cancelled = true);
  }, [user, threads.length, loading, updateTrigger]);

  if (!user) {
    console.log("❌ No user - showing login prompt");
    return (
      <div className="p-4 h-full">
        <div className="text-sm text-gray-500 text-center py-8">
          <div className="mb-2">Vui lòng đăng nhập để chat</div>
          <div className="text-xs">Click icon profile để login</div>
        </div>
      </div>
    );
  }

  console.log("🎨 Rendering ChatSidebar:", {
    user: user.username,
    loading,
    threadsCount: threads.length,
    suggestionsCount: suggestions.length,
    loadingSuggestions,
  });

  return (
    <div className="p-4 h-full overflow-y-auto">
      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <div className="space-y-4">
          {/* Show existing threads that actually have messages */}
          {threads.filter(
            (t) => t.lastMsg && (t.lastMsg.text || t.lastMsg.type)
          ).length > 0 && (
            <div>
              <div className="text-xs text-gray-600 font-medium mb-2 uppercase tracking-wide font-['Inter',sans-serif]">
                CUỘC TRÒ CHUYỆN GẦN ĐÂY
              </div>
              <div className="space-y-2 mb-4">
                {threads
                  .filter(
                    (t) => t.lastMsg && (t.lastMsg.text || t.lastMsg.type)
                  )
                  .map((t, index) => (
                    <button
                      key={`thread-${t.other?.id || index}`}
                      onClick={() => onSelect(t.other)}
                      className="w-full text-left flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-colors"
                    >
                      {t.other?.avatarUrl ? (
                        <img
                          src={`http://localhost:5000${t.other.avatarUrl}`}
                          alt={t.other.displayName || t.other.username}
                          className="w-10 h-10 rounded-full object-cover shadow-avatar"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-avatar">
                          {(
                            t.other?.displayName?.[0] ||
                            t.other?.username?.[0] ||
                            "?"
                          ).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900">
                          {t.other?.displayName ||
                            t.other?.username ||
                            "Unknown User"}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {t.lastMsg?.text || "Chưa có tin nhắn"}
                        </div>
                      </div>
                      <div className="w-2 h-2 bg-green-400 rounded-full" />
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Always show suggestions for starting new conversations */}
          <div>
            <div className="text-xs text-gray-600 font-medium mb-2 uppercase tracking-wide font-['Inter',sans-serif]">
              BẮT ĐẦU CUỘC TRÒ CHUYỆN MỚI
            </div>

            {loadingSuggestions ? (
              <div className="text-sm text-gray-500 text-center py-4">
                <div className="inline-flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                  Đang tải...
                </div>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-center py-4">
                <div className="text-sm text-gray-500 mb-1">
                  Chưa có người dùng
                </div>
                <div className="text-xs text-gray-400">
                  Đăng ký thêm user để chat
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {(() => {
                  // Build a set of users that already have threads (by id or username)
                  const existing = new Set(
                    threads
                      .map((t) => t.other?.id || t.other?.username)
                      .filter(Boolean)
                  );

                  // Filter suggestions to only those who do NOT already have a thread
                  const filteredSuggestions = suggestions.filter((s) => {
                    const key = s?.id || s?.username;
                    if (!key) return false;
                    return !existing.has(key);
                  });

                  return filteredSuggestions.map((suggestion, index) => (
                    <button
                      key={`suggestion-${
                        suggestion.id || suggestion.username || index
                      }`}
                      onClick={() => onSelect(suggestion)}
                      className="w-full text-left flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-colors"
                    >
                      {suggestion?.avatarUrl ? (
                        <img
                          src={`http://localhost:5000${suggestion.avatarUrl}`}
                          alt={suggestion.displayName || suggestion.username}
                          className="w-10 h-10 rounded-full object-cover shadow-avatar"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-r from-green-400 to-blue-400 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-avatar">
                          {(
                            suggestion.displayName?.[0] ||
                            suggestion.username?.[0]
                          )?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900">
                          {suggestion.displayName || suggestion.username}
                        </div>
                        <div className="text-xs text-gray-500">
                          @{suggestion.username}
                        </div>
                      </div>
                      <div className="w-2 h-2 bg-green-400 rounded-full" />
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
