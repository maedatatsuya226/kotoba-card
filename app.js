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
    //             / 'matching' = 線つなぎ(ことば⇔絵の対応づけ)
    mode: 'naming',
    choiceCount: 3,
    pairCount: 3,
    // 表示する文字の種類: 'default'(標準表記) | 'hiragana' | 'katakana' | 'kanji'
    script: 'default',
    // 選択モードのお題の出し方: 'text' | 'audio'(聴理解) | 'both'
    promptType: 'text',
    // 選択モード: 正解をタップした時にお題を読み上げるか (文の課題では切りたいことがある)
    correctAudio: true,
    // 選択モード: 間違えた時の音声。'prompt' = お題をもう一度 / 'chosen' = 選んだ絵のことば(訂正) / 'none'
    wrongAudio: 'prompt',
    // 呼称モードの制限時間 (秒)。0 = なし
    timeLimit: 0,
    // ならべるモード: ダミー文字の数 / 文字数(空欄)を見せるか / 出題する語の最小文字数 (0 = すべて)
    dummyCount: 2,
    lengthHint: true,
    minLength: 0,
    // 情景カードの文のレベル: 'all' | 'simple' | 'semantic' | 'reversible' | 'particle' | 'relative'
    sentenceLevel: 'all',
    // セッション内の記録 (終了画面の正答率用。保存はしない)
    session: {
      judgments: [],   // 呼称: index → true(○) / false(×) / undefined(未評価)
      firstTry: [],    // 選択・線つなぎ: 問題(組)ごとに一発正解なら true
      hintUsed: [],    // 呼称: index → ヒントを使ったら true
      timedOut: [],    // 呼称: index → 時間切れなら true
      wrongTaps: 0,    // 選択・線つなぎ: 誤答タップの総数
      errorTypes: [],  // 呼称: index → 誤りの種類 (× の時に任意で記録)
      missed: new Set(), // 選択・線つなぎ: 誤答に関わったカードid (復習用)
    },
    queue: [],
    // 選択モード: 出題ごとの選択肢カード配列 (queue と同じ並び)
    choiceSets: [],
    // 線つなぎモード: queue を組数ごとに区切った画面単位の配列
    matchChunks: [],
    index: 0,
    answerShown: false,
    hintShown: false,
  };

  // sw.js の CACHE_NAME と合わせて更新する (スタート画面に表示、更新確認用)
  const APP_VERSION = 'v37';

  const FAM_KEYS = ['high', 'mid', 'low'];
  const FAM_LABEL = { high: 'やさしい', mid: 'ふつう', low: 'むずかしい' };
  const PRESETS = {
    easy:     { high: 10, mid: 0,  low: 0 },
    balanced: { high: 4,  mid: 4,  low: 2 },
    hard:     { high: 2,  mid: 4,  low: 4 },
    clear:    { high: 0,  mid: 0,  low: 0 },
  };

  // ホームの課題プリセット。タップすると設定画面がこの初期値で開く。
  // categories: 'core' = 基本カテゴリ / 'core+action' = 基本+動作 / 配列 = そのカテゴリのみ
  // fam: 親密度の配分プリセット名。その配分を当ててから total に合わせて比例調整する
  const TASK_PRESETS = {
    'noun-naming':       { title: '名詞呼称',           mode: 'naming',   categories: 'core',        total: 10, fam: 'balanced' },
    'verb-naming':       { title: '動作呼称',           mode: 'naming',   categories: ['action'],    total: 10, fam: 'balanced' },
    'scene-description': { title: '情景説明',           mode: 'naming',   categories: ['scene'],     total: 8,  fam: 'balanced', sentenceLevel: 'all' },
    'read-select':       { title: '文字を見て絵を選ぶ', mode: 'select',   categories: 'core+action', total: 10, fam: 'balanced', promptType: 'text',  choiceCount: 3, wrongAudio: 'none' },
    'listen-select':     { title: '単語を聞いて絵を選ぶ', mode: 'select', categories: 'core+action', total: 10, fam: 'balanced', promptType: 'audio', choiceCount: 3, wrongAudio: 'prompt' },
    'sentence-select':   { title: '文を聞いて情景絵を選ぶ', mode: 'select', categories: ['scene'],   total: 8,  fam: 'balanced', promptType: 'audio', choiceCount: 2, sentenceLevel: 'all', wrongAudio: 'chosen' },
    'matching-basic':    { title: '文字と絵を線でつなぐ', mode: 'matching', categories: 'core+action', total: 9, fam: 'balanced', pairCount: 3 },
    'kana-spell':        { title: '文字チップ (文字数あり)', mode: 'spell', categories: 'core', total: 10, fam: 'balanced', dummyCount: 2, lengthHint: true,  minLength: 0 },
    'kana-spell-free':   { title: '文字チップ (文字数なし)', mode: 'spell', categories: 'core', total: 10, fam: 'balanced', dummyCount: 2, lengthHint: false, minLength: 0 },
  };
  const MODE_LABEL = { naming: '話す', select: '選ぶ', matching: 'つなぐ', spell: 'ならべる' };
  const LEVEL_LABEL = { all: 'すべて', simple: '単文', semantic: '意味', reversible: '語順', particle: '助詞', relative: '関係節' };
  const ERROR_TYPE_LABEL = {
    anomia: '喚語困難', neologism: '新造語', semantic: '語性錯語',
    phonemic: '音韻性錯語', perseveration: '保続',
  };
  const SCRIPT_LABEL = { default: '標準', hiragana: 'ひらがな', katakana: 'カタカナ', kanji: '漢字' };
  const PROMPT_LABEL = { text: '文字', audio: '音声のみ', both: '文字＋音声' };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ---- 表示文字種 ----
  function toKatakana(hira) {
    return hira.replace(/[ぁ-ゖ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) + 0x60)
    );
  }

  // 設定「文字の種類」に応じた表示用ラベルを返す。
  // 漢字表記のない語 (外来語等) は標準表記のまま
  function displayLabel(card) {
    switch (state.script) {
      case 'hiragana': return card.reading;
      case 'katakana': return toKatakana(card.reading);
      case 'kanji':    return card.kanji_label || card.japanese_label;
      default:         return card.japanese_label;
    }
  }

  // カードの絵。受動文などは能動文の絵を流用するので image で上書きできる
  function imageUrl(card) {
    return `images/${card.category}/${card.image || card.id}.png`;
  }

  // 対の絵 (選択肢に必ず混ぜるカードid)。旧 pair (単数) も受け付ける
  function pairIds(card) {
    return card.pairs || (card.pair ? [card.pair] : []);
  }

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
      updateDetailSummary();
    });
  }

  // ---- 詳細設定 (折りたたみ + 現在値の要約) ----
  function categorySummary() {
    const sel = state.selectedCategories;
    if (sel.size === 0) return 'なし';
    if (sel.size === state.categories.length) return 'すべて';
    const core = state.categories.filter((c) => c.core).map((c) => c.id);
    if (sel.size === core.length && core.every((id) => sel.has(id))) return '基本のみ';
    const names = state.categories.filter((c) => sel.has(c.id)).map((c) => c.label);
    return names.length <= 2 ? names.join('・') : `${names.length}カテゴリ`;
  }

  function updateDetailSummary() {
    const fc = state.familiarityCounts;
    const parts = [
      `課題: ${MODE_LABEL[state.mode]}`,
      `カテゴリ: ${categorySummary()}`,
      `内訳: ${fc.high}/${fc.mid}/${fc.low}`,
      `文字: ${SCRIPT_LABEL[state.script]}`,
    ];
    if (state.mode === 'naming') parts.push(`制限時間: ${state.timeLimit ? `${state.timeLimit}秒` : 'なし'}`);
    if (state.mode === 'select') {
      parts.push(`お題: ${PROMPT_LABEL[state.promptType]}`, `選択肢: ${state.choiceCount}枚`,
        `正解の音声: ${state.correctAudio ? '流す' : '流さない'}`);
    }
    if (state.mode === 'matching') parts.push(`組: ${state.pairCount}`);
    if (state.mode === 'spell') {
      parts.push(`ダミー: ${state.dummyCount}枚`, `文字数: ${state.lengthHint ? '見せる' : '見せない'}`);
      if (state.minLength) parts.push(`語の長さ: ${state.minLength}文字以上`);
    }
    if (state.selectedCategories.has('scene') && state.mode !== 'spell') {
      parts.push(`文のレベル: ${LEVEL_LABEL[state.sentenceLevel]}`);
    }
    parts.push(`出題順: ${state.shuffle ? 'ランダム' : '順番'}`);
    $('#detail-summary').textContent = parts.join(' ・ ');
  }

  function bindDetailToggle() {
    const btn = $('#detail-toggle');
    const body = $('#detail-body');
    const apply = (open) => {
      body.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      $('#setup-detail').classList.toggle('is-open', open);
    };
    // 開閉状態は端末に記憶する (患者情報ではなく表示の好みなので localStorage 可)
    let open = false;
    try { open = localStorage.getItem('kotoba-detail-open') === '1'; } catch (_) { /* noop */ }
    apply(open);
    btn.addEventListener('click', () => {
      const next = body.hidden;
      apply(next);
      try { localStorage.setItem('kotoba-detail-open', next ? '1' : '0'); } catch (_) { /* noop */ }
    });
  }

  // ---- ホームのプリセット ----
  function resolveCategories(spec) {
    const core = state.categories.filter((c) => c.core).map((c) => c.id);
    const ids = spec === 'core' ? core : spec === 'core+action' ? [...core, 'action'] : spec;
    return ids.filter((id) => state.categories.some((c) => c.id === id));
  }

  function applyTaskPreset(key) {
    const p = TASK_PRESETS[key];
    if (!p) return;
    const modeBtn = $(`.mode-select .mode-btn[data-mode="${p.mode}"]`);
    if (modeBtn) modeBtn.click();
    state.selectedCategories = new Set(resolveCategories(p.categories));
    $$('#cat-list input[type=checkbox]').forEach((cb) => {
      cb.checked = state.selectedCategories.has(cb.value);
    });
    if (p.promptType) {
      const b = $(`[data-prompt-type="${p.promptType}"]`);
      if (b) b.click();
    }
    if (p.choiceCount) {
      state.choiceCount = p.choiceCount;
      $('#choice-count-slider').value = p.choiceCount;
      $('#choice-count-value').textContent = p.choiceCount;
    }
    if (p.pairCount) {
      state.pairCount = p.pairCount;
      $('#pair-count-slider').value = p.pairCount;
      $('#pair-count-value').textContent = p.pairCount;
    }
    if (p.dummyCount) {
      state.dummyCount = p.dummyCount;
      $('#dummy-count-slider').value = p.dummyCount;
      $('#dummy-count-value').textContent = p.dummyCount;
    }
    if (p.lengthHint !== undefined) {
      const b = $(`[data-length-hint="${p.lengthHint ? 1 : 0}"]`);
      if (b) b.click();
    }
    if (p.minLength !== undefined) {
      const b = $(`[data-min-length="${p.minLength}"]`);
      if (b) b.click();
    }
    if (p.sentenceLevel) {
      const b = $(`[data-sentence-level="${p.sentenceLevel}"]`);
      if (b) b.click();
    }
    if (p.wrongAudio) {
      const b = $(`[data-wrong-audio="${p.wrongAudio}"]`);
      if (b) b.click();
    }
    // 親密度: 配分プリセットを利用可能数でクランプしてから総数に合わせる
    const avail = getAvailableByFamiliarity();
    FAM_KEYS.forEach((fam) => {
      state.familiarityCounts[fam] = Math.min(PRESETS[p.fam][fam], avail[fam]);
    });
    scaleToTotal(p.total);
    updateSummary();
    $('#setup-title').textContent = `設定 — ${p.title}`;
  }

  function bindModeButtons() {
    $$('.mode-select .mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.mode = btn.dataset.mode;
        $$('.mode-select .mode-btn').forEach((b) => {
          b.classList.toggle('is-selected', b === btn);
        });
        $('#time-limit-row').hidden = state.mode !== 'naming';
        $('#prompt-type-row').hidden = state.mode !== 'select';
        $('#wrong-audio-section').hidden = state.mode !== 'select';
        $('#correct-audio-row').hidden = state.mode !== 'select';
        $('#choice-count-row').hidden = state.mode !== 'select';
        $('#pair-count-row').hidden = state.mode !== 'matching';
        $('#dummy-count-row').hidden = state.mode !== 'spell';
        $('#length-hint-row').hidden = state.mode !== 'spell';
        $('#min-length-row').hidden = state.mode !== 'spell';
        // ならべるは出題できる語が変わる (情景を除外・語の長さ) ので利用可能数を更新
        updateSummary();
      });
    });

    $('#dummy-count-slider').addEventListener('input', (e) => {
      state.dummyCount = parseInt(e.target.value, 10);
      $('#dummy-count-value').textContent = state.dummyCount;
      updateDetailSummary();
    });

    // 汎用: data-* 属性のボタン群を排他選択にして state に反映する
    const bindOptionGroup = (attr, apply) => {
      const btns = $$(`[${attr}]`);
      btns.forEach((btn) => {
        btn.addEventListener('click', () => {
          apply(btn.getAttribute(attr));
          btns.forEach((b) => b.classList.toggle('is-selected', b === btn));
          updateDetailSummary();
        });
      });
    };
    bindOptionGroup('data-prompt-type', (v) => { state.promptType = v; });
    bindOptionGroup('data-correct-audio', (v) => { state.correctAudio = v === '1'; });
    bindOptionGroup('data-wrong-audio', (v) => { state.wrongAudio = v; });
    bindOptionGroup('data-length-hint', (v) => { state.lengthHint = v === '1'; });
    bindOptionGroup('data-min-length', (v) => { state.minLength = parseInt(v, 10) || 0; updateSummary(); });
    bindOptionGroup('data-sentence-level', (v) => { state.sentenceLevel = v; updateSummary(); });

    // 制限時間: 0〜30秒のスライダー (0 = なし)
    $('#time-limit-slider').addEventListener('input', (e) => {
      state.timeLimit = parseInt(e.target.value, 10) || 0;
      $('#time-limit-value').textContent = state.timeLimit ? `${state.timeLimit}秒` : 'なし';
      updateDetailSummary();
    });

    $('#choice-count-slider').addEventListener('input', (e) => {
      state.choiceCount = parseInt(e.target.value, 10);
      $('#choice-count-value').textContent = state.choiceCount;
      updateDetailSummary();
    });

    $('#pair-count-slider').addEventListener('input', (e) => {
      state.pairCount = parseInt(e.target.value, 10);
      $('#pair-count-value').textContent = state.pairCount;
      updateDetailSummary();
    });

    $$('.script-select [data-script]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.script = btn.dataset.script;
        $$('.script-select [data-script]').forEach((b) => {
          b.classList.toggle('is-selected', b === btn);
        });
        updateDetailSummary();
      });
    });
  }

  // そのカードを今の設定で出題できるか。
  // ならべるは文 (情景) を除外し、「語の長さ」の下限も適用する
  function cardAllowed(c) {
    if (!state.selectedCategories.has(c.category)) return false;
    if (state.mode === 'spell') {
      if (c.type === 'scene') return false;
      if (state.minLength && getCharUnits(c.reading).length < state.minLength) return false;
    }
    // 情景カードは文のレベルで絞り込める
    if (c.type === 'scene' && state.sentenceLevel !== 'all' && c.level !== state.sentenceLevel) return false;
    return true;
  }

  // 選択中カテゴリ内で親密度別に利用可能なカード数を返す
  function getAvailableByFamiliarity() {
    const result = { high: 0, mid: 0, low: 0 };
    for (const c of state.cards) {
      if (!cardAllowed(c)) continue;
      if (result[c.familiarity] !== undefined) result[c.familiarity]++;
    }
    return result;
  }

  // 選択中カテゴリ内で親密度別のカードプールを返す
  function getCandidatesByFamiliarity() {
    const result = { high: [], mid: [], low: [] };
    for (const c of state.cards) {
      if (!cardAllowed(c)) continue;
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

    // 文のレベルは情景カードを選んでいる時だけ意味を持つ
    $('#sentence-level-row').hidden = !state.selectedCategories.has('scene') || state.mode === 'spell';

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
    updateDetailSummary();
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
    beginSession(state.shuffle ? shuffleArray(picks) : picks);
  }

  // 出題する語の並びを受け取ってセッションを開始する。
  // 通常の開始 (startQuiz) と「間違えた語で もう一度」の両方から使う
  function beginSession(queue) {
    state.queue = queue;
    state.index = 0;
    state.answerShown = false;
    state.session = {
      judgments: [], firstTry: [], hintUsed: [], timedOut: [], wrongTaps: 0,
      errorTypes: [], missed: new Set(),
    };
    preloadedSrcs.clear();

    // 選択モード: 各問題の選択肢(正解+ディストラクタ)を先に決めておく
    // (先読みで次問の画像を確実にプリフェッチするため)
    state.choiceSets = state.mode === 'select'
      ? state.queue.map((card) => buildChoices(card))
      : [];

    // 線つなぎモード: queue を組数ごとの画面に区切る。
    // 1画面の組数は常に設定どおりにするため、組数で割り切れない端数の語は
    // 出題しない (例: 10語・3組 → 9語で3画面。語数が組数未満ならその語数で1画面)
    if (state.mode === 'matching') {
      // 表示上同じ文字になる語 (例: ひらがな表示の はな=花/鼻) が同一セッションに
      // 並ぶと区別できないため、先に重複を除いてから組数の倍数に切り詰める
      const seenLabels = new Set();
      state.queue = state.queue.filter((c) => {
        const label = displayLabel(c);
        if (seenLabels.has(label)) return false;
        seenLabels.add(label);
        return true;
      });
      const usable = state.queue.length >= state.pairCount
        ? Math.floor(state.queue.length / state.pairCount) * state.pairCount
        : state.queue.length;
      state.queue = state.queue.slice(0, usable);
      const chunks = [];
      for (let i = 0; i < state.queue.length; i += state.pairCount) {
        chunks.push(state.queue.slice(i, i + state.pairCount));
      }
      state.matchChunks = chunks;
    } else {
      state.matchChunks = [];
    }

    $('#progress-total').textContent = state.queue.length;
    showScreen('screen-quiz');
    renderCurrentCard();
  }

  // 選択モードの選択肢を組み立てる。ディストラクタは選択中カテゴリ全体から
  // 無作為抽出し、足りなければ全カードから補充する
  function buildChoices(target) {
    const wanted = state.choiceCount - 1;
    // 表示上同じ文字になるカード (例: ひらがな表示の はな=花/鼻) が並ぶと
    // 区別できないため除外する (漢字表示なら別の文字になるので出題可)。
    // 音声で出題する場合は読みが同じカードも同様に除外する
    const targetLabel = displayLabel(target);
    const useAudio = state.promptType !== 'text';
    // 同じ絵を使うカード (受動文と能動文など) は答えが2つになるので除外する
    const confusable = (c) =>
      displayLabel(c) === targetLabel || (useAudio && c.reading === target.reading) ||
      imageUrl(c) === imageUrl(target);
    const inScope = state.cards.filter(
      (c) => c.id !== target.id && !confusable(c) && state.selectedCategories.has(c.category)
    );
    // 情景カードに対の絵 (主語と目的語を入れ替えたもの等) があれば必ず選択肢に含める
    // (「猫が犬を追いかける」に対して「犬が猫を追いかける」= 短文理解の本命ディストラクタ)
    const pinned = pairIds(target)
      .map((id) => state.cards.find((c) => c.id === id))
      .filter((c) => c && !confusable(c))
      .slice(0, wanted);
    let distractors = pinned.concat(
      shuffleArray(inScope.filter((c) => !pinned.includes(c))).slice(0, wanted - pinned.length)
    );
    if (distractors.length < wanted) {
      const used = new Set([target.id, ...distractors.map((c) => c.id)]);
      const rest = shuffleArray(state.cards.filter((c) => !used.has(c.id) && !confusable(c)));
      distractors = distractors.concat(rest.slice(0, wanted - distractors.length));
    }
    return shuffleArray([target, ...distractors]);
  }

  function renderCurrentCard() {
    const isSelect = state.mode === 'select';
    const isMatch = state.mode === 'matching';
    const isSpell = state.mode === 'spell';

    // 線つなぎは1画面に複数語出すため「4〜6」のように語の範囲で表示する
    if (isMatch) {
      const start = state.index * state.pairCount + 1;
      const end = start + state.matchChunks[state.index].length - 1;
      $('#progress-current').textContent = start === end ? start : `${start}〜${end}`;
    } else {
      $('#progress-current').textContent = state.index + 1;
    }
    $('#card-frame').hidden = isSelect || isMatch || isSpell;
    $('#select-area').hidden = !isSelect;
    $('#match-area').hidden = !isMatch;
    $('#spell-area').hidden = !isSpell;
    $('#answer-area').hidden = true;
    $('#answer-label').textContent = '';
    $('#answer-label').classList.remove('is-hint');
    // 情景カード (type: scene) は正解が一つでないため、ヒント(モーラ○)は出さず
    // 「答えを見る」で模範文を表示する
    const isScene = !isMatch && state.queue[state.index] && state.queue[state.index].type === 'scene';
    $('#btn-hint').hidden = isSelect || isMatch || isSpell || isScene;
    $('#btn-show-answer').hidden = isSelect || isMatch;
    $('#btn-show-answer').textContent = isScene ? '模範文を見る' : '答えを見る';
    // 選択・線つなぎ・ならべるでは「次へ」を最初からグレー表示しておく。
    // 後から出現させるとフッターの高さが変わり、線つなぎの線がずれるため
    const btnNext = $('#btn-next');
    if (isSelect || isMatch || isSpell) {
      const lastIndex = (isMatch ? state.matchChunks.length : state.queue.length) - 1;
      btnNext.textContent = state.index === lastIndex ? '終了' : '次へ';
      btnNext.hidden = false;
      btnNext.disabled = true;
    } else {
      btnNext.hidden = true;
      btnNext.disabled = false;
    }
    state.answerShown = false;
    state.hintShown = false;
    $('#judge-row').hidden = true;
    $('#judge3-row').hidden = true;
    stopTimer();
    $('#timer').hidden = true; // 呼称で制限時間ありの時だけ startTimer() が表示する

    if (isMatch) {
      renderMatchQuestion(state.matchChunks[state.index]);
    } else if (isSelect) {
      renderChoiceQuestion(state.queue[state.index]);
    } else if (isSpell) {
      renderSpellQuestion(state.queue[state.index]);
    } else {
      const card = state.queue[state.index];
      const img = $('#card-image');
      img.src = imageUrl(card);
      img.alt = card.japanese_label;
      startTimer();
    }

    preloadUpcomingImages();
  }

  // ---- 制限時間 (呼称モード) ----
  // 静かに減る細いバーと残り秒数を表示し、時間切れで答えを自動表示する
  let timerId = null;
  function startTimer() {
    stopTimer();
    const timerEl = $('#timer');
    if (state.mode !== 'naming' || !state.timeLimit) {
      timerEl.hidden = true;
      return;
    }
    const total = state.timeLimit * 1000;
    const endAt = Date.now() + total;
    timerEl.hidden = false;
    timerEl.classList.remove('is-ending');
    const tick = () => {
      const remain = Math.max(0, endAt - Date.now());
      $('#timer-fill').style.width = `${(remain / total) * 100}%`;
      $('#timer-text').textContent = `残り ${Math.ceil(remain / 1000)} 秒`;
      timerEl.classList.toggle('is-ending', remain <= 3000);
      if (remain <= 0) {
        stopTimer();
        state.session.timedOut[state.index] = true;
        showAnswer();
      }
    };
    tick();
    timerId = setInterval(tick, 100);
  }

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  // 選択モード: お題のことばを表示し、絵カードをタップで選ばせる
  function renderChoiceQuestion(target) {
    // お題の出し方: 文字 / 音声のみ(聴理解: 文字は出さない) / 文字+音声
    const useText = state.promptType !== 'audio';
    const useAudio = state.promptType !== 'text';
    const promptEl = $('#select-prompt');
    promptEl.textContent = useText ? displayLabel(target) : '';
    promptEl.hidden = !useText;
    promptEl.classList.toggle('is-sentence', target.type === 'scene');
    $('#btn-select-replay').hidden = !useAudio;
    // スタート/次へのタップ起点で同期的に呼ばれるので iOS でも再生できる
    if (useAudio) speak(target);

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
      img.src = imageUrl(choice);
      img.alt = '';
      btn.appendChild(img);

      btn.addEventListener('click', () => {
        if (state.answerShown || btn.classList.contains('is-wrong')) return;
        const isCorrect = choice.id === target.id;
        // 最初のタップで正否を記録 (一発正解かどうか)
        if (state.session.firstTry[state.index] === undefined) {
          state.session.firstTry[state.index] = isCorrect;
        }
        if (isCorrect) {
          btn.classList.add('is-correct');
          grid.classList.add('is-answered');
          state.answerShown = true;
          if (state.correctAudio) speak(target);
          $('#btn-next').disabled = false;
        } else {
          btn.classList.add('is-wrong');
          state.session.wrongTaps++;
          state.session.missed.add(target.id);
          // 間違えた時の音声: お題をもう一度 (聞き直して選び直す) /
          // 選んだ絵のことば (「誰が誰に」の違いを対比させる訂正フィードバック) / なし
          const say = state.wrongAudio === 'prompt' ? target : state.wrongAudio === 'chosen' ? choice : null;
          if (say) {
            setTimeout(() => {
              if (!state.answerShown && state.queue[state.index] === target) speak(say);
            }, 400);
          }
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

  // ---- ならべるモード (文字チップ) ----
  // 絵を見て、かなチップ (正解の文字 + 似た音のダミー) を順にタップして ことばを作る。
  // 音韻性錯語 (ライオン→カイオン 等) の患者向け。判定は「文字数あり」なら
  // 空欄が埋まった時点で自動、「なし」なら「できた」ボタンで行う
  const KANA_ROWS = [
    'あいうえお', 'かきくけこ', 'がぎぐげご', 'さしすせそ', 'ざじずぜぞ', 'たちつてと', 'だぢづでど',
    'なにぬねの', 'はひふへほ', 'ばびぶべぼ', 'ぱぴぷぺぽ', 'まみむめも', 'やゆよ', 'らりるれろ', 'わをん',
  ];
  const VOICING_GROUPS = [
    ['かきくけこ', 'がぎぐげご'], ['さしすせそ', 'ざじずぜぞ'],
    ['たちつてと', 'だぢづでど'], ['はひふへほ', 'ばびぶべぼ', 'ぱぴぷぺぽ'],
  ];

  // 1ユニット (例: 'た', 'きゃ') に対して、間違えやすい似た音の候補を返す
  function similarUnits(unit) {
    const base = unit[0];
    const small = unit.slice(1);
    const out = new Set();
    // 清音・濁音・半濁音の入れ替え (か⇔が、は⇔ば⇔ぱ)
    for (const group of VOICING_GROUPS) {
      const gi = group.findIndex((row) => row.includes(base));
      if (gi < 0) continue;
      const pos = group[gi].indexOf(base);
      group.forEach((row, j) => { if (j !== gi) out.add(row[pos] + small); });
    }
    // 同じ行の別の音 (た→ち/つ/て/と)
    const row = KANA_ROWS.find((r) => r.includes(base));
    if (row) for (const ch of row) if (ch !== base) out.add(ch + small);
    // 拗音は小書き文字の入れ替え (きゃ→きゅ/きょ)
    if (small) for (const s of 'ゃゅょ') if (s !== small) out.add(base + s);
    out.delete(unit);
    return Array.from(out);
  }

  function buildDummies(targetUnits, count) {
    const targetSet = new Set(targetUnits);
    const pool = shuffleArray(targetUnits.flatMap(similarUnits)).filter((u) => !targetSet.has(u));
    const picked = [];
    for (const u of pool) {
      if (picked.length >= count) break;
      if (!picked.includes(u)) picked.push(u);
    }
    // 似た音が足りなければ (「ー」だけの語など) 任意のかなで補充
    const any = shuffleArray(KANA_ROWS.join('').split(''));
    for (const ch of any) {
      if (picked.length >= count) break;
      if (!targetSet.has(ch) && !picked.includes(ch)) picked.push(ch);
    }
    return picked;
  }

  const spellState = { target: [], answer: [], chips: [], done: false, tried: false };

  function spellDisplay(unit) {
    return state.script === 'katakana' ? toKatakana(unit) : unit;
  }

  function renderSpellQuestion(card) {
    const img = $('#spell-image');
    img.src = `images/${card.category}/${card.id}.png`;
    img.alt = '';

    spellState.target = getCharUnits(card.reading);
    spellState.answer = [];
    spellState.chips = [];
    spellState.done = false;
    spellState.tried = false;

    const chipsEl = $('#spell-chips');
    chipsEl.innerHTML = '';
    chipsEl.classList.remove('is-locked');
    const units = shuffleArray([...spellState.target, ...buildDummies(spellState.target, state.dummyCount)]);
    units.forEach((unit) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'spell-chip';
      if (unit.length > 1) btn.classList.add('is-digraph');
      btn.textContent = spellDisplay(unit);
      const chip = { unit, el: btn, used: false };
      btn.addEventListener('click', () => {
        if (spellState.done || chip.used) return;
        chip.used = true;
        btn.classList.add('is-used');
        spellState.answer.push(chip);
        renderSpellSlots();
        // 文字数あり: 埋まったら自動判定
        if (state.lengthHint && spellState.answer.length === spellState.target.length) checkSpell();
      });
      spellState.chips.push(chip);
      chipsEl.appendChild(btn);
    });

    $('#btn-spell-check').hidden = state.lengthHint;
    $('#btn-spell-undo').disabled = false;
    $('#btn-spell-check').disabled = false;
    renderSpellSlots();
  }

  function renderSpellSlots(status) {
    const slotsEl = $('#spell-slots');
    slotsEl.innerHTML = '';
    slotsEl.classList.remove('is-correct', 'is-wrong', 'is-revealed');
    if (status) slotsEl.classList.add(status);
    const n = state.lengthHint ? spellState.target.length : spellState.answer.length;
    for (let i = 0; i < n; i++) {
      const slot = document.createElement('div');
      slot.className = 'spell-slot';
      const chip = spellState.answer[i];
      if (chip) {
        slot.textContent = spellDisplay(chip.unit);
        slot.classList.add('is-filled');
        if (chip.unit.length > 1) slot.classList.add('is-digraph');
      }
      slotsEl.appendChild(slot);
    }
  }

  function undoSpell() {
    if (spellState.done) return;
    const chip = spellState.answer.pop();
    if (!chip) return;
    chip.used = false;
    chip.el.classList.remove('is-used');
    renderSpellSlots();
  }

  function checkSpell() {
    if (spellState.done || spellState.answer.length === 0) return;
    const card = state.queue[state.index];
    const answer = spellState.answer.map((c) => c.unit);
    const correct = answer.length === spellState.target.length &&
      answer.every((u, i) => u === spellState.target[i]);
    if (state.session.firstTry[state.index] === undefined) {
      state.session.firstTry[state.index] = correct;
    }
    if (correct) {
      finishSpell('is-correct');
      speak(card);
    } else {
      // 不正解: 赤く点滅させてから並べ直せるようにする
      state.session.wrongTaps++;
      state.session.missed.add(card.id);
      spellState.tried = true;
      renderSpellSlots('is-wrong');
      setTimeout(() => {
        if (spellState.done) return;
        spellState.answer.forEach((c) => { c.used = false; c.el.classList.remove('is-used'); });
        spellState.answer = [];
        renderSpellSlots();
      }, 600);
    }
  }

  // 「答えを見る」: 正解の並びを表示して次へ進めるようにする (一発正解にはならない)
  function revealSpell() {
    if (spellState.done) return;
    const card = state.queue[state.index];
    if (state.session.firstTry[state.index] === undefined) state.session.firstTry[state.index] = false;
    state.session.missed.add(card.id);
    spellState.chips.forEach((c) => { c.used = false; c.el.classList.remove('is-used'); });
    // 同じ文字が2回出る語 (例: ままごと) でも別々のチップを使う
    spellState.answer = spellState.target.map((unit) => {
      const chip = spellState.chips.find((c) => c.unit === unit && !c.used);
      if (!chip) return { unit };
      chip.used = true;
      chip.el.classList.add('is-used');
      return chip;
    });
    finishSpell('is-revealed');
    speak(card);
  }

  function finishSpell(status) {
    spellState.done = true;
    state.answerShown = true;
    renderSpellSlots(status);
    $('#spell-chips').classList.add('is-locked');
    $('#btn-spell-undo').disabled = true;
    $('#btn-spell-check').disabled = true;
    $('#btn-show-answer').hidden = true;
    $('#btn-next').disabled = false;
  }

  // ---- 線つなぎモード ----
  // ことば(左列)と絵カード(右列)を指でなぞって線でつなぐ。
  // ドラッグでもタップ→タップでもつなげる (運動麻痺のある患者への配慮)
  const matchState = {
    items: [],        // { card, side: 'word'|'pic', el, done }
    connections: [],  // { wordEl, picEl }
    pending: null,    // タップ選択中のアイテム
    wrongIds: new Set(), // この画面で誤答に関わったカードid (一発正解の判定用)
  };

  function renderMatchQuestion(chunk) {
    const wordsEl = $('#match-words');
    const picsEl = $('#match-pics');
    wordsEl.innerHTML = '';
    picsEl.innerHTML = '';
    matchState.items = [];
    matchState.connections = [];
    matchState.pending = null;
    matchState.wrongIds = new Set();
    clearMatchLines();

    // 左右で並び順を独立にシャッフル (同じ高さ同士が正解にならないように)
    shuffleArray(chunk).forEach((card) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'match-word';
      el.textContent = displayLabel(card);
      wordsEl.appendChild(el);
      addMatchItem(card, 'word', el);
    });
    shuffleArray(chunk).forEach((card) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'match-pic';
      const img = document.createElement('img');
      img.src = imageUrl(card);
      img.alt = '';
      el.appendChild(img);
      picsEl.appendChild(el);
      addMatchItem(card, 'pic', el);
    });

    sizeMatchCards();
  }

  function addMatchItem(card, side, el) {
    const item = { card, side, el, done: false };
    matchState.items.push(item);

    el.addEventListener('pointerdown', (e) => {
      if (item.done) return;
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
    });

    el.addEventListener('pointermove', (e) => {
      if (item.done) return;
      if (e.buttons === 0) return;
      drawDragLine(item, e.clientX, e.clientY);
    });

    el.addEventListener('pointerup', (e) => {
      removeDragLine();
      if (item.done) return;
      const target = matchItemFromPoint(e.clientX, e.clientY);
      if (target && target !== item && target.side !== item.side && !target.done) {
        // ドラッグで反対側のアイテムに到達 / タップ選択からの2タップ目
        attemptMatch(item, target);
      } else if (target === item) {
        // 自分の上で離した = タップ。選択→反対側タップでつなぐ
        if (matchState.pending && matchState.pending.side !== item.side) {
          attemptMatch(matchState.pending, item);
        } else {
          setMatchPending(item === matchState.pending ? null : item);
        }
      }
    });
  }

  function setMatchPending(item) {
    matchState.pending = item;
    matchState.items.forEach((it) => {
      it.el.classList.toggle('is-selected', it === item);
    });
  }

  function attemptMatch(a, b) {
    const word = a.side === 'word' ? a : b;
    const pic = a.side === 'pic' ? a : b;
    if (word.card.id === pic.card.id) {
      word.done = pic.done = true;
      word.el.classList.add('is-done');
      pic.el.classList.add('is-done');
      setMatchPending(null);
      matchState.connections.push({ wordEl: word.el, picEl: pic.el });
      // この組に誤答が絡んでいなければ一発正解
      const firstTry = !matchState.wrongIds.has(word.card.id);
      state.session.firstTry.push(firstTry);
      if (!firstTry) state.session.missed.add(word.card.id);
      redrawMatchLines();
      speak(word.card);
      if (matchState.items.every((it) => it.done)) {
        state.answerShown = true;
        $('#btn-next').disabled = false;
      }
    } else {
      // 不正解: 両方を一瞬赤くして選択解除。関わった両方の組を誤答扱いにする
      state.session.wrongTaps++;
      matchState.wrongIds.add(a.card.id);
      matchState.wrongIds.add(b.card.id);
      setMatchPending(null);
      [a.el, b.el].forEach((el) => {
        el.classList.remove('is-wrong');
        void el.offsetWidth; // アニメーション再発火
        el.classList.add('is-wrong');
        setTimeout(() => el.classList.remove('is-wrong'), 500);
      });
    }
  }

  function matchItemFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return matchState.items.find((it) => it.el === el || it.el.contains(el)) || null;
  }

  // ---- 線の描画 (SVGオーバーレイ) ----
  function matchAnchor(item) {
    const area = $('#match-area').getBoundingClientRect();
    const r = item.el.getBoundingClientRect();
    return {
      x: (item.side === 'word' ? r.right : r.left) - area.left,
      y: r.top + r.height / 2 - area.top,
    };
  }

  function svgLine(x1, y1, x2, y2, cls) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('class', cls);
    return line;
  }

  function clearMatchLines() {
    $('#match-lines').innerHTML = '';
  }

  function redrawMatchLines() {
    clearMatchLines();
    const svg = $('#match-lines');
    for (const conn of matchState.connections) {
      const w = matchAnchor({ el: conn.wordEl, side: 'word' });
      const p = matchAnchor({ el: conn.picEl, side: 'pic' });
      svg.appendChild(svgLine(w.x, w.y, p.x, p.y, 'match-line-done'));
    }
  }

  let dragLineEl = null;
  function drawDragLine(item, clientX, clientY) {
    const area = $('#match-area').getBoundingClientRect();
    const from = matchAnchor(item);
    if (!dragLineEl) {
      dragLineEl = svgLine(from.x, from.y, clientX - area.left, clientY - area.top, 'match-line-drag');
      $('#match-lines').appendChild(dragLineEl);
    } else {
      dragLineEl.setAttribute('x1', from.x);
      dragLineEl.setAttribute('y1', from.y);
      dragLineEl.setAttribute('x2', clientX - area.left);
      dragLineEl.setAttribute('y2', clientY - area.top);
    }
  }

  function removeDragLine() {
    if (dragLineEl) {
      dragLineEl.remove();
      dragLineEl = null;
    }
  }

  // 絵カードの1辺を「列の高さ / 組数」に収まるように計算する
  // (列の幅はカード自身の幅で決まるため上限に使わない。横は十分広い)
  function sizeMatchCards() {
    if ($('#match-area').hidden) return;
    const picsEl = $('#match-pics');
    const n = picsEl.children.length;
    if (n === 0) return;
    const gap = 12;
    const colH = picsEl.clientHeight;
    const size = Math.max(64, Math.floor(Math.min((colH - gap * (n - 1)) / n, 230)));
    $('#match-area').style.setProperty('--match-card-size', `${size}px`);
    redrawMatchLines();
  }
  window.addEventListener('resize', sizeMatchCards);

  // フォント読み込みやボタン表示などでレイアウトが後から微調整されると
  // 引き終わった線がずれるため、盤面のサイズ変化を監視して常に再同期する
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => sizeMatchCards());
    document.addEventListener('DOMContentLoaded', () => {
      ['#match-area', '#match-words', '#match-pics'].forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) observer.observe(el);
      });
    });
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
    const units = getCharUnits(displayLabel(card));
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
    state.session.hintUsed[state.index] = true;
  }

  // 次の2問の画像と音声をバックグラウンドで先読み (体感速度向上)
  const preloadedSrcs = new Set();
  function preloadUpcomingImages() {
    for (let i = 1; i <= 2; i++) {
      const next = state.mode === 'matching'
        ? (state.matchChunks[state.index + i] || [])[0]
        : state.queue[state.index + i];
      if (!next) break;
      // 選択モードは次問の選択肢すべて、線つなぎは次画面の組すべて、呼称は出題カードのみ
      const upcoming = state.mode === 'select'
        ? (state.choiceSets[state.index + i] || [])
        : state.mode === 'matching'
          ? state.matchChunks[state.index + i]
          : [next];
      for (const c of upcoming) {
        const imgSrc = imageUrl(c);
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
    stopTimer();
    const card = state.queue[state.index];
    $('#answer-label').textContent = displayLabel(card);
    $('#answer-label').classList.remove('is-hint');
    $('#answer-label').classList.toggle('is-sentence', card.type === 'scene');
    $('#answer-area').hidden = false;
    $('#btn-replay').hidden = false;
    $('#btn-hint').hidden = true;
    $('#btn-show-answer').hidden = true;
    $('#btn-next').hidden = false;
    // ST が評価を記録できるようにする (任意)。情景は ○/× ではなく3段階
    const isSceneCard = card.type === 'scene';
    $('#judge-row').hidden = isSceneCard;
    $('#judge3-row').hidden = !isSceneCard;
    renderJudgeButtons();

    if (state.index === state.queue.length - 1) {
      $('#btn-next').textContent = '終了';
    } else {
      $('#btn-next').textContent = '次へ';
    }

    state.answerShown = true;
    speak(card);
  }

  function setJudgment(value) {
    // 同じボタンをもう一度押したら取り消し (未評価に戻す)
    const current = state.session.judgments[state.index];
    state.session.judgments[state.index] = current === value ? undefined : value;
    renderJudgeButtons();
  }

  // 評価値: 通常カードは true(○) / false(×)、情景は 'indep' / 'cue' / 'hard'
  function renderJudgeButtons() {
    const j = state.session.judgments[state.index];
    $('#btn-judge-ok').classList.toggle('is-selected', j === true);
    $('#btn-judge-ng').classList.toggle('is-selected', j === false);
    $('#btn-judge-indep').classList.toggle('is-selected', j === 'indep');
    $('#btn-judge-cue').classList.toggle('is-selected', j === 'cue');
    $('#btn-judge-hard').classList.toggle('is-selected', j === 'hard');
    // 誤りの種類は × の時だけ記録できる
    $('#error-type-row').hidden = j !== false;
    const t = state.session.errorTypes[state.index];
    $$('[data-error-type]').forEach((b) => {
      b.classList.toggle('is-selected', b.dataset.errorType === t);
    });
  }

  function setErrorType(type) {
    const current = state.session.errorTypes[state.index];
    state.session.errorTypes[state.index] = current === type ? undefined : type;
    renderJudgeButtons();
  }

  // ---- 終了画面の付加情報: 間違えた語・復習・文字数別/カテゴリ別の内訳 ----
  // 「間違えた語」: 呼称は ×/困難/手がかりあり、選択・線つなぎは誤答に関わった語
  function missedCards() {
    const s = state.session;
    if (state.mode === 'naming') {
      return state.queue.filter((c, i) => {
        const j = s.judgments[i];
        return j === false || j === 'hard' || j === 'cue';
      });
    }
    return state.queue.filter((c) => s.missed.has(c.id));
  }

  // 分析用: 語ごとの正否 (評価されたものだけ)。情景は文なので対象外
  function scoredEntries() {
    const s = state.session;
    const entries = [];
    state.queue.forEach((card, i) => {
      if (card.type === 'scene') return;
      let ok;
      if (state.mode === 'naming') {
        if (s.judgments[i] !== true && s.judgments[i] !== false) return;
        ok = s.judgments[i] === true;
      } else if (state.mode === 'select' || state.mode === 'spell') {
        if (s.firstTry[i] === undefined) return;
        ok = s.firstTry[i] === true;
      } else {
        ok = !s.missed.has(card.id);
      }
      entries.push({ card, ok });
    });
    return entries;
  }

  function groupRate(entries, keyFn, sortKeys) {
    const groups = new Map();
    entries.forEach(({ card, ok }) => {
      const k = keyFn(card);
      const g = groups.get(k) || { ok: 0, total: 0 };
      g.total++;
      if (ok) g.ok++;
      groups.set(k, g);
    });
    return sortKeys(Array.from(groups.entries()));
  }

  function renderEndExtras() {
    const box = $('#end-extras');
    const missed = missedCards();
    const entries = scoredEntries();
    let html = '';

    if (missed.length > 0) {
      const items = missed.map((c) => {
        const i = state.queue.indexOf(c);
        const t = state.mode === 'naming' ? state.session.errorTypes[i] : undefined;
        return `<li>${displayLabel(c)}${t ? `<small>${ERROR_TYPE_LABEL[t]}</small>` : ''}</li>`;
      }).join('');
      html += `<div class="end-block"><h3 class="end-block-title">間違えた ことば (${missed.length})</h3>` +
              `<ul class="end-missed-list">${items}</ul>` +
              `<button class="btn btn-secondary btn-large" type="button" data-retry>間違えた語で もう一度</button></div>`;
    }

    if (entries.length >= 2) {
      const catLabel = (id) => (state.categories.find((c) => c.id === id) || { label: id }).label;
      const byMora = groupRate(entries, (c) => getCharUnits(c.reading).length, (a) => a.sort((x, y) => x[0] - y[0]));
      const byCat = groupRate(entries, (c) => c.category, (a) => a.sort((x, y) => y[1].total - x[1].total));
      const row = (label, groups, fmtKey) =>
        `<p class="end-analysis-row"><span class="k">${label}</span>` +
        groups.map(([k, g]) => {
          const low = g.ok < g.total;
          return `<span class="v${low ? ' is-low' : ''}">${fmtKey(k)} ${g.ok}/${g.total}</span>`;
        }).join('') + '</p>';
      html += `<div class="end-block"><h3 class="end-block-title">内訳 <span class="hint">(正答 / 出題)</span></h3>` +
              row('文字数', byMora, (k) => `${k}文字`) +
              row('カテゴリ', byCat, catLabel) + '</div>';
    }

    box.innerHTML = html;
    box.hidden = !html;
  }

  function retryMissed() {
    const cards = missedCards();
    if (cards.length === 0) return;
    beginSession(state.shuffle ? shuffleArray(cards) : cards);
  }

  function nextCard() {
    const total = state.mode === 'matching' ? state.matchChunks.length : state.queue.length;
    if (state.index >= total - 1) {
      endQuiz();
      return;
    }
    state.index += 1;
    renderCurrentCard();
  }

  function endQuiz() {
    stopTimer();
    stopSpeak();
    $('#end-count').textContent = state.queue.length;
    renderEndResults();
    renderEndExtras();
    showScreen('screen-end');
  }

  // 終了画面の正答率。セッション内の記録だけを使い、どこにも保存しない
  function renderEndResults() {
    const box = $('#end-results');
    const s = state.session;
    const pct = (num, den) => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—');
    let html = '';

    if (state.mode === 'naming') {
      // 通常カード (○/×) と情景カード (3段階) を分けて集計する
      const idx = state.queue.map((_, i) => i);
      const wordIdx = idx.filter((i) => state.queue[i].type !== 'scene');
      const sceneIdx = idx.filter((i) => state.queue[i].type === 'scene');
      const judgedWords = wordIdx.map((i) => s.judgments[i]).filter((j) => j === true || j === false);
      const judgedScenes = sceneIdx.map((i) => s.judgments[i]).filter((j) => typeof j === 'string');
      const hints = s.hintUsed.filter(Boolean).length;
      const timeouts = s.timedOut.filter(Boolean).length;

      if (judgedWords.length > 0) {
        const ok = judgedWords.filter((j) => j === true).length;
        const ng = judgedWords.length - ok;
        const unrated = wordIdx.length - judgedWords.length;
        html += `<div class="end-rate"><span class="end-rate-value">${pct(ok, judgedWords.length)}</span>` +
                `<span class="end-rate-label">正答率 (${ok} / ${judgedWords.length})</span></div>`;
        html += `<p class="end-breakdown">○ 言えた ${ok}　× 言えなかった ${ng}` +
                (unrated > 0 ? `　未評価 ${unrated}` : '') +
                `<br />ヒント使用 ${hints}` +
                (state.timeLimit ? `　時間切れ ${timeouts}` : '') + `</p>`;
      }
      if (judgedScenes.length > 0) {
        const c = { indep: 0, cue: 0, hard: 0 };
        judgedScenes.forEach((j) => { c[j]++; });
        const n = judgedScenes.length;
        const unrated = sceneIdx.length - n;
        const w = (k) => `${(c[k] / n) * 100}%`;
        html += `<div class="end-rate"><span class="end-rate-value">${c.indep}</span>` +
                `<span class="end-rate-label">/ ${n} 自立 (情景説明)</span></div>`;
        html += `<div class="end-bar3"><i class="is-indep" style="width:${w('indep')}"></i>` +
                `<i class="is-cue" style="width:${w('cue')}"></i><i class="is-hard" style="width:${w('hard')}"></i></div>`;
        html += `<p class="end-breakdown"><span class="end-legend is-indep">自立 ${c.indep}</span>` +
                `<span class="end-legend is-cue">手がかりあり ${c.cue}</span>` +
                `<span class="end-legend is-hard">困難 ${c.hard}</span>` +
                (unrated > 0 ? `　未評価 ${unrated}` : '') + `</p>`;
      }
      if (!html) {
        box.hidden = true;
        return;
      }
    } else {
      // 選択・線つなぎ: 一発正解の割合
      const total = s.firstTry.length;
      const ok = s.firstTry.filter(Boolean).length;
      if (total === 0) {
        box.hidden = true;
        return;
      }
      const unit = state.mode === 'matching' ? '組' : '問';
      html += `<div class="end-rate"><span class="end-rate-value">${pct(ok, total)}</span>` +
              `<span class="end-rate-label">正答率 (${ok} / ${total}${unit})</span></div>`;
      html += `<p class="end-breakdown">一発正解 ${ok}${unit}　やり直しあり ${total - ok}${unit}` +
              `<br />誤答タップ ${s.wrongTaps} 回</p>`;
    }
    html += '<p class="end-note">結果はこの画面を閉じると消えます (保存されません)</p>';
    box.innerHTML = html;
    box.hidden = false;
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
    // ホームの入口見出し: その課題の種類だけ切り替え、他は前回の設定のまま設定画面へ
    $$('[data-start-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const modeBtn = $(`.mode-select .mode-btn[data-mode="${btn.dataset.startMode}"]`);
        if (modeBtn) modeBtn.click();
        $('#setup-title').textContent = `設定 — ${btn.dataset.entryTitle || '出題設定'}`;
        warmUpSpeech();
        showScreen('screen-setup');
      });
    });
    // ホームの課題プリセット: その課題の初期値で設定画面へ
    $$('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyTaskPreset(btn.dataset.preset);
        warmUpSpeech();
        showScreen('screen-setup');
      });
    });
    $('#btn-setup-back').addEventListener('click', () => showScreen('screen-start'));
    $('#btn-start').addEventListener('click', () => {
      warmUpSpeech();
      startQuiz();
    });

    $('#btn-hint').addEventListener('click', showHint);
    $('#btn-show-answer').addEventListener('click', () => {
      if (state.mode === 'spell') revealSpell(); else showAnswer();
    });
    $('#btn-spell-undo').addEventListener('click', undoSpell);
    $('#btn-spell-check').addEventListener('click', checkSpell);
    $('#btn-replay').addEventListener('click', () => {
      const card = state.queue[state.index];
      if (card) speak(card);
    });
    $('#btn-select-replay').addEventListener('click', () => {
      const card = state.queue[state.index];
      if (card) speak(card);
    });
    $('#btn-judge-ok').addEventListener('click', () => setJudgment(true));
    $('#btn-judge-ng').addEventListener('click', () => setJudgment(false));
    $('#btn-judge-indep').addEventListener('click', () => setJudgment('indep'));
    $('#btn-judge-cue').addEventListener('click', () => setJudgment('cue'));
    $('#btn-judge-hard').addEventListener('click', () => setJudgment('hard'));
    $$('[data-error-type]').forEach((b) => {
      b.addEventListener('click', () => setErrorType(b.dataset.errorType));
    });
    // 終了画面の「間違えた語で もう一度」(中身は毎回生成するので委譲で受ける)
    $('#end-extras').addEventListener('click', (e) => {
      if (e.target.closest('[data-retry]')) retryMissed();
    });
    $('#btn-next').addEventListener('click', nextCard);
    $('#btn-quiz-quit').addEventListener('click', () => {
      if (confirm('セッションを中断しますか?')) {
        stopTimer();
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
    $('#app-version').textContent = APP_VERSION;
    renderCategoryList();
    bindCategoryActions();
    bindFamiliaritySliders();
    bindTotalSlider();
    bindFamiliarityPresets();
    bindShuffleToggle();
    bindModeButtons();
    bindDetailToggle();
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
