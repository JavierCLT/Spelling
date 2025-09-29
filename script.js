/* Say & Spell — overlay grid matches bars; wrong letter turns red immediately */

const WORD_AUDIO_DIR   = 'sounds/word_sounds/English';
const SUCCESS_AUDIO    = 'sounds/success.mp3';
const LETTER_AUDIO_DIR = 'sounds/letter_sounds/English';
const GITHUB_IMG_BASE  = 'https://raw.githubusercontent.com/JavierCLT/Spelling/main/images';
const TTS_NORMAL = 0.78;
const TTS_SLOW   = 0.66;

const GRAPHEMES = ['tch','igh','sh','ch','th','wh','ph','ck','ng','ai','ee','ea','oa','oo'];

const LEVELS = [
  { key: 'L1', name: 'CVC (short vowels)' },
  { key: 'L2', name: 'Digraphs & Blends' },
  { key: 'L3', name: 'Magic‑e (CVCe)' },
  { key: 'L4', name: 'Vowel Teams' },
  { key: 'L5', name: 'Full words' },
];

const WORDS = {
  L1: ['cat','map','bag','cap','jam','tap','pan','van','fan','ham','bed','pen','web','leg','sun','bug','cup','rug','bus','dog','log','pot','mop'],
  L2: ['ship','shop','chin','moth','shed','cash','duck','sock','ring','phone','whale','photo'],
  L3: ['cape','bike','home','cube','tape','pine','note','cake','rope','mule','gate','pole','robe','kite'],
  L4: ['rain','tail','seed','feet','boat','goat','road','moon','team','coat','soap','toad'],
  L5: ['apple','lemon','orange','pepper','table','school','guitar','parrot','tomato','violin','whale','water']
};

const state = {
  levelKey: 'L1',
  word: '',
  chunks: [],
  typed: '',
  locked: false,
  firstBadIndex: -1,
  started: false,
  finished: false,
  letterAudio: null,
  audioExistsMemo: new Map(),
  counters: { correct: 0, totalErrors: 0, errorsThisWord: 0 },
  goals: { words: 10, errors: 3 },
  taskCelebrated: false,
  voice: null,
};

let suppressAutoFocus = false;

const els = {};
document.addEventListener('DOMContentLoaded', init);

function init(){
  els.levelSelect    = document.getElementById('levelSelect');
  els.goalCard       = document.getElementById('goalCard');
  els.goalWords      = document.getElementById('goalWords');
  els.goalErrors     = document.getElementById('goalErrors');
  els.startBtn       = document.getElementById('startBtn');
  els.resetBtn       = document.getElementById('resetBtn');
  els.statusLine     = document.getElementById('statusLine');
  els.correctCount   = document.getElementById('correctCount');
  els.totalErrors    = document.getElementById('totalErrors');
  els.errorsThisWord = document.getElementById('errorsThisWord');
  els.bars           = document.getElementById('bars');
  els.spellInput     = document.getElementById('spellInput');
  els.overlay        = document.getElementById('overlay');
  els.picture        = document.getElementById('picture');
  els.wordImg        = document.getElementById('wordImg');
  els.imgCaption     = document.getElementById('imgCaption');
  els.scoreCard      = document.getElementById('scoreCard');
  els.toast          = document.getElementById('toast');
  els.playVeil       = document.getElementById('playVeil');
  els.aboutBtn       = document.getElementById('aboutBtn');
  els.aboutDialog    = document.getElementById('aboutDialog');

  buildLevelSelect();

  attachNumericGuards(els.goalWords, { min: 1, max: 99 });
  attachNumericGuards(els.goalErrors,{ min: 0, max: 99 });

  els.goalWords.addEventListener('input', () => {
    state.goals.words = clamp(intOrZero(els.goalWords.value), 1, 99);
    bindGoalNumbers(); updateStatusLine();
  });
  els.goalErrors.addEventListener('input', () => {
    state.goals.errors = clamp(intOrZero(els.goalErrors.value), 0, 99);
    bindGoalNumbers(); updateStatusLine();
  });

  els.startBtn.addEventListener('click', startSession);
  els.resetBtn.addEventListener('click', resetCounters);

  els.spellInput.addEventListener('keydown', handleType);
  els.spellInput.addEventListener('paste', (e) => e.preventDefault());
  els.spellInput.addEventListener('drop', (e) => e.preventDefault());

  els.spellInput.addEventListener('blur', () => {
    if (!state.started || state.finished) return;
    const af = document.activeElement;
    const movingToControls =
      (af && (af === els.levelSelect)) ||
      (af && els.goalCard && els.goalCard.contains(af));
    if (!suppressAutoFocus && !movingToControls && !isInteractive(af)) {
      setTimeout(() => els.spellInput.focus(), 0);
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (!state.started || state.finished) return;
    const inControls =
      e.target === els.levelSelect ||
      (els.goalCard && els.goalCard.contains(e.target));
    if (inControls) {
      suppressAutoFocus = true;
      setTimeout(() => { suppressAutoFocus = false; }, 1500);
      return;
    }
    if (!isInteractive(e.target)) {
      setTimeout(() => { if (!suppressAutoFocus) els.spellInput.focus(); }, 0);
    }
  });

  if (els.aboutBtn && els.aboutDialog) {
    els.aboutBtn.addEventListener('click', () => {
      if (typeof els.aboutDialog.showModal === 'function') els.aboutDialog.showModal();
      else els.aboutDialog.setAttribute('open', '');
    });
    els.aboutDialog.addEventListener('close', () => els.aboutBtn.focus());
  }

  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = () => { state.voice = chooseVoice(); };
    state.voice = chooseVoice();
  }

  selectLevel(state.levelKey); // don’t deal a word until Start
}

/* Level dropdown */
function buildLevelSelect(){
  els.levelSelect.innerHTML = '';
  LEVELS.forEach((lvl) => {
    const opt = document.createElement('option');
    opt.value = lvl.key; opt.textContent = lvl.name;
    if (lvl.key === state.levelKey) opt.selected = true;
    els.levelSelect.appendChild(opt);
  });
  els.levelSelect.addEventListener('change', (e) => selectLevel(e.target.value));
  applyLevelSelectColor();
}
function applyLevelSelectColor(){
  const idx = Math.max(0, LEVELS.findIndex(l => l.key === state.levelKey));
  els.levelSelect.className = 'level-select l' + (idx + 1);
}

/* Segmentation (phoneme bars) */
function chunkWord(word){
  const chunks = [];
  const lower = word.toLowerCase();
  let i = 0;
  const sorted = [...GRAPHEMES].sort((a,b)=>b.length-a.length);
  while (i < lower.length){
    let matched = null;
    for (const g of sorted){ if (lower.startsWith(g, i)){ matched = g; break; } }
    if (matched){ chunks.push(matched); i += matched.length; }
    else { chunks.push(lower[i]); i += 1; }
  }
  return chunks;
}
function renderBars(){
  els.bars.innerHTML = '';
  const chunks = state.chunks;
  const typed = state.typed;
  const target = state.word;

  let correctPrefix = 0;
  for (let i=0;i<typed.length;i++){
    if (typed[i] === target[i]) correctPrefix++;
    else break;
  }

  let offset = 0;
  for (const ch of chunks){
    const start = offset;
    const end = offset + ch.length;
    const div = document.createElement('div');
    div.className = 'bar';
    if (ch.length > 1) div.dataset.multi = 'true';
    if (correctPrefix >= end) div.classList.add('done');
    else if (correctPrefix > start) div.classList.add('active');
    els.bars.appendChild(div);
    offset = end;
  }

  // Keep overlay grid in sync with number of chunks
  els.overlay.style.setProperty('--chunk-count', String(chunks.length));
}

/* Overlay painting — one grid cell per chunk */
function renderOverlay(){
  const typed = state.typed;
  const target = state.word;
  const chunks = state.chunks;

  els.overlay.style.setProperty('--chunk-count', String(chunks.length));

  let html = '';
  let pos = 0;
  for (let ci = 0; ci < chunks.length; ci++){
    const start = pos;
    const end = start + chunks[ci].length;
    let cell = '';

    // Paint letters typed inside this chunk
    for (let i = start; i < Math.min(end, typed.length); i++){
      const good = typed[i] === target[i];
      const cls = good ? 'ok' : 'bad';  // wrong letter becomes red immediately
      cell += `<span class="${cls}">${escapeHTML(typed[i])}</span>`;
    }

    html += `<div class="cell">${cell}</div>`;
    pos = end;
  }

  els.overlay.innerHTML = html;
}

/* Status & counters */
function bindGoalNumbers(){
  els.statusLine.querySelectorAll('[data-bind]').forEach(span => {
    const k = span.getAttribute('data-bind');
    if (k === 'goalWords')   span.textContent = state.goals.words;
    if (k === 'goalErrors')  span.textContent = state.goals.errors;
    if (k === 'totalErrors') span.textContent = state.counters.totalErrors;
  });
}
function updateCountersUI(){
  els.correctCount.textContent = state.counters.correct;
  els.totalErrors.textContent = state.counters.totalErrors;
  els.errorsThisWord.textContent = state.counters.errorsThisWord;
  bindGoalNumbers();
}
function updateStatusLine(){
  const wordsReached = state.counters.correct >= state.goals.words;
  const withinErrors = state.counters.totalErrors <= state.goals.errors;
  const base = `Progress: ${state.counters.correct}/${state.goals.words} words • Errors: ${state.counters.totalErrors} (cap ≤ ${state.goals.errors})`;

  els.statusLine.textContent = wordsReached ? `✓ Task completed — ${base}` : base;

  if (wordsReached && !state.finished) finishTask();
  if (wordsReached && withinErrors && !state.taskCelebrated) {
    showToast('WELL DONE!', 1000);
    const defaults = {
      spread: 360, ticks: 50, gravity: 0, decay: 0.94, startVelocity: 30,
      shapes: ["star"], colors: ["FFE400", "FFBD00", "E89400", "FFCA6C", "FDFFB8"],
    };
    function shoot() {
      confetti({ ...defaults, particleCount: 40, scalar: 1.2, shapes: ["star"] });
      confetti({ ...defaults, particleCount: 10, scalar: 0.75, shapes: ["circle"] });
    }
    setTimeout(shoot, 0);
    setTimeout(shoot, 100);
    setTimeout(shoot, 200);
    playSuccessSound();
    state.taskCelebrated = true;
  }
}

/* Start / Reset / Finish */
function startSession(){
  if (state.started && !state.finished) return;
  resetCounters(); // keep level & goal values
  state.started = true;
  lockGoalInputs(true);
  els.playVeil.classList.add('hidden');
  els.spellInput.removeAttribute('disabled');
  newWord(true);
  setTimeout(() => els.spellInput.focus(), 0);
}
function lockGoalInputs(disabled){
  els.goalWords.disabled = disabled;
  els.goalErrors.disabled = disabled;
}
function finishTask(){
  state.finished = true;
  lockGoalInputs(false);
  els.spellInput.setAttribute('disabled','disabled');
  showScore();
}
function resetCounters(){
  state.counters.correct = 0;
  state.counters.totalErrors = 0;
  state.counters.errorsThisWord = 0;
  state.taskCelebrated = false;
  state.started = false;
  state.finished = false;

  updateCountersUI(); updateStatusLine();

  lockGoalInputs(false);

  state.typed = ''; state.locked = false; state.firstBadIndex = -1;
  els.spellInput.value = '';
  els.spellInput.setAttribute('disabled','disabled');
  renderOverlay(); renderBars();

  els.scoreCard.classList.add('hidden');
  if (state.levelKey === 'L5') els.picture.classList.remove('hidden');
  else els.picture.classList.add('hidden');
  els.playVeil.classList.remove('hidden');
}

/* Word flow */
async function newWord(autoHear = true){
  if (!state.started || state.finished) return;

  state.errorsThisWord = 0;
  state.locked = false;
  state.firstBadIndex = -1;
  state.typed = '';

  const list = WORDS[state.levelKey];
  state.word = list[Math.floor(Math.random() * list.length)].toLowerCase();
  state.chunks = chunkWord(state.word);

  els.scoreCard.classList.add('hidden');
  els.wordImg.classList.remove('hidden');
  els.spellInput.value = '';

  renderBars();
  renderOverlay();
  updateCountersUI();
  updateStatusLine();
  maybeLoadImage();

  if (autoHear) await playWordAudio(state.word, { slow: false });
}
function selectLevel(key){
  state.levelKey = key;
  applyLevelSelectColor();
  if (state.levelKey === 'L5') els.picture.classList.remove('hidden');
  else els.picture.classList.add('hidden');
}

/* Keyboard handling — F1 plays slow audio; others pass through */
function handleType(e){
  if (!state.started || state.finished) return;

  if (/^F\d{1,2}$/.test(e.key)) {
    if (e.key === 'F1') {
      e.preventDefault();
      playWordAudio(state.word, { slow: true });
    }
    return;
  }

  const isLetter = e.key.length === 1 && /^[a-z]$/i.test(e.key);
  const allowed = isLetter || e.key === 'Backspace' || e.key === 'Enter';

  if (!allowed || e.ctrlKey || e.metaKey || e.altKey) {
    e.preventDefault();
    return;
  }

  e.preventDefault();

  if (e.key === 'Enter') { playWordAudio(state.word, { slow: false }); return; }
  if (e.key === 'Backspace') {
    if (state.typed.length > 0) {
      const priorBad = state.firstBadIndex;
      state.typed = state.typed.slice(0, -1);
      if (priorBad >= state.typed.length) { state.locked = false; state.firstBadIndex = -1; }
    }
    els.spellInput.value = state.typed;
    renderOverlay(); renderBars();
    return;
  }

  // Letters
  if (isLetter) {
    if (state.locked) return;

    const ch = e.key.toLowerCase();
    state.typed += ch;
    els.spellInput.value = state.typed;

    playLetterAudio(ch);

    const idx = state.typed.length - 1;
    const good = state.word[idx] === ch;

    if (!good) {
      // Wrong letter becomes red immediately via renderOverlay();
      state.locked = true;
      state.firstBadIndex = idx;
      state.counters.totalErrors += 1;
      state.counters.errorsThisWord += 1;
      updateCountersUI();
    }

    renderOverlay();
    renderBars();

    if (!state.locked && state.typed === state.word) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      playSuccessSound();
      state.counters.correct += 1;
      updateCountersUI();
      const wordsReached = state.counters.correct >= state.goals.words;
      updateStatusLine();
      if (!wordsReached) setTimeout(() => newWord(true), 500);
    }
  }
}

/* Images & score */
function maybeLoadImage(){
  if (state.levelKey !== 'L5') return;
  const exts = ['png','jpg','jpeg','webp'];
  const base = `${GITHUB_IMG_BASE}/${state.word}`;
  const img = els.wordImg;

  let i = 0;
  const tryNext = () => {
    if (i >= exts.length) { els.picture.classList.add('hidden'); return; }
    const url = `${base}.${exts[i++]}`;
    img.onload = () => {
      els.picture.classList.remove('hidden');
      els.scoreCard.classList.add('hidden');
      els.wordImg.classList.remove('hidden');
      els.imgCaption.textContent = state.word;
      img.alt = state.word;
    };
    img.onerror = tryNext;
    img.src = url;
  };
  tryNext();
}
function showScore(){
  const errors = state.counters.totalErrors;
  const cap = state.goals.errors;
  const grade = gradeFromErrors(errors, cap);
  const msg = gradeMessage(grade);
  els.wordImg.classList.add('hidden');
  els.picture.classList.remove('hidden');
  els.scoreCard.classList.remove('hidden');
  els.scoreCard.innerHTML = `
    <div class="grade" aria-label="Grade">${grade}</div>
    <div class="meta">Errors: <strong>${errors}</strong> of allowed <strong>${cap}</strong></div>
    <div class="meta">${msg}</div>
  `;
}
function gradeFromErrors(errors, maxErrors){
  if (maxErrors <= 0) return errors === 0 ? 'A+' : 'B';
  if (errors === 0) return 'A+';
  const r = errors / maxErrors;
  if (r <= 0.20) return 'A';
  if (r <= 0.35) return 'A-';
  if (r <= 0.50) return 'B+';
  if (r <= 0.65) return 'B';
  if (r <= 0.80) return 'B-';
  if (r <= 1.00) return 'C';
  if (r <= 1.25) return 'D';
  return 'F';
}
function gradeMessage(g){
  switch(g){
    case 'A+': return 'Perfect precision and careful listening. Bravo!';
    case 'A':  return 'Excellent! Almost no mistakes.';
    case 'A-': return 'Great work—very few errors.';
    case 'B+': return 'Strong effort. Keep the focus on tricky letters.';
    case 'B':  return 'Good job. Let’s keep practicing blends and vowels.';
    case 'B-': return 'Solid progress. Slow down and listen closely.';
    case 'C':  return 'You met the goal. Try again to tighten accuracy.';
    case 'D':  return 'Almost there—take your time and use the audio hints.';
    default: return 'Let’s review and try another round!';
  }
}

/* Audio & TTS */
async function playSuccessSound(){ try { await new Audio(SUCCESS_AUDIO).play(); } catch (_) {} }
window.playSuccessSound = playSuccessSound;

async function playWordAudio(word, { slow = false } = {}){
  const file = slow ? `${WORD_AUDIO_DIR}/${word}_slow.mp3` : `${WORD_AUDIO_DIR}/${word}.mp3`;
  const exists = await audioExists(file);
  if (exists) { try { await new Audio(file).play(); return; } catch (_) {} }
  speak(word, { rate: slow ? TTS_SLOW : TTS_NORMAL });
}
async function playLetterAudio(letter){
  try {
    if (state.letterAudio) { state.letterAudio.pause(); state.letterAudio = null; }
    const file = `${LETTER_AUDIO_DIR}/${letter}.mp3`;
    if (await audioExists(file)) {
      const a = new Audio(file); state.letterAudio = a; await a.play(); return;
    }
  } catch(_) {}
  speak(letter, { rate: TTS_NORMAL });
}
async function audioExists(url){
  if (state.audioExistsMemo.has(url)) return state.audioExistsMemo.get(url);
  let ok = false;
  try { ok = (await fetch(url, { method: 'HEAD' })).ok; }
  catch { try { ok = (await fetch(url, { cache: 'no-store' })).ok; } catch { ok = false; } }
  state.audioExistsMemo.set(url, ok);
  return ok;
}
function chooseVoice(){
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices() || [];
  const preferred = [
    'Google US English','Google UK English Female','Google UK English Male',
    'Microsoft Aria','Microsoft Jenny','Microsoft Guy',
    'Jenny','Aria','Samantha','Alex','Serena','Daniel','Moira'
  ];
  for (const name of preferred) {
    const v = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
    if (v) return v;
  }
  const corp = voices.find(v => /^en(-|_)/i.test(v.lang) && /(google|microsoft)/i.test(v.name));
  if (corp) return corp;
  const en = voices.find(v => /^en(-|_)/i.test(v.lang));
  return en || voices[0] || null;
}
function speak(text, { rate = TTS_NORMAL } = {}){
  if (!('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  let voice = state.voice || chooseVoice();
  if (!voice) { setTimeout(() => speak(text, { rate }), 100); return; }
  utter.voice = voice; utter.lang = voice.lang || 'en-US';
  utter.rate = rate; utter.pitch = 1.0; utter.volume = 1.0;
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}

/* Numeric guards (two digits, numeric only) */
function attachNumericGuards(input, {min, max}){
  input.setAttribute('min', String(min));
  input.setAttribute('max', String(max));
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('pattern', '[0-9]*');
  input.addEventListener('keydown', (e) => {
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Home','End','Tab'];
    const isDigit = /^[0-9]$/.test(e.key);
    if (e.ctrlKey || e.metaKey) return;
    if (!isDigit && !allowed.includes(e.key)) e.preventDefault();
  });
  input.addEventListener('input', () => {
    let v = (input.value || '').replace(/\D+/g, '').slice(0,2);
    let n = v === '' ? '' : Number(v);
    if (n !== '') { n = clamp(n, min, max); input.value = String(n); }
    else { input.value = ''; }
  });
  input.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
}
function intOrZero(v){ const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

/* Helpers */
function escapeHTML(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function showToast(text, ms = 1000){
  els.toast.textContent = text;
  els.toast.hidden = false;
  els.toast.classList.add('show');
  setTimeout(() => {
    els.toast.classList.remove('show');
    setTimeout(() => { els.toast.hidden = true; }, 180);
  }, ms);
}
function isInteractive(el){
  if (!el || typeof el.matches !== 'function') return false;
  return el.matches('input, select, textarea, button, a, [role="button"], [contenteditable], [tabindex]:not([tabindex="-1"])');
}

/* Expose (names matter) */
window.chunkWord = chunkWord;
window.playWordAudio = playWordAudio;
window.chooseVoice = chooseVoice;
window.speak = speak;
window.newWord = newWord;
window.selectLevel = selectLevel;
window.handleType = handleType;
