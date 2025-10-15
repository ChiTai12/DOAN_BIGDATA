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

export default adminApi;
