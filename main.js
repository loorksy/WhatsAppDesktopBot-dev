// main.js — مع دعم الإرسال الجماعي (Bulk) + تحميل تلقائي للإعدادات/العملاء/المجموعات

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { WhatsAppAutomationAIService } = require('./bot');

const store = new Store.default();
let win;
let automationAI;

/* ===== Bulk (إرسال جماعي) — ضعه قبل استخدامه ===== */
const BulkStore = new (require('electron-store').default)({ name: 'bulk-state' });
let bulkState = {
  running: false,
  paused: false,
  groupId: null,
  messages: [],
  index: 0,
  total: 0,
  delaySec: 3,
  rpm: 20,
  lastMinute: { ts: 0, count: 0 }
};
/* ================================================ */

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'بوت واتساب — سطح المكتب'
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  const sessionsDir = path.join(app.getPath('userData'), 'whatsappautomationai-sessions');
  automationAI = new WhatsAppAutomationAIService({ sessionsDir });

  automationAI.onLog((line) => { if (win) win.webContents.send('whatsappautomationai-log', line); });

  await automationAI.init();

  // ✅ حمّل الإعدادات/العملاء/المجموعات تلقائياً عند الإقلاع
  try {
    const initSettings = store.get('settings') || {};
    const initClients  = store.get('clients')  || [];
    const initGroups   = store.get('selectedGroupIds') || [];
    automationAI.setSettings(initSettings);
    automationAI.setClients(initClients);
    automationAI.setSelectedGroups(initGroups);
    automationAI.log('[init] preloaded settings/clients/groups');
  } catch (e) {
    automationAI.log('[init] preload failed: ' + (e.message || e));
  }

  // استعادة حالة الإرسال الجماعي (إن وُجدت)
  try {
    const cp = BulkStore.get('checkpoint');
    const running = BulkStore.get('running');
    if (cp && running) {
      bulkState.groupId = cp.groupId || null;
      bulkState.messages = Array.isArray(cp.messages) ? cp.messages : [];
      bulkState.total = cp.total || bulkState.messages.length || 0;
      bulkState.index = cp.index || 0;
      bulkState.running = false; // لا نبدأ تلقائياً
    }
  } catch {}

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* ============ IPC (القائمة الأساسية) ============ */
ipcMain.handle('get-status', async () => automationAI.getStatus());
ipcMain.handle('get-qr', async () => automationAI.getQR());
ipcMain.handle('fetch-groups', async () => automationAI.fetchGroups());

ipcMain.handle('save-groups', async (_e, ids) => {
  store.set('selectedGroupIds', Array.isArray(ids) ? ids : []);
  automationAI.setSelectedGroups(store.get('selectedGroupIds') || []);
  return { ok: true, count: automationAI.getSelectedGroups().length };
});
ipcMain.handle('get-groups-saved', async () => automationAI.getSelectedGroups());

ipcMain.handle('save-clients', async (_e, rawText) => {
  const settings = store.get('settings') || {};
  const fallbackEmoji = settings.emoji || '✅';

  const lines = String(rawText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const arr = [];
  const seen = new Set();
  for (const line of lines) {
    const [n, e] = line.split('|');
    const name = (n || '').trim();
    const emoji = (e || '').trim() || fallbackEmoji;
    if (!name) continue;
    const key = name + '|' + emoji;
    if (seen.has(key)) continue;
    seen.add(key);
    arr.push({ name, emoji });
  }
  store.set('clients', arr);
  automationAI.setClients(arr);
  return { ok: true, count: arr.length };
});
ipcMain.handle('get-clients', async () => store.get('clients') || []);

ipcMain.handle('set-settings', async (_e, s) => {
  const merged = Object.assign(
    { emoji: '✅', ratePerMinute: 20, cooldownSec: 3, normalizeArabic: true, mode: 'emoji', replyText: 'تم ✅' },
    store.get('settings') || {},
    s || {}
  );
  store.set('settings', merged);
  automationAI.setSettings(merged);
  return merged;
});
ipcMain.handle('get-settings', async () => store.get('settings') || { emoji: '✅', ratePerMinute: 20, cooldownSec: 3, normalizeArabic: true, mode: 'emoji', replyText: 'تم ✅' });

ipcMain.handle('start-whatsappautomationai', async () => {
  automationAI.setSettings(store.get('settings') || {});
  automationAI.setClients(store.get('clients') || []);
  automationAI.setSelectedGroups(store.get('selectedGroupIds') || []);
  await automationAI.start();
  return automationAI.getStatus();
});
ipcMain.handle('stop-whatsappautomationai', async () => { await automationAI.stop(); return automationAI.getStatus(); });

ipcMain.handle('get-last-checked', async () => automationAI.getLastCheckedMap());
ipcMain.handle('process-backlog', async (_e, opts) => {
  await automationAI.processBacklog(opts || {});
  return { ok: true };
});
ipcMain.handle('check-backlog', async (_e, opts) => {
  const res = await automationAI.countBacklog(opts || {});
  return res;
});

/* ============ Bulk (إرسال جماعي) ============ */
async function bulkSendLoop() {
  if (!automationAI || !automationAI.isReady || !bulkState.running) return;

  const resetMinuteIfNeeded = () => {
    const now = Date.now();
    if (now - bulkState.lastMinute.ts > 60_000) {
      bulkState.lastMinute = { ts: now, count: 0 };
    }
  };
  resetMinuteIfNeeded();

  while (bulkState.running) {
    if (bulkState.paused) { await new Promise(r => setTimeout(r, 500)); continue; }
    if (bulkState.index >= bulkState.total) { bulkState.running = false; break; }

    resetMinuteIfNeeded();
    if (bulkState.lastMinute.count >= bulkState.rpm) {
      const toWait = 60_000 - (Date.now() - bulkState.lastMinute.ts);
      await new Promise(r => setTimeout(r, Math.max(500, toWait)));
      continue;
    }

    const text = bulkState.messages[bulkState.index];
    try {
      await automationAI.client.sendMessage(bulkState.groupId, text);
      bulkState.index += 1;
      bulkState.lastMinute.count += 1;

      BulkStore.set('checkpoint', {
        groupId: bulkState.groupId,
        index: bulkState.index,
        total: bulkState.total,
        messages: bulkState.messages
      });

      if (bulkState.delaySec > 0) {
        await new Promise(r => setTimeout(r, bulkState.delaySec * 1000));
      }
    } catch (e) {
      if (win) win.webContents.send('whatsappautomationai-log', `⚠️ bulk send error: ${e.message || e}`);
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  if (win) win.webContents.send('whatsappautomationai-log', '✅ bulk finished');
  bulkState.running = false;
  BulkStore.set('running', false);
}

ipcMain.handle('bulk-start', async (_e, opts) => {
  if (!automationAI || !automationAI.isReady) throw new Error('WhatsApp not ready');
  const { groupId, messages, delaySec = 3, rpm = 20 } = opts || {};
  if (!groupId) throw new Error('groupId required');
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('messages required');

  bulkState = {
    running: true,
    paused: false,
    groupId,
    messages,
    index: 0,
    total: messages.length,
    delaySec: Math.max(0, Number(delaySec)),
    rpm: Math.max(1, Number(rpm)),
    lastMinute: { ts: Date.now(), count: 0 }
  };
  BulkStore.set('running', true);
  BulkStore.set('checkpoint', { groupId, index: 0, total: messages.length, messages });

  bulkSendLoop().catch(() => {});
  return { ok: true };
});
ipcMain.handle('bulk-pause', async () => { bulkState.paused = true; return { ok: true }; });
ipcMain.handle('bulk-resume', async () => {
  if (!bulkState.running) bulkState.running = true;
  bulkState.paused = false;
  bulkSendLoop().catch(() => {});
  return { ok: true };
});
ipcMain.handle('bulk-cancel', async () => {
  bulkState.running = false; bulkState.paused = false;
  BulkStore.set('running', false);
  return { ok: true };
});
ipcMain.handle('bulk-status', async () => {
  const status = automationAI.getStatus();
  return { ...status, bulk: { running: bulkState.running, paused: bulkState.paused, index: bulkState.index, total: bulkState.total } };
});
ipcMain.handle('bulk-save-draft', async (_e, d) => { BulkStore.set('draft', d || null); return { ok: true }; });
ipcMain.handle('bulk-load-draft', async () => BulkStore.get('draft') || null);
ipcMain.handle('bulk-save-settings', async (_e, s) => { BulkStore.set('settings', s || {}); return { ok: true }; });
ipcMain.handle('bulk-load-settings', async () => BulkStore.get('settings') || { delaySec: 3, rpm: 20 });