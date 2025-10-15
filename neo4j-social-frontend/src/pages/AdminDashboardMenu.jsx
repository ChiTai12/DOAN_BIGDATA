import React, { useState, useRef, useEffect } from "react";
import AdminUpdateProfileModal from "../components/AdminUpdateProfileModal";
import AdminChangePasswordModal from "../components/AdminChangePasswordModal";
import { API_BASE_URL } from "../config.js";

export default function AdminDashboardMenu({ logout, admin }) {
  const [showUpdate, setShowUpdate] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const containerRef = useRef(null);

  // close menu when clicking outside or pressing Escape
  useEffect(() => {
    function onDocClick(e) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setShowMenu(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setShowMenu(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <>
      <div className="relative" ref={containerRef}>
        <button
          onClick={() => setShowMenu((s) => !s)}
          className="flex items-center gap-3 bg-white rounded-full px-2 py-1 shadow-sm"
          aria-haspopup="menu"
        >
          <img
            src={(() => {
              const av = admin?.avatarUrl;
              if (!av) return "/public/default-avatar.png";
              try {
                if (String(av).startsWith("http"))
                  return (
                    av + (av.includes("?") ? "&" : "?") + "cb=" + Date.now()
                  );
                return (
                  API_BASE_URL +
                  av +
                  (av.includes("?") ? "&" : "?") +
                  "cb=" +
                  Date.now()
                );
              } catch (e) {
                return "/public/default-avatar.png";
              }
            })()}
            alt="avatar"
            className="w-8 h-8 rounded-full object-cover"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = "/public/default-avatar.png";
            }}
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
        {showMenu && (
          <div className="absolute left-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-30 translate-x-4 md:translate-x-6">
            <button
              onClick={() => {
                setShowMenu(false);
                setShowUpdate(true);
              }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Cập nhật tài khoản
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                setShowChangePw(true);
              }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              Đổi mật khẩu
            </button>
            <div className="border-t my-1" />
            <button
              onClick={() => {
                try {
                  logout();
                } catch (e) {}
                setShowMenu(false);
                window.location.pathname = "/";
              }}
              className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
            >
              Đăng xuất
            </button>
          </div>
        )}
      </div>
      {showUpdate && (
        <AdminUpdateProfileModal
          admin={admin}
          onClose={() => setShowUpdate(false)}
        />
      )}
      {showChangePw && (
        <AdminChangePasswordModal onClose={() => setShowChangePw(false)} />
      )}
    </>
  );
}
