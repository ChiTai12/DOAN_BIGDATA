import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [isLoading, setIsLoading] = useState(true);
  const [updateTrigger, setUpdateTrigger] = useState(0);

  // Restore user data from token when app loads
  useEffect(() => {
    const storedToken = localStorage.getItem("token");

    if (storedToken) {
      // CHỈ lưu token, user data sẽ được fetch từ server khi cần
      setToken(storedToken);
      // TODO: Có thể thêm API call để verify token và lấy user data
      // Hiện tại để đơn giản, sẽ lấy user data khi user thực hiện action
    }
    setIsLoading(false);
  }, []);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    // CHỈ lưu token để authentication, KHÔNG lưu user data
    localStorage.setItem("token", authToken);
    // localStorage.setItem("user", JSON.stringify(userData));
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
    localStorage.removeItem("token");
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
