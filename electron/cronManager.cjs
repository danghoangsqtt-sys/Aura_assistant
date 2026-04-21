/**
 * CronManager — Persistent Scheduled Tasks for Aura Desktop
 * Uses node-cron for cron expressions + setTimeout for one-time delays.
 * Saves all tasks to a JSON file so they survive app restarts.
 */
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class CronManager {
  constructor() {
    this.tasks = [];       // Array of task objects
    this.activeJobs = {};  // { taskId: cronJob | timeoutId }
    this.filePath = '';
    this.onTriggerCallback = null;
  }

  /**
   * Initialize with the app data path and load saved tasks
   */
  init(appDataPath) {
    const auraDir = path.join(appDataPath, 'Aura');
    if (!fs.existsSync(auraDir)) fs.mkdirSync(auraDir, { recursive: true });
    this.filePath = path.join(auraDir, 'scheduled_tasks.json');
    this._load();
    this._restoreJobs();
    console.log(`[CronManager] Initialized. ${this.tasks.length} tasks loaded from ${this.filePath}`);
  }

  /**
   * Set callback for when a task triggers
   * @param {function} callback - (task) => void
   */
  onTrigger(callback) {
    this.onTriggerCallback = callback;
  }

  /**
   * Add a new scheduled task
   * @param {object} options
   * @param {string} options.label - What to remind about
   * @param {string} [options.cronExpression] - Cron expression (e.g., "0 7 * * *")
   * @param {number} [options.delayMinutes] - Minutes from now (one-time)
   * @param {boolean} [options.repeat] - Whether this is a repeating task
   * @returns {object} - The created task
   */
  addTask({ label, cronExpression, delayMinutes, repeat = false }) {
    const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const task = {
      id,
      label,
      repeat,
      createdAt: new Date(now).toISOString(),
      active: true,
    };

    if (cronExpression && cron.validate(cronExpression)) {
      task.type = 'cron';
      task.cronExpression = cronExpression;
    } else if (delayMinutes && delayMinutes > 0) {
      task.type = 'delay';
      task.delayMinutes = delayMinutes;
      task.dueAt = new Date(now + delayMinutes * 60 * 1000).toISOString();
    } else {
      return { success: false, error: 'Invalid: need cronExpression or delayMinutes' };
    }

    this.tasks.push(task);
    this._save();
    this._startJob(task);

    console.log(`[CronManager] Task added: ${id} — "${label}" (${task.type})`);
    return { success: true, task };
  }

  /**
   * Cancel/remove a task by ID
   */
  removeTask(taskId) {
    const idx = this.tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return { success: false, error: 'Task not found' };

    this._stopJob(taskId);
    this.tasks.splice(idx, 1);
    this._save();
    console.log(`[CronManager] Task removed: ${taskId}`);
    return { success: true };
  }

  /**
   * List all active tasks
   */
  listTasks() {
    return this.tasks.filter(t => t.active).map(t => ({
      id: t.id,
      label: t.label,
      type: t.type,
      repeat: t.repeat,
      cronExpression: t.cronExpression || null,
      dueAt: t.dueAt || null,
      createdAt: t.createdAt,
    }));
  }

  // ── Private Methods ──────────────────────────────────

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        this.tasks = Array.isArray(data.tasks) ? data.tasks : [];
      }
    } catch (e) {
      console.warn('[CronManager] Failed to load tasks, starting fresh:', e.message);
      this.tasks = [];
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify({ tasks: this.tasks }, null, 2), 'utf8');
    } catch (e) {
      console.error('[CronManager] Failed to save tasks:', e.message);
    }
  }

  _restoreJobs() {
    // Restore active jobs after app restart
    const now = Date.now();
    const expired = [];

    for (const task of this.tasks) {
      if (!task.active) continue;

      if (task.type === 'cron') {
        this._startJob(task);
      } else if (task.type === 'delay') {
        const dueTime = new Date(task.dueAt).getTime();
        if (dueTime <= now) {
          // Already expired — trigger immediately if missed, then clean up
          console.log(`[CronManager] Missed task "${task.label}" — triggering now`);
          this._triggerTask(task);
          if (!task.repeat) expired.push(task.id);
        } else {
          // Still in the future, re-schedule with remaining time
          const remaining = dueTime - now;
          task._remainingMs = remaining;
          this._startJob(task);
        }
      }
    }

    // Clean up expired one-time tasks
    for (const id of expired) {
      const idx = this.tasks.findIndex(t => t.id === id);
      if (idx !== -1) this.tasks.splice(idx, 1);
    }
    if (expired.length > 0) this._save();
  }

  _startJob(task) {
    this._stopJob(task.id); // Stop existing if any

    if (task.type === 'cron' && task.cronExpression) {
      try {
        const job = cron.schedule(task.cronExpression, () => {
          this._triggerTask(task);
        });
        this.activeJobs[task.id] = { type: 'cron', job };
      } catch (e) {
        console.error(`[CronManager] Failed to start cron for ${task.id}:`, e.message);
      }
    } else if (task.type === 'delay') {
      const delayMs = task._remainingMs || (task.delayMinutes * 60 * 1000);
      delete task._remainingMs;
      const timeoutId = setTimeout(() => {
        this._triggerTask(task);
        if (!task.repeat) {
          this.removeTask(task.id);
        }
      }, delayMs);
      this.activeJobs[task.id] = { type: 'timeout', timeoutId };
    }
  }

  _stopJob(taskId) {
    const active = this.activeJobs[taskId];
    if (!active) return;

    if (active.type === 'cron' && active.job) {
      active.job.stop();
    } else if (active.type === 'timeout' && active.timeoutId) {
      clearTimeout(active.timeoutId);
    }
    delete this.activeJobs[taskId];
  }

  _triggerTask(task) {
    console.log(`[CronManager] 🔔 TRIGGER: "${task.label}"`);
    if (this.onTriggerCallback) {
      this.onTriggerCallback(task);
    }
  }

  /**
   * Stop all active jobs (call on app quit)
   */
  destroy() {
    for (const id of Object.keys(this.activeJobs)) {
      this._stopJob(id);
    }
    console.log('[CronManager] Destroyed all jobs.');
  }
}

module.exports = new CronManager();
