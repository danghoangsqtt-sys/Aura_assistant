const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const PROXY_RESOURCES_DIR = path.join(PROJECT_ROOT, 'resources', 'proxy');
const CLI_PROXY_DIR = path.join(PROJECT_ROOT, '..', '..', 'CLIProxyAPI');

console.log('[Build] Starting Proxy Embedded Build...');

// 1. Ensure output directory exists
if (!fs.existsSync(PROXY_RESOURCES_DIR)) {
  fs.mkdirSync(PROXY_RESOURCES_DIR, { recursive: true });
}

// 2. Build the Go binary
const isWin = process.platform === 'win32';
const binName = isWin ? 'cliproxy.exe' : 'cliproxy';
const outputPath = path.join(PROXY_RESOURCES_DIR, binName);

if (!fs.existsSync(CLI_PROXY_DIR)) {
  console.error(`[Error] CLIProxyAPI project not found at: ${CLI_PROXY_DIR}`);
  console.error(`Please ensure the CLIProxyAPI repository is cloned next to Aura_assistant.`);
  process.exit(1);
}

console.log(`[Build] Compiling Go binary to ${outputPath}...`);
try {
  execSync(`go build -o "${outputPath}" cmd/server/main.go`, {
    cwd: CLI_PROXY_DIR,
    stdio: 'inherit',
    env: { ...process.env, CGO_ENABLED: '0' } // Static binary
  });
  console.log('[Build] Go binary built successfully.');
} catch (err) {
  console.error('[Error] Failed to build Go binary:', err.message);
  process.exit(1);
}

// 3. Ensure config.yaml exists
const configPath = path.join(PROXY_RESOURCES_DIR, 'config.yaml');
if (!fs.existsSync(configPath)) {
  console.log('[Build] Creating default config.yaml...');
  const defaultConfig = `# Aura Assistant Embedded CLIProxyAPI Config
host: "127.0.0.1"
port: 8318
tls:
  enable: false
remote-management:
  allow-remote: false
  secret-key: "aura-mgmt-key"
  disable-control-panel: true
auth-dir: "./auths"
api-keys:
  - "aura-assistant-bypass"
gemini-api-key:
  - api-key: "placeholder-not-used"
    base-url: "https://generativelanguage.googleapis.com"
debug: false
request-retry: 3
cors:
  allowed-origins:
    - "http://localhost:5173"
    - "http://127.0.0.1:5173"
`;
  fs.writeFileSync(configPath, defaultConfig, 'utf-8');
} else {
  console.log('[Build] config.yaml already exists. Skipping.');
}

// 4. Ensure auths directory exists
const authsDir = path.join(PROXY_RESOURCES_DIR, 'auths');
if (!fs.existsSync(authsDir)) {
  fs.mkdirSync(authsDir, { recursive: true });
  console.log('[Build] Created auths directory.');
}

console.log('[Build] Complete. Ready for Electron.');
