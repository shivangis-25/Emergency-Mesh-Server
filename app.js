const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();

const DB_PATH = './messages.db';
const PORT = 3000;

app.use(express.json());

// Initialize database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initDB();
  }
});

// Enhanced database schema with conflict resolution fields
function initDB() {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      content TEXT NOT NULL,
      lat REAL,
      lon REAL,
      timestamp TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      version INTEGER DEFAULT 1
    )
  `, (err) => {
    if (err) {
      console.error('Error creating table:', err);
    } else {
      console.log('Messages table ready');
      // Create index for faster duplicate detection
      db.run(`CREATE INDEX IF NOT EXISTS idx_device_timestamp 
              ON messages(device_id, timestamp)`, (err) => {
        if (err) console.error('Error creating index:', err);
      });
    }
  });
}

// POST /sync endpoint with enhanced conflict resolution
app.post('/sync', (req, res) => {
  try {
    const { messages, conflict_strategy = 'skip' } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: 'Invalid request format. Expected "messages" array.'
      });
    }

    const results = {
      saved: [],
      updated: [],
      skipped: [],
      errors: [],
      conflicts: []
    };

    let processed = 0;

    messages.forEach((msg) => {
      // Validate required fields
      const requiredFields = ['id', 'device_id', 'content', 'timestamp'];
      const missingFields = requiredFields.filter(field => !msg[field]);

      if (missingFields.length > 0) {
        results.errors.push({
          message_id: msg.id || 'unknown',
          reason: `Missing required fields: ${missingFields.join(', ')}`
        });
        processed++;
        if (processed === messages.length) sendResponse();
        return;
      }

      // Validate timestamp format (ISO 8601 or YYYY-MM-DD HH:MM:SS)
      if (!isValidTimestamp(msg.timestamp)) {
        results.errors.push({
          message_id: msg.id,
          reason: 'Invalid timestamp format. Use ISO 8601 or YYYY-MM-DD HH:MM:SS'
        });
        processed++;
        if (processed === messages.length) sendResponse();
        return;
      }

      // Check for existing message
      db.get(
        `SELECT id, timestamp, version, content FROM messages WHERE id = ?`,
        [msg.id],
        (err, existingMsg) => {
          if (err) {
            results.errors.push({
              message_id: msg.id,
              reason: `Database error: ${err.message}`
            });
            processed++;
            if (processed === messages.length) sendResponse();
            return;
          }

          if (existingMsg) {
            // Conflict detected - apply resolution strategy
            handleConflict(msg, existingMsg, conflict_strategy);
          } else {
            // Check for duplicate content from same device within time window
            checkDuplicateContent(msg);
          }
        }
      );
    });

    // Handle conflict based on strategy
    function handleConflict(newMsg, existingMsg, strategy) {
      const newTimestamp = new Date(newMsg.timestamp);
      const existingTimestamp = new Date(existingMsg.timestamp);

      results.conflicts.push({
        message_id: newMsg.id,
        strategy_used: strategy,
        existing_timestamp: existingMsg.timestamp,
        new_timestamp: newMsg.timestamp
      });

      switch (strategy) {
        case 'skip':
          // Skip new message, keep existing
          results.skipped.push({
            id: newMsg.id,
            reason: 'Message ID already exists (conflict: skip strategy)'
          });
          processed++;
          if (processed === messages.length) sendResponse();
          break;

        case 'latest':
          // Keep message with latest timestamp
          if (newTimestamp > existingTimestamp) {
            updateMessage(newMsg, existingMsg.version);
          } else {
            results.skipped.push({
              id: newMsg.id,
              reason: 'Existing message is newer (conflict: latest strategy)'
            });
            processed++;
            if (processed === messages.length) sendResponse();
          }
          break;

        case 'overwrite':
          // Always overwrite with new message
          updateMessage(newMsg, existingMsg.version);
          break;

        case 'version':
          // Increment version number
          updateMessage(newMsg, existingMsg.version);
          break;

        default:
          results.skipped.push({
            id: newMsg.id,
            reason: 'Unknown conflict strategy'
          });
          processed++;
          if (processed === messages.length) sendResponse();
      }
    }

    // Check for duplicate content (same device, similar timestamp)
    function checkDuplicateContent(msg) {
      const timeWindow = 5000; // 5 seconds window
      const msgTimestamp = new Date(msg.timestamp).getTime();
      
      db.all(
        `SELECT id, timestamp, content FROM messages 
         WHERE device_id = ? AND content = ?`,
        [msg.device_id, msg.content],
        (err, duplicates) => {
          if (err) {
            results.errors.push({
              message_id: msg.id,
              reason: `Duplicate check error: ${err.message}`
            });
            processed++;
            if (processed === messages.length) sendResponse();
            return;
          }

          // Check if any duplicate is within time window
          const isDuplicate = duplicates.some(dup => {
            const dupTimestamp = new Date(dup.timestamp).getTime();
            return Math.abs(msgTimestamp - dupTimestamp) < timeWindow;
          });

          if (isDuplicate) {
            results.skipped.push({
              id: msg.id,
              reason: 'Duplicate content detected within 5-second window'
            });
            processed++;
            if (processed === messages.length) sendResponse();
          } else {
            insertMessage(msg);
          }
        }
      );
    }

    // Insert new message
    function insertMessage(msg) {
      db.run(
        `INSERT INTO messages (id, device_id, content, lat, lon, timestamp, version)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [msg.id, msg.device_id, msg.content, msg.lat || null, msg.lon || null, msg.timestamp],
        (err) => {
          if (err) {
            results.errors.push({
              message_id: msg.id,
              reason: `Insert error: ${err.message}`
            });
          } else {
            results.saved.push({
              id: msg.id,
              timestamp: msg.timestamp
            });
          }
          processed++;
          if (processed === messages.length) sendResponse();
        }
      );
    }

    // Update existing message
    function updateMessage(msg, currentVersion) {
      const now = new Date().toISOString();
      db.run(
        `UPDATE messages 
         SET content = ?, lat = ?, lon = ?, timestamp = ?, 
             updated_at = ?, version = ?
         WHERE id = ?`,
        [msg.content, msg.lat || null, msg.lon || null, msg.timestamp, 
         now, currentVersion + 1, msg.id],
        (err) => {
          if (err) {
            results.errors.push({
              message_id: msg.id,
              reason: `Update error: ${err.message}`
            });
          } else {
            results.updated.push({
              id: msg.id,
              version: currentVersion + 1,
              timestamp: msg.timestamp
            });
          }
          processed++;
          if (processed === messages.length) sendResponse();
        }
      );
    }

    function sendResponse() {
      const statusCode = (results.saved.length > 0 || results.updated.length > 0) ? 200 : 400;
      res.status(statusCode).json({
        status: 'completed',
        summary: {
          saved: results.saved.length,
          updated: results.updated.length,
          skipped: results.skipped.length,
          errors: results.errors.length,
          conflicts: results.conflicts.length
        },
        details: results
      });
    }

    if (messages.length === 0) {
      sendResponse();
    }

  } catch (error) {
    res.status(500).json({
      error: `Server error: ${error.message}`
    });
  }
});

// GET /sync endpoint with enhanced filtering
app.get('/sync', (req, res) => {
  try {
    const { device_id, limit, since, until, min_version } = req.query;
    
    let query = `SELECT id, device_id, content, lat, lon, timestamp, 
                 created_at, updated_at, version FROM messages WHERE 1=1`;
    const params = [];

    if (device_id) {
      query += ' AND device_id = ?';
      params.push(device_id);
    }

    if (since) {
      query += ' AND timestamp >= ?';
      params.push(since);
    }

    if (until) {
      query += ' AND timestamp <= ?';
      params.push(until);
    }

    if (min_version) {
      query += ' AND version >= ?';
      params.push(parseInt(min_version));
    }

    query += ' ORDER BY timestamp DESC';

    if (limit && parseInt(limit) > 0) {
      query += ' LIMIT ?';
      params.push(parseInt(limit));
    }

    db.all(query, params, (err, rows) => {
      if (err) {
        return res.status(500).json({
          error: `Database error: ${err.message}`
        });
      }

      res.status(200).json({
        messages: rows,
        count: rows.length,
        filters_applied: {
          device_id: device_id || 'all',
          limit: limit || 'none',
          since: since || 'none',
          until: until || 'none'
        }
      });
    });

  } catch (error) {
    res.status(500).json({
      error: `Server error: ${error.message}`
    });
  }
});

// GET /conflicts endpoint - view conflict history
app.get('/conflicts', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 50;
  
  db.all(
    `SELECT id, device_id, content, version, updated_at 
     FROM messages WHERE version > 1 
     ORDER BY updated_at DESC LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          error: `Database error: ${err.message}`
        });
      }
      res.json({
        conflicts: rows,
        count: rows.length
      });
    }
  );
});

// DELETE /messages/:id endpoint - delete specific message
app.delete('/messages/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM messages WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({
        error: `Delete error: ${err.message}`
      });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({
        error: 'Message not found'
      });
    }
    
    res.json({
      success: true,
      deleted_id: id
    });
  });
});

// Health check
app.get('/health', (req, res) => {
  db.get('SELECT COUNT(*) as count FROM messages', (err, row) => {
    if (err) {
      return res.status(500).json({
        status: 'unhealthy',
        error: err.message
      });
    }
    res.json({
      status: 'healthy',
      database: 'connected',
      total_messages: row.count
    });
  });
});

// Utility: Validate timestamp
function isValidTimestamp(timestamp) {
  // Check ISO 8601 or YYYY-MM-DD HH:MM:SS format
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const sqlRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  
  if (!isoRegex.test(timestamp) && !sqlRegex.test(timestamp)) {
    return false;
  }
  
  const date = new Date(timestamp);
  return !isNaN(date.getTime());
}

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📝 Endpoints available:`);
  console.log(`   POST   /sync          - Upload messages`);
  console.log(`   GET    /sync          - Retrieve messages`);
  console.log(`   GET    /conflicts     - View conflict history`);
  console.log(`   DELETE /messages/:id  - Delete message`);
  console.log(`   GET    /health        - Health check`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('\n💾 Database connection closed');
    }
    process.exit(0);
  });
});