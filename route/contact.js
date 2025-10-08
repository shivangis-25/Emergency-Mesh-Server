const express = require('express');
const router = express.Router();
const db = require('../db');

// POST new contact
router.post('/contacts', (req, res) => {
  const { id, userId, name, phone } = req.body;
  if (!id || !userId || !name || !phone)
    return res.status(400).json({ error: 'Missing required fields' });

  db.run(
    'INSERT INTO emergency_contacts (id, userId, name, phone) VALUES (?, ?, ?, ?)',
    [id, userId, name, phone],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Contact added successfully' });
    }
  );
});

// GET contacts for a user
router.get('/contacts/:userId', (req, res) => {
  const { userId } = req.params;
  db.all('SELECT * FROM emergency_contacts WHERE userId = ?', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// DELETE contact
router.delete('/contacts/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM emergency_contacts WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Contact not found' });
    res.json({ message: 'Contact deleted' });
  });
});

module.exports = router;