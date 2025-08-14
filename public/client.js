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

  const listsEl = $('#lists');
  const newListBtn = $('#new-list-btn');
  const refreshListsBtn = $('#refresh-lists-btn');
  const listEditor = $('#list-editor');
  const listNameInput = $('#list-name');
  const questionsContainer = $('#questions-container');
  const addQuestionBtn = $('#add-question-btn');
  const saveListBtn = $('#save-list-btn');

  const presentPanel = $('#present-panel');
  const presentSessionId = $('#present-session-id');
  const studentJoinLink = $('#student-join-link');
  const showQrBtn = $('#show-qr-btn');
  const beginPresentationBtn = $('#begin-presentation-btn');

  const presView = $('#presentation');
  const presPrev = $('#pres-prev');
  const presNext = $('#pres-next');
  const presIndex = $('#pres-index');
  const presTotal = $('#pres-total');
  const presQuestion = $('#pres-question');
  const presChoices = $('#pres-choices');
  const revealBtn = $('#reveal-btn');
  const sumStudents = $('#sum-students');
  const sumAnswers = $('#sum-answers');

  const qrModal = $('#qr-modal');
  const qrClose = $('#qr-close');
  const qrContainer = $('#qr');
  const qrLink = $('#qr-link');

  let qrInstance = null;

  let teacherState = {
    code: '',
    sessionId: null,
    ws: null,
    lists: [],
    currentList: null, // { id, name, questions }
    presIndex: 0,
  };

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
      await loadLists();
    } catch(e){
      teacherLoginMsg.textContent = e.message || 'Login failed';
    }
  });

  async function loadLists(){
    listsEl.innerHTML = '<li class="msg">Loading...</li>';
    try {
      const res = await fetch('/api/question-lists', { headers: { 'x-access-code': teacherState.code } });
      if (!res.ok) throw new Error('Failed to load lists');
      const data = await res.json();
      teacherState.lists = data.items || [];
      renderLists();
    } catch(e){
      listsEl.innerHTML = `<li class="msg">${e.message}</li>`;
    }
  }

  function renderLists(){
    listsEl.innerHTML = '';
    if (!teacherState.lists.length){
      const li = document.createElement('li');
      li.className = 'msg';
      li.textContent = 'No lists yet. Create one!';
      listsEl.appendChild(li);
      return;
    }
    teacherState.lists.forEach(item => {
      const li = document.createElement('li');
      li.className = 'list-item';
      const btnEdit = document.createElement('button');
      btnEdit.className = 'secondary';
      btnEdit.textContent = 'Edit';
      btnEdit.addEventListener('click', () => openListEditor(item.id));
      const btnStart = document.createElement('button');
      btnStart.textContent = 'Start Class';
      btnStart.addEventListener('click', async () => {
        await startSessionFromList(item.id);
      });
      const meta = document.createElement('div');
      meta.className = 'list-meta';
      meta.innerHTML = `<strong>${item.name}</strong><br/><small>${new Date(item.updatedAt||Date.now()).toLocaleString()}</small>`;
      li.appendChild(meta);
      const actions = document.createElement('div');
      actions.className = 'list-actions';
      actions.appendChild(btnEdit);
      actions.appendChild(btnStart);
      li.appendChild(actions);
      listsEl.appendChild(li);
    });
  }

  newListBtn.addEventListener('click', () => {
    teacherState.currentList = { id: null, name: '', questions: [] };
    listNameInput.value = '';
    questionsContainer.innerHTML = '';
    addQuestionBlock();
    listEditor.classList.remove('hidden');
  });

  refreshListsBtn.addEventListener('click', loadLists);

  async function openListEditor(id){
    try {
      const res = await fetch(`/api/question-lists/${encodeURIComponent(id)}`, { headers: { 'x-access-code': teacherState.code } });
      if (!res.ok) throw new Error('Failed to load list');
      const data = await res.json();
      teacherState.currentList = data;
      listNameInput.value = data.name || '';
      questionsContainer.innerHTML = '';
      (data.questions || []).forEach(q => addQuestionBlock(q));
      listEditor.classList.remove('hidden');
    } catch(e){
      alert(e.message || 'Error');
    }
  }

  function addQuestionBlock(q = { text: '', choices: [] }){
    const wrap = document.createElement('div');
    wrap.className = 'q-block';
    const labelQ = document.createElement('label');
    labelQ.textContent = 'Question';
    const inputQ = document.createElement('input');
    inputQ.type = 'text';
    inputQ.value = q.text || '';
    const labelC = document.createElement('label');
    labelC.textContent = 'Choices (one per line)';
    const ta = document.createElement('textarea');
    ta.rows = 4;
    ta.value = (q.choices || []).join('\n');
    const del = document.createElement('button');
    del.className = 'secondary';
    del.textContent = 'Remove';
    del.addEventListener('click', () => wrap.remove());
    wrap.appendChild(labelQ);
    wrap.appendChild(inputQ);
    wrap.appendChild(labelC);
    wrap.appendChild(ta);
    wrap.appendChild(del);
    questionsContainer.appendChild(wrap);
  }

  addQuestionBtn.addEventListener('click', () => addQuestionBlock());

  saveListBtn.addEventListener('click', async () => {
    const name = listNameInput.value.trim();
    const questions = Array.from(questionsContainer.querySelectorAll('.q-block')).map(block => {
      const inputs = block.querySelectorAll('input, textarea');
      const text = inputs[0].value.trim();
      const choices = inputs[1].value.split('\n').map(s => s.trim()).filter(Boolean);
      return { text, choices };
    }).filter(q => q.text && q.choices.length >= 2);
    if (!name || !questions.length){
      alert('Please provide a list name and at least one question with two choices.');
      return;
    }
    try {
      const payload = { id: teacherState.currentList?.id || undefined, name, questions };
      const res = await fetch('/api/question-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': teacherState.code },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to save list');
      const data = await res.json();
      teacherState.currentList = { id: data.id, name, questions };
      await loadLists();
      alert('Saved.');
    } catch(e){
      alert(e.message || 'Error saving list');
    }
  });

  async function startSessionFromList(listId){
    try {
      // load full list
      const resList = await fetch(`/api/question-lists/${encodeURIComponent(listId)}`, { headers: { 'x-access-code': teacherState.code } });
      if (!resList.ok) throw new Error('Failed to load list');
      const list = await resList.json();
      teacherState.currentList = list;
      // create session
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-access-code': teacherState.code },
        body: JSON.stringify({ name: list.name })
      });
      if (!res.ok) throw new Error('Failed to create session');
      const data = await res.json();
      teacherState.sessionId = data.id;
      presentSessionId.textContent = data.id;
      const joinUrl = `${location.origin}/?session=${encodeURIComponent(data.id)}&as=student`;
      studentJoinLink.href = joinUrl;
      studentJoinLink.textContent = joinUrl;
      presentPanel.classList.remove('hidden');
    } catch(e){
      alert(e.message || 'Could not start session');
    }
  }

  showQrBtn?.addEventListener('click', () => {
    const url = studentJoinLink.href;
    if (!url) return;
    qrLink.href = url;
    qrLink.textContent = url;
    qrModal.classList.remove('hidden');
    if (qrInstance) { qrContainer.innerHTML = ''; qrInstance = null; }
    qrInstance = new QRCode(qrContainer, { text: url, width: 256, height: 256 });
  });

  qrClose?.addEventListener('click', () => {
    qrModal.classList.add('hidden');
  });

  beginPresentationBtn?.addEventListener('click', () => {
    if (!teacherState.sessionId || !teacherState.currentList) return;
    teacherState.presIndex = 0;
    presTotal.textContent = String(teacherState.currentList.questions.length);
    presView.classList.remove('hidden');
    teacherOpenWS();
  });

  presPrev.addEventListener('click', () => moveSlide(-1));
  presNext.addEventListener('click', () => moveSlide(1));

  function moveSlide(delta){
    if (!teacherState.currentList) return;
    const len = teacherState.currentList.questions.length;
    teacherState.presIndex = Math.max(0, Math.min(len - 1, teacherState.presIndex + delta));
    pushCurrentQuestion();
  }

  function pushCurrentQuestion(){
    const q = teacherState.currentList.questions[teacherState.presIndex];
    presIndex.textContent = String(teacherState.presIndex + 1);
    presQuestion.textContent = q.text;
    presChoices.innerHTML = '';
    q.choices.forEach((c, idx) => {
      const div = document.createElement('div');
      div.className = 'pres-choice';
      div.textContent = c;
      presChoices.appendChild(div);
    });
    if (teacherState.ws && teacherState.ws.readyState === WebSocket.OPEN){
      teacherState.ws.send(JSON.stringify({ type: 'setQuestion', sessionId: teacherState.sessionId, question: { text: q.text, choices: q.choices, correct: [] } }));
    }
  }

  function teacherOpenWS(){
    if (!teacherState.sessionId) return;
    if (teacherState.ws) try { teacherState.ws.close(); } catch(_){}
    const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws`);
    teacherState.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', role: 'teacher', sessionId: teacherState.sessionId }));
      // After join, push current slide
      if (teacherState.currentList) pushCurrentQuestion();
    };
    ws.onmessage = (ev) => handleTeacherMessage(JSON.parse(ev.data));
  }

  function handleTeacherMessage(msg){
    if (msg.type === 'summary'){
      sumStudents.textContent = msg.studentCount ?? 0;
      renderAnswerCounts(msg.answerCounts || [], []);
    }
    if (msg.type === 'answerUpdate' || msg.type === 'reveal'){
      renderAnswerCounts(msg.answerCounts || [], []);
    }
  }

  revealBtn.addEventListener('click', () => {
    if (!teacherState.ws || teacherState.ws.readyState !== WebSocket.OPEN) return;
    teacherState.ws.send(JSON.stringify({ type: 'reveal', sessionId: teacherState.sessionId }));
  });

  function renderAnswerCounts(counts){
    sumAnswers.innerHTML = '';
    for (let i = 0; i < counts.length; i++){
      const li = document.createElement('li');
      const count = counts[i] ?? 0;
      li.textContent = `Choice ${i+1}: ${count}`;
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
    if (preSession){
      studentSessionInput.value = preSession;
      // auto-join
      studentJoin();
    }
  }
})();
