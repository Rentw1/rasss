(() => {
  "use strict";

  const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const INTERVALS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];
  const P_BY_BOX = [0.5, 0.72, 0.88, 0.94, 0.97, 0.985, 0.993];
  const TOPIC_ORDER = [
    "Общие положения", "Дорожные знаки", "Дорожная разметка", "Сигналы светофора и регулировщика",
    "Начало движения, маневрирование", "Расположение транспортных средств на проезжей части", "Скорость движения",
    "Обгон, опережение, встречный разъезд", "Остановка и стоянка", "Проезд перекрестков",
    "Пешеходные переходы и места остановок маршрутных транспортных средств", "Движение через железнодорожные пути",
    "Движение по автомагистралям", "Движение в жилых зонах", "Приоритет маршрутных транспортных средств",
    "Пользование внешними световыми приборами и звуковыми сигналами", "Применение специальных сигналов",
    "Применение аварийной сигнализации и знака аварийной остановки", "Буксировка механических транспортных средств",
    "Учебная езда и дополнительные требования к движению велосипедистов", "Перевозка людей и грузов",
    "Общие обязанности водителей", "Неисправности и условия допуска транспортных средств к эксплуатации",
    "Безопасность движения и техника управления автомобилем", "Оказание доврачебной медицинской помощи",
    "Ответственность водителя",
  ];
  const CAT_LABEL = { ab: "A B M", cd: "C D" };

  /* ---------- storage ---------- */
  const mem = {};
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem("pdd1." + key);
        if (raw != null) return JSON.parse(raw);
      } catch (e) { /* storage unavailable */ }
      return key in mem ? mem[key] : fallback;
    },
    set(key, value) {
      mem[key] = value;
      try { localStorage.setItem("pdd1." + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    del(key) {
      delete mem[key];
      try { localStorage.removeItem("pdd1." + key); } catch (e) { /* ignore */ }
    },
  };

  const DEFAULT_SET = {
    cat: "ab", newPer: 20, shuffle: false, examHints: false, autoNext: true,
    speakAuto: false, rate: 1.05, theme: "auto", examDate: "",
    goal: 60, sound: true, errorless: true,
  };
  const S = {
    set: Object.assign({}, DEFAULT_SET, store.get("set", {})),
    prog: store.get("prog", {}),
    stats: store.get("stats", { days: {} }),
    exams: store.get("exams", []),
    mar: store.get("mar", {}),
    game: Object.assign({ xp: 0, ach: {}, best: {} }, store.get("game", {})),
    data: {},
    refs: {},
    view: { name: "home" },
  };
  let saveTimer = 0;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    store.set("prog", S.prog);
    store.set("stats", S.stats);
    store.set("exams", S.exams.slice(-200));
    store.set("mar", S.mar);
    store.set("game", S.game);
  }
  function saveSet() { store.set("set", S.set); }
  window.addEventListener("pagehide", saveNow);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveNow(); });

  /* ---------- utils ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => dayKey(Date.now());
  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  const toastQ = [];
  let toastBusy = false;
  function toast(text, kind = "") {
    if (toastQ.length > 3) toastQ.shift();
    toastQ.push({ text, kind });
    if (!toastBusy) nextToast();
  }
  function nextToast() {
    const t = toastQ.shift();
    if (!t) { toastBusy = false; return; }
    toastBusy = true;
    const el = document.createElement("div");
    el.className = "toast " + t.kind;
    el.setAttribute("role", "status");
    el.textContent = t.text;
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); nextToast(); }, t.kind ? 2800 : 1900);
  }
  function fmtTip(tip) {
    let h = esc(tip);
    h = h.replace(/(\d+(?:[,.]\d+)?(?:\s?[–-]\s?\d+(?:[,.]\d+)?)?\s?(?:км\/ч|км\/час|мг\/л|мм|метр[а-яё]*|м|градус[а-яё]*|°|минут[а-яё]*|час[а-яё]*|суток|лет|года?|т|кг|миллиграмм[а-яё]*))(?![а-яёА-ЯЁ\w])/g, "<mark>$1</mark>");
    h = h.replace(/\(([^()]*?(?:ПДД|Пункт|пункт|КоАП|Перечн|положени|Дорожные знаки|Статья|ст\.)[^()]*)\)/g, '<span class="rule">($1)</span>');
    return h;
  }

  /* ---------- data ---------- */
  async function fetchJSON(url) {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(url + ": HTTP " + res.status);
    return res.json();
  }
  async function loadCat(cat) {
    if (S.data[cat]) return S.data[cat];
    const raw = await fetchJSON(`data/${cat}/q.json`);
    const topicRank = (name) => {
      const i = TOPIC_ORDER.indexOf(name);
      return i < 0 ? 99 : i;
    };
    const qs = raw.q.map((q, i) => Object.assign(q, { i, cat }));
    const byTicket = Array.from({ length: 41 }, () => []);
    qs.forEach((q) => byTicket[q.t].push(q));
    const seen = new Set();
    const unique = [];
    qs.forEach((q) => { if (!seen.has(q.id)) { seen.add(q.id); unique.push(q); } });
    const topics = raw.topics.map((name, ti) => ({
      name, ti, rank: topicRank(name),
      qs: unique.filter((q) => q.tp.includes(ti)),
    })).sort((a, b) => a.rank - b.rank || b.qs.length - a.qs.length);
    const learnOrder = unique.slice().sort((a, b) => {
      const ra = topicRank(raw.topics[a.tp[0]]), rb = topicRank(raw.topics[b.tp[0]]);
      return ra - rb || a.t - b.t || a.n - b.n;
    });
    S.data[cat] = { cat, qs, byTicket, unique, topics, topicNames: raw.topics, learnOrder, imgChunks: {} };
    return S.data[cat];
  }
  const D = () => S.data[S.set.cat];

  function imgChunk(cat, ticket) {
    const d = S.data[cat];
    if (!d.imgChunks[ticket]) {
      d.imgChunks[ticket] = fetchJSON(`data/${cat}/img/${String(ticket).padStart(2, "0")}.json`).catch((e) => {
        delete d.imgChunks[ticket];
        throw e;
      });
    }
    return d.imgChunks[ticket];
  }
  function fillImages(root = document) {
    root.querySelectorAll("[data-img]").forEach((box) => {
      const [cat, t, h] = box.dataset.img.split("|");
      box.removeAttribute("data-img");
      imgChunk(cat, +t).then((chunk) => {
        const src = chunk[h];
        if (!src) { box.textContent = "Картинка не найдена"; return; }
        const img = new Image();
        img.alt = "Иллюстрация к вопросу";
        img.decoding = "async";
        img.src = src;
        box.classList.remove("ph");
        box.replaceChildren(img);
      }).catch(() => { box.textContent = "Не удалось загрузить картинку. Проверьте интернет."; });
    });
  }
  function imgBox(q, cls = "qimg") {
    if (!q.img) return "";
    return `<div class="${cls} ph" data-img="${q.cat}|${q.t}|${q.img}">Загрузка картинки…</div>`;
  }
  async function loadRef(name) {
    if (!S.refs[name]) S.refs[name] = await fetchJSON(`data/${name}.json`);
    return S.refs[name];
  }

  /* ---------- progress / SRS ---------- */
  const P = (q) => S.prog[q.id];
  const box = (q) => (S.prog[q.id] ? S.prog[q.id].b : -1);
  function touchDay(field, inc = 1) {
    const k = today();
    const d = S.stats.days[k] || (S.stats.days[k] = { a: 0, ok: 0, n: 0 });
    d[field] = (d[field] || 0) + inc;
  }
  function grade(q, ok) {
    const now = Date.now();
    const prev = S.prog[q.id] ? Object.assign({}, S.prog[q.id]) : null;
    const p = S.prog[q.id] || { b: 0, d: 0, r: 0, w: 0, l: 0 };
    const isNew = !prev;
    if (ok) {
      p.r++;
      if (isNew || p.b === 0) p.b = 2;
      else if (p.d <= now) p.b = Math.min(6, p.b + 1);
    } else {
      p.w++;
      p.b = 1;
      p.lw = now;
    }
    p.d = now + capInterval(INTERVALS[p.b]);
    p.l = now;
    S.prog[q.id] = p;
    touchDay("a");
    if (ok) touchDay("ok");
    if (isNew) touchDay("n");
    saveSoon();
    return { prev, isNew };
  }
  function undoGrade(q, snap) {
    if (snap.prev) S.prog[q.id] = snap.prev;
    else delete S.prog[q.id];
    const d = S.stats.days[today()];
    if (d) {
      d.a = Math.max(0, d.a - 1);
      d.ok = Math.max(0, d.ok - 1);
      if (snap.isNew) d.n = Math.max(0, d.n - 1);
    }
  }
  function daysLeft() {
    if (!S.set.examDate) return null;
    const t = new Date(S.set.examDate + "T09:00:00").getTime();
    if (!isFinite(t)) return null;
    return Math.ceil((t - Date.now()) / DAY);
  }
  function capInterval(ms) {
    const left = daysLeft();
    if (left == null || left <= 0 || ms < DAY) return ms;
    return Math.max(DAY, Math.min(ms, Math.floor(left / 2) * DAY));
  }
  function dueList(d) {
    const now = Date.now();
    return d.unique.filter((q) => { const p = P(q); return p && p.d <= now; })
      .sort((a, b) => P(a).b - P(b).b || P(a).d - P(b).d);
  }
  const newList = (d) => d.learnOrder.filter((q) => !P(q));
  const mistakesList = (d) => d.unique.filter((q) => { const p = P(q); return p && p.w > 0 && p.b < 3; })
    .sort((a, b) => P(b).w - P(a).w || P(a).b - P(b).b);
  function ticketLevel(qs) {
    let seen = 0, known = 0, solid = 0, errs = 0;
    qs.forEach((q) => {
      const b = box(q);
      if (b >= 0) seen++;
      if (b === 1) errs++;
      if (b >= 2) known++;
      if (b >= 4) solid++;
    });
    const n = qs.length || 1;
    if (!seen) return 0;
    if (solid / n >= 0.9) return 4;
    if (known / n >= 0.9) return 3;
    if (errs && known / n < 0.7) return 1;
    return 2;
  }
  function passChance(d, runs = 700) {
    const pq = (q) => P_BY_BOX[Math.max(0, box(q))] ?? 0.5;
    let pass = 0;
    for (let r = 0; r < runs; r++) {
      const t = 1 + Math.floor(Math.random() * 40);
      const qs = d.byTicket[t];
      const blockErr = [0, 0, 0, 0];
      let total = 0;
      for (let i = 0; i < 20; i++) if (Math.random() > pq(qs[i])) { blockErr[Math.floor(i / 5)]++; total++; }
      if (total > 2 || blockErr.some((e) => e > 1)) continue;
      let ok = true;
      for (let b = 0; b < 4 && ok; b++) {
        if (!blockErr[b]) continue;
        let t2 = 1 + Math.floor(Math.random() * 40);
        if (t2 === t) t2 = (t2 % 40) + 1;
        for (let i = b * 5; i < b * 5 + 5; i++) if (Math.random() > pq(d.byTicket[t2][i])) { ok = false; break; }
      }
      if (ok) pass++;
    }
    return pass / runs;
  }
  function streak() {
    let n = 0;
    const d = new Date();
    if (!S.stats.days[dayKey(d.getTime())]) d.setDate(d.getDate() - 1);
    while (S.stats.days[dayKey(d.getTime())]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ---------- game: XP, ranks, achievements, sound, confetti ---------- */
  const RANKS = [
    [0, "Пешеход"], [150, "Ученик автошколы"], [500, "Стажёр"], [1200, "Новичок за рулём"], [2500, "Водитель"],
    [4500, "Уверенный водитель"], [7500, "Опытный водитель"], [12000, "Профи"], [18000, "Инструктор"], [26000, "Экзаменатор ГИБДД"],
  ];
  function rankOf(xp) {
    let i = 0;
    while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
    return { i, lvl: i + 1, name: RANKS[i][1], from: RANKS[i][0], to: RANKS[i + 1] ? RANKS[i + 1][0] : null };
  }
  function addXP(n, R) {
    const before = rankOf(S.game.xp).i;
    S.game.xp += n;
    if (R) R.xp = (R.xp || 0) + n;
    const after = rankOf(S.game.xp);
    if (after.i > before) {
      toast(`Новый ранг: ${after.name}`, "ach");
      beep("pass");
      celebrate();
    }
  }
  const totalAnswers = () => Object.values(S.stats.days).reduce((a, d) => a + (d.a || 0), 0);
  function knownShare() {
    const d = D();
    if (!d) return 0;
    let k = 0;
    d.unique.forEach((q) => { if (box(q) >= 2) k++; });
    return k / d.unique.length;
  }
  const ACH = [
    { id: "first", t: "Первый шаг", d: "Ответить на первый вопрос", ok: () => totalAnswers() >= 1 },
    { id: "a100", t: "Сотня", d: "100 ответов", ok: () => totalAnswers() >= 100 },
    { id: "a500", t: "Пятьсот", d: "500 ответов", ok: () => totalAnswers() >= 500 },
    { id: "a2000", t: "Железная задница", d: "2000 ответов", ok: () => totalAnswers() >= 2000 },
    { id: "goal", t: "Норма дня", d: "Выполнить дневную цель", ok: () => ((S.stats.days[today()] || {}).a || 0) >= S.set.goal },
    { id: "streak3", t: "Три дня подряд", d: "Заниматься 3 дня без пропуска", ok: () => streak() >= 3 },
    { id: "streak7", t: "Неделя за рулём", d: "Заниматься 7 дней без пропуска", ok: () => streak() >= 7 },
    { id: "combo10", t: "Комбо ×10", d: "10 верных ответов подряд", ok: () => (S.game.best.combo || 0) >= 10 },
    { id: "combo30", t: "Неудержимый", d: "30 верных ответов подряд", ok: () => (S.game.best.combo || 0) >= 30 },
    { id: "topic", t: "Тема закрыта", d: "Выучить все вопросы одной темы", ok: () => D() && D().topics.some((tp) => tp.qs.every((q) => box(q) >= 2)) },
    { id: "half", t: "Половина пути", d: "Выучить 50% вопросов", ok: () => knownShare() >= 0.5 },
    { id: "all", t: "Все 800", d: "Выучить все вопросы категории", ok: () => knownShare() >= 1 },
    { id: "exam1", t: "Первый зачёт", d: "Сдать экзамен", ok: () => S.exams.some((e) => e.ok) },
    { id: "perfect", t: "Чистый лист", d: "Сдать экзамен без единой ошибки", ok: () => S.exams.some((e) => e.ok && !e.err) },
    { id: "fast", t: "Молния", d: "Экзамен без ошибок быстрее 5 минут", ok: () => S.exams.some((e) => e.ok && !e.err && e.sec < 300) },
    { id: "row5", t: "Готов к ГИБДД", d: "5 экзаменов подряд сданы", ok: () => S.exams.length >= 5 && S.exams.slice(-5).every((e) => e.ok) },
    { id: "t40", t: "Все 40 билетов", d: "Сдать экзамен по каждому билету", ok: () => new Set(S.exams.filter((e) => e.ok && e.cat === S.set.cat).map((e) => e.t)).size >= 40 },
    { id: "signs", t: "Знаток знаков", d: "20 из 20 в тренажёре знаков", ok: () => (S.game.best.signs || 0) >= 20 },
    { id: "blitz15", t: "Блиц", d: "15 очков в блице", ok: () => (S.game.best.blitz || 0) >= 15 },
    { id: "blitz30", t: "Реакция пилота", d: "30 очков в блице", ok: () => (S.game.best.blitz || 0) >= 30 },
  ];
  function checkAch() {
    let any = false;
    ACH.forEach((a) => {
      if (S.game.ach[a.id]) return;
      let ok = false;
      try { ok = a.ok(); } catch (e) { ok = false; }
      if (ok) {
        S.game.ach[a.id] = Date.now();
        S.game.xp += 50;
        toast(`Достижение: ${a.t} · +50 XP`, "ach");
        any = true;
      }
    });
    if (any) { beep("ach"); saveSoon(); }
  }
  let actx = null;
  function beep(kind) {
    if (!S.set.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      if (actx.state === "suspended") actx.resume();
      const seq = { ok: [[660, 0.06], [990, 0.09]], no: [[196, 0.18]], ach: [[523, 0.08], [659, 0.08], [784, 0.16]], pass: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.25]] }[kind];
      if (!seq) return;
      let t = actx.currentTime + 0.01;
      seq.forEach(([f, dur]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = kind === "no" ? "triangle" : "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(actx.destination);
        o.start(t);
        o.stop(t + dur + 0.03);
        t += dur;
      });
    } catch (e) { /* audio unavailable */ }
  }
  function celebrate() {
    try { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch (e) { /* ignore */ }
    const c = document.createElement("canvas");
    c.className = "confetti";
    c.setAttribute("aria-hidden", "true");
    document.body.appendChild(c);
    const w = c.width = innerWidth, h = c.height = innerHeight;
    const ctx = c.getContext("2d");
    const colors = ["#d0202e", "#1457b4", "#f2b705", "#11804a", "#ffffff"];
    const parts = Array.from({ length: 140 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: pick(colors),
    }));
    const t0 = performance.now();
    (function frame(now) {
      const k = (now - t0) / 1800;
      ctx.clearRect(0, 0, w, h);
      parts.forEach((p) => {
        p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.globalAlpha = Math.max(0, 1 - k); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      });
      if (k < 1) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  /* ---------- speech ---------- */
  const tts = {
    ok: typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined",
    voice: null,
    pickVoice() {
      if (!this.ok) return;
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find((v) => /^ru/i.test(v.lang) && /google|milena|yandex|natural/i.test(v.name)) || vs.find((v) => /^ru/i.test(v.lang)) || null;
    },
    speak(text, onend) {
      if (!this.ok) { if (onend) onend(false); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ru-RU";
      if (this.voice) u.voice = this.voice;
      u.rate = +S.set.rate || 1;
      u.onend = () => onend && onend(true);
      u.onerror = () => onend && onend(false);
      speechSynthesis.speak(u);
    },
    stop() { if (this.ok) speechSynthesis.cancel(); },
  };
  if (tts.ok) {
    tts.pickVoice();
    speechSynthesis.onvoiceschanged = () => tts.pickVoice();
  }
  const clean = (s) => String(s).replace(/\(.*?ПДД.*?\)/g, "").replace(/«|»/g, "");
  const qSpeech = (q) => `${q.q}. ${q.a.map((a, i) => `${i + 1}: ${a}`).join(". ")}.`;
  const aSpeech = (q) => `Правильный ответ ${q.c + 1}: ${q.a[q.c]}. ${clean(q.tip)}`;

  /* ---------- theme ---------- */
  function applyTheme() {
    const root = document.documentElement;
    if (S.set.theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = S.set.theme;
  }

  /* ---------- navigation ---------- */
  let timerId = 0;
  function go(view) {
    tts.stop();
    clearInterval(timerId);
    if (S.view.player) S.view.player.playing = false;
    S.view = view;
    render();
    window.scrollTo(0, 0);
  }
  const app = () => $("#app");

  function render() {
    const v = S.view;
    renderBar();
    const fn = VIEWS[v.name] || VIEWS.home;
    try { fn(v); } catch (e) {
      console.error(e);
      app().innerHTML = `<div class="card stack"><h2>Что-то пошло не так</h2><p class="muted">${esc(e.message)}</p><button class="btn primary" data-act="home">На главную</button></div>`;
    }
    fillImages(app());
  }

  function renderBar() {
    $("#bar").innerHTML = `<div class="bar-in">
      <button class="brand" data-act="home" aria-label="На главную">
        <svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 37 34H3Z" fill="#fff" stroke="#d0202e" stroke-width="4" stroke-linejoin="round"/><path d="M20 15v9" stroke="#111" stroke-width="3.4" stroke-linecap="round"/><circle cx="20" cy="29" r="2" fill="#111"/></svg>
        <span class="brand-name">Билеты ПДД</span>
      </button>
      <span class="bar-sp"></span>
      <button class="lvl" data-act="achievements" aria-label="Ранг и достижения"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-6 1-9.5Z" fill="#f28a05"/></svg><b class="num">${streak()}</b><span class="lvl-n">Ур. ${rankOf(S.game.xp).lvl}</span></button>
      <div class="seg" role="group" aria-label="Категория">
        <button data-act="cat" data-v="ab" aria-pressed="${S.set.cat === "ab"}">ABM</button>
        <button data-act="cat" data-v="cd" aria-pressed="${S.set.cat === "cd"}">CD</button>
      </div>
      <button class="icon-btn" data-act="settings" aria-label="Настройки"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg></button>
    </div>`;
  }

  /* ---------- views ---------- */
  const VIEWS = {};

  VIEWS.home = () => {
    const d = D();
    const total = d.unique.length;
    let known = 0, solid = 0, seen = 0;
    d.unique.forEach((q) => { const b = box(q); if (b >= 0) seen++; if (b >= 2) known++; if (b >= 4) solid++; });
    const due = dueList(d).length;
    const fresh = total - seen;
    const mist = mistakesList(d).length;
    const chance = Math.round(passChance(d) * 100);
    const left = daysLeft();
    const td = S.stats.days[today()] || { a: 0, ok: 0, n: 0 };
    let planText;
    if (left != null && left > 0) {
      const studyDays = Math.max(1, left - 1);
      const perDay = Math.ceil(fresh / studyDays);
      planText = `До экзамена ${left} ${plural(left, "день", "дня", "дней")}. Нужно ${perDay} ${plural(perDay, "новый вопрос", "новых вопроса", "новых вопросов")} в день, последний день — только экзамены.`;
    } else if (left != null && left <= 0) {
      planText = "День экзамена: решайте 3–5 экзаменов подряд и «Ошибки». Новое не учите.";
    } else {
      planText = "Укажите дату экзамена в настройках — рассчитаю дневную норму.";
    }
    const lastExams = S.exams.filter((e) => e.cat === S.set.cat);
    const lastByTicket = {};
    lastExams.forEach((e) => { lastByTicket[e.t] = e.ok; });
    const recent = lastExams.slice(-10);
    const recentPass = recent.filter((e) => e.ok).length;
    const learnLabel = due || fresh ? `Учить сейчас · ${Math.min(due, 80) + Math.min(fresh, S.set.newPer)}` : "Всё выучено — экзамен";

    app().innerHTML = `<div class="stack">
      <section class="card stack" aria-label="Готовность">
        <div class="hero">
          <div class="plate" title="Оценка шанса сдать теорию сейчас"><b class="num">${chance}</b><small>% СДАЧИ</small></div>
          <div class="stack" style="gap:12px;min-width:0">
            <div><span class="label">Категория ${CAT_LABEL[S.set.cat]} · ${total} уникальных вопросов</span><h1>Шанс сдать сейчас ≈ ${chance}%</h1></div>
            <div class="hero-stats">
              <div class="stat"><b>${known}</b><span>выучено</span></div>
              <div class="stat"><b>${solid}</b><span>закреплено</span></div>
              <div class="stat"><b>${streak()}</b><span>${plural(streak(), "день", "дня", "дней")} подряд</span></div>
            </div>
          </div>
        </div>
        <div class="bar-track" role="img" aria-label="Закреплено ${solid}, выучено ${known}, начато ${seen} из ${total}">
          <i style="width:${(solid / total) * 100}%;background:var(--m4)"></i>
          <i style="width:${((known - solid) / total) * 100}%;background:var(--m3)"></i>
          <i style="width:${((seen - known) / total) * 100}%;background:var(--m2)"></i>
        </div>
        <div class="plan">
          <div class="plan-line">
            <div class="row small"><span class="chip ${due ? "warn" : ""}">Повторить: <b class="num">${due}</b></span><span class="chip">Новых осталось: <b class="num">${fresh}</b></span><span class="chip">Сегодня решено: <b class="num">${td.a}</b></span></div>
          </div>
          <p class="small muted">${esc(planText)}</p>
          <div class="row">
            <button class="btn primary big" data-act="${due || fresh ? "learn" : "exam"}">${learnLabel}</button>
            <button class="btn big" data-act="exam">Экзамен 20 мин</button>
          </div>
          <label class="switch small"><input type="checkbox" id="errorless-home" data-act="errorless" ${S.set.errorless ? "checked" : ""}> Режим «с нуля»: новый вопрос сначала показывается с ответом, потом вы отвечаете сами</label>
        </div>
      </section>

      ${progressCard(td)}

      <section class="modes" aria-label="Режимы">
        <button class="mode" data-act="mistakes"><b>Ошибки</b><span><span class="cnt">${mist}</span> ${plural(mist, "вопрос", "вопроса", "вопросов")} до закрепления</span></button>
        <button class="mode" data-act="topics"><b>По темам</b><span>26 разделов ПДД, от простого к сложному</span></button>
        <button class="mode" data-act="marathon"><b>Марафон</b><span>Все ${total} вопросов подряд, с сохранением места</span></button>
        <button class="mode" data-act="cheat"><b>Шпаргалка</b><span>Все цифры и запреты на одной странице</span></button>
        <button class="mode" data-act="signs"><b>Знаки и разметка</b><span>Справочник и тренажёр знаков</span></button>
        <button class="mode" data-act="listen" data-src="mistakes"><b>Слушать</b><span>Аудиоповтор ошибок: вопрос, ответ, пояснение</span></button>
        <button class="mode" data-act="blitz"><b>Блиц 90 секунд</b><span>3 жизни, на скорость. Рекорд: <span class="cnt">${S.game.best.blitz || 0}</span></span></button>
        <button class="mode" data-act="achievements"><b>Достижения</b><span><span class="cnt">${Object.keys(S.game.ach).length}</span> из ${ACH.length} получено</span></button>
      </section>

      <section class="card stack" aria-label="Билеты">
        <div class="plan-line"><h2>Билеты 1–40</h2><span class="small muted">Экзамены: ${recent.length ? `${recentPass} из ${recent.length} последних сданы` : "ещё не было"}</span></div>
        <div class="tickets">${Array.from({ length: 40 }, (_, i) => {
          const t = i + 1;
          const l = ticketLevel(d.byTicket[t]);
          const ex = t in lastByTicket ? `<em class="${lastByTicket[t] ? "pass" : "fail"}"></em>` : "";
          return `<button class="tk" data-l="${l}" data-act="ticket" data-t="${t}" aria-label="Билет ${t}">${t}${ex}</button>`;
        }).join("")}</div>
        <div class="legend"><span><i style="background:var(--m0)"></i>не начат</span><span><i style="background:var(--m1)"></i>есть ошибки</span><span><i style="background:var(--m2)"></i>в процессе</span><span><i style="background:var(--m3)"></i>выучен</span><span><i style="background:var(--m4)"></i>закреплён</span></div>
      </section>

      <section class="card method" aria-label="Методика">
        <h2>Как выучить 800 вопросов быстрее всего</h2>
        <ol class="small">
          <li><b>Шпаргалка — 30 минут.</b> Все цифры и запреты. Они закрывают около четверти вопросов.</li>
          <li><b>«Учить сейчас» каждый день.</b> Порции по ${S.set.newPer} новых вопросов, сгруппированы по темам. Сначала знаки и разметка, потом манёвры и перекрёстки.</li>
          <li><b>Отвечайте сами, до подсказки.</b> Попытка вспомнить закрепляет лучше, чем перечитывание. Ошибка вернётся через 3 вопроса и потом ещё раз, пока не ответите дважды подряд.</li>
          <li><b>Честно жмите «Угадал».</b> Случайный правильный ответ не считается выученным.</li>
          <li><b>Повторения по расписанию.</b> 10 минут → 1 день → 3 → 7 → 14 дней. Приложение само подставит нужные вопросы.</li>
          <li><b>Последние 2 дня — только экзамены и «Ошибки».</b> Цель: 5 экзаменов подряд без ошибок.</li>
          <li><b>Совсем с нуля?</b> Оставьте включённым режим «с нуля»: новый вопрос сначала показывается с ответом, через 3 вопроса вы отвечаете сами. Так меньше случайных ошибок и правильный ответ запоминается быстрее.</li>
          <li><b>Держите ритм.</b> Цель дня, серия дней и ранги показывают, что вы продвигаетесь. Блиц на 90 секунд — разминка, когда нет сил на сессию.</li>
          <li><b>Если память слабая:</b> включите озвучку, читайте пояснение вслух, слушайте «Ошибки» в дороге, учите 2–3 короткие сессии в день вместо одной длинной, перед сном — повтор.</li>
        </ol>
      </section>
    </div>`;
  };

  function progressCard(td) {
    const r = rankOf(S.game.xp);
    const pct = r.to ? ((S.game.xp - r.from) / (r.to - r.from)) * 100 : 100;
    const goal = Math.max(1, +S.set.goal || 60);
    const g = Math.min(1, (td.a || 0) / goal);
    const C = 2 * Math.PI * 26;
    const cells = [];
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() - (7 * 15 + ((start.getDay() + 6) % 7)));
    for (let i = 0; i < 16 * 7; i++) {
      const d = new Date(start.getTime());
      d.setDate(start.getDate() + i);
      const k = dayKey(d.getTime());
      const a = (S.stats.days[k] || {}).a || 0;
      const l = d > new Date() ? -1 : a >= 100 ? 4 : a >= 50 ? 3 : a >= 20 ? 2 : a > 0 ? 1 : 0;
      cells.push(`<i data-h="${l}" title="${k}: ${a}"></i>`);
    }
    return `<section class="card prog" aria-label="Прогресс">
      <div class="ring" role="img" aria-label="Цель дня: ${td.a || 0} из ${goal}">
        <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" class="ring-bg"/>${g > 0 ? `<circle cx="32" cy="32" r="26" class="ring-fg" stroke-dasharray="${(C * g).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 32 32)"/>` : ""}</svg>
        <div><b class="num">${td.a || 0}</b><span>из ${goal}</span></div>
      </div>
      <div class="prog-main">
        <div class="plan-line"><div><span class="label">Ранг · уровень ${r.lvl}</span><h2>${esc(r.name)}</h2></div><span class="num small muted">${S.game.xp} XP${r.to ? ` / ${r.to}` : ""}</span></div>
        <div class="xp"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="heat" aria-label="Активность за 16 недель">${cells.join("")}</div>
      </div>
    </section>`;
  }

  VIEWS.achievements = () => {
    const r = rankOf(S.game.xp);
    app().innerHTML = `<div class="stack">
      <div class="row"><button class="btn ghost" data-act="home">← Назад</button></div>
      <section class="card stack">
        <div><span class="label">${S.game.xp} XP · уровень ${r.lvl}</span><h1>${esc(r.name)}</h1></div>
        <p class="small muted">Очки: верный ответ +10 и бонус за комбо до +10, ошибка +2, сданный экзамен +100 (без ошибок +200), достижение +50.</p>
        <div class="ranks">${RANKS.map(([xp, name], i) => `<div class="rank ${i <= r.i ? "on" : ""}"><b class="num">${i + 1}</b><span>${esc(name)}</span><em class="num">${xp}</em></div>`).join("")}</div>
      </section>
      <section class="card stack">
        <h2>Достижения · ${Object.keys(S.game.ach).length} из ${ACH.length}</h2>
        <div class="achs">${ACH.map((a) => {
          const at = S.game.ach[a.id];
          return `<div class="ach ${at ? "on" : ""}"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 3 37 34H3Z" class="ach-tri"/><path d="m13 22 5 5 9-11" class="ach-check"/></svg><div><b>${esc(a.t)}</b><span>${esc(a.d)}${at ? ` · ${new Date(at).toLocaleDateString("ru-RU")}` : ""}</span></div></div>`;
        }).join("")}</div>
      </section>
    </div>`;
  };

  VIEWS.ticket = (v) => {
    const d = D();
    const qs = d.byTicket[v.t];
    const l = ticketLevel(qs);
    const tExams = S.exams.filter((e) => e.cat === S.set.cat && e.t === v.t);
    app().innerHTML = `<div class="stack">
      <div class="row"><button class="btn ghost" data-act="home">← Назад</button></div>
      <section class="card stack">
        <div><span class="label">Категория ${CAT_LABEL[S.set.cat]}</span><h1>Билет ${v.t}</h1></div>
        <p class="muted small">${["Не начат", "Есть ошибки", "В процессе", "Выучен", "Закреплён"][l]} · экзаменов по билету: ${tExams.length}, сдано ${tExams.filter((e) => e.ok).length}</p>
        <div class="row">
          <button class="btn primary" data-act="practice-ticket" data-t="${v.t}">Решать с подсказками</button>
          <button class="btn" data-act="exam" data-t="${v.t}">Экзамен по билету</button>
          <button class="btn" data-act="browse" data-src="ticket" data-t="${v.t}">Смотреть с ответами</button>
          <button class="btn" data-act="listen" data-src="ticket" data-t="${v.t}">Слушать</button>
        </div>
        <div class="row" style="gap:6px">${qs.map((q) => {
          const b = box(q);
          const cls = b < 0 ? "" : b === 1 ? "bad" : b >= 2 ? "good" : "";
          return `<span class="chip ${cls}" title="Вопрос ${q.n}">${q.n}</span>`;
        }).join("")}</div>
      </section>
    </div>`;
  };

  VIEWS.topics = () => {
    const d = D();
    app().innerHTML = `<div class="stack">
      <div class="row"><button class="btn ghost" data-act="home">← Назад</button></div>
      <section class="card">
        <h1>Темы ПДД</h1>
        <p class="muted small" style="margin-top:6px">Порядок — от основ к сложному. Учите тему целиком, затем переходите к следующей.</p>
        <div class="list" style="margin-top:8px">${d.topics.map((tp) => {
          const n = tp.qs.length;
          let known = 0, seen = 0;
          tp.qs.forEach((q) => { const b = box(q); if (b >= 0) seen++; if (b >= 2) known++; });
          return `<div class="li">
            <button class="li-t" style="background:none;border:0;padding:0;text-align:left" data-act="topic" data-ti="${tp.ti}">${esc(tp.name)}</button>
            <span class="small muted num">${known}/${n}</span>
            <div class="bar-track"><i style="width:${(known / n) * 100}%;background:var(--m4)"></i><i style="width:${((seen - known) / n) * 100}%;background:var(--m2)"></i></div>
          </div>`;
        }).join("")}</div>
      </section>
    </div>`;
  };

  VIEWS.topic = (v) => {
    const d = D();
    const tp = d.topics.find((t) => t.ti === v.ti);
    const unseen = tp.qs.filter((q) => !P(q)).length;
    app().innerHTML = `<div class="stack">
      <div class="row"><button class="btn ghost" data-act="topics">← Темы</button></div>
      <section class="card stack">
        <div><span class="label">${tp.qs.length} ${plural(tp.qs.length, "вопрос", "вопроса", "вопросов")} · новых ${unseen}</span><h1>${esc(tp.name)}</h1></div>
        <div class="row">
          <button class="btn primary" data-act="learn-topic" data-ti="${tp.ti}">Учить тему</button>
          <button class="btn" data-act="practice-topic" data-ti="${tp.ti}">Решать все подряд</button>
          <button class="btn" data-act="browse" data-src="topic" data-ti="${tp.ti}">Смотреть с ответами</button>
          <button class="btn" data-act="listen" data-src="topic" data-ti="${tp.ti}">Слушать</button>
        </div>
      </section>
    </div>`;
  };

  /* ----- runner ----- */
  function makeItem(q, extra = {}) {
    const ord = q.a.map((_, i) => i);
    return Object.assign({ q, ord: S.set.shuffle ? shuffle(ord) : ord, res: null, need: 0, first: true, snap: null, guessed: false }, extra);
  }
  function startRunner(kind, title, qs, opts = {}) {
    if (!qs.length) { toast("Здесь пока нет вопросов"); return; }
    const study = opts.studyIds || null;
    go({ name: "run", R: Object.assign({ kind, title, items: qs.map((q) => makeItem(q, study && study.has(q.id) ? { study: true, first: false } : {})), pos: 0, started: Date.now(), done: 0 }, opts) });
  }
  function startLearn(pool) {
    const d = D();
    let due, fresh;
    if (pool) {
      const now = Date.now();
      due = pool.filter((q) => { const p = P(q); return p && p.d <= now; });
      fresh = pool.filter((q) => !P(q)).slice(0, S.set.newPer);
    } else {
      due = dueList(d).slice(0, 80);
      fresh = newList(d).slice(0, S.set.newPer);
    }
    const reviews = shuffle(due);
    const seq = [];
    let ri = 0, ni = 0;
    while (ri < reviews.length || ni < fresh.length) {
      for (let k = 0; k < 2 && ri < reviews.length; k++) seq.push(reviews[ri++]);
      if (ni < fresh.length) seq.push(fresh[ni++]);
    }
    if (!seq.length) {
      toast(pool ? "В этой теме всё выучено — решайте подряд" : "На сегодня всё выучено. Решите экзамен.");
      return;
    }
    const studyIds = S.set.errorless ? new Set(fresh.map((q) => q.id)) : null;
    startRunner("learn", pool ? "Учить тему" : "Учить сейчас", seq, { learnPool: pool || null, studyIds });
  }
  function startExam(ticket) {
    const d = D();
    const t = ticket || 1 + Math.floor(Math.random() * 40);
    const items = d.byTicket[t].map((q) => makeItem(q, { block: Math.floor((q.n - 1) / 5) }));
    go({ name: "run", R: { kind: "exam", title: `Экзамен · билет ${t}`, ticket: t, items, pos: 0, started: Date.now(), deadline: Date.now() + 20 * MIN, phase: "base", extra: [], status: "run", done: 0 } });
  }

  VIEWS.run = (v) => {
    const R = v.R;
    const it = R.items[R.pos];
    const q = it.q;
    const answered = it.res != null;
    const exam = R.kind === "exam";
    const blitz = R.kind === "blitz";
    const study = it.study && !answered;
    const showFb = study || (answered && (!exam || S.set.examHints));
    const ok = answered && it.res === q.c;
    const total = R.items.length;
    const doneCount = R.items.filter((x) => x.res != null).length;
    let head = "";
    if (exam) {
      head = `<div class="qhead"><span class="label">${esc(R.title)}${R.phase === "extra" ? " · доп. вопросы" : ""}</span><span class="sp"></span><span class="timer num" id="timer">${fmtTime(R.deadline - Date.now())}</span></div>
      <div class="grid20" aria-label="Вопросы">${R.items.map((x, i) => {
        const cls = i === R.pos ? "cur" : "";
        const st = x.res == null ? "" : S.set.examHints ? (x.res === x.q.c ? "ok" : "no") : "done";
        return `<button class="${cls} ${st}" data-act="jump" data-i="${i}" aria-label="Вопрос ${i + 1}">${i + 1}</button>`;
      }).join("")}</div>`;
    } else if (blitz) {
      head = `<div class="qhead"><span class="label">Блиц · 90 секунд</span><span class="sp"></span><span class="lives" aria-label="Жизни: ${R.lives}">${[0, 1, 2].map((i) => `<i class="${i < R.lives ? "on" : ""}"></i>`).join("")}</span><span class="chip good num">${R.score} очк.</span><span class="timer num" id="timer">${fmtTime(R.deadline - Date.now())}</span></div>`;
    } else if (R.kind === "learn") {
      head = `<div class="qhead"><span class="label">${esc(R.title)} · билет ${q.t}, вопрос ${q.n}</span><span class="sp"></span><span class="small muted num">${doneCount}/${total}</span></div>
      <div class="progress"><i style="width:${(doneCount / total) * 100}%"></i></div>`;
    } else {
      const where = R.title === `Билет ${q.t}` ? `вопрос ${q.n}` : `билет ${q.t}, вопрос ${q.n}`;
      head = `<div class="qhead"><span class="label">${esc(R.title)} · ${where}</span><span class="sp"></span><span class="small muted num">${R.pos + 1}/${total}</span></div>`;
      if (total <= 40) {
        head += `<div class="grid20">${R.items.map((x, i) => `<button class="${i === R.pos ? "cur" : ""} ${x.res == null ? "" : x.res === x.q.c ? "ok" : "no"}" data-act="jump" data-i="${i}" aria-label="Вопрос ${i + 1}">${i + 1}</button>`).join("")}</div>`;
      } else {
        head += `<div class="progress"><i style="width:${((R.pos + 1) / total) * 100}%"></i></div>`;
      }
    }
    let tag = study ? `<span class="chip warn">Новый вопрос — запомните ответ</span>` : it.need > 0 && !answered ? `<span class="chip bad">Повтор ошибки</span>` : box(q) < 0 && !answered && R.kind === "learn" ? `<span class="chip warn">Новый</span>` : "";
    if (!exam && (R.combo || 0) >= 3) tag += `<span class="chip combo">Комбо ×${R.combo}</span>`;
    const answersHtml = it.ord.map((ai, k) => {
      let cls = "";
      if (study) cls = ai === q.c ? "right" : "dim";
      else if (answered) {
        if (showFb) {
          if (ai === q.c) cls = "right";
          else if (ai === it.res) cls = "wrong";
          else cls = "dim";
        } else if (ai === it.res) cls = "picked";
      }
      return `<button class="ans ${cls}" data-act="answer" data-a="${ai}" ${answered || study ? "disabled" : ""}><span class="k">${k + 1}</span><span>${esc(q.a[ai])}</span></button>`;
    }).join("");
    let fb = "";
    if (study) {
      fb = `<div class="tip">${fmtTip(q.tip)}</div><p class="small muted">Через несколько вопросов он вернётся — ответите сами.</p>`;
    } else if (showFb && blitz) {
      fb = `<div class="verdict ${ok ? "ok" : "no"}" role="status">${ok ? "+1" : "Минус жизнь"}</div>`;
    } else if (showFb) {
      fb = `<div class="verdict ${ok ? "ok" : "no"}" role="status">${ok ? (it.guessed ? "Засчитано как ошибка — повторим" : "Верно") : "Ошибка"}</div>
      <div class="tip">${fmtTip(q.tip)}</div>`;
    }
    const actions = [];
    if (study) {
      actions.push(`<button class="btn ghost" data-act="say-a">Озвучить ответ</button><span class="sp"></span><button class="btn primary" data-act="studied" id="next-btn">Запомнил</button>`);
    } else if (blitz) {
      if (answered) actions.push(`<span class="sp"></span><button class="btn primary" data-act="next" id="next-btn">Дальше</button>`);
    } else if (!answered) {
      if (exam) actions.push(`<button class="btn" data-act="skip">Пропустить</button>`);
      actions.push(`<button class="btn ghost" data-act="say-q" aria-label="Прочитать вопрос вслух">Озвучить</button>`);
    } else {
      if (showFb && ok && !exam && !it.guessed) actions.push(`<button class="btn" data-act="guessed" title="Ответ был случайным — повторить вопрос">Угадал</button>`);
      if (showFb) actions.push(`<button class="btn ghost" data-act="say-a">Озвучить ответ</button>`);
      actions.push(`<span class="sp"></span><button class="btn primary" data-act="next" id="next-btn">Дальше</button>`);
    }
    if (!answered && !study) actions.push(`<span class="sp"></span>`);
    actions.push(`<button class="btn ghost danger" data-act="quit">${v.confirmQuit ? "Точно выйти?" : "Выйти"}</button>`);

    app().innerHTML = `<div class="stack">
      ${head}
      <article class="card qcard">
        ${imgBox(q)}
        <div class="qbody">
          ${tag ? `<div class="row">${tag}</div>` : ""}
          <p class="qtext">${esc(q.q)}</p>
          <div class="answers">${answersHtml}</div>
          ${fb}
          <div class="qactions">${actions.join("")}</div>
          <p class="hint-keys">${study ? `<span class="kbd">Enter</span> — запомнил` : `Клавиши: <span class="kbd">1</span>–<span class="kbd">${q.a.length}</span> ответ, <span class="kbd">Enter</span> дальше${!exam && !blitz ? `, <span class="kbd">G</span> угадал` : ""}`}</p>
        </div>
      </article>
    </div>`;

    if (exam || blitz) {
      const tick = () => {
        const left = R.deadline - Date.now();
        const el = $("#timer");
        if (el) { el.textContent = fmtTime(left); el.classList.toggle("low", left < (blitz ? 15e3 : 3 * MIN)); }
        if (left <= 0 && R.status === "run") blitz ? finishBlitz(R, "Время вышло") : finishExam(R, false, "Время вышло");
      };
      clearInterval(timerId);
      timerId = setInterval(tick, 1000);
    }
    const nextItems = R.items.slice(R.pos + 1, R.pos + 4);
    nextItems.forEach((x) => { if (x.q.img) imgChunk(x.q.cat, x.q.t).catch(() => {}); });
    if (study && S.set.speakAuto) tts.speak(`${q.q}. ${aSpeech(q)}`);
    else if (!answered && S.set.speakAuto && !blitz) tts.speak(qSpeech(q));
    if (answered && showFb && S.set.speakAuto && !blitz) tts.speak((ok ? "Верно. " : "Ошибка. ") + aSpeech(q));
    if (answered && showFb && ok && S.set.autoNext && !exam && !blitz && !S.set.speakAuto) {
      const pos = R.pos;
      v.autoTimer = setTimeout(() => { if (S.view === v && R.pos === pos && R.items[pos].res != null && !R.items[pos].guessed) nextQuestion(); }, 1100);
    }
  };

  function answer(ai) {
    const v = S.view, R = v.R;
    const it = R.items[R.pos];
    if (it.res != null || it.study || ((R.kind === "exam" || R.kind === "blitz") && R.status !== "run")) return;
    tts.stop();
    it.res = ai;
    const q = it.q;
    const ok = ai === q.c;
    const prevGoal = (S.stats.days[today()] || {}).a || 0;
    if (R.kind !== "exam") {
      R.combo = ok ? (R.combo || 0) + 1 : 0;
      R.maxCombo = Math.max(R.maxCombo || 0, R.combo);
      if (R.combo > (S.game.best.combo || 0)) S.game.best.combo = R.combo;
      addXP(ok ? 10 + Math.min(R.combo, 10) : 2, R);
      beep(ok ? "ok" : "no");
    } else {
      addXP(ok ? 10 : 2, R);
    }
    afterAnswer(prevGoal);
    if (R.kind === "blitz") {
      grade(q, ok);
      if (ok) R.score++;
      else R.lives--;
      if (R.pos + 6 > R.items.length) R.items.push(...R.pool.splice(0, 20).map((x) => makeItem(x)));
      render();
      const pos = R.pos;
      v.autoTimer = setTimeout(() => {
        if (S.view !== v || R.pos !== pos) return;
        if (R.lives <= 0) finishBlitz(R, "Жизни закончились");
        else nextQuestion();
      }, ok ? 550 : 1500);
      return;
    }
    if (R.kind === "learn") {
      if (it.first) it.snap = grade(q, ok);
      else if (!ok) grade(q, false);
      if (!ok) requeue(R, q, 2, 3);
      else if (it.need > 1) requeue(R, q, it.need - 1, 6);
    } else if (R.kind === "exam") {
      grade(q, ok);
      if (R.phase === "extra" && !ok) { finishExam(R, false, "Ошибка в дополнительных вопросах"); return; }
      if (R.items.every((x) => x.res != null)) { evaluateExam(R); return; }
      if (!S.set.examHints) { advanceExam(R); return; }
    } else {
      it.snap = grade(q, ok);
    }
    render();
    const nb = $("#next-btn");
    if (nb) nb.focus({ preventScroll: true });
  }
  function afterAnswer(prevGoal) {
    const now = (S.stats.days[today()] || {}).a || 0;
    if (prevGoal < S.set.goal && now >= S.set.goal) { toast("Дневная цель выполнена!", "ach"); celebrate(); }
    checkAch();
  }
  function studied() {
    const v = S.view, R = v.R, it = R.items[R.pos];
    if (!it.study || it.res != null) return;
    it.res = it.q.c;
    addXP(3, R);
    const at = Math.min(R.items.length, R.pos + 4);
    R.items.splice(at, 0, makeItem(it.q, { first: true }));
    nextQuestion();
  }
  function startBlitz() {
    const d = D();
    const pool = shuffle(d.unique);
    const now = Date.now();
    go({ name: "run", R: { kind: "blitz", title: "Блиц", items: pool.splice(0, 30).map((q) => makeItem(q)), pool, pos: 0, started: now, deadline: now + 90e3, lives: 3, score: 0, status: "run", done: 0 } });
  }
  function finishBlitz(R, reason) {
    if (R.status !== "run") return;
    R.status = "done";
    clearInterval(timerId);
    const rec = R.score > (S.game.best.blitz || 0);
    if (rec) S.game.best.blitz = R.score;
    addXP(R.score * 3, R);
    checkAch();
    saveNow();
    if (rec && R.score > 0) { beep("pass"); celebrate(); }
    go({ name: "result", R, ok: null, reason, record: rec });
  }
  function requeue(R, q, need, gap) {
    const at = Math.min(R.items.length, R.pos + 1 + gap);
    R.items.splice(at, 0, makeItem(q, { need, first: false }));
  }
  function markGuessed() {
    const R = S.view.R;
    const it = R.items[R.pos];
    if (it.res == null || it.res !== it.q.c || it.guessed || R.kind === "exam") return;
    if (it.snap) undoGrade(it.q, it.snap);
    grade(it.q, false);
    it.guessed = true;
    R.combo = 0;
    if (R.kind === "learn") requeue(R, it.q, 2, 3);
    saveSoon();
    render();
  }
  function nextQuestion() {
    const v = S.view, R = v.R;
    clearTimeout(v.autoTimer);
    tts.stop();
    if (R.kind === "exam") { advanceExam(R); return; }
    if (R.kind === "blitz") {
      if (R.status !== "run") return;
      if (R.lives <= 0) { finishBlitz(R, "Жизни закончились"); return; }
      R.pos++;
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (R.pos + 1 < R.items.length) {
      R.pos++;
      if (R.kind === "marathon") { S.mar[S.set.cat].pos = R.offset + R.pos; saveSoon(); }
      render();
      window.scrollTo(0, 0);
    } else {
      if (R.kind === "marathon") { S.mar[S.set.cat].pos = R.offset + R.items.length; saveSoon(); }
      finishRunner(R);
    }
  }
  function advanceExam(R) {
    const n = R.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (R.pos + k) % n;
      if (R.items[i].res == null) { R.pos = i; render(); window.scrollTo(0, 0); return; }
    }
    evaluateExam(R);
  }
  function evaluateExam(R) {
    if (R.status !== "run") return;
    if (R.phase === "base") {
      const errs = [0, 0, 0, 0];
      R.items.forEach((x) => { if (x.res !== x.q.c) errs[x.block]++; });
      const total = errs.reduce((a, b) => a + b, 0);
      if (total === 0) return finishExam(R, true, "Без ошибок");
      if (total > 2) return finishExam(R, false, `${total} ${plural(total, "ошибка", "ошибки", "ошибок")} — больше двух`);
      if (errs.some((e) => e > 1)) return finishExam(R, false, "Две ошибки в одном тематическом блоке");
      const d = D();
      const extra = [];
      errs.forEach((e, b) => {
        if (!e) return;
        let t2 = 1 + Math.floor(Math.random() * 40);
        if (t2 === R.ticket) t2 = (t2 % 40) + 1;
        d.byTicket[t2].slice(b * 5, b * 5 + 5).forEach((q) => extra.push(makeItem(q, { block: b, extra: true })));
      });
      R.phase = "extra";
      R.items = R.items.concat(extra);
      R.deadline += (extra.length / 5) * 5 * MIN;
      R.pos = 20;
      toast(`+${extra.length} дополнительных вопросов и +${extra.length} минут. Ошибаться нельзя.`);
      render();
      return;
    }
    finishExam(R, true, "С дополнительными вопросами");
  }
  function finishExam(R, ok, reason) {
    if (R.status !== "run") return;
    R.status = ok ? "pass" : "fail";
    clearInterval(timerId);
    const err = R.items.filter((x) => x.res != null && x.res !== x.q.c).length;
    S.exams.push({ cat: S.set.cat, t: R.ticket, ok, ts: Date.now(), err, sec: Math.round((Date.now() - R.started) / 1000) });
    if (ok) { addXP(err ? 100 : 200, R); beep("pass"); celebrate(); }
    else addXP(20, R);
    checkAch();
    saveNow();
    go({ name: "result", R, ok, reason });
  }
  function finishRunner(R) {
    saveNow();
    go({ name: "result", R, ok: null });
  }

  VIEWS.result = (v) => {
    const R = v.R;
    const answered = R.items.filter((x) => x.res != null);
    const firstTry = R.kind === "learn" ? answered.filter((x) => x.first) : answered;
    const wrongMap = new Map();
    answered.forEach((x) => { if (x.res !== x.q.c || x.guessed) wrongMap.set(x.q.id, x); });
    const wrong = [...wrongMap.values()];
    const right = firstTry.filter((x) => x.res === x.q.c && !x.guessed).length;
    const secs = Math.round((Date.now() - R.started) / 1000);
    const exam = R.kind === "exam";
    let headline, cls;
    if (exam) { headline = v.ok ? "Сдал" : "Не сдал"; cls = v.ok ? "ok" : "no"; }
    else if (R.kind === "blitz") { headline = `${R.score} ${plural(R.score, "очко", "очка", "очков")}`; cls = v.record ? "ok" : ""; }
    else { headline = `${right} из ${firstTry.length}`; cls = wrong.length ? "" : "ok"; }
    const d = D();
    const dueLeft = dueList(d).length;
    const freshLeft = newList(d).length;
    const buttons = [];
    if (wrong.length) buttons.push(`<button class="btn primary" data-act="redo-wrong">Работа над ошибками · ${wrong.length}</button>`);
    if (exam) buttons.push(`<button class="btn ${wrong.length ? "" : "primary"}" data-act="exam">Новый экзамен</button>`);
    if (R.kind === "learn") buttons.push(`<button class="btn ${wrong.length ? "" : "primary"}" data-act="${R.learnPool ? "learn-topic" : "learn"}" ${R.learnPool ? `data-ti="${R.learnTi}"` : ""}>Ещё порция</button>`);
    if (R.kind === "marathon") buttons.push(`<button class="btn" data-act="marathon">Продолжить марафон</button>`);
    if (R.kind === "blitz") buttons.push(`<button class="btn ${wrong.length ? "" : "primary"}" data-act="blitz">Ещё блиц</button>`);
    buttons.push(`<button class="btn ghost" data-act="home">На главную</button>`);
    app().innerHTML = `<div class="stack">
      <section class="card stack">
        <span class="label">${esc(R.title)}</span>
        <div class="res-big ${cls}">${headline}</div>
        <div class="row"><span class="chip combo">+${R.xp || 0} XP</span>${R.maxCombo >= 3 ? `<span class="chip">Лучшее комбо ×${R.maxCombo}</span>` : ""}${R.kind === "blitz" ? `<span class="chip ${v.record ? "good" : ""}">${v.record ? "Новый рекорд!" : `Рекорд: ${S.game.best.blitz || 0}`}</span>` : ""}</div>
        <p class="muted">${exam || R.kind === "blitz" ? esc(v.reason) + " · " : ""}время ${fmtTime(secs * 1000)} · ошибок ${wrong.length}${R.kind === "learn" ? ` · к повтору сейчас ${dueLeft}, новых осталось ${freshLeft}` : ""}</p>
        <div class="row">${buttons.join("")}</div>
      </section>
      ${wrong.length ? `<section class="card stack"><h2>Разбор ошибок</h2>${wrong.map((x) => `<div class="review-item">
          ${imgBox(x.q, "qimg")}
          <p><b>Билет ${x.q.t}, вопрос ${x.q.n}.</b> ${esc(x.q.q)}</p>
          ${x.res !== x.q.c ? `<p class="no-ans">${esc(x.q.a[x.res])}</p>` : `<p class="small muted">Отмечено «Угадал»</p>`}
          <p class="ok-ans">✓ ${esc(x.q.a[x.q.c])}</p>
          <div class="tip small">${fmtTip(x.q.tip)}</div>
        </div>`).join("")}</section>` : ""}
    </div>`;
    v.wrongQs = wrong.map((x) => x.q);
  };

  VIEWS.browse = (v) => {
    const d = D();
    let qs, title;
    if (v.src === "ticket") { qs = d.byTicket[v.t]; title = `Билет ${v.t}`; }
    else if (v.src === "topic") { const tp = d.topics.find((t) => t.ti === v.ti); qs = tp.qs; title = tp.name; }
    else { qs = mistakesList(d); title = "Ошибки"; }
    app().innerHTML = `<div class="stack">
      <div class="row"><button class="btn ghost" data-act="back-browse">← Назад</button></div>
      <section class="card">
        <span class="label">Чтение с ответами · ${qs.length}</span><h1>${esc(title)}</h1>
        <p class="small muted" style="margin-top:6px">Быстрый первый проход: смотрите на картинку, читайте вопрос, затем правильный ответ и пояснение. После — обязательно решите сами.</p>
        <div>${qs.map((q) => `<div class="bq">
          ${imgBox(q, "qimg")}
          <p class="q">${q.t}.${q.n} · ${esc(q.q)}</p>
          <ul>${q.a.map((a, i) => `<li class="${i === q.c ? "c" : "x"}">${esc(a)}</li>`).join("")}</ul>
          <div class="tip small">${fmtTip(q.tip)}</div>
        </div>`).join("")}</div>
      </section>
    </div>`;
  };

  /* ----- audio player ----- */
  VIEWS.listen = (v) => {
    const d = D();
    if (!v.qs) {
      if (v.src === "ticket") { v.qs = d.byTicket[v.t]; v.title = `Билет ${v.t}`; }
      else if (v.src === "topic") { const tp = d.topics.find((t) => t.ti === v.ti); v.qs = tp.qs; v.title = tp.name; }
      else {
        v.qs = mistakesList(d);
        v.title = "Ошибки";
        if (!v.qs.length) { v.qs = dueList(d).slice(0, 40); v.title = "Повторение"; }
        if (!v.qs.length) { v.qs = d.byTicket[1]; v.title = "Билет 1"; }
      }
      v.player = { i: 0, playing: false, stage: 0 };
    }
    const pl = v.player;
    const q = v.qs[pl.i];
    app().innerHTML = `<div class="stack">
      <div class="row"><button class="btn ghost" data-act="home">← Назад</button></div>
      ${tts.ok ? "" : `<div class="notice">Браузер не поддерживает озвучку. Откройте страницу в Chrome, Edge или Safari.</div>`}
      <section class="card stack">
        <div class="qhead"><span class="label">Слушать · ${esc(v.title)}</span><span class="sp"></span><span class="small muted num">${pl.i + 1}/${v.qs.length}</span></div>
        <div class="row">
          <button class="btn" data-act="pl-prev" aria-label="Предыдущий">⏮</button>
          <button class="btn primary" data-act="pl-toggle" style="min-width:120px">${pl.playing ? "Пауза" : "Играть"}</button>
          <button class="btn" data-act="pl-next" aria-label="Следующий">⏭</button>
          <label class="small muted" for="rate">Скорость</label>
          <select id="rate" data-act="rate">${[0.8, 0.9, 1, 1.05, 1.2, 1.4].map((r) => `<option value="${r}" ${+S.set.rate === r ? "selected" : ""}>${r}×</option>`).join("")}</select>
        </div>
      </section>
      <article class="card qcard">
        ${imgBox(q)}
        <div class="qbody">
          <p class="qtext">${esc(q.q)}</p>
          <div class="answers">${q.a.map((a, i) => `<div class="ans ${i === q.c ? "right" : "dim"}"><span class="k">${i + 1}</span><span>${esc(a)}</span></div>`).join("")}</div>
          <div class="tip">${fmtTip(q.tip)}</div>
        </div>
      </article>
    </div>`;
  };
  function playerStep(v) {
    const pl = v.player;
    if (!pl.playing || S.view !== v) return;
    const q = v.qs[pl.i];
    tts.speak(`Вопрос. ${qSpeech(q)}`, (okSpeak) => {
      if (!pl.playing || S.view !== v || !okSpeak) return;
      setTimeout(() => {
        if (!pl.playing || S.view !== v) return;
        tts.speak(aSpeech(q), (ok2) => {
          if (!pl.playing || S.view !== v || !ok2) return;
          setTimeout(() => {
            if (!pl.playing || S.view !== v) return;
            if (pl.i + 1 >= v.qs.length) { pl.playing = false; render(); return; }
            pl.i++;
            render();
            playerStep(v);
          }, 900);
        });
      }, 2500);
    });
  }

  /* ----- cheat sheet ----- */
  VIEWS.cheat = () => {
    const tbl = (rows, h = ["Ситуация", "Значение"]) => `<div class="tbl-wrap"><table><thead><tr><th>${h[0]}</th><th>${h[1]}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="v">${r[1]}</td></tr>`).join("")}</tbody></table></div>`;
    const ul = (items) => `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>`;
    app().innerHTML = `<div class="stack cheat">
      <div class="row"><button class="btn ghost" data-act="home">← Назад</button></div>
      <section class="card stack">
        <div><span class="label">Выучить первым делом</span><h1>Шпаргалка ПДД</h1></div>
        <p class="small muted">Цифры и запреты, на которых держится четверть билетов. Проверено по пояснениям к вопросам базы. Прочитайте вслух, закройте и перескажите — так запоминается в разы лучше.</p>
      </section>

      <section class="card stack"><h2>Скорость (п. 10.2–10.4)</h2>
      ${tbl([
        ["Населённый пункт", "60 км/ч"],
        ["Жилая зона, велосипедная зона, двор", "20 км/ч"],
        ["Вне н. п.: легковые, мотоциклы, грузовые до 3,5 т", "90 км/ч"],
        ["Автомагистраль: легковые, мотоциклы, грузовые до 3,5 т", "110 км/ч"],
        ["Легковой с прицепом, грузовой более 3,5 т: вне н. п. / автомагистраль", "70 / 90"],
        ["Грузовой с людьми в кузове", "60 км/ч"],
        ["Буксировка", "50 км/ч"],
        ["Автомагистраль: запрещены ТС, которые не могут ехать быстрее", "40 км/ч"],
      ], ["Кто и где", "Не более"])}
      <p class="mnemo">«Город — 60, двор — 20, трасса — 90, магистраль — 110. Прицеп — минус двадцать: 70 и 90. Тянешь на тросе — 50».</p>
      </section>

      <section class="card stack"><h2>Остановка и стоянка (п. 12.4, 12.5)</h2>
      ${tbl([
        ["Перед пешеходным переходом и на нём", "ближе 5 м — нельзя"],
        ["От края пересекаемой проезжей части на перекрёстке", "ближе 5 м — нельзя"],
        ["От остановки маршрутных ТС (разметка 1.17 или знак)", "ближе 15 м — нельзя"],
        ["Между авто и сплошной линией (или противоположным краем)", "меньше 3 м — нельзя"],
        ["Видимость дороги хотя бы в одну сторону", "меньше 100 м — нельзя"],
        ["Стоянка от железнодорожного переезда", "ближе 50 м — нельзя"],
      ], ["Где", "Расстояние"])}
      ${ul([
        "Остановка запрещена: на ж/д переездах, в тоннелях, на мостах, эстакадах и путепроводах (если в этом направлении менее трёх полос) и под ними, на трамвайных путях, на полосе для маршрутных ТС.",
        "Жёлтая сплошная у края (разметка 1.4) — остановка запрещена; жёлтая прерывистая 1.10 — запрещена стоянка.",
        "Остановка — до 5 минут или дольше для посадки людей и погрузки. Дольше по другим причинам — это уже стоянка.",
      ])}
      <p class="mnemo">«5 — переход и перекрёсток, 15 — автобус, 3 — до сплошной, 50 — переезд, 100 — видимость».</p>
      </section>

      <section class="card stack"><h2>Обгон, разворот, задний ход (п. 8.11, 8.12, 11.4)</h2>
      <h3>Обгон запрещён</h3>
      ${ul([
        "на регулируемом перекрёстке и на нерегулируемом, если едете по второстепенной;",
        "на пешеходном переходе;",
        "на ж/д переезде и ближе 100 м перед ним;",
        "на мостах, путепроводах, эстакадах и под ними, в тоннелях;",
        "в конце подъёма, на опасных поворотах и других участках с ограниченной видимостью;",
        "если впереди идущий обгоняет, объезжает препятствие или показал левый поворот.",
      ])}
      <h3>Разворот запрещён</h3>
      ${ul(["на пешеходных переходах, в тоннелях, на мостах, путепроводах, эстакадах и под ними, на ж/д переездах;", "там, где видимость хотя бы в одну сторону меньше 100 м;", "в местах остановок маршрутных ТС."])}
      <h3>Задний ход запрещён</h3>
      ${ul(["на перекрёстках и везде, где запрещён разворот;", "на автомагистрали (там же нельзя разворачиваться и въезжать в технологические разрывы)."])}
      <p class="mnemo">«Мосты, тоннели, переезды, переходы — ни обгона, ни разворота. Где нельзя развернуться, нельзя и пятиться».</p>
      </section>

      <section class="card stack"><h2>Перекрёстки: кто главный (п. 6.15, 8.3, 13)</h2>
      ${ul([
        "Старшинство: <b>регулировщик → светофор → знаки приоритета → разметка</b>. Временные (жёлтые) знаки важнее постоянных, временная разметка важнее постоянной.",
        "Равнозначный перекрёсток — уступи тому, кто <b>справа</b> («помеха справа»). Трамвай здесь главнее безрельсовых ТС, откуда бы ни ехал.",
        "Поворот налево и разворот — уступи встречным, которые едут прямо и направо.",
        "Главная дорога поворачивает — все, кто на главной, разъезжаются между собой как на равнозначном.",
        "Не видно, есть ли покрытие на вашей дороге (ночь, снег) — считайте себя на второстепенной.",
        "Выезжаете с прилегающей территории (двор, АЗС, парковка) — уступите всем.",
        "Зелёная стрелка в дополнительной секции — ехать можно, но уступив всем с других направлений.",
        "Затор за перекрёстком — не въезжайте, даже на зелёный.",
      ])}
      <h3>Регулировщик (п. 6.10)</h3>
      <p class="mnemo">«Если палка смотрит в рот — делай правый поворот. Если палка смотрит вправо — ехать не имеешь права. Если палка смотрит влево — поезжай как королева. Грудь и спина — для водителя стена».</p>
      <p class="small muted">Руки вытянуты или опущены: со стороны боков — трамваю прямо, остальным прямо и направо; грудь и спина — стоп.</p>
      </section>

      <section class="card stack"><h2>Ж/д переезд (п. 15)</h2>
      ${ul([
        "Знаки «Приближение к переезду» вне н. п. — за <b>150–300 м</b>. Обгон запрещён ближе <b>100 м</b> до переезда.",
        "Стоп у стоп-линии, знака 2.5 или светофора; если их нет — не ближе <b>5 м</b> от шлагбаума, без шлагбаума — не ближе <b>10 м</b> до рельса.",
        "Нельзя на переезд: шлагбаум закрыт или начал закрываться, красный сигнал, за переездом затор, приближается поезд.",
        "Нельзя объезжать стоящие перед переездом машины по встречной.",
        "Застряли — высадить людей, освободить переезд. Не получается — направить двух человек вдоль путей в обе стороны на <b>1000 м</b>.",
      ])}
      </section>

      <section class="card stack"><h2>Свет, сигналы, аварийная остановка (п. 7, 19)</h2>
      ${tbl([
        ["Знак аварийной остановки в населённом пункте", "≥ 15 м"],
        ["Знак аварийной остановки вне населённого пункта", "≥ 30 м"],
        ["Переключить дальний свет на ближний до встречного", "за 150 м"],
        ["Днём при движении", "ближний, ДХО или ПТФ"],
      ])}
      ${ul([
        "Аварийка обязательна: ДТП, вынужденная остановка там, где остановка запрещена, ослепление фарами, буксировка (на буксируемом), посадка и высадка детей из ТС со знаком «Перевозка детей».",
        "Ослепили — включите аварийку и, не меняя полосы, снизьте скорость и остановитесь.",
        "Звуковой сигнал — только чтобы предупредить об обгоне вне н. п. или предотвратить ДТП.",
      ])}
      </section>

      <section class="card stack"><h2>Буксировка (п. 20)</h2>
      ${tbl([
        ["Жёсткая сцепка", "не более 4 м"],
        ["Гибкая сцепка", "4–6 м"],
        ["Скорость", "50 км/ч"],
      ], ["Что", "Норма"])}
      ${ul([
        "Запрещено: на гибкой сцепке в гололедицу; двух и более ТС; ТС без работающего рулевого (можно только частичной погрузкой); двухколёсными мотоциклами без коляски.",
        "Не работают тормоза и буксируемый тяжелее половины буксирующего — нельзя; если легче — только жёсткая сцепка или частичная погрузка.",
        "Людям нельзя: в буксируемом автобусе и троллейбусе, в кузове буксируемого грузовика, в буксируемом при частичной погрузке.",
      ])}
      </section>

      <section class="card stack"><h2>Техсостояние (Перечень неисправностей)</h2>
      ${tbl([
        ["Протектор: легковые (M1)", "1,6 мм"],
        ["Протектор: мотоциклы (L)", "0,8 мм"],
        ["Протектор: грузовые N2, N3", "1,0 мм"],
        ["Протектор: автобусы M2, M3", "2,0 мм"],
        ["Люфт руля: легковые", "10°"],
        ["Люфт руля: грузовые", "25°"],
      ], ["Параметр", "Предел"])}
      ${ul([
        "Двигаться нельзя совсем: неисправны тормоза, рулевое, сцепное устройство автопоезда; ночью или в плохую видимость не горят фары и задние габариты; в дождь или снег не работает «дворник» со стороны водителя.",
        "Нельзя ставить шипованные и нешипованные шины вместе и шины с разным рисунком протектора на одну ось.",
      ])}
      </section>

      <section class="card stack"><h2>Люди, дети, первая помощь, ответственность</h2>
      ${ul([
        "Пристёгнуты должны быть все, кто в машине.",
        "Ребёнок до 12 лет — нельзя на заднем сиденье мотоцикла. На переднем сиденье легкового — только в детском удерживающем устройстве.",
        "Людей в кузове грузовика везёт водитель с категорией C или C1 стажем 3 года и больше; скорость не более 60 км/ч.",
        "Сердечно-лёгочная реанимация: <b>30 надавливаний на грудину → 2 вдоха</b>, на твёрдой поверхности.",
        "Жгут: летом не более <b>1 часа</b>, зимой не более <b>30 минут</b>. Алая пульсирующая кровь — артерия: сначала прижать пальцем выше раны.",
        "Опьянение: свыше <b>0,16 мг/л</b> в выдыхаемом воздухе.",
        "Уехали с места ДТП — лишение прав на 1–1,5 года или арест. Вернуть права: сдать теорию ПДД и оплатить штрафы.",
      ])}
      </section>

      <section class="card stack"><h2>Знаки: зона действия</h2>
      ${ul([
        "Предупреждающие (треугольник): вне н. п. за <b>150–300 м</b>, в н. п. за <b>50–100 м</b> до опасного места.",
        "Запрещающие (круг с красной каймой) действуют до ближайшего перекрёстка за знаком, в н. п. без перекрёстков — до конца н. п. Выезды из дворов и полевые дороги действие не прерывают.",
        "Предписывающие — синий круг, особые предписания и информационные — синий прямоугольник, временные — жёлтый фон.",
        "Таблички уточняют знак: 8.14 «Полоса движения» — только для этой полосы, 8.16 «Влажное покрытие» — только когда мокро.",
      ])}
      <div class="row"><button class="btn primary" data-act="signs">Открыть все знаки</button></div>
      </section>
    </div>`;
  };

  /* ----- signs & markup ----- */
  VIEWS.signs = async (v) => {
    if (!S.refs.signs || !S.refs.markup) app().innerHTML = `<div class="loading">Загружаю знаки…</div>`;
    let signs, markup;
    try { [signs, markup] = await Promise.all([loadRef("signs"), loadRef("markup")]); } catch (e) {
      app().innerHTML = `<div class="card stack"><h2>Не удалось загрузить знаки</h2><p class="muted">Проверьте подключение и обновите страницу.</p><button class="btn" data-act="home">На главную</button></div>`;
      return;
    }
    if (S.view !== v) return;
    const tab = v.tab || "signs";
    const groups = tab === "signs" ? signs : markup;
    const qv = (v.query || "").trim().toLowerCase();
    const byTitle = (it) => (it.n + " " + it.t).toLowerCase().includes(qv);
    const byAll = (it) => (it.n + " " + it.t + " " + it.d).toLowerCase().includes(qv);
    const match = !qv ? () => true : groups.some((g) => g.items.some(byTitle)) ? byTitle : byAll;
    const groupsHtml = groups.map((g) => {
      const items = g.items.filter(match);
      if (!items.length) return "";
      return `<section class="card stack"><h2>${esc(g.g)}</h2><div class="signs">${items.map((it) => `<div class="sign ${tab === "markup" ? "wide" : ""}" title="${esc(it.d)}">
        ${it.img ? `<img src="${it.img}" alt="${esc(it.n)}" loading="lazy">` : ""}
        <b>${esc(it.n)}</b><span>${esc(it.t || it.d.slice(0, 90))}</span></div>`).join("")}</div></section>`;
    }).join("");
    app().innerHTML = `<div class="stack">
      <div class="row"><button class="btn ghost" data-act="home">← Назад</button></div>
      <section class="card stack">
        <h1>Знаки и разметка</h1>
        <div class="row">
          <div class="seg" role="group" aria-label="Раздел">
            <button data-act="signs-tab" data-v="signs" aria-pressed="${tab === "signs"}">Знаки</button>
            <button data-act="signs-tab" data-v="markup" aria-pressed="${tab === "markup"}">Разметка</button>
          </div>
          <button class="btn primary" data-act="signquiz">Тренажёр знаков · 20</button>
        </div>
        <input class="search" id="sign-search" type="search" placeholder="Поиск: номер или название, например 3.27 или стоянка" value="${esc(v.query || "")}" aria-label="Поиск знака">
      </section>
      <div class="stack" id="sign-groups">${groupsHtml || `<p class="muted">Ничего не найдено.</p>`}</div>
    </div>`;
    const inp = $("#sign-search");
    if (v.focusSearch) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  };

  VIEWS.signquiz = async (v) => {
    if (!v.items) {
      app().innerHTML = `<div class="loading">Загружаю знаки…</div>`;
      let signs;
      try { signs = await loadRef("signs"); } catch (e) { toast("Не удалось загрузить знаки"); go({ name: "home" }); return; }
      if (S.view !== v) return;
      const all = [];
      signs.forEach((g) => g.items.forEach((it) => { if (it.img && it.t) all.push(Object.assign({ g: g.g }, it)); }));
      v.items = shuffle(all).slice(0, 20).map((it) => {
        const same = all.filter((x) => x.g === it.g && x.t !== it.t);
        const pool = same.length >= 3 ? same : all.filter((x) => x.t !== it.t);
        const opts = shuffle([it.t].concat(shuffle(pool).slice(0, 3).map((x) => x.t)));
        return { it, opts, res: null };
      });
      v.pos = 0;
    }
    const cur = v.items[v.pos];
    if (!cur) {
      const ok = v.items.filter((x) => x.res === x.it.t).length;
      if (!v.scored) {
        v.scored = true;
        if (ok > (S.game.best.signs || 0)) S.game.best.signs = ok;
        addXP(ok * 3);
        checkAch();
        saveNow();
        if (ok >= 18) celebrate();
      }
      app().innerHTML = `<div class="stack"><section class="card stack"><span class="label">Тренажёр знаков</span><div class="res-big ${ok >= 18 ? "ok" : ""}">${ok} из ${v.items.length}</div>
        <div class="row"><button class="btn primary" data-act="signquiz">Ещё 20 знаков</button><button class="btn" data-act="signs">Справочник</button><button class="btn ghost" data-act="home">На главную</button></div></section>
        ${v.items.filter((x) => x.res !== x.it.t).map((x) => `<section class="card row"><img src="${x.it.img}" alt="" style="width:64px;height:64px;object-fit:contain;background:#fff;border-radius:6px"><div style="min-width:0;flex:1"><b class="num">${esc(x.it.n)}</b> ${esc(x.it.t)}<p class="small muted">${esc(x.it.d)}</p></div></section>`).join("")}</div>`;
      return;
    }
    const answered = cur.res != null;
    app().innerHTML = `<div class="stack">
      <div class="qhead"><span class="label">Тренажёр знаков</span><span class="sp"></span><span class="small muted num">${v.pos + 1}/${v.items.length}</span></div>
      <article class="card qcard">
        <div class="sign-q"><img src="${cur.it.img}" alt="Знак"></div>
        <div class="qbody">
          <p class="qtext">Что означает этот знак?</p>
          <div class="answers">${cur.opts.map((o, k) => {
            let cls = "";
            if (answered) cls = o === cur.it.t ? "right" : o === cur.res ? "wrong" : "dim";
            return `<button class="ans ${cls}" data-act="sq-answer" data-k="${k}" ${answered ? "disabled" : ""}><span class="k">${k + 1}</span><span>${esc(o)}</span></button>`;
          }).join("")}</div>
          ${answered ? `<div class="tip"><b class="num">${esc(cur.it.n)}</b> ${esc(cur.it.t)}${cur.it.d ? ". " + esc(cur.it.d) : ""}</div>` : ""}
          <div class="qactions"><span class="sp"></span>${answered ? `<button class="btn primary" data-act="sq-next" id="next-btn">Дальше</button>` : ""}<button class="btn ghost danger" data-act="home">Выйти</button></div>
        </div>
      </article>
    </div>`;
    if (answered) { const nb = $("#next-btn"); if (nb) nb.focus({ preventScroll: true }); }
  };

  /* ----- settings ----- */
  VIEWS.settings = (v) => {
    const exported = v.showExport ? JSON.stringify({ v: 1, prog: S.prog, stats: S.stats, exams: S.exams, game: S.game }) : "";
    app().innerHTML = `<div class="stack">
      <div class="row"><button class="btn ghost" data-act="home">← Назад</button></div>
      <section class="card stack">
        <h1>Настройки</h1>
        <div class="field"><label for="examDate">Дата экзамена</label><input id="examDate" type="date" value="${esc(S.set.examDate)}" data-set="examDate"><span class="small muted">По ней считается дневная норма; интервалы повторения сжимаются, чтобы всё повторить до экзамена.</span></div>
        <div class="field"><label for="newPer">Новых вопросов в одной порции</label><select id="newPer" data-set="newPer">${[10, 15, 20, 30, 40, 60].map((n) => `<option value="${n}" ${+S.set.newPer === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div class="field"><label for="goal">Цель дня, ответов</label><select id="goal" data-set="goal">${[30, 60, 100, 150, 200, 300].map((n) => `<option value="${n}" ${+S.set.goal === n ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <label class="switch"><input type="checkbox" id="errorless" data-set="errorless" ${S.set.errorless ? "checked" : ""}> Режим «с нуля»: новый вопрос сначала с ответом</label>
        <label class="switch"><input type="checkbox" id="sound" data-set="sound" ${S.set.sound ? "checked" : ""}> Звуки</label>
        <label class="switch"><input type="checkbox" id="autoNext" data-set="autoNext" ${S.set.autoNext ? "checked" : ""}> Сразу дальше после верного ответа</label>
        <label class="switch"><input type="checkbox" id="shuffle" data-set="shuffle" ${S.set.shuffle ? "checked" : ""}> Перемешивать варианты ответов (учит смысл, а не позицию)</label>
        <label class="switch"><input type="checkbox" id="examHints" data-set="examHints" ${S.set.examHints ? "checked" : ""}> Показывать ответы во время экзамена</label>
        <label class="switch"><input type="checkbox" id="speakAuto" data-set="speakAuto" ${S.set.speakAuto ? "checked" : ""} ${tts.ok ? "" : "disabled"}> Читать вопросы и пояснения вслух${tts.ok ? "" : " (браузер не поддерживает)"}</label>
        <div class="field"><label for="theme">Тема</label><select id="theme" data-set="theme"><option value="auto" ${S.set.theme === "auto" ? "selected" : ""}>Как в системе</option><option value="light" ${S.set.theme === "light" ? "selected" : ""}>Светлая</option><option value="dark" ${S.set.theme === "dark" ? "selected" : ""}>Тёмная</option></select></div>
      </section>
      <section class="card stack">
        <h2>Перенос прогресса</h2>
        <p class="small muted">Прогресс хранится в этом браузере. Чтобы перенести на другое устройство, скопируйте код и вставьте его там.</p>
        <div class="row"><button class="btn" data-act="export">Показать код прогресса</button>${v.showExport ? `<button class="btn" data-act="copy-export">Копировать</button>` : ""}</div>
        ${v.showExport ? `<textarea id="export-box" readonly aria-label="Код прогресса">${esc(exported)}</textarea>` : ""}
        <label class="small" for="import-box">Вставьте код с другого устройства</label>
        <textarea id="import-box" placeholder='{"v":1,...}'></textarea>
        <div class="row"><button class="btn" data-act="import">Загрузить прогресс</button></div>
      </section>
      <section class="card stack">
        <h2>Сброс</h2>
        <div class="row"><button class="btn danger" data-act="reset">${v.confirmReset ? "Нажмите ещё раз — всё удалится" : "Сбросить весь прогресс"}</button></div>
      </section>
      <p class="small muted">Вопросы: официальные билеты ГИБДД, база <a href="https://github.com/etspring/pdd_russia" target="_blank" rel="noopener">etspring/pdd_russia</a>.</p>
    </div>`;
  };

  /* ---------- actions ---------- */
  function ensureMarathon() {
    const d = D();
    let m = S.mar[S.set.cat];
    if (!m || !Array.isArray(m.order) || m.order.length !== d.unique.length || m.pos >= m.order.length) {
      m = S.mar[S.set.cat] = { order: shuffle(d.unique.map((_, i) => i)), pos: 0 };
    }
    return m;
  }

  const ACTIONS = {
    home: () => go({ name: "home" }),
    settings: () => go({ name: "settings" }),
    cat: async (el) => {
      const cat = el.dataset.v;
      if (cat === S.set.cat) return;
      if (S.view.name === "run" && S.view.R.kind === "exam" && S.view.R.status === "run") { toast("Закончите экзамен"); return; }
      app().innerHTML = `<div class="loading">Загружаю вопросы ${CAT_LABEL[cat]}…</div>`;
      try { await loadCat(cat); } catch (e) { toast("Не удалось загрузить вопросы"); render(); return; }
      S.set.cat = cat;
      saveSet();
      go({ name: "home" });
    },
    learn: () => startLearn(null),
    "learn-topic": (el) => {
      const ti = +el.dataset.ti;
      const tp = D().topics.find((t) => t.ti === ti);
      if (!tp) return;
      startLearn(tp.qs);
      if (S.view.name === "run") { S.view.R.learnTi = ti; S.view.R.title = tp.name; render(); }
    },
    exam: (el) => startExam(el.dataset.t ? +el.dataset.t : 0),
    ticket: (el) => go({ name: "ticket", t: +el.dataset.t }),
    topics: () => go({ name: "topics" }),
    topic: (el) => go({ name: "topic", ti: +el.dataset.ti }),
    "practice-ticket": (el) => startRunner("practice", `Билет ${el.dataset.t}`, D().byTicket[+el.dataset.t]),
    "practice-topic": (el) => {
      const tp = D().topics.find((t) => t.ti === +el.dataset.ti);
      startRunner("practice", tp.name, tp.qs.slice().sort((a, b) => box(a) - box(b)));
    },
    mistakes: () => {
      const list = mistakesList(D());
      if (!list.length) { toast("Ошибок нет. Решите экзамен или учите новые."); return; }
      startRunner("practice", "Ошибки", list.slice(0, 40));
    },
    marathon: () => {
      const d = D();
      const m = ensureMarathon();
      const qs = m.order.slice(m.pos).map((i) => d.unique[i]);
      startRunner("marathon", `Марафон · с ${m.pos + 1}-го`, qs, { offset: m.pos });
    },
    browse: (el) => go({ name: "browse", src: el.dataset.src, t: +el.dataset.t || 0, ti: +el.dataset.ti || 0, back: S.view }),
    "back-browse": () => { const b = S.view.back; go(b && b.name !== "browse" ? Object.assign({}, b) : { name: "home" }); },
    listen: (el) => go({ name: "listen", src: el.dataset.src, t: +el.dataset.t || 0, ti: +el.dataset.ti || 0 }),
    cheat: () => go({ name: "cheat" }),
    signs: () => go({ name: "signs", tab: "signs" }),
    "signs-tab": (el) => go({ name: "signs", tab: el.dataset.v, query: S.view.query || "" }),
    signquiz: () => go({ name: "signquiz" }),
    "sq-answer": (el) => {
      const v = S.view, cur = v.items[v.pos];
      if (cur.res != null) return;
      cur.res = cur.opts[+el.dataset.k];
      beep(cur.res === cur.it.t ? "ok" : "no");
      render();
    },
    "sq-next": () => { S.view.pos++; render(); window.scrollTo(0, 0); },
    answer: (el) => answer(+el.dataset.a),
    next: () => nextQuestion(),
    guessed: () => markGuessed(),
    studied: () => studied(),
    blitz: () => startBlitz(),
    achievements: () => go({ name: "achievements" }),
    errorless: () => { S.set.errorless = !S.set.errorless; saveSet(); toast(S.set.errorless ? "Режим «с нуля» включён" : "Режим «с нуля» выключен"); render(); },
    skip: () => advanceExam(S.view.R),
    jump: (el) => {
      const R = S.view.R;
      clearTimeout(S.view.autoTimer);
      R.pos = +el.dataset.i;
      render();
    },
    quit: () => {
      const v = S.view, R = v.R;
      const examRunning = R.kind === "exam" && R.status === "run";
      if (examRunning && !v.confirmQuit) { v.confirmQuit = true; render(); return; }
      if (examRunning) { finishExam(R, false, "Экзамен прерван"); return; }
      if (R.kind === "blitz" && R.status === "run") { finishBlitz(R, "Остановлено"); return; }
      if (R.items.some((x) => x.res != null)) finishRunner(R);
      else go({ name: "home" });
    },
    "redo-wrong": () => {
      const v = S.view;
      startRunner("practice", "Работа над ошибками", v.wrongQs || []);
    },
    "say-q": () => { const it = S.view.R.items[S.view.R.pos]; tts.ok ? tts.speak(qSpeech(it.q)) : toast("Озвучка не поддерживается браузером"); },
    "say-a": () => { const it = S.view.R.items[S.view.R.pos]; tts.ok ? tts.speak(aSpeech(it.q)) : toast("Озвучка не поддерживается браузером"); },
    "pl-toggle": () => {
      const v = S.view, pl = v.player;
      if (!tts.ok) { toast("Озвучка не поддерживается браузером"); return; }
      pl.playing = !pl.playing;
      if (!pl.playing) tts.stop();
      render();
      if (pl.playing) playerStep(v);
    },
    "pl-next": () => { const v = S.view; tts.stop(); v.player.i = Math.min(v.qs.length - 1, v.player.i + 1); render(); if (v.player.playing) playerStep(v); },
    "pl-prev": () => { const v = S.view; tts.stop(); v.player.i = Math.max(0, v.player.i - 1); render(); if (v.player.playing) playerStep(v); },
    export: () => { S.view.showExport = true; render(); },
    "copy-export": () => {
      const box2 = $("#export-box");
      const text = box2 ? box2.value : "";
      const fallback = () => { if (box2) { box2.focus(); box2.select(); } toast("Выделено — скопируйте вручную"); };
      try {
        navigator.clipboard.writeText(text).then(() => toast("Скопировано"), fallback);
      } catch (e) { fallback(); }
    },
    import: () => {
      const raw = ($("#import-box") || {}).value || "";
      try {
        const obj = JSON.parse(raw);
        if (!obj || typeof obj.prog !== "object" || Array.isArray(obj.prog)) throw new Error("bad");
        const clean2 = {};
        Object.entries(obj.prog).forEach(([id, p]) => {
          if (/^[0-9a-f]{32}$/.test(id) && p && Number.isFinite(p.b) && p.b >= 0 && p.b <= 6) {
            clean2[id] = { b: p.b | 0, d: +p.d || 0, r: +p.r || 0, w: +p.w || 0, l: +p.l || 0, lw: +p.lw || 0 };
          }
        });
        S.prog = Object.assign(S.prog, clean2);
        if (obj.stats && obj.stats.days && typeof obj.stats.days === "object") Object.assign(S.stats.days, obj.stats.days);
        if (obj.game && Number.isFinite(obj.game.xp)) {
          S.game.xp = Math.max(S.game.xp, obj.game.xp);
          if (obj.game.ach && typeof obj.game.ach === "object") Object.entries(obj.game.ach).forEach(([k, t]) => { if (ACH.some((a) => a.id === k) && Number.isFinite(t)) S.game.ach[k] = S.game.ach[k] || t; });
          if (obj.game.best && typeof obj.game.best === "object") ["combo", "blitz", "signs"].forEach((k) => { if (Number.isFinite(obj.game.best[k])) S.game.best[k] = Math.max(S.game.best[k] || 0, obj.game.best[k]); });
        }
        if (Array.isArray(obj.exams)) S.exams = S.exams.concat(obj.exams.filter((e) => e && typeof e.t === "number")).sort((a, b) => a.ts - b.ts);
        saveNow();
        toast(`Загружено ${Object.keys(clean2).length} вопросов`);
        go({ name: "home" });
      } catch (e) { toast("Код не распознан. Скопируйте его целиком."); }
    },
    reset: () => {
      const v = S.view;
      if (!v.confirmReset) { v.confirmReset = true; render(); return; }
      S.prog = {}; S.stats = { days: {} }; S.exams = []; S.mar = {}; S.game = { xp: 0, ach: {}, best: {} };
      saveNow();
      toast("Прогресс сброшен");
      go({ name: "home" });
    },
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "SELECT") return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.set) {
      const k = el.dataset.set;
      let val = el.type === "checkbox" ? el.checked : el.value;
      if (k === "newPer") val = Math.max(5, Math.min(100, parseInt(val, 10) || 20));
      if (k === "goal") val = Math.max(10, Math.min(1000, parseInt(val, 10) || 60));
      if (k === "examDate" && val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) val = "";
      S.set[k] = val;
      saveSet();
      if (k === "theme") applyTheme();
      if (k === "speakAuto" && !val) tts.stop();
      toast("Сохранено");
    } else if (el.dataset.act === "rate") {
      S.set.rate = +el.value || 1;
      saveSet();
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "sign-search" && S.view.name === "signs") {
      S.view.query = e.target.value;
      S.view.focusSearch = true;
      clearTimeout(S.view.qTimer);
      S.view.qTimer = setTimeout(() => render(), 200);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    const v = S.view;
    if (v.name === "run") {
      const R = v.R, it = R.items[R.pos];
      if (it.study && it.res == null) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") { e.preventDefault(); studied(); }
        return;
      }
      if (/^[1-5]$/.test(e.key)) {
        const k = +e.key - 1;
        if (it.res == null && k < it.ord.length) { e.preventDefault(); answer(it.ord[k]); }
      } else if ((e.key === "Enter" || e.key === " " || e.key === "ArrowRight") && it.res != null) {
        e.preventDefault(); nextQuestion();
      } else if ((e.key === "g" || e.key === "п" || e.key === "G" || e.key === "П") && R.kind !== "exam" && R.kind !== "blitz") {
        markGuessed();
      }
    } else if (v.name === "signquiz" && v.items) {
      const cur = v.items[v.pos];
      if (!cur) return;
      if (/^[1-4]$/.test(e.key) && cur.res == null) { cur.res = cur.opts[+e.key - 1]; render(); }
      else if ((e.key === "Enter" || e.key === " ") && cur.res != null) { e.preventDefault(); ACTIONS["sq-next"](); }
    }
  });

  /* ---------- boot ---------- */
  async function boot() {
    applyTheme();
    renderBar();
    app().innerHTML = `<div class="loading">Загружаю 800 вопросов…</div>`;
    if (!S.data[S.set.cat]) {
      try { await loadCat(S.set.cat); } catch (e) {
        try { S.set.cat = "ab"; await loadCat("ab"); } catch (e2) {
          app().innerHTML = `<div class="card stack"><h2>Вопросы не загрузились</h2><p class="muted">${esc(e2.message)}. Обновите страницу. Если открываете файл с диска, запустите локальный сервер: <code>python3 -m http.server</code> в папке pdd.</p></div>`;
          return;
        }
      }
    }
    const hash = (location.hash || "").slice(1);
    const deep = { exam: () => startExam(0), learn: () => startLearn(null), cheat: () => go({ name: "cheat" }), signs: () => go({ name: "signs", tab: "signs" }), topics: () => go({ name: "topics" }), mistakes: () => ACTIONS.mistakes(), blitz: () => startBlitz(), achievements: () => go({ name: "achievements" }) };
    S.view = { name: "home" };
    render();
    if (deep[hash]) deep[hash]();
    window.addEventListener("hashchange", () => {
      const h = (location.hash || "").slice(1);
      const busy = S.view.name === "run" && S.view.R.kind === "exam" && S.view.R.status === "run";
      if (deep[h] && !busy) deep[h]();
    });
  }
  boot();
})();
