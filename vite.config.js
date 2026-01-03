import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/tra-timetable/",
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "台鐵班次查詢",
        short_name: "台鐵查詢",
        description: "台鐵班次查詢",
        theme_color: "#0f172a",
        background_color: "#ffffff",
        display: "standalone",
        scope: "/tra-timetable/",
        start_url: "/tra-timetable/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },

      // ✅ 讓 GH Pages 上的 /data 也有快取（查過一次就能離線看）
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/data/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "tra-data",
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    allowedHosts: [
      "localhost",
      ".ngrok-free.app", // ✅ 允許所有 ngrok free subdomain
    ],
  },
});
