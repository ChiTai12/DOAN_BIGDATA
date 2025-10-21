import axios from "axios";
import { API_BASE_URL } from "../config.js";

const adminApi = axios.create({
  baseURL: API_BASE_URL,
});

// Add token to requests if available
adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Admin APIs (dùng endpoint riêng cho admin)
export const updateAdminProfile = (profileData) =>
  adminApi.put("/admin/update", profileData);
export const changeAdminPassword = (passwordData) =>
  adminApi.put("/admin/change-password", passwordData);
export const uploadAdminAvatar = (formData) =>
  adminApi.post("/admin/upload-avatar", formData);

// Admin post management
export const fetchAdminPosts = async (params) => {
  try {
    return await adminApi.get("/admin/posts", { params });
  } catch (err) {
    // If unauthorized/forbidden, fall back to public dev endpoint so UI can load posts from DB
    const status = err && err.response && err.response.status;
    if (status === 401 || status === 403) {
      try {
        return await axios.get(`${API_BASE_URL}/admin/posts/public`, {
          params,
        });
      } catch (err2) {
        throw err2;
      }
    }
    throw err;
  }
};
// Admin deletion disabled: keep function but make it throw so callers fail fast.
export const deleteAdminPost = (postId) => {
  return Promise.reject(
    new Error(
      "Admin deletion of posts is disabled. Authors can remove their own posts via the author endpoint."
    )
  );
};
export const hideAdminPost = (postId) =>
  adminApi.post(`/admin/posts/${postId}/hide`);

export default adminApi;
