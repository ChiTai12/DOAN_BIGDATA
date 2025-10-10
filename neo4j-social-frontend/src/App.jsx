import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import Feed from "./components/Feed";
import Sidebar from "./components/SidebarWrapper";
import { AuthProvider } from "./components/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";

function App() {
  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}

export default App;
