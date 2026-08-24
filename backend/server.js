import express from 'express';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const app = express();
const notes = new Map();

function argValue(flag) {
  const args = process.argv.slice(2);
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
}

const persistFile = argValue('--persist');

if (persistFile && existsSync(persistFile)) {
  try {
    const raw = JSON.parse(readFileSync(persistFile, 'utf8'));
    for (const [id, ct] of Object.entries(raw)) {
      notes.set(id, ct);
    }
  } catch (error) {
    console.error('failed to load notes file:', error.message);
  }
}

function persist() {
  if (!persistFile) {
    return;
  }
  const obj = {};
  for (const [id, ct] of notes) {
    obj[id] = ct;
  }
  writeFileSync(persistFile, JSON.stringify(obj, null, 2));
}

app.use(function(req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '2mb' }));

app.post('/api/get2', function(req, res) {
  const id = req.body && req.body.id;
  if (typeof id !== 'string') {
    return res.status(400).json({ body: 'bad request' });
  }
  const ct = notes.get(id);
  if (ct === undefined) {
    return res.json({});
  }
  res.json({ body: JSON.stringify({ ct }) });
});

app.post('/api/save2', function(req, res) {
  const id = req.body && req.body.id;
  const ct = req.body && req.body.ct;
  if (typeof id !== 'string' || typeof ct !== 'string') {
    return res.status(400).json({ body: 'bad request' });
  }
  if (String(ct).length >= 100000) {
    return res.status(413).json({ body: 'note too large' });
  }
  notes.set(id, ct);
  persist();
  res.json({ body: 'successfully saved' });
});

const port = process.env.PORT || 3001;
app.listen(port, function() {
  console.log('publicnote mock backend on http://localhost:' + port);
});
