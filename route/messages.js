const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all messages
router.get('/sync', (req, res) => {
  db.all('SELECT * FROM messages ORDER BY timestamp DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST a new message
router.post('/sync', (req, res) => {
  const { id, text, lat, lon, timestamp } = req.body;

  if (!id || !text || !lat || !lon || !timestamp) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Check if a message with same ID already exists
  db.get('SELECT * FROM messages WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row) {
      // Conflict resolution: update only if new timestamp is newer
      if (timestamp > row.timestamp) {
        db.run(
          'UPDATE messages SET text = ?, lat = ?, lon = ?, timestamp = ? WHERE id = ?',
          [text, lat, lon, timestamp, id],
          (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Message updated successfully' });
          }
        );
      } else {
        res.status(409).json({ error: 'Message ID already exists with same or newer timestamp' });
      }
    } else {
      // Insert new message
      db.run(
        'INSERT INTO messages (id, text, lat, lon, timestamp) VALUES (?, ?, ?, ?, ?)',
        [id, text, lat, lon, timestamp],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.status(201).json({ message: 'Message saved successfully' });
        }
      );
    }
  });
});

module.exports = router;