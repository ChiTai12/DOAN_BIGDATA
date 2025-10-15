import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import api from "../services/api";
import miniSocial from "../../../mini-social.png";

function LoginModal({ onClose }) {
  const { login } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    email: "",
    displayName: "",
    fullName: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const response = await api.post("/auth/login", {
          username: formData.username,
          password: formData.password,
        });
        // Some backends return token in different shapes. Try common locations.
        const data = response.data || {};
        const tokenCandidate =
          data.token ||
          data.accessToken ||
          data?.data?.token ||
          data?.token?.token;
        const userCandidate = data.user ?? data;
        if (!tokenCandidate) {
          console.warn("Login response did not include a token:", data);
          // Clear any previously stored token to avoid accidentally using a
          // stale token that belongs to another user (causes account switch).
          try {
            localStorage.removeItem("token");
          } catch (e) {}
          alert(
            "Login succeeded but server did not return a token. Please try again or contact support."
          );
        }
        // If we have a token, do a sanity check: decode payload and ensure it
        // refers to the same user object returned by the server. This prevents
        // a stale/wrong token from a previous session being stored and causing
        // the UI to switch to another account.
        if (tokenCandidate && userCandidate) {
          try {
            const parts = tokenCandidate.split(".");
            if (parts.length >= 2) {
              const payloadJson = JSON.parse(atob(parts[1]));
              const tokenUserId =
                payloadJson.userId || payloadJson.id || payloadJson.sub;
              const returnedUserId =
                userCandidate.id || userCandidate.userId || null;
              if (
                tokenUserId &&
                returnedUserId &&
                String(tokenUserId) !== String(returnedUserId)
              ) {
                console.error(
                  "Token payload userId does not match returned user id",
                  { tokenUserId, returnedUserId }
                );
                // Clear any stored token and abort to avoid switching to another account
                try {
                  localStorage.removeItem("token");
                } catch (e) {}
                alert(
                  "Login failed: token does not match user information. Please contact support."
                );
                setLoading(false);
                return;
              }
            }
          } catch (e) {
            console.warn("Failed to decode token for sanity check", e);
          }
        }

        // Pass whatever we found to the AuthContext.login helper which will
        // persist the token to localStorage. This ensures the app remains
        // authenticated across F5 if a token exists.
        login(userCandidate, tokenCandidate);
        onClose();
      } else {
        await api.post("/auth/register", formData);
        alert("Account created! Please login.");
        setIsLogin(true);
      }
    } catch (error) {
      console.error("Auth error:", error);
      alert(error.response?.data?.error || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl overflow-hidden grid grid-cols-1 md:grid-cols-11 min-h-[600px]">
        {/* Left decorative panel */}
        <div className="hidden md:flex flex-col items-center justify-center modal-bg-pink p-8 md:col-span-5">
          {/* Left decorative panel: show Vietnamese heading and footer around the image */}
          <h3 className="text-white text-lg md:text-xl font-bold mb-3 uppercase text-center leading-snug md:leading-normal tracking-wide md:tracking-[0.06em]">
            <span className="block mb-1">CHÀO MỪNG ĐẾN VỚI MẠNG</span>
            <span className="block">XÃ HỘI NEO4JI BIG DATA</span>
          </h3>
          <img
            src={miniSocial}
            alt="decor"
            className="w-56 h-56 md:w-80 md:h-80 object-contain"
          />
          <p className="text-white text-sm mt-4">
            Kết nối, chia sẻ và khám phá cùng mọi người
          </p>
        </div>

        {/* Right form panel */}
        <div className="p-6 md:p-10 md:col-span-6 flex flex-col justify-center relative">
          <div className="relative mb-4">
            <div className="max-w-md mx-auto w-full">
              <h2 className="text-xl font-bold text-gray-900">
                {isLogin ? "Đăng nhập" : "Tạo tài khoản"}
              </h2>
              <div className="text-sm text-gray-500">
                {isLogin
                  ? "Chào mừng trở lại — vui lòng nhập thông tin để đăng nhập"
                  : "Tạo tài khoản để tiếp tục"}
              </div>
            </div>
            <button
              onClick={onClose}
              className="absolute right-0 top-0 text-gray-400 hover:text-gray-600 text-2xl"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto">
            {!isLogin && (
              <>
                <input
                  type="text"
                  placeholder="Họ và tên"
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                  className="w-full px-4 py-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-base"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full px-4 py-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-base"
                  required
                />
              </>
            )}

            <input
              type="text"
              placeholder="Tên đăng nhập"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              className="w-full px-4 py-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-base"
              required
            />

            <input
              type="password"
              placeholder="Mật khẩu"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className="w-full px-4 py-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 text-base"
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full auth-btn--primary py-4 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-300 transition-colors text-base"
            >
              {loading
                ? "Đang xử lý..."
                : isLogin
                ? "Đăng nhập"
                : "Tạo tài khoản"}
            </button>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-indigo-600 hover:underline text-sm"
              >
                {isLogin
                  ? "Bạn chưa có tài khoản? Tạo tài khoản"
                  : "Đã có tài khoản? Đăng nhập"}
              </button>
            </div>
          </form>

          <div className="mt-8 flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <div className="text-xs text-gray-400">hoặc tiếp tục với</div>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <div className="mt-6 max-w-md mx-auto grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => alert("Google sign-in placeholder")}
              className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-lg py-3 hover:shadow-sm text-sm auth-btn--wide"
            >
              <img
                src="https://www.svgrepo.com/show/355037/google.svg"
                alt="google"
                className="w-6 h-6"
              />
              <span className="text-sm">Google</span>
            </button>
            <button
              type="button"
              onClick={() => alert("Facebook sign-in placeholder")}
              className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-lg py-3 hover:shadow-sm text-sm auth-btn--wide"
            >
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg"
                alt="fb"
                className="w-6 h-6"
              />
              <span className="text-sm">Facebook</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginModal;
