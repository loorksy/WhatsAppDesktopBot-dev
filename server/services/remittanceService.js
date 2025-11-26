const remittanceData = require('./remittanceData');

const STATUS = {
  NO_RECORD: 'NO_RECORD',
  PENDING: 'PENDING',
  SENT_NO_RECEIPT: 'SENT_NO_RECEIPT',
  SENT_WITH_RECEIPT: 'SENT_WITH_RECEIPT',
};

function mapEntryToStatus(entry = {}) {
  if (!entry) return STATUS.NO_RECORD;
  const base = String(entry.status || '').toUpperCase();
  const hasReceipt = !!(entry.receiptInfo || entry.receiptMessageId);
  if (base === 'SENT' || base === 'PAID' || base === 'TRANSFERRED' || base === 'DONE') {
    return hasReceipt ? STATUS.SENT_WITH_RECEIPT : STATUS.SENT_NO_RECEIPT;
  }
  if (base === 'PENDING' || base === 'IN_PROGRESS' || base === 'PROCESSING') return STATUS.PENDING;
  if (hasReceipt) return STATUS.SENT_WITH_RECEIPT;
  return STATUS.NO_RECORD;
}

function getStatusForPhone(whatsAppNumber) {
  const user = remittanceData.getUserIdsByPhone(whatsAppNumber);
  const ids = Array.isArray(user.ids) ? user.ids : [];
  if (!ids.length) {
    return {
      status: STATUS.NO_RECORD,
      ids: [],
      autoReplyEnabled: user.autoReplyEnabled !== false,
    };
  }

  let latest = null;
  ids.forEach((entry) => {
    const ts = Number(new Date(entry.lastUpdate || 0).getTime());
    if (!latest || ts > latest.lastUpdate) {
      latest = { ...entry, lastUpdate: ts };
    }
  });

  const overallStatus = mapEntryToStatus(latest);

  return {
    status: overallStatus,
    id: latest?.id,
    amount: latest?.amount,
    lastUpdate: latest?.lastUpdate || null,
    receipt: latest?.receiptInfo || (latest?.receiptMessageId ? { messageId: latest.receiptMessageId } : null),
    ids,
    autoReplyEnabled: user.autoReplyEnabled !== false,
  };
}

module.exports = {
  STATUS,
  getStatusForPhone,
  mapEntryToStatus,
};
