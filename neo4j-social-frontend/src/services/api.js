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
      localStorage.removeItem("token");
      window.location.reload();
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

// Messages APIs
export const getConversations = () => api.get("/messages/conversations");
export const getMessages = (conversationId) =>
  api.get(`/messages/${conversationId}`);
export const sendMessage = (messageData) => api.post("/messages", messageData);
