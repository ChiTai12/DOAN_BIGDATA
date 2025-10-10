import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught error captured by ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-xl w-full text-center">
            <h2 className="text-2xl font-semibold mb-4">Đã xảy ra lỗi</h2>
            <p className="text-gray-600 mb-6">
              Ứng dụng gặp vấn đề khi hiển thị. Bạn có thể thử tải lại trang.
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md"
              >
                Tải lại
              </button>
            </div>
            <details className="mt-4 text-left text-xs text-gray-500">
              <summary>Chi tiết lỗi (debug)</summary>
              <pre className="whitespace-pre-wrap mt-2">
                {String(this.state.error)}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
