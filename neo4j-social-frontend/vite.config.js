import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // keep server options minimal; middleware is added via configureServer below
  },
  // Add middleware via Vite's configureServer so rewrites run before Vite's handlers
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      try {
        if (req.url && req.url.startsWith("/public/")) {
          // rewrite /public/xyz -> /xyz
          req.url = req.url.replace(/^\/public\//, "/");
        }
      } catch (e) {
        // ignore
      }
      next();
    });
  },
});
