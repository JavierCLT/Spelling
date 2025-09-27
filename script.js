(() => {
  'use strict';

  // -------------------- Config --------------------
  const LETTER_AUDIO_DIR = 'sounds/letter%20sounds';          // keep your folder name as-is
  const WORD_AUDIO_DIR_EN = 'sounds/word_sounds/English';     // keep your existing folder
  const SUCCESS_AUDIO = 'sounds/success.mp3';                 // optional

  const LANGS = {
    en: { label: 'English',  ttsLang: 'en-US', wordAudioDir: WORD_AUDIO_DIR_EN },
    es: { label: 'Español',  ttsLang: 'es-ES', wordAudioDir: null }  // Spanish = TTS by default
  };

  // -------------------- Teacher-curated scope --------------------
  // Keep words decodable, avoid tricky alignments (x = /ks/, qu=/kw/, silent letters, doubled letters).
  const ORIGINALS = ["apple","banana","bathroom","bedroom","car","carrot","cat","chair","chimpanzee","computer","dad","day","dog","drums","ear","fall","feet","fridge","garlic","gorilla","guitar","hand","happiness","harmonica","hawk","house","ice","jellyfish","lemon","lion","milk","mom","motorcycle","night","onion","orange","parrot","pepper","plane","potato","salt","school","spacecraft","spring","summer","table","tomato","violin","wall","water","whale","winter"];

  const WORD_SETS = {
    en: {
      week1_a:   { label: 'Week 1 – short a (CVC)', words: ['cat','mat','map','sad','bag','cap','jam','tap','pan','rag','van','fan','ham','nap','bad'] },
      week2_i:   { label: 'Week 2 – short i (CVC)', words: ['sit','sip','fin','pin','win','hit','bit','lip','kid','pig','dig','tin','wig','rib','lid'] },
      week3_o:   { label: 'Week 3 – short o (CVC)', words: ['hot','hop','mop','pot','top','log','dog','cob','rod','cop','pop','dot'] },
      week4_e:   { label: 'Week 4 – short e (CVC)', words: ['pen','ten','bed','red','hen','web','leg','jet','men','fed','beg'] },
      week5_u:   { label: 'Week 5 – short u (CVC)', words: ['sun','bug','cup','mud','rug','bus','gum','nut','hug','tub','cub'] },
      week6_mix: { label: 'Week 6 – CVC Review',    words: ['cat','sit','hot','pen','sun','map','kid','dog','bed','cup','rag','lip'] },

      digraphs1: { label: 'Digraphs 1 – sh, ch, th', words: ['ship','shop','chat','chin','thin','path','moth','shed','chop','cash'] },
      digraphs2: { label: 'Digraphs 2 – ck, ng, wh, ph', words: ['back','duck','sock','ring','sing','song','whale','whip','phone'] },
      vowels1:   { label: 'Vowel Teams – ai, ee, oa, oo', words: ['rain','tail','seed','feet','boat','goat','road','soon','moon'] },

      originals: { label: 'Originals (your list)', words: ORIGINALS }
    },

    // Spanish mode: simple CV/CVC words; no tildes/ñ to keep the keyboard simple.
    es: {
      semana1: { label: 'Semana 1 – CVC básicas', words: ['sol','pan','sal','pez','gas','tel'] },
      semana2: { label: 'Semana 2 – CV/CVC comunes', words: ['casa','pato','gato','luna','pelo','moto','taza','pipa','mesa','sapo','puma','lupa'] }
    }
  };

  // -------------------- Phoneme alignment (grapheme → phoneme) --------------------
  // Greedy grapheme units per language that generally map 1→1 to phonemes.
  const GRAPHEME_UNITS = {
    en: ['tch','igh','sh','ch','th','wh','ph','ck','ng','ai','ee','ea','oa','oo'],
    es: ['ch','ll','rr','qu','gu'] // we avoid these in sets, but rules are here
  };

  // State
  const els = {
    wordDisplay: document.getElementById('wordDisplay'),
    elkonin: document.getElementById('elkoninBoxes'),
    input: document.getElementById('wordInput'),
    overlay: document.getElementById('styledOverlay'),
    msg: document.getElementById('message'),
    counter: document.getElementById('counter'),
    streak: document.getElementById('streak'),
    image: document.getElementById('wordImage'),
    caption: document.getElementById('picCaption'),
    lang: document.getElementById('langSelect'),
    level: document.getElementById('levelSelect'),
    btnNew: document.getElementById('btnNew'),
    btnHear: document.getElementById('btnHear'),
    btnHearSlow: document.getElementById('btnHearSlow'),
    btnSegment: document.getElementById('btnSegment'),
    btnHint: document.getElementById('btnHint'),
    kb: document.getElementById('onscreenKeyboard')
  };

  let langKey = 'en';
  let levelKey = null;
  let wordsTyped = 0;
  let streak = 0;
  let currentWord = '';
  let currentChunks = []; // grapheme chunks aligned to phonemes

  // Leitner-like spaced review per language+level
  const BUCKET_WEIGHTS = [8, 4, 2, 1, 0.5];
  const storeKey = (l, lvl) => `spelling.leitner.${l}.${lvl}`;
  const loadProgress = (l, lvl) => JSON.parse(localStorage.getItem(storeKey(l, lvl)) || '{}');
  const saveProgress = (l, lvl, data) => localStorage.setItem(storeKey(l, lvl), JSON.stringify(data));
  let progress = {};

  // -------------------- Utilities --------------------
  const toLower = (s) => (s || '').toLowerCase();
  const sanitize = (s) => toLower(s).replace(/[^a-z]/g, ''); // ASCII letters only

  function speak(text, { rate = 0.95, lang = 'en-US' } = {}) {
    return new Promise((res) => {
      if (!('speechSynthesis' in window)) return res(false);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang; u.rate = rate; u.pitch = 1.0;
      u.onend = () => res(true);
      try {
        window.speechSynthesis.speak(u);
        setTimeout(() => res(true), 1200);
      } catch { res(false); }
    });
  }

  function playAudio(path, { rate = 1 } = {}) {
    return new Promise((res) => {
      const a = new Audio(path);
      a.playbackRate = rate;
      a.onended = () => res(true);
      a.onerror = () => res(false);
      a.play().catch(() => res(false));
    });
  }

  async function playWordSound(word, { slow = false } = {}) {
    const cfg = LANGS[langKey];
    let ok = false;
    if (cfg.wordAudioDir) {
      ok = await playAudio(`${cfg.wordAudioDir}/${word}.mp3`, { rate: slow ? 0.85 : 1 });
    }
    if (!ok) {
      await speak(word, { rate: slow ? 0.85 : 0.95, lang: cfg.ttsLang });
    }
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Greedy grapheme chunker → approximates 1:1 grapheme–phoneme units
  function chunkGraphemes(word, language) {
    const rules = (GRAPHEME_UNITS[language] || []).slice().sort((a,b) => b.length - a.length);
    const chunks = [];
    let i = 0;
    while (i < word.length) {
      let match = null;
      for (const g of rules) {
        if (word.startsWith(g, i)) { match = g; break; }
      }
      if (match) { chunks.push(match); i += match.length; }
      else { chunks.push(word[i]); i++; }
    }
    return chunks;
  }

  // -------------------- Rendering --------------------
  function setImage(word) {
    els.image.style.display = 'none';
    els.caption.textContent = '';
    const src = `images/${word}.png`; // optional
    els.image.onload = () => { els.image.style.display = 'block'; els.caption.textContent = word; };
    els.image.onerror = () => { els.image.style.display = 'none'; };
    els.image.src = src;
    els.image.alt = word;
  }

  function renderBoxes(chunks) {
    els.elkonin.innerHTML = '';
    chunks.forEach((_, idx) => {
      const b = document.createElement('div');
      b.className = 'box';
      b.dataset.idx = String(idx);
      b.addEventListener('click', async () => {
        // Tap a box to (try to) say that sound
        b.classList.add('active');
        await delay(180);
        b.classList.remove('active');
        await speak(chunks[idx], { lang: LANGS[langKey].ttsLang, rate: 0.9 });
      });
      els.elkonin.appendChild(b);
    });
  }

  function colorOverlay(targetWord, typed) {
    els.overlay.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < typed.length; i++) {
      const span = document.createElement('span');
      span.textContent = typed[i];
      span.className = (targetWord[i] === typed[i]) ? 'ok' : 'bad';
      frag.appendChild(span);
    }
    if (typed.length < targetWord.length) {
      const hint = document.createElement('span');
      hint.textContent = targetWord[typed.length];
      hint.className = 'next';
      frag.appendChild(hint);
    }
    els.overlay.appendChild(frag);

    // Fill boxes by grapheme chunks (phoneme alignment proxy)
    const boxes = [...els.elkonin.children];
    let cursor = 0;
    currentChunks.forEach((chunk, i) => {
      const b = boxes[i];
      const typedChunk = typed.slice(cursor, cursor + chunk.length);
      b.textContent = typedChunk;
      b.classList.remove('ok','partial');
      if (typedChunk.length === 0) {
        // empty
      } else if (typedChunk === chunk) {
        b.classList.add('ok');
      } else {
        b.classList.add('partial');
      }
      cursor += chunk.length;
    });
  }

  function updateDisplayedWord(word) {
    els.wordDisplay.textContent = '_ '.repeat(word.length).trim();
    currentChunks = chunkGraphemes(word, langKey);
    renderBoxes(currentChunks);
    els.input.value = '';
    els.overlay.innerHTML = '';
    setImage(word);
  }

  function setMessage(text = '') { els.msg.textContent = text; }
  function updateHUD() { els.counter.textContent = String(wordsTyped); els.streak.textContent = String(streak); }

  // -------------------- Word scheduling --------------------
  function pickNextWord() {
    const pool = WORD_SETS[langKey][levelKey]?.words || [];
    if (!pool.length) return '';
    const weighted = [];
    for (const w of pool) {
      const b = progress[w] ?? 0;
      const weight = BUCKET_WEIGHTS[Math.max(0, Math.min(BUCKET_WEIGHTS.length - 1, b))];
      for (let i = 0; i < Math.ceil(weight); i++) weighted.push(w);
    }
    const list = weighted.length ? weighted : pool;
    return list[Math.floor(Math.random() * list.length)];
  }
  function bumpWordBucket(word) {
    progress[word] = Math.min((progress[word] ?? 0) + 1, BUCKET_WEIGHTS.length - 1);
    saveProgress(langKey, levelKey, progress);
  }
  function resetWordBucket(word) {
    progress[word] = 0;
    saveProgress(langKey, levelKey, progress);
  }

  // -------------------- Flow --------------------
  async function newRound(skip = false) {
    currentWord = toLower(pickNextWord());
    if (!currentWord) return;
    updateDisplayedWord(currentWord);
    setMessage(skip ? 'New word!' : 'Listen and type the word.');
    await delay(80);
    await playWordSound(currentWord);
    focusInput();
  }

  function revealNextLetter() {
    const typed = sanitize(els.input.value);
    if (!currentWord || typed.length >= currentWord.length) return;
    const next = currentWord[typed.length];
    els.input.value = typed + next;
    colorOverlay(currentWord, sanitize(els.input.value));
  }

  async function handleInput() {
    const typed = sanitize(els.input.value);
    if (!currentWord) return;

    // sanitize view if user pasted or hit blocked keys
    if (els.input.value !== typed) els.input.value = typed;

    colorOverlay(currentWord, typed);

    if (typed === currentWord) {
      wordsTyped += 1;
      streak += 1;
      bumpWordBucket(currentWord);
      updateHUD();
      setMessage('Great job!');
      try { playAudio(SUCCESS_AUDIO); } catch {}
      if (window.confetti) confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
      await delay(650);
      await newRound();
      return;
    }

    if (typed.length >= currentWord.length && typed !== currentWord) {
      streak = 0;
      resetWordBucket(currentWord);
      updateHUD();
      setMessage('Close—try “Hint” or tap the sound boxes.');
    } else {
      setMessage('');
    }
  }

  // Sequentially highlight phoneme boxes and (attempt to) voice each chunk.
  async function playSegmented() {
    const boxes = [...els.elkonin.children];
    for (let i = 0, offset = 0; i < currentChunks.length; i++) {
      const ch = currentChunks[i];
      boxes[i]?.classList.add('active');
      // Prefer a quick TTS of the chunk; then a tiny pause
      await speak(ch, { lang: LANGS[langKey].ttsLang, rate: 0.9 });
      await delay(150);
      boxes[i]?.classList.remove('active');
      offset += ch.length;
    }
  }

  // -------------------- Keyboard guardrails --------------------
  function isAllowedKey(evt) {
    const k = evt.key;
    const isLetter = k.length === 1 && /^[a-zA-Z]$/.test(k);
    const isEnter = k === 'Enter';
    const isBackspace = k === 'Backspace';
    const isFKey = /^F([1-9]|1[0-2])$/.test(k);
    return isLetter || isEnter || isBackspace || isFKey;
  }

  function enforceStrictKeyboard() {
    // Block everything except letters, Enter, Backspace, F-keys (no spacebar, no digits, no punctuation)
    const guard = (e) => {
      if (!isAllowedKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        setMessage('Letters only (plus Enter/Backspace).');
      }
    };
    els.input.addEventListener('keydown', guard);
    els.input.addEventListener('beforeinput', (e) => {
      if (e.data && /[^a-zA-Z]/.test(e.data)) e.preventDefault();
    });
    els.input.addEventListener('paste', (e) => e.preventDefault());
    els.input.addEventListener('drop', (e) => e.preventDefault());
    // Also sanitize programmatic changes
    els.input.addEventListener('input', handleInput);
  }

  function focusInput() {
    // Keep focus on the input so the guardrails always apply
    if (document.activeElement !== els.input) els.input.focus({ preventScroll: true });
  }

  // -------------------- UI wiring --------------------
  function buildKeyboard() {
    const rows = 'qwertyuiop-asdfghjkl-zxcvbnm'.split('-');
    const frag = document.createDocumentFragment();

    for (const row of rows) {
      for (const ch of row) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'key';
        b.textContent = ch;
        b.setAttribute('aria-label', ch);
        b.addEventListener('click', () => {
          els.input.value = sanitize(els.input.value + ch);
          handleInput();
          focusInput();
        });
        frag.appendChild(b);
      }
    }

    const back = document.createElement('button');
    back.type = 'button'; back.className = 'key wide'; back.textContent = '⌫';
    back.setAttribute('aria-label', 'Backspace');
    back.addEventListener('click', () => {
      els.input.value = els.input.value.slice(0, -1);
      handleInput();
      focusInput();
    });
    frag.appendChild(back);

    const enter = document.createElement('button');
    enter.type = 'button'; enter.className = 'key wide'; enter.textContent = '⏎';
    enter.setAttribute('aria-label', 'Enter');
    enter.addEventListener('click', () => { els.input.blur(); setTimeout(focusInput, 0); });
    frag.appendChild(enter);

    els.kb.innerHTML = '';
    els.kb.appendChild(frag);
  }

  function populateLevels(language) {
    const select = els.level;
    const sets = WORD_SETS[language];
    select.innerHTML = '';
    Object.keys(sets).forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = sets[k].label;
      select.appendChild(opt);
    });
    // default first set per language
    levelKey = Object.keys(sets)[0];
    select.value = levelKey;
    progress = loadProgress(language, levelKey);
  }

  function wireEvents() {
    els.btnNew.addEventListener('click', () => newRound(true));
    els.btnHear.addEventListener('click', () => playWordSound(currentWord));
    els.btnHearSlow.addEventListener('click', () => playWordSound(currentWord, { slow: true }));
    els.btnSegment.addEventListener('click', playSegmented);
    els.btnHint.addEventListener('click', revealNextLetter);

    els.level.addEventListener('change', () => {
      levelKey = els.level.value;
      progress = loadProgress(langKey, levelKey);
      streak = 0;
      updateHUD();
      newRound(true);
    });

    els.lang.addEventListener('change', () => {
      langKey = els.lang.value;
      populateLevels(langKey);
      streak = 0;
      updateHUD();
      newRound(true);
    });

    // Guardrails + main input handler
    enforceStrictKeyboard();

    // Keep input focused so guardrails remain in effect
    document.addEventListener('click', () => focusInput());
  }

  // -------------------- Init --------------------
  async function init() {
    buildKeyboard();
    populateLevels(langKey);
    updateHUD();
    wireEvents();
    await newRound();
    focusInput();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
