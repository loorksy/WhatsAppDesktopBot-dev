const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const REMITTANCES_FILE = path.join(DATA_DIR, 'remittances.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function normalizePhone(phone = '') {
  return String(phone).replace(/[^0-9+]/g, '').replace(/^\+/, '');
}

function loadData() {
  try {
    if (!fs.existsSync(REMITTANCES_FILE)) return [];
    const raw = fs.readFileSync(REMITTANCES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveData(data) {
  fs.writeFileSync(REMITTANCES_FILE, JSON.stringify(data || [], null, 2));
}

function getUserRecord(phoneNumber) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return null;
  return loadData().find((r) => normalizePhone(r.phoneNumber) === phone) || null;
}

function getUserIdsByPhone(phoneNumber) {
  const rec = getUserRecord(phoneNumber);
  if (!rec) return { phoneNumber: normalizePhone(phoneNumber), ids: [], autoReplyEnabled: true };
  return {
    phoneNumber: rec.phoneNumber,
    ids: Array.isArray(rec.ids) ? rec.ids : [],
    autoReplyEnabled: rec.autoReplyEnabled !== false,
  };
}

function getLatestRemittanceStatusForId(id) {
  if (!id) return null;
  const data = loadData();
  let found = null;
  data.forEach((user) => {
    const ids = Array.isArray(user.ids) ? user.ids : [];
    ids.forEach((entry) => {
      if (String(entry.id) === String(id)) {
        const lastUpdate = Number(new Date(entry.lastUpdate || 0).getTime());
        if (!found || lastUpdate > found.lastUpdate) {
          found = {
            ...entry,
            phoneNumber: user.phoneNumber,
            autoReplyEnabled: user.autoReplyEnabled !== false,
            lastUpdate,
          };
        }
      }
    });
  });
  return found;
}

function linkReceiptToId(id, receiptInfo = {}) {
  const data = loadData();
  const now = Date.now();
  let updated = false;
  const normalizedId = String(id);

  data.forEach((user) => {
    if (!Array.isArray(user.ids)) return;
    user.ids = user.ids.map((entry) => {
      if (String(entry.id) !== normalizedId) return entry;
      updated = true;
      const mergedReceipt = Object.assign({}, entry.receiptInfo || {}, receiptInfo);
      return {
        ...entry,
        receiptMessageId: receiptInfo.messageId || entry.receiptMessageId,
        receiptInfo: mergedReceipt,
        lastUpdate: receiptInfo.timestamp || entry.lastUpdate || now,
      };
    });
  });

  if (updated) saveData(data);
  return updated;
}

function upsertUserRecord(phoneNumber, updater) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return null;
  const data = loadData();
  const idx = data.findIndex((u) => normalizePhone(u.phoneNumber) === phone);
  const current = idx >= 0 ? data[idx] : { phoneNumber: phone, ids: [], autoReplyEnabled: true };
  const updated = typeof updater === 'function' ? updater({ ...current }) : current;
  if (idx >= 0) data[idx] = updated; else data.push(updated);
  saveData(data);
  return updated;
}

function setAutoReplyEnabled(phoneNumber, enabled) {
  return upsertUserRecord(phoneNumber, (rec) => ({ ...rec, autoReplyEnabled: !!enabled }));
}

function listRemittances() {
  return loadData();
}

module.exports = {
  getUserIdsByPhone,
  getLatestRemittanceStatusForId,
  linkReceiptToId,
  setAutoReplyEnabled,
  listRemittances,
  normalizePhone,
  upsertUserRecord,
};
