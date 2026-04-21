/**
 * Security Guard — Multi-layer Protection for Aura Desktop
 * Validates paths, commands, and file extensions before execution.
 * Logs all tool operations to an audit file.
 */
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════
// BLACKLISTS
// ═══════════════════════════════════════════════════════

const PATH_BLACKLIST = [
  'windows\\system32', 'windows\\syswow64', 'windows\\boot',
  'windows\\servicing', 'windows\\winsxs', 'windows\\installer',
  '.ssh', '.gnupg', '.aws', '.azure',
  'appdata\\roaming\\microsoft\\credentials',
  'appdata\\roaming\\microsoft\\protect',
  'appdata\\local\\microsoft\\vault',
  'appdata\\local\\microsoft\\windows\\inetcache',
  'program files\\windows defender',
  '$recycle.bin', 'system volume information',
  'config\\systemprofile',
];

const COMMAND_BLACKLIST = [
  /remove-item\s.*-recurse\s.*-force/i,
  /del\s+\/[fqs]/i,
  /rmdir\s+\/s/i,
  /format\s+[a-z]:/i,
  /shutdown/i,
  /restart-computer/i,
  /stop-computer/i,
  /taskkill\s.*explorer/i,
  /taskkill\s.*svchost/i,
  /taskkill\s.*csrss/i,
  /taskkill\s.*winlogon/i,
  /reg\s+delete/i,
  /reg\s+add\s.*\\\\run/i,
  /net\s+user\s/i,
  /net\s+localgroup\s/i,
  /netsh\s/i,
  /invoke-webrequest/i,
  /invoke-restmethod/i,
  /start-bitstransfer/i,
  /certutil\s.*-urlcache/i,
  /new-scheduledtask/i,
  /set-executionpolicy/i,
  /\bfork\s*bomb\b/i,
  /:\(\)\{.*\|.*&\s*\}/i,       // Fork bomb pattern
];

const EXT_BLACKLIST = [
  '.exe', '.bat', '.cmd', '.vbs', '.vbe',
  '.ps1', '.psm1', '.psd1',
  '.msi', '.msp', '.reg', '.scr', '.com',
  '.wsf', '.wsh', '.inf', '.hta', '.cpl',
];

// ═══════════════════════════════════════════════════════
// VALIDATORS
// ═══════════════════════════════════════════════════════

class SecurityGuard {
  constructor() {
    this.auditLogPath = '';
    this.maxLogSize = 1 * 1024 * 1024; // 1MB max
  }

  init(appDataPath) {
    const auraDir = path.join(appDataPath, 'Aura');
    if (!fs.existsSync(auraDir)) fs.mkdirSync(auraDir, { recursive: true });
    this.auditLogPath = path.join(auraDir, 'tool_audit.log');
    console.log(`[SecurityGuard] Initialized. Audit log: ${this.auditLogPath}`);
  }

  /**
   * Validate a file/folder path
   */
  validatePath(targetPath) {
    if (!targetPath) return { allowed: true };
    const normalized = targetPath.toLowerCase().replace(/\//g, '\\');

    for (const blocked of PATH_BLACKLIST) {
      if (normalized.includes(blocked)) {
        return {
          allowed: false,
          reason: `Đường dẫn bị cấm vì lý do bảo mật (chứa "${blocked}")`,
        };
      }
    }
    return { allowed: true };
  }

  /**
   * Validate a shell/PowerShell command
   */
  validateCommand(command) {
    if (!command) return { allowed: true };

    for (const pattern of COMMAND_BLACKLIST) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: `Lệnh bị chặn vì lý do bảo mật (khớp pattern: ${pattern.source})`,
        };
      }
    }
    return { allowed: true };
  }

  /**
   * Validate file extension (block opening dangerous file types)
   */
  validateExtension(filePath) {
    if (!filePath) return { allowed: true };
    const ext = path.extname(filePath).toLowerCase();
    if (EXT_BLACKLIST.includes(ext)) {
      return {
        allowed: false,
        reason: `Không được phép mở file có phần mở rộng "${ext}" vì lý do bảo mật`,
      };
    }
    return { allowed: true };
  }

  /**
   * Write an entry to the audit log
   */
  audit(action, detail, blocked = false) {
    try {
      // Auto-rotate if too large
      if (fs.existsSync(this.auditLogPath)) {
        const stats = fs.statSync(this.auditLogPath);
        if (stats.size > this.maxLogSize) {
          const backupPath = this.auditLogPath + '.old';
          if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
          fs.renameSync(this.auditLogPath, backupPath);
        }
      }

      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const line = `[${timestamp}] ACTION=${action} ${detail} BLOCKED=${blocked}\n`;
      fs.appendFileSync(this.auditLogPath, line, 'utf8');
    } catch (e) {
      console.warn('[SecurityGuard] Audit log write failed:', e.message);
    }
  }
}

module.exports = new SecurityGuard();
