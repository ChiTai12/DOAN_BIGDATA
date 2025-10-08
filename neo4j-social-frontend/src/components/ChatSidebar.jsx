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
              <div className="text-xs text-gray-600 font-medium mb-2 uppercase tracking-wide">
                Cuộc trò chuyện gần đây
              </div>
              <div className="space-y-1 mb-4">
                {threads
                  .filter(
                    (t) => t.lastMsg && (t.lastMsg.text || t.lastMsg.type)
                  )
                  .map((t, index) => (
                    <button
                      key={`thread-${t.other?.id || index}`}
                      onClick={() => onSelect(t.other)}
                      className="w-full text-left flex items-center gap-3 p-2 hover:bg-gray-50 rounded transition-colors"
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
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Always show suggestions for starting new conversations */}
          <div>
            <div className="text-xs text-gray-600 font-medium mb-2 uppercase tracking-wide">
              {threads.length > 0
                ? "Bắt đầu cuộc trò chuyện mới"
                : "Bắt đầu trò chuyện"}
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
              <div className="space-y-1">
                {(() => {
                  // Threads that exist but have no messages (pending starts)
                  const pending = threads
                    .filter(
                      (t) => !t.lastMsg || !(t.lastMsg.text || t.lastMsg.type)
                    )
                    .map((t) => t.other)
                    .filter(Boolean);

                  // Merge pending and suggestions, dedupe by id/username
                  const combined = [];
                  const seen = new Set();
                  const pushIfNew = (u) => {
                    const key = u?.id || u?.username;
                    if (!key || seen.has(key)) return;
                    seen.add(key);
                    combined.push(u);
                  };

                  pending.forEach(pushIfNew);
                  suggestions.forEach(pushIfNew);

                  return combined.map((suggestion, index) => (
                    <button
                      key={`suggestion-${
                        suggestion.id || suggestion.username || index
                      }`}
                      onClick={() => onSelect(suggestion)}
                      className="w-full text-left flex items-center gap-3 p-2 hover:bg-gray-50 rounded transition-colors"
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
                      <div className="w-2 h-2 bg-green-400 rounded-full"></div>
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
