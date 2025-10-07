import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "./AuthContext";
import LoginModal from "./LoginModal";
import UpdateProfileModal from "./UpdateProfileModal";
import ChangePasswordModal from "./ChangePasswordModal";
import ChatPage from "../pages/ChatPage";
import { FaHome, FaCommentAlt, FaBell, FaChevronDown } from "react-icons/fa";
import { FiPlus, FiMessageCircle } from "react-icons/fi";
import { AiOutlineHome, AiOutlinePlusSquare } from "react-icons/ai";
import ioClient from "socket.io-client";
import { SOCKET_URL } from "../config.js";

function Header() {
  const { user, logout } = useAuth();
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
      socket.on("connect", () => console.log("Header socket connected", socket.id));
      socket.on("notification:new", (payload) => {
        console.log("Header received notification:new", payload);
        // Remove any existing notifications from the same user for the same post (dedupe)
        // Be permissive: older notifications may not have fromUserId stored, so treat them as matches too.
        setNotifications((prev) => {
          const matches = (n) => n.postId === payload.postId && (payload.fromUserId ? (n.fromUserId === payload.fromUserId || !n.fromUserId) : true);
          const removed = prev.filter(matches);
          const remaining = prev.filter(n => !matches(n));
          // Count how many removed were unread so we can avoid double-counting the badge
          const removedUnread = removed.filter(n => !n.read).length;
          // Update badge: add 1 for the incoming notification, subtract removed unread ones
          setNotifCount((c) => Math.max(0, c - removedUnread + 1));

          // Prepend the fresh notification
          return [{
            id: Date.now(),
            type: payload.type,
            message: payload.message,
            from: payload.from,
            fromUserId: payload.fromUserId,
            postId: payload.postId,
            timestamp: payload.timestamp || Date.now(),
            read: false
          }, ...remaining];
        });
        // Broadcast a global event so other components (Feed/PostCard) can update immediately
        try {
          window.dispatchEvent(new CustomEvent('app:notification:new', { detail: payload }));
        } catch (e) {
          console.warn('Failed to dispatch app:notification:new', e);
        }
      });
      // Handle removal of a previously emitted notification (e.g. unlike)
      socket.on('notification:remove', (payload) => {
        console.log('Header received notification:remove', payload);
        setNotifications((prev) => {
          if (!prev || prev.length === 0) return prev;
          // If backend provided notifIds, remove exactly those
          if (payload?.notifIds && Array.isArray(payload.notifIds) && payload.notifIds.length > 0) {
            const toRemove = prev.filter(n => payload.notifIds.includes(n.id));
            setNotifCount((c) => Math.max(0, c - toRemove.filter(n => !n.read).length));
            return prev.filter(n => !payload.notifIds.includes(n.id));
          }
          // Fallback to matching by postId/fromUserId (permissive)
          const matches = (n) => n.postId === payload.postId && (payload.fromUserId ? (n.fromUserId === payload.fromUserId || !n.fromUserId) : true);
          const toRemove = prev.filter(matches);
          if (toRemove.length === 0) return prev;
          setNotifCount((c) => Math.max(0, c - toRemove.filter(n => !n.read).length));
          return prev.filter(n => !matches(n));
        });
        // Also notify other components so they can update likesCount/live UI
        try {
          window.dispatchEvent(new CustomEvent('app:notification:remove', { detail: payload }));
        } catch (e) {
          console.warn('Failed to dispatch app:notification:remove', e);
        }
      });

      // Listen for post likes updates for real-time feed updates
      socket.on('post:likes:update', (payload) => {
        console.log('Header received post:likes:update', payload);
        try {
          window.dispatchEvent(new CustomEvent('app:post:likes:update', { detail: payload }));
        } catch (e) {
          console.warn('Failed to dispatch app:post:likes:update', e);
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

  // Fetch persisted notifications when user logs in
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${SOCKET_URL.replace(/:\/\/.+$/, 'http://localhost:5000')}/notifications`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data)) {
          // map to our notification shape
          setNotifications(data.map(n => ({
            id: n.id || Date.now(),
            type: n.type,
            message: n.message,
            from: n.from || 'Someone',
            fromUserId: n.fromUserId,
            postId: n.postId,
            timestamp: n.createdAt || Date.now(),
            read: false
          })));
          // badge count = number of unread (we treat all as unread initially)
          setNotifCount(data.length);
        }
      } catch (err) {
        console.warn('Failed to fetch persisted notifications', err);
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

  

  const handleNotificationClick = () => {
    setShowNotifications(!showNotifications);
    if (!showNotifications) {
      // Mark all as read and reset count
      setNotifCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
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
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotifications]);

  const avatarContent = () => {
    if (user?.avatarUrl)
      return (
        <img
          src={`http://localhost:5000${user.avatarUrl}`}
          alt="avatar"
          className="w-8 h-8 rounded-full object-cover"
        />
      );
    return (
      <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center text-white font-bold text-sm">
        {(user?.displayName?.[0] || user?.username?.[0])?.toUpperCase() || "U"}
      </div>
    );
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-gray-300 z-50">
        <div className="flex max-w-7xl w-full gap-10 mx-auto px-4 items-center justify-between h-16">
          {/* Logo */}
          <div className="text-2xl font-bold text-gray-900">pictogram</div>

          {/* Search bar */}
          <div className="flex-1 max-w-xs mx-8">
            <input
              type="text"
              placeholder="looking for someone.."
              className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <button
                  aria-label="Home"
                  className="p-2 rounded text-gray-600 hover:text-black hover:bg-gray-100"
                >
                  <AiOutlineHome className="w-6 h-6" />
                </button>

                <button
                  aria-label="Create"
                  className="p-2 rounded text-gray-600 hover:text-black hover:bg-gray-100"
                >
                  <FiPlus className="w-6 h-6" />
                </button>

                <button
                  onClick={() => setShowChat(true)}
                  aria-label="Messages"
                  className="p-2 rounded text-gray-600 hover:text-black hover:bg-gray-100"
                >
                  <FiMessageCircle className="w-6 h-6" />
                </button>

                <div className="relative" ref={notifRef}>
                  <button
                    aria-label="Notifications"
                    className="p-2 rounded text-gray-600 hover:text-black hover:bg-gray-100"
                    onClick={handleNotificationClick}
                  >
                    <div className="relative">
                      <FaBell className="w-6 h-6" />
                      {notifCount > 0 && (
                        <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">
                          {notifCount}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Notifications Dropdown */}
                  {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50 max-h-96 overflow-y-auto">
                      <div className="px-4 py-2 border-b border-gray-100">
                        <h3 className="font-semibold text-gray-900">Thông báo</h3>
                      </div>
                      
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-gray-500 text-sm">
                          Chưa có thông báo nào
                        </div>
                      ) : (
                        <div className="max-h-80 overflow-y-auto">
                          {notifications.map((notif) => (
                            <div
                              key={notif.id}
                              className={`px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-b-0 ${
                                !notif.read ? 'bg-blue-50' : ''
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 bg-gradient-to-r from-pink-400 to-red-400 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                  ❤️
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-900">
                                    <span className="font-semibold">{notif.from}</span> đã thích bài viết của bạn
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {new Date(notif.timestamp).toLocaleString('vi-VN')}
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
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100"
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                  >
                    {avatarContent()}
                    <FaChevronDown className="text-gray-600 w-3 h-3" />
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded shadow-lg py-1 z-50">
                      <button
                        onClick={handleUpdateProfile}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                      >
                        Cập nhật tài khoản
                      </button>
                      <button
                        onClick={handleChangePassword}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                      >
                        Đổi mật khẩu
                      </button>
                      <div className="border-t my-1" />
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50"
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
                className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                Login
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
