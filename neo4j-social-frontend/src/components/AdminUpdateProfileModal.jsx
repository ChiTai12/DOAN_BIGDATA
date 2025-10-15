import React, { useState } from "react";
import { FaUser, FaImage } from "react-icons/fa";
import { updateAdminProfile, uploadAdminAvatar } from "../services/adminApi";
import { useAuth } from "./AuthContext";

function AdminUpdateProfileModal({ onClose, admin }) {
  const [formData, setFormData] = useState({
    displayName: admin?.displayName || admin?.username || "",
  });
  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // get updater from AuthContext at top-level (hooks must be called unconditionally)
  const { updateUserOnly } = useAuth();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAvatarChange = (e) => {
    setAvatar(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      let avatarUrl;
      if (avatar) {
        const avatarFormData = new FormData();
        avatarFormData.append("avatar", avatar);
        const avatarResponse = await uploadAdminAvatar(avatarFormData);
        avatarUrl =
          avatarResponse.data?.avatarUrl ||
          avatarResponse.data?.user?.avatarUrl;
      }
      const payload = { displayName: formData.displayName };
      if (avatarUrl) payload.avatarUrl = avatarUrl;
      const updateRes = await updateAdminProfile(payload);
      // backend returns the updated user object (or user fields) — update AuthContext so UI reflects changes
      const updatedUser = updateRes.data?.user || updateRes.data;
      if (updatedUser) updateUserOnly(updatedUser);
      setSuccess("Cập nhật thành công!");
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err.response?.data?.error || "Cập nhật thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-lg md:max-w-xl p-8 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Cập nhật tài khoản admin</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full"
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
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            {success}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-lg icon-no-bg flex items-center justify-center text-gray-600">
                <FaUser className="w-5 h-5" />
              </div>
            </div>
            <label
              htmlFor="displayName"
              className="w-20 md:w-24 text-sm font-medium text-gray-700"
            >
              Tên hiển thị
            </label>
            <input
              id="displayName"
              type="text"
              name="displayName"
              value={formData.displayName}
              onChange={handleChange}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              required
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-lg icon-no-bg flex items-center justify-center text-gray-600">
                <FaImage className="w-5 h-5" />
              </div>
            </div>
            <label
              htmlFor="avatar"
              className="w-20 md:w-24 text-sm font-medium text-gray-700"
            >
              Ảnh đại diện
            </label>
            <div className="flex-1">
              <input
                id="avatar"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-4 pt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-black text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors duration-200"
            >
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminUpdateProfileModal;
