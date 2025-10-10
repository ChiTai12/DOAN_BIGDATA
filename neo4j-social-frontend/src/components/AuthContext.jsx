import React, { createContext, useContext, useState, useEffect } from "react";
import api from "../services/api";

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

  // Restore user data from token when app loads
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    // if we have a cached user in localStorage, set it immediately so UI stays logged in
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        setUser(JSON.parse(rawUser));
      }
    } catch (e) {
      // ignore parse errors
    }

    if (storedToken) {
      // keep the token value in state
      setToken(storedToken);
      // Try to refresh/verify user on background; if it fails, we won't clear token here
      (async () => {
        try {
          console.log("AuthContext: attempting to restore user from /users/me");
          const res = await api.get("/users/me");
          const userPayload = res.data?.user ?? res.data;
          console.log("AuthContext: /users/me response", res.data);
          if (userPayload) {
            setUser(userPayload);
            try {
              localStorage.setItem("user", JSON.stringify(userPayload));
            } catch (e) {}
          }
        } catch (err) {
          // don't clear token on failure here — keep token/user cache so user doesn't get logged out on F5
          console.warn(
            "Auth restore failed (will keep cached token/user)",
            err
          );
        }
      })();
    }
    setIsLoading(false);
  }, []);

  const login = (userData, authToken) => {
    console.log("AuthContext.login: saving user and token", {
      userData,
      authToken,
    });
    setUser(userData);
    setToken(authToken);
    try {
      if (authToken) {
        localStorage.setItem("token", authToken);
        console.log("AuthContext.login: token written to localStorage");
      }
      if (userData) {
        localStorage.setItem("user", JSON.stringify(userData));
        console.log("AuthContext.login: user written to localStorage");
      }
    } catch (e) {
      console.warn(
        "AuthContext.login: failed to write auth data to localStorage",
        e
      );
    }
  };

  // Function để update user mà KHÔNG lưu localStorage
  const updateUserOnly = (userData) => {
    console.log(
      "🔄 AuthContext: Updating user data (no localStorage):",
      userData
    );
    console.log("🔄 AuthContext: Previous user data:", user);

    // Tạo object mới để đảm bảo React detect thay đổi
    const newUserData = { ...userData };
    setUser(newUserData);

    // Force re-render tất cả components
    setUpdateTrigger((prev) => prev + 1);

    console.log("🔄 AuthContext: User updated successfully (no localStorage)");
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
        updateUserOnly,
        isLoading,
        setUser: updateUserOnly,
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
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
