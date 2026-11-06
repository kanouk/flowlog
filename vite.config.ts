/// <reference types="vitest" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: ["staging", "cloudflare-production"].includes(mode) ? { "import.meta.env.VITE_MIGRATION_READ_ONLY": JSON.stringify(process.env.FLOWLOG_STAGING_READ_ONLY === "1"), "import.meta.env.VITE_DEPLOYMENT_ENVIRONMENT": JSON.stringify(mode === "cloudflare-production" ? "production" : "staging"), "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""), "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("") } : {},
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  build: {
    rollupOptions: {
      plugins: [
        visualizer({
          filename: "stats.html",
          gzipSize: true,
          brotliSize: true,
          template: "treemap",
        }),
      ],
    },
  },
}));
