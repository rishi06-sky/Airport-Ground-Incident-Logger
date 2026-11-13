import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          framework: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
  test: { environment: "jsdom" },
});
