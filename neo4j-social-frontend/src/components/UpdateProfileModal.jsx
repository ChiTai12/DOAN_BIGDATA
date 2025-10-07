import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import { updateProfile, uploadAvatar } from "../services/api";

function UpdateProfileModal({ onClose }) {
  const { user, updateUserOnly } = useAuth();
  const [formData, setFormData] = useState({
    displayName: user?.displayName || user?.username || "",
  });
  const [avatar, setAvatar] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

    try {
      let updated = null;
      let avatarUrl;

      if (avatar) {
        const avatarFormData = new FormData();
        avatarFormData.append("avatar", avatar);
        const avatarResponse = await uploadAvatar(avatarFormData);
        if (avatarResponse.data?.user) updated = avatarResponse.data.user;
        avatarUrl = avatarResponse.data?.avatarUrl;
      }

      const payload = { displayName: formData.displayName };
      if (avatarUrl) payload.avatarUrl = avatarUrl;

      console.log("📤 Sending update payload:", payload);
      const response = await updateProfile(payload);
      console.log("📥 Server response:", response);
      console.log("📥 Response data:", response.data);

      const updatedUserDataFromServer = response.data || updated;
      console.log(
        "🔄 Updated user data from server:",
        updatedUserDataFromServer
      );

      // SỬ DỤNG DỮ LIỆU TỪ SERVER TRỰC TIẾP (vì server trả về dữ liệu mới nhất từ Neo4j)
      const newUserData = {
        ...user, // Keep existing fields like id, token, etc
        ...updatedUserDataFromServer, // Use fresh data from server
        // Đảm bảo các field được cập nhật từ server
        displayName: updatedUserDataFromServer.displayName,
        avatarUrl:
          updatedUserDataFromServer.avatarUrl || avatarUrl || user.avatarUrl,
      };

      console.log("🔄 Current user before update:", user);
      console.log("🔄 Final user data to save:", newUserData);

      // CHỈ update user context, KHÔNG lưu localStorage để tránh cache cũ
      // updateUserOnly sẽ trigger updateTrigger và làm tất cả components re-fetch data
      updateUserOnly(newUserData);

      console.log("✅ User context updated with fresh data from Neo4j!");
      console.log("🔄 All components will re-fetch data due to updateTrigger");

      // Thêm thông báo thành công
      alert(`Cập nhật thành công! Tên mới: ${newUserData.displayName}`);
      onClose();

      // KHÔNG cần reload trang nữa vì updateTrigger sẽ làm tất cả components update
    } catch (err) {
      const serverMsg = err.response?.data?.error;
      let friendly = serverMsg;
      if (serverMsg === "Display name cannot be empty")
        friendly = "Tên hiển thị không được để trống";
      if (serverMsg === "No updatable fields provided")
        friendly = "Không có thông tin nào để cập nhật";
      if (!friendly) friendly = "Cập nhật không thành công";
      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Cập nhật tài khoản</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên hiển thị
            </label>
            <input
              type="text"
              name="displayName"
              value={formData.displayName}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Avatar
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UpdateProfileModal;
