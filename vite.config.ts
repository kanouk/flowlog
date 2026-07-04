/// <reference types="vitest" />

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ?? "https://wdvwnbeofakzihmjacko.supabase.co";
const supabasePublishableKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkdnduYmVvZmFremlobWphY2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxMDg5ODQsImV4cCI6MjA4MTY4NDk4NH0.aMLoh64qEIF1oY_EVmV6QSaGOiOwiYLARnj_TzcEbr8";

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
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      supabasePublishableKey,
    ),
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
