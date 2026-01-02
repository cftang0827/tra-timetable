import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(), // ← 這一行是關鍵
  ],
  server: {
    allowedHosts: [
      "localhost",
      ".ngrok-free.app", // ✅ 允許所有 ngrok free subdomain
    ],
  },
});
