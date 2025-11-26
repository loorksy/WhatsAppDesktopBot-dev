const express = require('express');
const remittanceData = require('../services/remittanceData');
const remittanceService = require('../services/remittanceService');

module.exports = () => {
  const router = express.Router();

  router.get('/remittances', (_req, res) => {
    res.json({ remittances: remittanceData.listRemittances() });
  });

  router.post('/remittances/auto-reply', (req, res) => {
    const { phoneNumber, enabled } = req.body || {};
    if (!phoneNumber) return res.status(400).json({ error: 'phoneNumber is required' });
    const record = remittanceData.setAutoReplyEnabled(phoneNumber, enabled);
    return res.json({ record });
  });

  router.get('/remittances/status/:phone', (req, res) => {
    const status = remittanceService.getStatusForPhone(req.params.phone);
    res.json({ status });
  });

  return router;
};
