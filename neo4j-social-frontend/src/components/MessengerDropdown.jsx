import React, { useState, useEffect, useRef } from "react";
import { FiMessageCircle, FiSearch, FiX } from "react-icons/fi";
import { useAuth } from "./AuthContext";
import { getAllUsers } from "../services/api";

function MessengerDropdown({ isOpen, onClose, onStartChat }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef();

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  // Update users list when someone updates their profile elsewhere
  useEffect(() => {
    function onUserUpdated(e) {
      const payload = e.detail || e;
      if (!payload || !payload.user) return;
      const updated = payload.user;
      setUsers((prev) =>
        prev.map((u) => {
          try {
            if (!u) return u;
            if (u.id && updated.id && String(u.id) === String(updated.id))
              return { ...u, ...updated };
            if (
              u.username &&
              updated.username &&
              String(u.username) === String(updated.username)
            )
              return { ...u, ...updated };
          } catch (err) {}
          return u;
        })
      );
    }

    window.addEventListener("app:user:updated", onUserUpdated);
    return () => window.removeEventListener("app:user:updated", onUserUpdated);
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await getAllUsers();
      // Lọc bỏ user hiện tại
      const otherUsers = response.data.filter(
        (u) => u.username !== user?.username
      );
      setUsers(otherUsers);
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.fullName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getUserAvatar = (userData) => {
    if (userData.avatar) {
      return (
        <img
          src={userData.avatar}
          alt={userData.username}
          className="w-10 h-10 rounded-full object-cover shadow-avatar"
        />
      );
    }
    return (
      <div className="w-10 h-10 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-avatar">
        {userData.username?.[0]?.toUpperCase() || "U"}
      </div>
    );
  };

  const handleStartChat = (selectedUser) => {
    onStartChat(selectedUser);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Tin nhắn</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <FiX className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm kiếm người dùng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Users list */}
      <div className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">
            <div className="inline-flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
              Đang tải...
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {searchTerm
              ? "Không tìm thấy người dùng"
              : "Chưa có người dùng nào"}
          </div>
        ) : (
          <div className="py-2">
            {filteredUsers.map((userData) => (
              <button
                key={userData.username}
                onClick={() => handleStartChat(userData)}
                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
              >
                {getUserAvatar(userData)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {userData.fullName || userData.username}
                  </div>
                  <div className="text-sm text-gray-500 truncate">
                    @{userData.username}
                  </div>
                </div>
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-100 bg-gray-50">
        <button
          onClick={() => {
            // Có thể thêm link đến chat page đầy đủ
            onClose();
          }}
          className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          Xem tất cả tin nhắn
        </button>
      </div>
    </div>
  );
}

export default MessengerDropdown;
