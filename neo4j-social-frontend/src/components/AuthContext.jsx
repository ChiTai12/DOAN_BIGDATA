import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import api from "../services/api";
import ioClient from "socket.io-client";
import { SOCKET_URL } from "../config";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [isLoading, setIsLoading] = useState(true);
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const socketRef = useRef(null);

  // Khôi phục dữ liệu user từ token khi app khởi động
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    // if we have a cached user in localStorage, set it immediately so UI stays logged in
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) setUser(JSON.parse(rawUser));
    } catch (e) {
      // ignore parse errors
    }

    if (storedToken) {
      setToken(storedToken);
      (async () => {
        try {
          console.log("AuthContext: đang khôi phục user từ /users/me");
          const res = await api.get("/users/me");
          const userPayload = res.data?.user ?? res.data;
          console.log("AuthContext: phản hồi /users/me", res.data);
          if (userPayload) {
            setUser(userPayload);
            try {
              localStorage.setItem("user", JSON.stringify(userPayload));
            } catch (e) {}
            // redirect admin to admin page when restoring session
            try {
              const isAdminRestored =
                userPayload?.role === "admin" ||
                String(userPayload?.username) === "admin";
              if (
                isAdminRestored &&
                typeof window !== "undefined" &&
                window.location.pathname !== "/admin"
              ) {
                window.location.pathname = "/admin";
              }
            } catch (e) {}
          }
        } catch (err) {
          console.warn("Khôi phục Auth thất bại (giữ cache token/user)", err);
        }
      })();
    }
    setIsLoading(false);
  }, []);

  // Mở socket để lắng nghe cập nhật user từ server (giữ header đồng bộ)
  useEffect(() => {
    if (!token) return;
    try {
      const socket = ioClient(SOCKET_URL, { auth: { token } });
      socketRef.current = socket;
      socket.on("connect", () =>
        console.log("AuthContext: socket đã kết nối", socket.id)
      );
      socket.on("user:updated", (payload) => {
        try {
          const updated = payload?.user || payload;
          if (updated) updateUserAndPersist(updated);
        } catch (e) {
          console.warn(
            "AuthContext: không áp dụng được payload user:updated",
            e
          );
        }
      });
      socket.on("disconnect", () =>
        console.log("AuthContext: socket ngắt kết nối")
      );
    } catch (e) {
      console.warn("AuthContext: khởi tạo socket thất bại", e);
    }
    return () => {
      try {
        if (socketRef.current) socketRef.current.disconnect();
      } catch (e) {}
      socketRef.current = null;
    };
  }, [token]);

  const login = (userData, authToken) => {
    console.log("AuthContext.login: lưu user và token", {
      userData,
      authToken,
    });
    setUser(userData);
    setToken(authToken);
    try {
      if (authToken) {
        localStorage.setItem("token", authToken);
        console.log("AuthContext.login: token đã lưu vào localStorage");
      } else {
        // If no token provided, ensure we don't keep a stale token from a
        // previous session which could cause the app to call APIs as the
        // wrong user (observed as switching back to another account).
        try {
          localStorage.removeItem("token");
          console.log(
            "AuthContext.login: không có token trả về, đã xóa token lưu trước đó"
          );
        } catch (e) {}
      }
      if (userData) {
        localStorage.setItem("user", JSON.stringify(userData));
        console.log("AuthContext.login: user đã lưu vào localStorage");
      }
    } catch (e) {
      console.warn(
        "AuthContext.login: không ghi được auth data vào localStorage",
        e
      );
    }

    // If this account is an admin, navigate to the standalone admin page
    try {
      const isAdmin =
        userData?.role === "admin" || String(userData?.username) === "admin";
      if (
        isAdmin &&
        typeof window !== "undefined" &&
        window.location.pathname !== "/admin"
      ) {
        window.location.pathname = "/admin";
      }
    } catch (e) {
      // bỏ qua lỗi điều hướng
    }
  };

  // Hàm cập nhật user KHÔNG lưu vào localStorage
  const updateUserOnly = (userData) => {
    console.log(
      "🔄 AuthContext: Cập nhật dữ liệu user (không lưu localStorage):",
      userData
    );
    console.log("🔄 AuthContext: Dữ liệu user trước đó:", user);

    // Tạo object mới để đảm bảo React detect thay đổi
    const newUserData = { ...userData };
    setUser(newUserData);

    // Force re-render tất cả components
    setUpdateTrigger((prev) => prev + 1);

    console.log(
      "🔄 AuthContext: Cập nhật user thành công (không lưu localStorage)"
    );
  };

  // Persisting update: keep localStorage in sync when updating user via this helper
  const updateUserAndPersist = (userData) => {
    updateUserOnly(userData);
    try {
      localStorage.setItem("user", JSON.stringify(userData));
      console.log("AuthContext: đã lưu user cập nhật vào localStorage");
    } catch (e) {
      console.warn("AuthContext: không lưu được user cập nhật", e);
    }
  };

  // Không cần updateUser với localStorage nữa

  const logout = () => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } catch (e) {}
    // localStorage.removeItem("user"); // Không cần nữa
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        updateUserOnly: updateUserAndPersist,
        isLoading,
        setUser: updateUserAndPersist,
        updateTrigger,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth phải được sử dụng bên trong AuthProvider");
  }
  return context;
};
