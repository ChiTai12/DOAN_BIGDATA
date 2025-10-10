import axios from "axios";
import { API_BASE_URL } from "../config.js";

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // remove token so subsequent requests don't include it
      localStorage.removeItem("token");
      // Avoid forcing an unconditional reload which can cause a reload loop
      // if localStorage was cleared manually. Use a session-scoped flag so we
      // only reload once per session when receiving an auth error.
      try {
        const reloaded = sessionStorage.getItem("auth_reloaded");
        if (!reloaded) {
          sessionStorage.setItem("auth_reloaded", "1");
          // small timeout to allow any pending UI updates to flush
          setTimeout(() => window.location.reload(), 50);
        } else {
          // already attempted reload this session — do nothing to avoid loop
          console.warn(
            "401 received but reload already attempted this session"
          );
        }
      } catch (e) {
        // If sessionStorage isn't available, fall back to a single reload attempt
        try {
          window.location.reload();
        } catch (err) {
          console.error("Failed to reload after 401", err);
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth APIs
export const login = (credentials) => api.post("/auth/login", credentials);
export const register = (userData) => api.post("/auth/register", userData);

// User APIs
export const getAllUsers = () => api.get("/users");
export const getUserSuggestions = () => api.get("/users/suggestions");
export const getCurrentUser = () => api.get("/users/me"); // API để lấy user hiện tại
export const updateProfile = (profileData) =>
  api.put("/users/update", profileData);
export const changePassword = (passwordData) =>
  api.put("/users/change-password", passwordData);
export const uploadAvatar = (formData) =>
  api.post("/users/upload-avatar", formData);

// Posts APIs
export const createPost = (postData) => api.post("/posts", postData);
export const getAllPosts = () => api.get("/posts");

// Social APIs
// Social APIs
// (share feature removed)

// Messages APIs
export const getConversations = () => api.get("/messages/conversations");
export const getMessages = (conversationId) =>
  api.get(`/messages/${conversationId}`);
export const sendMessage = (messageData) => api.post("/messages", messageData);
