const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all alerts
router.get('/alerts', (req, res) => {
  db.all('SELECT * FROM emergency_alerts ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET alert by ID
router.get('/alerts/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM emergency_alerts WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Alert not found' });
    res.json(row);
  });
});

// POST new alert
router.post('/alerts', (req, res) => {
  const { id, userId, type, message, lat, lon, timestamp } = req.body;
  if (!id || !userId || !type || !lat || !lon || !timestamp)
    return res.status(400).json({ error: 'Missing required fields' });

  db.run(
    'INSERT INTO emergency_alerts (id, userId, type, message, lat, lon, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, userId, type, message || '', lat, lon, timestamp],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Alert created successfully' });
    }
  );
});

// PUT update alert status
router.put('/alerts/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  db.run(
    'UPDATE emergency_alerts SET status = ? WHERE id = ?',
    [status, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Alert not found' });
      res.json({ message: 'Alert status updated' });
    }
  );
});

// DELETE alert
router.delete('/alerts/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM emergency_alerts WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json({ message: 'Alert deleted' });
  });
});

module.exports = router;