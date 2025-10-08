import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "./AuthContext";
import LoginModal from "./LoginModal";
import UpdateProfileModal from "./UpdateProfileModal";
import ChangePasswordModal from "./ChangePasswordModal";
import ChatPage from "../pages/ChatPage";
import {
  FaHome,
  FaCommentAlt,
  FaBell,
  FaChevronDown,
  FaSearch,
} from "react-icons/fa";
import { FiPlus, FiMessageCircle } from "react-icons/fi";
import { AiOutlineHome, AiOutlinePlusSquare } from "react-icons/ai";
import ioClient from "socket.io-client";
import ConnectionsModal from "./ConnectionsModal";
import { SOCKET_URL } from "../config.js";

function Header() {
  const { user, logout, updateUserOnly } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showUpdateProfile, setShowUpdateProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef();
  const [notifCount, setNotifCount] = useState(0);
  const socketRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);
  const [showConnections, setShowConnections] = useState(false);
  const [isHomeActive, setIsHomeActive] = useState(true);

  useEffect(() => {
    function handleOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener("click", handleOutside);
    return () => window.removeEventListener("click", handleOutside);
  }, []);

  useEffect(() => {
    // Setup socket for notifications when user logs in
    if (!user) return;
    const token = localStorage.getItem("token");
    try {
      const socket = ioClient(SOCKET_URL, { auth: { token } });
      socketRef.current = socket;
      socket.on("connect", () =>
        console.log("Header socket connected", socket.id)
      );
      socket.on("notification:new", (payload) => {
        console.log("Header received notification:new", payload);
        const fromName =
          payload.fromName || payload.from || payload.fromUserId || "Someone";
        const notifId =
          payload.notifId ||
          `${payload.fromUserId}-${payload.postId}-${Date.now()}`;
        setNotifications((prev) => {
          // dedupe by notifId first, then by (fromUserId+postId)
          const existsById = prev.some((n) => n.id === notifId);
          const existsByPair = prev.some(
            (n) =>
              n.fromUserId === payload.fromUserId && n.postId === payload.postId
          );
          if (existsById || existsByPair) {
            // update timestamp/message of existing notification but don't create duplicate
            return prev.map((n) =>
              n.id === notifId ||
              (n.fromUserId === payload.fromUserId &&
                n.postId === payload.postId)
                ? {
                    ...n,
                    message: payload.message,
                    timestamp: payload.timestamp || Date.now(),
                    read: false,
                  }
                : n
            );
          }
          setNotifCount((c) => c + 1);
          return [
            {
              id: notifId,
              type: payload.type,
              message: payload.message,
              from: fromName,
              fromUserId: payload.fromUserId,
              postId: payload.postId,
              timestamp: payload.timestamp || Date.now(),
              read: false,
            },
            ...prev,
          ];
        });
      });
      // forward post likes updates to window so PostCard / Feed can listen
      socket.on("post:likes:update", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:post:likes:update", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward post:likes:update", e);
        }
      });

      // forward follow/unfollow events so other UI can react in real-time
      socket.on("user:follow", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:user:follow", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward user:follow", e);
        }
        try {
          // if this client is the target (someone followed this user), trigger an update
          if (
            payload &&
            payload.followingId &&
            payload.followingId === user?.id
          ) {
            updateUserOnly(user || {});
          }
        } catch (e) {
          // ignore
        }
      });
      socket.on("connections:update", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:connections:update", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward connections:update", e);
        }
      });
      socket.on("user:unfollow", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:user:unfollow", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward user:unfollow", e);
        }
        try {
          // if this client is the target (someone unfollowed this user), trigger an update
          if (
            payload &&
            payload.followingId &&
            payload.followingId === user?.id
          ) {
            updateUserOnly(user || {});
          }
        } catch (e) {
          // ignore
        }
      });
      // forward ack events (sent back to the actor) so the user who performed the action
      // also receives the same window event and UI can update immediately
      socket.on("user:follow:ack", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:user:follow", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward user:follow:ack", e);
        }
        try {
          if (
            payload &&
            payload.followingId &&
            payload.followingId === user?.id
          ) {
            updateUserOnly(user || {});
          }
        } catch (e) {}
      });
      socket.on("user:unfollow:ack", (payload) => {
        try {
          window.dispatchEvent(
            new CustomEvent("app:user:unfollow", { detail: payload })
          );
        } catch (e) {
          console.warn("Failed to forward user:unfollow:ack", e);
        }
        try {
          if (
            payload &&
            payload.followingId &&
            payload.followingId === user?.id
          ) {
            updateUserOnly(user || {});
          }
        } catch (e) {}
      });

      // handle notification removals when someone unlikes
      socket.on("notification:remove", (payload) => {
        try {
          console.log("Header received notification:remove", payload);
          setNotifications((prev) => {
            if (!payload) return prev;
            let newList = prev;
            if (
              Array.isArray(payload.notifIds) &&
              payload.notifIds.length > 0
            ) {
              const idsToRemove = new Set(payload.notifIds);
              newList = prev.filter((n) => !idsToRemove.has(n.id));
            } else if (payload.fromUserId && payload.postId) {
              newList = prev.filter(
                (n) =>
                  !(
                    n.fromUserId === payload.fromUserId &&
                    n.postId === payload.postId
                  )
              );
            }
            // update badge count accordingly
            const removed = prev.length - newList.length;
            if (removed > 0) setNotifCount((c) => Math.max(0, c - removed));
            return newList;
          });
        } catch (e) {
          console.warn("Failed to process notification:remove", e);
        }
      });
    } catch (err) {
      console.error("Header socket init failed", err);
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  // Hydrate persisted notifications from server when user logs in
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("http://localhost:5000/notifications", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) {
          setNotifications(
            data.map((n) => ({
              id: n.id,
              type: n.type,
              message: n.message,
              from: n.fromName || n.from || "Someone",
              fromUserId: n.fromUserId,
              postId: n.postId,
              timestamp: n.createdAt || Date.now(),
              read: false,
            }))
          );
          setNotifCount(data.length);
        }
      } catch (err) {
        console.warn("Failed to load persisted notifications", err);
      }
    })();
  }, [user]);

  const handleUpdateProfile = () => {
    setMenuOpen(false);
    setShowUpdateProfile(true);
  };

  const handleChangePassword = () => {
    setMenuOpen(false);
    setShowChangePassword(true);
  };

  // ...existing code...

  const handleNotificationClick = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications) {
      // Mark all as read and reset count
      setNotifCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showNotifications]);

  // track whether the feed (home) section is visible so the Home icon can show active state
  useEffect(() => {
    // For now, always keep Home active since user is on home page
    // In future, this could change based on different pages/routes
    setIsHomeActive(true);
  }, []);

  // When a user logs in, the feed is the default/home view — mark Home active
  useEffect(() => {
    if (user) setIsHomeActive(true);
  }, [user]);

  const avatarContent = () => {
    if (user?.avatarUrl)
      return (
        <img
          src={`http://localhost:5000${user.avatarUrl}`}
          alt="avatar"
          className="w-8 h-8 rounded-full object-cover shadow-avatar"
        />
      );
    return (
      <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-avatar">
        {(user?.displayName?.[0] || user?.username?.[0])?.toUpperCase() || "U"}
      </div>
    );
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 shadow-sm z-50">
        <div className="flex max-w-7xl w-full gap-10 mx-auto px-6 items-center justify-between h-16">
          {/* Logo */}
          <div className="text-2xl font-bold uppercase bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent font-['Inter',sans-serif] tracking-wide">
            MẠNG XÃ HỘI MINI
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-md mx-8 relative">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Tìm kiếm người dùng, bài viết..."
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 font-['Inter',sans-serif]"
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <button
                  aria-label="Trang chủ"
                  className={`p-3 rounded-xl transition-all duration-200 ${
                    isHomeActive
                      ? "bg-blue-100 text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-blue-600 hover:bg-gray-100"
                  }`}
                  onClick={() => {
                    try {
                      // notify app that Home was requested (refresh feed if needed)
                      window.dispatchEvent(
                        new CustomEvent("app:navigate:home")
                      );
                    } catch (e) {
                      console.warn("Failed to navigate home", e);
                    }
                  }}
                >
                  {isHomeActive ? (
                    <FaHome className="w-5 h-5" />
                  ) : (
                    <AiOutlineHome className="w-5 h-5" />
                  )}
                </button>

                <button
                  aria-label="Kết nối"
                  className="p-3 rounded-xl text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-all duration-200"
                  onClick={() => setShowConnections(true)}
                >
                  <FiPlus className="w-5 h-5" />
                </button>

                <button
                  onClick={() => setShowChat(true)}
                  aria-label="Tin nhắn"
                  className="p-3 rounded-xl text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-all duration-200"
                >
                  <FiMessageCircle className="w-5 h-5" />
                </button>

                <div className="relative" ref={notifRef}>
                  <button
                    aria-label="Thông báo"
                    className="p-3 rounded-xl text-gray-600 hover:text-blue-600 hover:bg-gray-100 transition-all duration-200 relative"
                    onClick={handleNotificationClick}
                  >
                    <div className="relative">
                      <FaBell className="w-5 h-5" />
                      {notifCount > 0 && (
                        <div className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center font-medium">
                          {notifCount}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Notifications Dropdown */}
                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50 max-h-96 overflow-y-auto">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <h3 className="font-semibold text-gray-900 font-['Inter',sans-serif]">
                          Thông báo
                        </h3>
                      </div>

                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-gray-500 text-sm font-['Inter',sans-serif]">
                          Chưa có thông báo nào
                        </div>
                      ) : (
                        <div className="max-h-80 overflow-y-auto">
                          {notifications.map((notif) => (
                            <div
                              key={notif.id}
                              className={`px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-b-0 transition-colors ${
                                !notif.read ? "bg-blue-50" : ""
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 bg-gradient-to-r from-pink-400 to-red-400 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
                                  ❤️
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-900 font-['Inter',sans-serif]">
                                    <span className="font-semibold">
                                      {notif.from}
                                    </span>{" "}
                                    đã thích bài viết của bạn
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1 font-['Inter',sans-serif]">
                                    {new Date(notif.timestamp).toLocaleString(
                                      "vi-VN"
                                    )}
                                  </p>
                                </div>
                                {!notif.read && (
                                  <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* end notifications list */}
                    </div>
                  )}
                </div>

                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen((s) => !s)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-all duration-200"
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                  >
                    {avatarContent()}
                    <FaChevronDown className="text-gray-500 w-3 h-3" />
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-50">
                      <button
                        onClick={handleUpdateProfile}
                        className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 font-['Inter',sans-serif] transition-colors"
                      >
                        Cập nhật tài khoản
                      </button>
                      <button
                        onClick={handleChangePassword}
                        className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 font-['Inter',sans-serif] transition-colors"
                      >
                        Đổi mật khẩu
                      </button>
                      <div className="border-t my-1 mx-2" />
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                        }}
                        className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 font-['Inter',sans-serif] transition-colors"
                      >
                        Đăng xuất
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-sm font-['Inter',sans-serif]"
              >
                Đăng nhập
              </button>
            )}
          </div>
        </div>
      </header>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      {showUpdateProfile && (
        <UpdateProfileModal onClose={() => setShowUpdateProfile(false)} />
      )}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
      {showConnections && (
        <ConnectionsModal
          isOpen={showConnections}
          onClose={() => setShowConnections(false)}
        />
      )}

      {/* Chat Modal - OpenChat */}
      {showChat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-5xl h-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">Messages</h2>
              <button
                onClick={() => setShowChat(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatPage />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Header;
