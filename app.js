// YouClicker minimal server
// Simple Express + WebSocket app with in-memory state

require('dotenv').config();
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const TEACHER_ACCESS_CODE = process.env.TEACHER_ACCESS_CODE || 'CHANGEME';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store
// sessions: { [sessionId]: { id, name, createdAt, teacherConnected, students: Set<clientId>, question: { text, choices: string[], correct: number[] } | null, answers: { [clientId]: number } } }
const sessions = new Map();

// Basic auth middleware for teacher actions
function requireTeacher(req, res, next) {
  const code = req.headers['x-access-code'] || req.body?.code;
  if (code && code === TEACHER_ACCESS_CODE) return next();
  return res.status(401).json({ error: 'Unauthorized: invalid access code' });
}

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Teacher login verification (stateless)
app.post('/api/teacher/login', (req, res) => {
  const { code } = req.body || {};
  if (code === TEACHER_ACCESS_CODE) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: 'Invalid code' });
});

// Create a session
app.post('/api/session', requireTeacher, (req, res) => {
  const { name } = req.body || {};
  const id = uuidv4();
  sessions.set(id, {
    id,
    name: name || 'Class Session',
    createdAt: Date.now(),
    teacherConnected: false,
    students: new Set(),
    question: null,
    answers: {},
  });
  res.json({ id });
});

// Get session basic info
app.get('/api/session/:id', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json({ id: s.id, name: s.name, createdAt: s.createdAt });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`YouClicker server listening on http://localhost:${PORT}`);
});

// WebSocket handling
const wss = new WebSocketServer({ server, path: '/ws' });

// Track clients
let nextStudentNum = 1;

function broadcast(sessionId, data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((ws) => {
    if (ws.readyState === ws.OPEN && ws.sessionId === sessionId) {
      ws.send(payload);
    }
  });
}

function sessionSummary(session) {
  return {
    type: 'summary',
    teacherConnected: session.teacherConnected,
    studentCount: session.students.size,
    question: session.question,
    answerCounts: countAnswers(session),
  };
}

function countAnswers(session) {
  const counts = [];
  if (!session.question || !Array.isArray(session.question.choices)) return counts;
  const n = session.question.choices.length;
  for (let i = 0; i < n; i++) counts[i] = 0;
  Object.values(session.answers).forEach((choice) => {
    if (Number.isInteger(choice) && choice >= 0 && choice < n) counts[choice]++;
  });
  return counts;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (msgBuf) => {
    let msg;
    try {
      msg = JSON.parse(msgBuf.toString());
    } catch (e) {
      return; // ignore invalid JSON
    }

    if (msg.type === 'join') {
      const { role, sessionId } = msg;
      const session = sessions.get(sessionId);
      if (!session) {
        ws.send(JSON.stringify({ type: 'error', error: 'Session not found' }));
        return;
      }
      ws.sessionId = sessionId;
      if (role === 'teacher') {
        ws.role = 'teacher';
        session.teacherConnected = true;
      } else {
        ws.role = 'student';
        if (!ws.clientId) {
          ws.clientId = `student-${String(nextStudentNum++).padStart(4, '0')}`;
        }
        session.students.add(ws.clientId);
        // Send assigned ID back to student
        ws.send(JSON.stringify({ type: 'identity', clientId: ws.clientId }));
      }
      // Send initial summary to this client and broadcast update
      ws.send(JSON.stringify(sessionSummary(session)));
      broadcast(sessionId, sessionSummary(session));
      return;
    }

    // Teacher sets question
    if (msg.type === 'setQuestion') {
      const { sessionId, question } = msg; // question: { text, choices: [], correct: [] }
      const session = sessions.get(sessionId);
      if (!session) return;
      if (ws.role !== 'teacher') return;
      session.question = question || null;
      session.answers = {};
      broadcast(sessionId, { type: 'question', question: session.question });
      broadcast(sessionId, sessionSummary(session));
      return;
    }

    // Student answers
    if (msg.type === 'answer') {
      const { sessionId, choice } = msg;
      const session = sessions.get(sessionId);
      if (!session || ws.role !== 'student' || !Number.isInteger(choice)) return;
      if (!ws.clientId) return;
      session.answers[ws.clientId] = choice;
      broadcast(sessionId, { type: 'answerUpdate', answerCounts: countAnswers(session) });
      return;
    }

    // Teacher can request reveal tally explicitly
    if (msg.type === 'reveal') {
      const { sessionId } = msg;
      const session = sessions.get(sessionId);
      if (!session || ws.role !== 'teacher') return;
      broadcast(sessionId, { type: 'reveal', answerCounts: countAnswers(session) });
      return;
    }
  });

  ws.on('close', () => {
    const { sessionId, role, clientId } = ws;
    if (!sessionId) return;
    const session = sessions.get(sessionId);
    if (!session) return;
    if (role === 'teacher') {
      session.teacherConnected = false;
    } else if (role === 'student' && clientId) {
      session.students.delete(clientId);
      delete session.answers[clientId];
    }
    broadcast(sessionId, sessionSummary(session));
  });
});

// Heartbeat for ws
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));
