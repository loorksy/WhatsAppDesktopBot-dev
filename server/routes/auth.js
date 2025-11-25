const express = require('express');

module.exports = ({ jwt, JWT_SECRET }) => {
  const router = express.Router();

  const handleLogin = (req, res) => {
    const { email, password } = req.body || {};
    if (email === 'loorksy@gmail.com' && password === 'lork0009') {
      const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
      return res.json({ token });
    }
    return res.status(401).json({ error: 'invalid credentials' });
  };

  router.post('/login', handleLogin);
  router.post('/api/login', handleLogin);

  router.post('/logout', (_req, res) => {
    res.clearCookie('token');
    return res.json({ ok: true });
  });

  return router;
};
