import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import Feed from "./components/Feed";
import Sidebar from "./components/SidebarWrapper";
import AdminDashboard from "./pages/AdminDashboard";
import ErrorBoundary from "./components/ErrorBoundary";
import { useAuth } from "./components/AuthContext";

function App() {
  const { user, isLoading } = useAuth();

  const isAdminUser =
    user && (user.role === "admin" || String(user.username) === "admin");
  const isAdminPath =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/admin");

  // If admin user, force standalone admin page
  if (!isLoading && isAdminUser) {
    if (!isAdminPath) {
      try {
        window.location.pathname = "/admin";
      } catch (e) {}
    }
    return (
      <ErrorBoundary>
        <div className="min-h-screen">
          <AdminDashboard />
        </div>
      </ErrorBoundary>
    );
  }

  // Prevent non-admins from accessing /admin
  if (!isLoading && !isAdminUser && isAdminPath) {
    try {
      window.location.pathname = "/";
    } catch (e) {}
    return null;
  }

  return (
    <ErrorBoundary>
      <div className="bg-gray-50 min-h-screen">
        <Header />
        <div className="pt-20 mt-[30px] pb-12 flex justify-center px-8">
          <div className="flex max-w-7xl w-full gap-10">
            <div className="flex-1 max-w-3xl">
              <Feed />
            </div>
            <div className="w-96 flex-shrink-0">
              <Sidebar />
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
