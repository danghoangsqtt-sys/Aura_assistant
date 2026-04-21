/**
 * kill-port.cjs — Giải phóng port trước khi khởi động dev server.
 * Dùng trước `npm run electron:dev` để tránh lỗi "Port already in use".
 * Usage: node scripts/kill-port.cjs <port>
 */
const { execSync } = require('child_process');
const port = process.argv[2] || '5173';

try {
  if (process.platform === 'win32') {
    const result = execSync(
      `powershell -Command "` +
      `$conn = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; ` +
      `if ($conn) { Stop-Process -Id $conn.OwningProcess -Force; Write-Host 'Killed PID ' $conn.OwningProcess } ` +
      `else { Write-Host 'Port ${port} is free' }"`,
      { stdio: 'pipe' }
    ).toString().trim();
    console.log(`[kill-port] ${result}`);
  } else {
    // macOS / Linux
    execSync(`lsof -ti tcp:${port} | xargs kill -9 2>/dev/null || true`);
    console.log(`[kill-port] Port ${port} cleared.`);
  }
} catch (e) {
  // Nếu không có gì để kill thì bỏ qua
  console.log(`[kill-port] Port ${port} already free.`);
}
