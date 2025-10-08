const express = require('express');
const cors = require('cors');

const messagesRouter = require('./routes/messages');
const alertsRouter = require('./routes/alerts');
const contactsRouter = require('./routes/contacts');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', messagesRouter);
app.use('/api', alertsRouter);
app.use('/api', contactsRouter);

app.get('/', (req, res) => {
  res.send('Emergency Mesh Backend is running');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});