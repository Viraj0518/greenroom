import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// SPA lives in app/, builds to dist/ at repo root (Pages output dir).
// functions/ at repo root is picked up by Cloudflare Pages as Pages Functions.
export default defineConfig({
  root: "app",
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // During pure-vite dev, proxy API calls to `wrangler pages dev` (port 8788)
    proxy: {
      "/api": "http://127.0.0.1:8788",
    },
  },
});
