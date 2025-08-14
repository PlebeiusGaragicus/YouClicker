// Minimal client-side logic for YouClicker
(function(){
  const $ = (sel) => document.querySelector(sel);
  const teacherTab = $('#tab-teacher');
  const studentTab = $('#tab-student');
  const teacherView = $('#teacher-view');
  const studentView = $('#student-view');

  function setTab(tab){
    if (tab === 'teacher'){
      teacherTab.classList.add('active');
      studentTab.classList.remove('active');
      teacherView.classList.remove('hidden');
      studentView.classList.add('hidden');
    } else {
      studentTab.classList.add('active');
      teacherTab.classList.remove('active');
      studentView.classList.remove('hidden');
      teacherView.classList.add('hidden');
    }
  }

  teacherTab.addEventListener('click', () => setTab('teacher'));
  studentTab.addEventListener('click', () => setTab('student'));

  // Teacher flow
  const teacherLoginBtn = $('#teacher-login-btn');
  const teacherCodeInput = $('#teacher-code');
  const teacherLoginMsg = $('#teacher-login-msg');
  const teacherControls = $('#teacher-controls');

  const createSessionBtn = $('#create-session-btn');
  const sessionNameInput = $('#session-name');
  const sessionInfo = $('#session-info');
  const presentPanel = $('#present-panel');
  const presentSessionId = $('#present-session-id');
  const studentJoinLink = $('#student-join-link');

  const qText = $('#q-text');
  const qChoices = $('#q-choices');
  const setQuestionBtn = $('#set-question-btn');
  const revealBtn = $('#reveal-btn');
  const sumStudents = $('#sum-students');
  const sumAnswers = $('#sum-answers');

  let teacherState = { code: '', sessionId: null, ws: null };

  teacherLoginBtn.addEventListener('click', async () => {
    teacherLoginMsg.textContent = '';
    const code = teacherCodeInput.value.trim();
    if (!code){
      teacherLoginMsg.textContent = 'Enter access code';
      return;
    }
    try {
      const res = await fetch('/api/teacher/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      if (!res.ok) throw new Error('Invalid code');
      teacherLoginMsg.textContent = 'Login successful';
      teacherControls.classList.remove('hidden');
      $('#teacher-login').classList.add('hidden');
      teacherState.code = code;
    } catch(e){
      teacherLoginMsg.textContent = e.message || 'Login failed';
    }
  });

  createSessionBtn.addEventListener('click', async () => {
    sessionInfo.textContent = '';
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-code': teacherState.code,
        },
        body: JSON.stringify({ name: sessionNameInput.value.trim() || undefined })
      });
      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
      teacherState.sessionId = data.id;
      sessionInfo.textContent = `Session created: ${data.id}`;
      presentSessionId.textContent = data.id;
      const joinUrl = `${location.origin}/?session=${encodeURIComponent(data.id)}&as=student`;
      studentJoinLink.href = joinUrl;
      studentJoinLink.textContent = joinUrl;
      presentPanel.classList.remove('hidden');

      // Open WS and join as teacher
      teacherOpenWS();
    } catch(e){
      sessionInfo.textContent = e.message || 'Error creating session';
    }
  });

  function teacherOpenWS(){
    if (!teacherState.sessionId) return;
    if (teacherState.ws) try { teacherState.ws.close(); } catch(_){}
    const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws`);
    teacherState.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', role: 'teacher', sessionId: teacherState.sessionId }));
    };
    ws.onmessage = (ev) => handleTeacherMessage(JSON.parse(ev.data));
  }

  function handleTeacherMessage(msg){
    if (msg.type === 'summary'){
      sumStudents.textContent = msg.studentCount ?? 0;
      renderAnswerCounts(msg.answerCounts || [], qText.value.trim(), getChoiceArray());
    }
    if (msg.type === 'answerUpdate' || msg.type === 'reveal'){
      renderAnswerCounts(msg.answerCounts || [], qText.value.trim(), getChoiceArray());
    }
  }

  function getChoiceArray(){
    return qChoices.value.split('\n').map(s => s.trim()).filter(Boolean);
  }

  setQuestionBtn.addEventListener('click', () => {
    if (!teacherState.ws || teacherState.ws.readyState !== WebSocket.OPEN) return;
    const choices = getChoiceArray();
    const question = { text: qText.value.trim(), choices, correct: [] };
    teacherState.ws.send(JSON.stringify({ type: 'setQuestion', sessionId: teacherState.sessionId, question }));
  });

  revealBtn.addEventListener('click', () => {
    if (!teacherState.ws || teacherState.ws.readyState !== WebSocket.OPEN) return;
    teacherState.ws.send(JSON.stringify({ type: 'reveal', sessionId: teacherState.sessionId }));
  });

  function renderAnswerCounts(counts, qTextLocal, choices){
    sumAnswers.innerHTML = '';
    for (let i = 0; i < Math.max(counts.length, choices.length); i++){
      const li = document.createElement('li');
      const choiceLabel = choices[i] || `Choice ${i+1}`;
      const count = counts[i] ?? 0;
      li.textContent = `${choiceLabel}: ${count}`;
      sumAnswers.appendChild(li);
    }
  }

  // Student flow
  const studentJoinBtn = $('#student-join-btn');
  const studentSessionInput = $('#student-session-id');
  const studentIdMsg = $('#student-id');

  const sqPanel = $('#student-question');
  const sqText = $('#sq-text');
  const sqChoices = $('#sq-choices');
  const sqTally = $('#sq-tally');

  let studentState = { sessionId: null, ws: null, clientId: null };

  studentJoinBtn.addEventListener('click', () => studentJoin());

  function studentJoin(){
    const sid = (studentSessionInput.value || '').trim();
    if (!sid) { studentIdMsg.textContent = 'Enter a session ID'; return; }
    studentState.sessionId = sid;
    studentOpenWS();
  }

  function studentOpenWS(){
    if (!studentState.sessionId) return;
    if (studentState.ws) try { studentState.ws.close(); } catch(_){}
    const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws`);
    studentState.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', role: 'student', sessionId: studentState.sessionId }));
    };
    ws.onmessage = (ev) => handleStudentMessage(JSON.parse(ev.data));
  }

  function handleStudentMessage(msg){
    if (msg.type === 'identity'){
      studentState.clientId = msg.clientId;
      studentIdMsg.textContent = `Your ID: ${msg.clientId}`;
      sqPanel.classList.remove('hidden');
    }
    if (msg.type === 'question'){
      renderStudentQuestion(msg.question);
    }
    if (msg.type === 'summary'){
      // initial state when joining
      if (msg.question) renderStudentQuestion(msg.question);
    }
    if (msg.type === 'reveal'){
      renderTally(msg.answerCounts || []);
      sqTally.classList.remove('hidden');
    }
    if (msg.type === 'answerUpdate'){
      // live update of counts while hidden is okay
      renderTally(msg.answerCounts || []);
    }
  }

  function renderStudentQuestion(q){
    if (!q){
      sqText.textContent = 'Waiting for question...';
      sqChoices.innerHTML = '';
      sqTally.classList.add('hidden');
      return;
    }
    sqText.textContent = q.text || 'Question';
    sqChoices.innerHTML = '';
    sqTally.classList.add('hidden');
    (q.choices || []).forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = choice;
      btn.addEventListener('click', () => sendStudentAnswer(idx));
      sqChoices.appendChild(btn);
    });
  }

  function sendStudentAnswer(idx){
    if (!studentState.ws || studentState.ws.readyState !== WebSocket.OPEN) return;
    studentState.ws.send(JSON.stringify({ type: 'answer', sessionId: studentState.sessionId, choice: idx }));
  }

  function renderTally(counts){
    sqTally.innerHTML = '';
    counts.forEach((c, i) => {
      const li = document.createElement('li');
      li.textContent = `Choice ${i+1}: ${c}`;
      sqTally.appendChild(li);
    });
  }

  // URL params support for convenience
  const params = new URLSearchParams(location.search);
  const preSession = params.get('session');
  const as = params.get('as');
  if (as === 'student'){
    setTab('student');
    if (preSession){ studentSessionInput.value = preSession; }
  }
})();
