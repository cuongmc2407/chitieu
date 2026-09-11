import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Chi Tiêu",
        short_name: "Chi Tiêu",
        description: "Ghi chi tiêu siêu nhanh qua Telegram, web và app",
        lang: "vi",
        theme_color: "#0d9488",
        background_color: "#f8fafc",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The API always needs the network — never let the SW answer it from cache.
        navigateFallbackDenylist: [/^\/api\//, /^\/telegram\//],
        runtimeCaching: [{ urlPattern: /^\/api\//, handler: "NetworkOnly" }],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3333",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
