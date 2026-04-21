/**
 * PluginLoader — Dynamic Plugin System for Aura Desktop
 * Scans a plugins directory, validates plugin.json manifests,
 * loads and executes plugin code in a controlled environment.
 * 
 * Plugin structure:
 *   %APPDATA%/Aura/plugins/
 *     ├── my_plugin/
 *     │   ├── plugin.json   ← Metadata + FunctionDeclaration
 *     │   └── index.js      ← module.exports = async function(params, context) { ... }
 */
const fs = require('fs');
const path = require('path');

// Permissions that plugins can request
const VALID_PERMISSIONS = ['fs.read', 'fs.write', 'net.http', 'shell.exec'];
const DEFAULT_TIMEOUT = 10000; // 10 seconds

class PluginLoader {
  constructor() {
    this.pluginsDir = '';
    this.plugins = {};       // { name: { meta, execute } }
    this.declarations = [];  // FunctionDeclaration[] for Gemini
  }

  /**
   * Initialize and scan for plugins
   * @param {string} appDataPath - e.g. app.getPath('userData')
   */
  init(appDataPath) {
    this.pluginsDir = path.join(appDataPath, 'Aura', 'plugins');
    // Create plugins directory if it doesn't exist
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
      console.log(`[PluginLoader] Created plugins directory: ${this.pluginsDir}`);
    }
    this.scanPlugins();
  }

  /**
   * Scan plugins directory and load valid plugins
   */
  scanPlugins() {
    this.plugins = {};
    this.declarations = [];

    try {
      const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        this._loadPlugin(entry.name);
      }
      console.log(`[PluginLoader] Loaded ${Object.keys(this.plugins).length} plugin(s)`);
    } catch (e) {
      console.warn('[PluginLoader] Error scanning plugins:', e.message);
    }
  }

  /**
   * Load a single plugin by directory name
   */
  _loadPlugin(dirName) {
    const pluginDir = path.join(this.pluginsDir, dirName);
    const manifestPath = path.join(pluginDir, 'plugin.json');
    const indexPath = path.join(pluginDir, 'index.js');

    // Check required files exist
    if (!fs.existsSync(manifestPath)) {
      console.warn(`[PluginLoader] Skipping "${dirName}": plugin.json not found`);
      return;
    }
    if (!fs.existsSync(indexPath)) {
      console.warn(`[PluginLoader] Skipping "${dirName}": index.js not found`);
      return;
    }

    try {
      // Parse manifest
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const meta = JSON.parse(raw);

      // Validate manifest
      if (!meta.name || !meta.functionDeclaration) {
        console.warn(`[PluginLoader] Skipping "${dirName}": missing name or functionDeclaration`);
        return;
      }

      // Validate permissions
      const perms = meta.permissions || [];
      for (const p of perms) {
        if (!VALID_PERMISSIONS.includes(p)) {
          console.warn(`[PluginLoader] Plugin "${meta.name}" requests invalid permission: ${p}`);
          return;
        }
      }

      // Load the execute function (but don't run it yet)
      // Use a fresh require to avoid caching issues on reload
      delete require.cache[require.resolve(indexPath)];
      const executeFn = require(indexPath);

      if (typeof executeFn !== 'function') {
        console.warn(`[PluginLoader] Plugin "${meta.name}": index.js must export a function`);
        return;
      }

      // Register
      this.plugins[meta.name] = {
        meta,
        execute: executeFn,
        dir: pluginDir,
        permissions: perms,
        maxTimeout: meta.maxExecutionTimeMs || DEFAULT_TIMEOUT,
        enabled: meta.enabled !== false,
      };

      // Add to Gemini FunctionDeclarations if enabled
      if (this.plugins[meta.name].enabled) {
        this.declarations.push(meta.functionDeclaration);
      }

      console.log(`[PluginLoader] ✅ Loaded plugin: "${meta.name}" v${meta.version || '1.0.0'}`);
    } catch (e) {
      console.error(`[PluginLoader] Error loading plugin "${dirName}":`, e.message);
    }
  }

  /**
   * Get all FunctionDeclaration[]  for Gemini tool registration
   */
  getDeclarations() {
    return this.declarations;
  }

  /**
   * Check if a tool call matches a loaded plugin
   */
  hasPlugin(toolName) {
    const plugin = this.plugins[toolName];
    return plugin && plugin.enabled;
  }

  /**
   * Execute a plugin by name with given parameters
   * @param {string} name - Plugin/function name
   * @param {object} params - Parameters from Gemini function call
   * @param {object} context - Runtime context { appDataPath, userId, ... }
   * @returns {Promise<object>} - { success, result } or { success: false, error }
   */
  async executePlugin(name, params, context = {}) {
    const plugin = this.plugins[name];
    if (!plugin) {
      return { success: false, error: `Plugin "${name}" not found` };
    }
    if (!plugin.enabled) {
      return { success: false, error: `Plugin "${name}" is disabled` };
    }

    try {
      // Execute with timeout
      const result = await Promise.race([
        plugin.execute(params, context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Plugin "${name}" timed out after ${plugin.maxTimeout}ms`)), plugin.maxTimeout)
        ),
      ]);

      return { success: true, result };
    } catch (e) {
      console.error(`[PluginLoader] Plugin "${name}" execution error:`, e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Reload all plugins (hot-reload)
   */
  reload() {
    console.log('[PluginLoader] Reloading all plugins...');
    this.scanPlugins();
    return { success: true, loaded: Object.keys(this.plugins).length };
  }

  /**
   * Get list of loaded plugins with metadata
   */
  listPlugins() {
    return Object.values(this.plugins).map(p => ({
      name: p.meta.name,
      version: p.meta.version || '1.0.0',
      description: p.meta.description || '',
      author: p.meta.author || 'unknown',
      enabled: p.enabled,
      permissions: p.permissions,
    }));
  }

  /**
   * Enable/disable a plugin by name
   */
  togglePlugin(name, enabled) {
    const plugin = this.plugins[name];
    if (!plugin) return { success: false, error: 'Plugin not found' };

    plugin.enabled = enabled;
    // Re-build declarations
    this.declarations = Object.values(this.plugins)
      .filter(p => p.enabled)
      .map(p => p.meta.functionDeclaration);

    console.log(`[PluginLoader] Plugin "${name}" ${enabled ? 'enabled' : 'disabled'}`);
    return { success: true };
  }
}

module.exports = new PluginLoader();
