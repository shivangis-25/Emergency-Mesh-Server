const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'messages.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to connect to database', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Messages table
db.run(
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    timestamp INTEGER NOT NULL
  )`
);

// Emergency alerts table
db.run(
  `CREATE TABLE IF NOT EXISTS emergency_alerts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    type TEXT NOT NULL, -- SOS or SAFE
    message TEXT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    status TEXT DEFAULT 'active', -- active/resolved
    timestamp INTEGER NOT NULL
  )`
);

// Emergency contacts table
db.run(
  `CREATE TABLE IF NOT EXISTS emergency_contacts (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL
  )`
);

module.exports = db;