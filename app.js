(() => {
  'use strict';

  const state = {
    cards: [],
    categories: [],
    selectedCategories: new Set(),
    // 親密度ごとの出題問題数 (合計が総問題数)
    familiarityCounts: { high: 5, mid: 3, low: 2 },
    shuffle: true,
    // 課題の種類: 'naming' = 呼称(絵→ことば) / 'select' = 選択(ことば→絵)
    mode: 'naming',
    choiceCount: 3,
    queue: [],
    // 選択モード: 出題ごとの選択肢カード配列 (queue と同じ並び)
    choiceSets: [],
    index: 0,
    answerShown: false,
    hintShown: false,
  };

  const FAM_KEYS = ['high', 'mid', 'low'];
  const FAM_LABEL = { high: 'やさしい', mid: 'ふつう', low: 'むずかしい' };
  const PRESETS = {
    easy:     { high: 10, mid: 0,  low: 0 },
    balanced: { high: 4,  mid: 4,  low: 2 },
    hard:     { high: 2,  mid: 4,  low: 4 },
    clear:    { high: 0,  mid: 0,  low: 0 },
  };

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

  function bindFamiliaritySliders() {
    FAM_KEYS.forEach((fam) => {
      const slider = $(`#count-${fam}`);
      slider.addEventListener('input', (e) => {
        state.familiarityCounts[fam] = parseInt(e.target.value, 10);
        updateSummary();
      });
    });
  }

  function bindTotalSlider() {
    const slider = $('#count-total-slider');
    slider.addEventListener('input', (e) => {
      const desired = parseInt(e.target.value, 10);
      scaleToTotal(desired);
      updateSummary();
    });
  }

  // 現在の比率を保ったまま合計問題数を desiredTotal に近づける (Hamilton法)
  // 各親密度の avail 上限に達した分は他親密度に吸収させる
  function scaleToTotal(desiredTotal) {
    const avail = getAvailableByFamiliarity();
    const current = state.familiarityCounts;
    const currentTotal = current.high + current.mid + current.low;
    const totalAvail = avail.high + avail.mid + avail.low;
    const target = Math.max(0, Math.min(desiredTotal, totalAvail));

    if (target === 0) {
      state.familiarityCounts = { high: 0, mid: 0, low: 0 };
      return;
    }

    // 現在の合計が 0 の場合は high→mid→low の順に埋める
    if (currentTotal === 0) {
      let remaining = target;
      const result = { high: 0, mid: 0, low: 0 };
      for (const fam of FAM_KEYS) {
        result[fam] = Math.min(remaining, avail[fam]);
        remaining -= result[fam];
      }
      state.familiarityCounts = result;
      return;
    }

    // Hamilton法: 各親密度の理想値を計算し、floor(avail上限でクランプ) と余りを出す
    const raw = {}, floor = {}, remainder = {};
    for (const fam of FAM_KEYS) {
      raw[fam] = (current[fam] / currentTotal) * target;
      const floorRaw = Math.floor(raw[fam]);
      floor[fam] = Math.min(floorRaw, avail[fam]);
      // 上限に達していれば remainder は 0 (これ以上増やせない)
      remainder[fam] = floor[fam] < avail[fam] ? raw[fam] - floorRaw : 0;
    }
    const result = { ...floor };
    let sum = result.high + result.mid + result.low;

    // fractional part が大きい順に +1 (Hamilton の丸め分配)
    const order = FAM_KEYS.slice().sort((a, b) => remainder[b] - remainder[a]);
    for (const fam of order) {
      if (sum >= target) break;
      if (result[fam] < avail[fam]) { result[fam]++; sum++; }
    }

    // 上限で吸収しきれなかった分は、余裕のある親密度に順次流し込む
    while (sum < target) {
      let progressed = false;
      for (const fam of FAM_KEYS) {
        if (result[fam] < avail[fam]) {
          result[fam]++; sum++; progressed = true;
          if (sum >= target) break;
        }
      }
      if (!progressed) break;
    }

    state.familiarityCounts = result;
  }

  function bindFamiliarityPresets() {
    $$('[data-fam-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = PRESETS[btn.dataset.famPreset];
        if (!preset) return;
        const avail = getAvailableByFamiliarity();
        // プリセット値を利用可能数でクランプ
        FAM_KEYS.forEach((fam) => {
          state.familiarityCounts[fam] = Math.min(preset[fam], avail[fam]);
        });
        updateSummary();
      });
    });
  }

  function bindShuffleToggle() {
    $('#shuffle-toggle').addEventListener('change', (e) => {
      state.shuffle = e.target.checked;
    });
  }

  function bindModeButtons() {
    $$('.mode-select .mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.mode = btn.dataset.mode;
        $$('.mode-select .mode-btn').forEach((b) => {
          b.classList.toggle('is-selected', b === btn);
        });
        $('#choice-count-row').hidden = state.mode !== 'select';
      });
    });

    $('#choice-count-slider').addEventListener('input', (e) => {
      state.choiceCount = parseInt(e.target.value, 10);
      $('#choice-count-value').textContent = state.choiceCount;
    });
  }

  // 選択中カテゴリ内で親密度別に利用可能なカード数を返す
  function getAvailableByFamiliarity() {
    const result = { high: 0, mid: 0, low: 0 };
    for (const c of state.cards) {
      if (!state.selectedCategories.has(c.category)) continue;
      if (result[c.familiarity] !== undefined) result[c.familiarity]++;
    }
    return result;
  }

  // 選択中カテゴリ内で親密度別のカードプールを返す
  function getCandidatesByFamiliarity() {
    const result = { high: [], mid: [], low: [] };
    for (const c of state.cards) {
      if (!state.selectedCategories.has(c.category)) continue;
      if (result[c.familiarity]) result[c.familiarity].push(c);
    }
    return result;
  }

  function updateSummary() {
    const avail = getAvailableByFamiliarity();
    let total = 0;
    let totalAvail = 0;

    FAM_KEYS.forEach((fam) => {
      const max = avail[fam];
      totalAvail += max;
      const slider = $(`#count-${fam}`);
      // 現在の値を新しい最大値でクランプ
      if (state.familiarityCounts[fam] > max) state.familiarityCounts[fam] = max;
      slider.max = max;
      slider.value = state.familiarityCounts[fam];
      slider.disabled = max === 0;
      $(`#count-${fam}-value`).textContent = state.familiarityCounts[fam];
      $(`#count-${fam}-max`).textContent = max;
      slider.closest('.fam-slider').classList.toggle('is-empty', max === 0);
      total += state.familiarityCounts[fam];
    });

    // 総問題数スライダーを更新
    const totalSlider = $('#count-total-slider');
    totalSlider.max = totalAvail;
    totalSlider.value = total;
    totalSlider.disabled = totalAvail === 0;
    $('#count-total-slider-value').textContent = total;
    $('#count-total-max').textContent = totalAvail;

    const startBtn = $('#btn-start');
    const warning = $('#setup-warning');
    const anyCategory = state.selectedCategories.size > 0;

    if (!anyCategory) {
      startBtn.disabled = true;
      warning.hidden = false;
      warning.textContent = 'カテゴリを1つ以上選択してください。';
    } else if (total === 0) {
      startBtn.disabled = true;
      warning.hidden = false;
      warning.textContent = '総問題数が 0 です。スライダーで問題数を設定してください。';
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
    const candidates = getCandidatesByFamiliarity();
    const picks = [];

    // 親密度ごとに指定数だけ抽出（シャッフルON時は各プール内でシャッフル）
    FAM_KEYS.forEach((fam) => {
      const wanted = state.familiarityCounts[fam];
      if (wanted <= 0) return;
      const pool = candidates[fam];
      const ordered = state.shuffle ? shuffleArray(pool) : pool.slice();
      picks.push(...ordered.slice(0, Math.min(wanted, pool.length)));
    });

    if (picks.length === 0) return;

    // 全体をシャッフル (シャッフルOFFなら high→mid→low 順で出題)
    state.queue = state.shuffle ? shuffleArray(picks) : picks;
    state.index = 0;
    state.answerShown = false;
    preloadedSrcs.clear();

    // 選択モード: 各問題の選択肢(正解+ディストラクタ)を先に決めておく
    // (先読みで次問の画像を確実にプリフェッチするため)
    state.choiceSets = state.mode === 'select'
      ? state.queue.map((card) => buildChoices(card))
      : [];

    $('#progress-total').textContent = state.queue.length;
    showScreen('screen-quiz');
    renderCurrentCard();
  }

  // 選択モードの選択肢を組み立てる。ディストラクタは選択中カテゴリ全体から
  // 無作為抽出し、足りなければ全カードから補充する
  function buildChoices(target) {
    const wanted = state.choiceCount - 1;
    const inScope = state.cards.filter(
      (c) => c.id !== target.id && state.selectedCategories.has(c.category)
    );
    let distractors = shuffleArray(inScope).slice(0, wanted);
    if (distractors.length < wanted) {
      const used = new Set([target.id, ...distractors.map((c) => c.id)]);
      const rest = shuffleArray(state.cards.filter((c) => !used.has(c.id)));
      distractors = distractors.concat(rest.slice(0, wanted - distractors.length));
    }
    return shuffleArray([target, ...distractors]);
  }

  function renderCurrentCard() {
    const card = state.queue[state.index];
    $('#progress-current').textContent = state.index + 1;

    const isSelect = state.mode === 'select';
    $('#card-frame').hidden = isSelect;
    $('#select-area').hidden = !isSelect;
    $('#answer-area').hidden = true;
    $('#answer-label').textContent = '';
    $('#answer-label').classList.remove('is-hint');
    $('#btn-hint').hidden = isSelect;
    $('#btn-show-answer').hidden = isSelect;
    $('#btn-next').hidden = true;
    state.answerShown = false;
    state.hintShown = false;

    if (isSelect) {
      renderChoiceQuestion(card);
    } else {
      const img = $('#card-image');
      img.src = `images/${card.category}/${card.id}.png`;
      img.alt = card.japanese_label;
    }

    preloadUpcomingImages();
  }

  // 選択モード: お題のことばを表示し、絵カードをタップで選ばせる
  function renderChoiceQuestion(target) {
    $('#select-prompt').textContent = target.japanese_label;

    const grid = $('#choice-grid');
    grid.innerHTML = '';
    const choices = state.choiceSets[state.index] || [target];
    // 枚数に応じて列数を決める (4枚は2×2、9枚まで3列、それ以上は4列)
    const n = choices.length;
    const cols = n === 1 ? 1 : n === 2 ? 2 : n === 4 ? 2 : n <= 9 ? 3 : 4;
    grid.style.setProperty('--cols', cols);
    grid.style.setProperty('--rows', Math.ceil(n / cols));
    grid.classList.remove('is-answered');

    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice-card';
      const img = document.createElement('img');
      img.src = `images/${choice.category}/${choice.id}.png`;
      img.alt = '';
      btn.appendChild(img);

      btn.addEventListener('click', () => {
        if (state.answerShown || btn.classList.contains('is-wrong')) return;
        if (choice.id === target.id) {
          btn.classList.add('is-correct');
          grid.classList.add('is-answered');
          state.answerShown = true;
          speak(target);
          $('#btn-next').textContent =
            state.index === state.queue.length - 1 ? '終了' : '次へ';
          $('#btn-next').hidden = false;
        } else {
          btn.classList.add('is-wrong');
        }
      });

      grid.appendChild(btn);
    });

    sizeChoiceCards();
  }

  // グリッドの実サイズから、セルに収まる正方形のカードサイズを計算して
  // --card-size にセットする (CSS任せの自動縮小は iOS Safari で潰れるため)
  function sizeChoiceCards() {
    if ($('#select-area').hidden) return;
    const grid = $('#choice-grid');
    if (!grid.children.length) return;
    const cols = parseInt(grid.style.getPropertyValue('--cols'), 10) || 1;
    const rows = parseInt(grid.style.getPropertyValue('--rows'), 10) || 1;
    const gap = 14;
    const cellW = (grid.clientWidth - gap * (cols - 1)) / cols;
    const cellH = (grid.clientHeight - gap * (rows - 1)) / rows;
    const size = Math.max(72, Math.floor(Math.min(cellW, cellH)));
    grid.style.setProperty('--card-size', `${size}px`);
  }
  window.addEventListener('resize', sizeChoiceCards);

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

    units.forEach((unit) => {
      const span = document.createElement('span');
      span.className = 'hint-char';
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
      labelEl.appendChild(span);
    });

    $('#answer-area').hidden = false;
    $('#btn-replay').hidden = true;
    $('#btn-hint').hidden = true;
    state.hintShown = true;
  }

  // 次の2問の画像と音声をバックグラウンドで先読み (体感速度向上)
  const preloadedSrcs = new Set();
  function preloadUpcomingImages() {
    for (let i = 1; i <= 2; i++) {
      const next = state.queue[state.index + i];
      if (!next) break;
      // 選択モードは次問の選択肢すべて、呼称モードは出題カードのみ
      const upcoming = state.mode === 'select'
        ? (state.choiceSets[state.index + i] || [])
        : [next];
      for (const c of upcoming) {
        const imgSrc = `images/${c.category}/${c.id}.png`;
        if (!preloadedSrcs.has(imgSrc)) {
          preloadedSrcs.add(imgSrc);
          const img = new Image();
          img.src = imgSrc;
        }
      }
      const audioSrc = audioUrl(next);
      if (!preloadedSrcs.has(audioSrc)) {
        preloadedSrcs.add(audioSrc);
        fetch(audioSrc).catch(() => {});
      }
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
    speak(card);
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
    stopSpeak();
    $('#end-count').textContent = state.queue.length;
    showScreen('screen-end');
  }

  // ---- Audio (VOICEVOX No.7 アナウンス で事前生成した wav を再生) ----
  // 取得失敗時は Web Speech API にフォールバック
  let currentAudio = null;
  let preferredVoice = null;
  let speechWarmedUp = false;

  function audioUrl(card) {
    return `audio/${card.category}/${card.id}.wav`;
  }

  function stopSpeak() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio = null;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  function speakViaTTS(text) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 0.9;
    if (preferredVoice) u.voice = preferredVoice;
    speechSynthesis.speak(u);
  }

  function speak(card) {
    stopSpeak();
    const audio = new Audio(audioUrl(card));
    audio.preload = 'auto';
    currentAudio = audio;
    let fellBack = false;
    const fallback = () => {
      // 既に別の発話に切り替わっていればフォールバックしない（連打対応）
      if (fellBack || currentAudio !== audio) return;
      fellBack = true;
      speakViaTTS(card.reading);
    };
    audio.addEventListener('error', fallback, { once: true });
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(fallback);
  }

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

  // iOS Safari はユーザー操作起点でないと音が出ない。
  // 事前生成 wav の play() / Web Speech どちらでも同様なので、
  // 設定画面・スタート時に無音発話で TTS フォールバック側を温めておく
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
      if (card) speak(card);
    });
    $('#btn-next').addEventListener('click', nextCard);
    $('#btn-quiz-quit').addEventListener('click', () => {
      if (confirm('セッションを中断しますか?')) {
        stopSpeak();
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
    bindFamiliaritySliders();
    bindTotalSlider();
    bindFamiliarityPresets();
    bindShuffleToggle();
    bindModeButtons();
    bindNavigation();
    updateSummary();
  }

  document.addEventListener('DOMContentLoaded', init);

  // style.css の読込失敗を検知したら SW キャッシュを飛ばして再取得を試みる
  // (Critical CSS がインライン化されているので画面は動くが、装飾を復旧させる)
  function recoverStyleIfMissing() {
    if (document.documentElement.dataset.cssFailed !== '1') return;
    const bust = 'style.css?retry=' + Date.now();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = bust;
    link.onload = () => { delete document.documentElement.dataset.cssFailed; };
    document.head.appendChild(link);
  }
  window.addEventListener('load', recoverStyleIfMissing);

  // Service Worker 登録 (オフライン動作用) + 起動時の更新チェック
  // オンラインなら新バージョンを取得して自動反映、オフラインならキャッシュ済みの
  // バージョンでそのまま動く(更新チェックは黙って失敗する)
  if ('serviceWorker' in navigator) {
    // controllerchange は初回インストール時(clients.claim)にも発火するため、
    // 「既にSW管理下だったページが新SWに切り替わった」時だけリロードする
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      // 訓練中のリロードは患者の混乱を招くため、スタート画面の時だけ即反映。
      // それ以外の画面では次回起動時に新バージョンで立ち上がる
      const active = document.querySelector('.screen.is-active');
      if (!active || active.id === 'screen-start') {
        window.location.reload();
      }
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        // iPadのPWAはアプリスイッチャーに残り続けてページが再読込されないため、
        // 前面に復帰したタイミングでも更新チェックを行う
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => {});
          }
        });
      }).catch((err) => {
        console.warn('SW registration failed:', err);
      });
    });
  }
})();
