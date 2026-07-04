/// <reference types="vitest" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig(() => ({
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
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-router-dom")) return "router";
          if (id.includes("react") || id.includes("react-dom")) return "vendor";
          if (id.includes("@supabase/supabase-js")) return "supabase";
          if (id.includes("recharts")) return "charts";
        },
      },
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
