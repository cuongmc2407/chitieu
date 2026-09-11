// PM2 chạy đúng file build (dist/index.mjs) — cùng một artifact với Docker,
// tránh phải cài devDependencies (tsx, typescript...) trên server thật.
//
//   pnpm --filter @chitieu/server build
//   pnpm --filter @chitieu/web build
//   pm2 start deploy/ecosystem.config.cjs
//
// apps/server/.env được app tự đọc lúc khởi động (process.loadEnvFile()),
// không cần PM2 truyền biến môi trường nào thêm ngoài NODE_ENV.

const path = require("node:path");

const SERVER_DIR = path.join(__dirname, "..", "apps", "server");
const LOG_DIR = path.join(__dirname, "..", "logs");

module.exports = {
  apps: [
    {
      name: "chitieu",
      cwd: SERVER_DIR,
      script: "dist/index.mjs",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      // Đủ thời gian cho graceful shutdown trong index.ts (đóng bot, DB,
      // hoàn tất request đang chạy) trước khi PM2 ép kill.
      kill_timeout: 10_000,
      env: {
        NODE_ENV: "production",
      },
      out_file: path.join(LOG_DIR, "chitieu-out.log"),
      error_file: path.join(LOG_DIR, "chitieu-error.log"),
      merge_logs: true,
      time: true,
    },
  ],
};
