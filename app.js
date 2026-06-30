(() => {
  'use strict';

  const state = {
    cards: [],
    categories: [],
    selectedCategories: new Set(),
    selectedFamiliarities: new Set(['high', 'mid', 'low']),
    count: 10,
    shuffle: true,
    queue: [],
    index: 0,
    answerShown: false,
    hintShown: false,
  };

  const FAM_LABEL = { high: 'やさしい', mid: 'ふつう', low: 'むずかしい' };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---- Screen routing ----
  function showScreen(id) {
    $$('.screen').forEach((s) => s.classList.toggle('is-active', s.id === id));
    window.scrollTo(0, 0);
  }

  // ---- Data loading ----
  async function loadData() {
    const [cards, categories] = await Promise.all([
      fetch('data/cards.json').then((r) => r.json()),
      fetch('data/categories.json').then((r) => r.json()),
    ]);
    state.cards = cards;
    state.categories = categories;
    state.selectedCategories = new Set(categories.map((c) => c.id));
  }

  // ---- Setup screen ----
  function renderCategoryList() {
    const container = $('#cat-list');
    container.innerHTML = '';
    state.categories.forEach((cat) => {
      const count = state.cards.filter((c) => c.category === cat.id).length;
      const label = document.createElement('label');
      label.className = 'cat-item';
      label.innerHTML = `
        <input type="checkbox" value="${cat.id}" ${state.selectedCategories.has(cat.id) ? 'checked' : ''} />
        <span class="cat-label">${cat.label}</span>
        ${cat.core ? '<span class="core-badge">基本</span>' : ''}
        <span class="cat-count">${count}語</span>
      `;
      label.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) state.selectedCategories.add(cat.id);
        else state.selectedCategories.delete(cat.id);
        updateSummary();
      });
      container.appendChild(label);
    });
  }

  function bindCategoryActions() {
    $$('.cat-actions [data-cat-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.catAction;
        if (action === 'all') {
          state.selectedCategories = new Set(state.categories.map((c) => c.id));
        } else if (action === 'core') {
          state.selectedCategories = new Set(
            state.categories.filter((c) => c.core).map((c) => c.id)
          );
        } else if (action === 'clear') {
          state.selectedCategories = new Set();
        }
        $$('#cat-list input[type=checkbox]').forEach((cb) => {
          cb.checked = state.selectedCategories.has(cb.value);
        });
        updateSummary();
      });
    });
  }

  function bindFamiliarityInputs() {
    $$('#fam-list input[name=familiarity]').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        if (e.target.checked) state.selectedFamiliarities.add(e.target.value);
        else state.selectedFamiliarities.delete(e.target.value);
        updateSummary();
      });
    });
  }

  function bindSlider() {
    const slider = $('#count-slider');
    const value = $('#count-value');
    slider.addEventListener('input', (e) => {
      state.count = parseInt(e.target.value, 10);
      value.textContent = state.count;
      updateSummary();
    });
  }

  function bindShuffleToggle() {
    $('#shuffle-toggle').addEventListener('change', (e) => {
      state.shuffle = e.target.checked;
    });
  }

  function getFilteredCards() {
    return state.cards.filter(
      (c) =>
        state.selectedCategories.has(c.category) &&
        state.selectedFamiliarities.has(c.familiarity)
    );
  }

  function updateSummary() {
    const filtered = getFilteredCards();
    const available = filtered.length;
    $('#available-count').textContent = available;

    const startBtn = $('#btn-start');
    const warning = $('#setup-warning');

    if (available === 0) {
      startBtn.disabled = true;
      warning.hidden = false;
      warning.textContent = '条件に合うカードがありません。カテゴリまたは親密度を選択してください。';
    } else if (available < state.count) {
      startBtn.disabled = false;
      warning.hidden = false;
      warning.textContent = `該当語数が問題数より少ないため、${available}問出題されます。`;
    } else {
      startBtn.disabled = false;
      warning.hidden = true;
    }
  }

  // ---- Quiz logic ----
  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startQuiz() {
    const pool = getFilteredCards();
    if (pool.length === 0) return;

    const ordered = state.shuffle ? shuffleArray(pool) : pool.slice();
    state.queue = ordered.slice(0, Math.min(state.count, ordered.length));
    state.index = 0;
    state.answerShown = false;
    preloadedSrcs.clear();

    $('#progress-total').textContent = state.queue.length;
    showScreen('screen-quiz');
    renderCurrentCard();
  }

  function renderCurrentCard() {
    const card = state.queue[state.index];
    $('#progress-current').textContent = state.index + 1;

    const img = $('#card-image');
    img.src = `images/${card.category}/${card.id}.png`;
    img.alt = card.japanese_label;

    $('#answer-area').hidden = true;
    $('#answer-label').textContent = '';
    $('#answer-label').classList.remove('is-hint');
    $('#btn-hint').hidden = false;
    $('#btn-show-answer').hidden = false;
    $('#btn-next').hidden = true;
    state.answerShown = false;
    state.hintShown = false;

    preloadUpcomingImages();
  }

  // 拗音(ゃゅょ)・促音(っ)を伴うモーラを1ユニットとして文字列を分割する
  function getCharUnits(label) {
    if (!label) return [];
    const small = /[ゃゅょぁぃぅぇぉっャュョァィゥェォッ]/;
    const units = [];
    let i = 0;
    while (i < label.length) {
      if (i + 1 < label.length && small.test(label[i + 1])) {
        units.push(label.slice(i, i + 2));
        i += 2;
      } else {
        units.push(label[i]);
        i++;
      }
    }
    return units;
  }

  function showHint() {
    if (state.answerShown || state.hintShown) return;
    const card = state.queue[state.index];
    const units = getCharUnits(card.japanese_label);
    if (units.length === 0) return;

    const labelEl = $('#answer-label');
    labelEl.textContent = '';
    labelEl.classList.add('is-hint');

    units.forEach((unit, idx) => {
      const span = document.createElement('span');
      span.className = 'hint-char';
      if (idx === 0) {
        span.textContent = unit;
        span.classList.add('revealed');
      } else {
        span.textContent = '〇';
        span.classList.add('masked');
        span.setAttribute('role', 'button');
        span.setAttribute('aria-label', 'タップして開く');
        span.addEventListener('click', () => {
          if (!span.classList.contains('masked')) return;
          span.textContent = unit;
          span.classList.remove('masked');
          span.classList.add('revealed');
          span.removeAttribute('role');
          span.removeAttribute('aria-label');
        });
      }
      labelEl.appendChild(span);
    });

    $('#answer-area').hidden = false;
    $('#btn-replay').hidden = true;
    $('#btn-hint').hidden = true;
    state.hintShown = true;
  }

  // 次の2問の画像をバックグラウンドで先読み (体感速度向上)
  const preloadedSrcs = new Set();
  function preloadUpcomingImages() {
    for (let i = 1; i <= 2; i++) {
      const next = state.queue[state.index + i];
      if (!next) break;
      const src = `images/${next.category}/${next.id}.png`;
      if (preloadedSrcs.has(src)) continue;
      preloadedSrcs.add(src);
      const img = new Image();
      img.src = src;
    }
  }

  function showAnswer() {
    if (state.answerShown) return;
    const card = state.queue[state.index];
    $('#answer-label').textContent = card.japanese_label;
    $('#answer-label').classList.remove('is-hint');
    $('#answer-area').hidden = false;
    $('#btn-replay').hidden = false;
    $('#btn-hint').hidden = true;
    $('#btn-show-answer').hidden = true;
    $('#btn-next').hidden = false;

    if (state.index === state.queue.length - 1) {
      $('#btn-next').textContent = '終了';
    } else {
      $('#btn-next').textContent = '次へ';
    }

    state.answerShown = true;
    speak(card.reading);
  }

  function nextCard() {
    if (state.index >= state.queue.length - 1) {
      endQuiz();
      return;
    }
    state.index += 1;
    renderCurrentCard();
  }

  function endQuiz() {
    speechSynthesis.cancel();
    $('#end-count').textContent = state.queue.length;
    showScreen('screen-end');
  }

  // ---- TTS ----
  let preferredVoice = null;
  let speechWarmedUp = false;

  function pickBestVoice(voices) {
    const ja = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('ja'));
    if (ja.length === 0) return null;

    // 1. iOS の Enhanced/Premium 版（Kyoko Enhanced 等）が最も自然
    const enhanced = ja.find((v) => /enhanced|premium|拡張/i.test(v.name));
    if (enhanced) return enhanced;

    // 2. Windows の Online/Natural/Neural 系（Microsoft Nanami Online 等）
    const cloudHq = ja.find((v) => /online|natural|neural/i.test(v.name));
    if (cloudHq) return cloudHq;

    // 3. 既知の自然な OS 標準ボイス（女性優先）
    const priorityNames = ['Kyoko', 'Nanami', 'Aoi', 'Mayu', 'Haruka', 'Otoya', 'Google 日本語', 'Google Japanese'];
    for (const name of priorityNames) {
      const found = ja.find((v) => v.name.includes(name));
      if (found) return found;
    }

    // 4. ローカル(端末内蔵)を優先
    const local = ja.find((v) => v.localService);
    return local || ja[0];
  }

  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    preferredVoice = pickBestVoice(voices);
  }
  if (typeof speechSynthesis !== 'undefined') {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  // iOS Safari は最初の speak() が無音になることがあるため、
  // ユーザー操作時に無音発話で初期化しておく
  function warmUpSpeech() {
    if (speechWarmedUp || !('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.lang = 'ja-JP';
      u.volume = 0;
      speechSynthesis.speak(u);
      speechWarmedUp = true;
    } catch (_) { /* noop */ }
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 0.9;
    if (preferredVoice) u.voice = preferredVoice;
    speechSynthesis.speak(u);
  }

  // ---- Navigation bindings ----
  function bindNavigation() {
    $('#btn-go-setup').addEventListener('click', () => {
      warmUpSpeech();
      showScreen('screen-setup');
    });
    $('#btn-setup-back').addEventListener('click', () => showScreen('screen-start'));
    $('#btn-start').addEventListener('click', () => {
      warmUpSpeech();
      startQuiz();
    });

    $('#btn-hint').addEventListener('click', showHint);
    $('#btn-show-answer').addEventListener('click', showAnswer);
    $('#btn-replay').addEventListener('click', () => {
      const card = state.queue[state.index];
      if (card) speak(card.reading);
    });
    $('#btn-next').addEventListener('click', nextCard);
    $('#btn-quiz-quit').addEventListener('click', () => {
      if (confirm('セッションを中断しますか?')) {
        speechSynthesis.cancel();
        showScreen('screen-setup');
      }
    });

    $('#btn-again').addEventListener('click', () => showScreen('screen-setup'));
    $('#btn-home').addEventListener('click', () => showScreen('screen-start'));
  }

  // ---- Init ----
  async function init() {
    try {
      await loadData();
    } catch (err) {
      document.body.innerHTML =
        '<div style="padding:40px;text-align:center;color:#b91c1c">' +
        'データの読み込みに失敗しました。<br /><small>' + err.message + '</small></div>';
      return;
    }
    renderCategoryList();
    bindCategoryActions();
    bindFamiliarityInputs();
    bindSlider();
    bindShuffleToggle();
    bindNavigation();
    updateSummary();
  }

  document.addEventListener('DOMContentLoaded', init);

  // Service Worker 登録 (オフライン動作用)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
      });
    });
  }
})();
