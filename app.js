const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const app = express();

const DB_PATH = './messages.db';
const PORT = 3000;

app.use(express.json());
app.use(cors());

// ------------------- Initialize DB -------------------
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Error opening database:', err);
  else {
    console.log('Connected to SQLite database');
    initDB();
  }
});

function initDB() {
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    content TEXT NOT NULL,
    lat REAL,
    lon REAL,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS emergency_alerts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    status TEXT NOT NULL,
    alert_type TEXT DEFAULT 'SOS',
    timestamp INTEGER NOT NULL,
    resolved BOOLEAN DEFAULT 0,
    resolved_at TEXT,
    resolved_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS emergency_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
}

// ------------------- Utils -------------------
function isValidTimestamp(timestamp) {
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const sqlRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  if (!isoRegex.test(timestamp) && !sqlRegex.test(timestamp)) return false;
  return !isNaN(new Date(timestamp).getTime());
}

// ------------------- MESH MESSAGES -------------------
app.post('/sync', (req, res) => {
  const { messages, conflict_strategy = 'skip' } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Expected messages array' });

  const results = { saved: 0, updated: 0, skipped: 0, errors: 0 };

  const processNext = (index) => {
    if (index >= messages.length) return res.json({ summary: results });

    const msg = messages[index];
    const required = ['id', 'device_id', 'content', 'timestamp'];
    const missing = required.filter(f => !msg[f]);
    if (missing.length > 0) {
      results.errors++;
      return processNext(index + 1);
    }

    if (!isValidTimestamp(msg.timestamp)) {
      results.errors++;
      return processNext(index + 1);
    }

    db.get('SELECT * FROM messages WHERE id=?', [msg.id], (err, row) => {
      if (err) { results.errors++; return processNext(index + 1); }

      if (row) {
        // Conflict resolution
        if (conflict_strategy === 'skip') results.skipped++;
        else if (conflict_strategy === 'overwrite') {
          db.run('UPDATE messages SET content=?,lat=?,lon=?,timestamp=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?',
            [msg.content, msg.lat || null, msg.lon || null, msg.timestamp, msg.id],
            function () { results.updated++; processNext(index + 1); });
        } else if (conflict_strategy === 'latest') {
          if (new Date(msg.timestamp) > new Date(row.timestamp)) {
            db.run('UPDATE messages SET content=?,lat=?,lon=?,timestamp=?,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=?',
              [msg.content, msg.lat || null, msg.lon || null, msg.timestamp, msg.id],
              function () { results.updated++; processNext(index + 1); });
          } else results.skipped++, processNext(index + 1);
        }
      } else {
        db.run('INSERT INTO messages(id,device_id,content,lat,lon,timestamp) VALUES(?,?,?,?,?,?)',
          [msg.id, msg.device_id, msg.content, msg.lat || null, msg.lon || null, msg.timestamp],
          function (err) {
            if (err) results.errors++; else results.saved++;
            processNext(index + 1);
          });
      }
    });
  };

  processNext(0);
});

app.get('/sync', (req, res) => {
  let query = 'SELECT * FROM messages WHERE 1=1';
  const params = [];
  if (req.query.device_id) { query += ' AND device_id=?'; params.push(req.query.device_id); }
  if (req.query.limit) { query += ' LIMIT ?'; params.push(parseInt(req.query.limit)); }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ count: rows.length, messages: rows });
  });
});

// ------------------- EMERGENCY ALERTS -------------------
app.post('/api/alerts', (req, res) => {
  const { userId, deviceId, latitude, longitude, status, alertType, timestamp } = req.body;
  if (!userId || !latitude || !longitude || !status || !timestamp)
    return res.status(400).json({ success: false, error: 'Missing required fields' });

  if (!['SOS', 'SAFE', 'DANGER', 'HELP'].includes(status))
    return res.status(400).json({ success: false, error: 'Invalid status' });

  const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  db.run(`INSERT INTO emergency_alerts 
    (id,user_id,device_id,latitude,longitude,status,alert_type,timestamp) VALUES (?,?,?,?,?,?,?,?)`,
    [alertId, userId, deviceId || null, latitude, longitude, status, alertType || 'SOS', timestamp],
    function (err) {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.status(201).json({ success: true, alertId, message: `${status} alert created`, data: { id: alertId, userId, latitude, longitude, status, timestamp } });
    });
});

app.get('/api/alerts', (req, res) => {
  let query = 'SELECT * FROM emergency_alerts WHERE 1=1';
  const params = [];
  if (req.query.status) { query += ' AND status=?'; params.push(req.query.status); }
  if (req.query.resolved !== undefined) { query += ' AND resolved=?'; params.push(req.query.resolved === 'true' ? 1 : 0); }
  if (req.query.userId) { query += ' AND user_id=?'; params.push(req.query.userId); }
  query += ' ORDER BY timestamp DESC';
  if (req.query.limit) { query += ' LIMIT ?'; params.push(parseInt(req.query.limit)); }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, count: rows.length, alerts: rows });
  });
});

app.get('/api/alerts/:id', (req, res) => {
  db.get('SELECT * FROM emergency_alerts WHERE id=?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!row) return res.status(404).json({ success: false, error: 'Alert not found' });
    res.json({ success: true, alert: row });
  });
});

app.put('/api/alerts/:id', (req, res) => {
  const { status, resolved, resolvedBy } = req.body;
  const updates = [];
  const params = [];

  if (status) { updates.push('status=?'); params.push(status); }
  if (resolved !== undefined) {
    updates.push('resolved=?'); params.push(resolved ? 1 : 0);
    if (resolved) { updates.push('resolved_at=?'); params.push(new Date().toISOString()); }
    if (resolvedBy) { updates.push('resolved_by=?'); params.push(resolvedBy); }
  }
  updates.push('updated_at=?'); params.push(new Date().toISOString());
  params.push(req.params.id);

  if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

  db.run(`UPDATE emergency_alerts SET ${updates.join(', ')} WHERE id=?`, params, function (err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (this.changes === 0) return res.status(404).json({ success: false, error: 'Alert not found' });
    res.json({ success: true, message: 'Alert updated successfully', alertId: req.params.id });
  });
});

app.delete('/api/alerts/:id', (req, res) => {
  db.run('DELETE FROM emergency_alerts WHERE id=?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (this.changes === 0) return res.status(404).json({ success: false, error: 'Alert not found' });
    res.json({ success: true, message: 'Alert deleted successfully', deletedId: req.params.id });
  });
});

// ------------------- EMERGENCY CONTACTS -------------------
app.post('/api/contacts', (req, res) => {
  const { userId, name, phoneNumber } = req.body;
  if (!userId || !name || !phoneNumber) return res.status(400).json({ success: false, error: 'Missing required fields' });

  db.run('INSERT INTO emergency_contacts(user_id,name,phone_number) VALUES(?,?,?)', [userId, name, phoneNumber], function (err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.status(201).json({ success: true, message: 'Contact added successfully', contactId: this.lastID });
  });
});

app.get('/api/contacts/:userId', (req, res) => {
  db.all('SELECT * FROM emergency_contacts WHERE user_id=? ORDER BY created_at DESC', [req.params.userId], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, count: rows.length, contacts: rows });
  });
});

app.delete('/api/contacts/:id', (req, res) => {
  db.run('DELETE FROM emergency_contacts WHERE id=?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (this.changes === 0) return res.status(404).json({ success: false, error: 'Contact not found' });
    res.json({ success: true, message: 'Contact deleted successfully' });
  });
});

// ------------------- HEALTH CHECK -------------------
app.get('/health', (req, res) => {
  db.get('SELECT COUNT(*) AS total_messages FROM messages', (err1, msgRow) => {
    db.get('SELECT COUNT(*) AS total_alerts FROM emergency_alerts', (err2, alertRow) => {
      res.json({
        status: 'healthy',
        total_messages: msgRow?.total_messages || 0,
        total_alerts: alertRow?.total_alerts || 0
      });
    });
  });
});

// ------------------- START SERVER -------------------
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));