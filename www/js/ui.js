'use strict';
/* Board rendering, input handling and the human player's controller. Uses the original TW3 Gwent textures in assets/. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const TOUCH = matchMedia('(pointer: coarse)').matches;
if (TOUCH) document.documentElement.classList.add('touch');

const Store = {
  get(k, d) { try { const v = localStorage.getItem('gwent.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('gwent.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

const Settings = Object.assign({ name: 'Geralt', sound: true, music: true }, Store.get('settings', {}));
function saveSettings() { Store.set('settings', Settings); }

/* ------------------------------------------------------------------ Audio */
const Sfx = {
  play(name) {
    if (!Settings.sound || !name) return;
    try {
      const a = new Audio(`assets/sfx/${name}.mp3`);
      a.volume = 0.55;
      a.play().catch(() => {});
    } catch { /* audio unavailable */ }
  },
};

/** The five Gwent tracks that play during matches and in the taverns of The Witcher 3, looped in shuffled order. */
const Music = {
  tracks: ['the_nightingale', 'back_on_the_path', 'another_round_for_everyone', 'a_story_you_wont_believe', 'gwent_tavern_theme'],
  el: null, order: [], i: 0,
  start() {
    if (!Settings.music) return;
    if (!this.el) {
      this.el = new Audio();
      this.el.volume = 0.32;
      this.el.addEventListener('ended', () => this.next());
      this.order = shuffle([...this.tracks]);
      this.el.src = `assets/music/${this.order[0]}.mp3`;
    }
    this.el.play().catch(() => {});
  },
  next() {
    this.i = (this.i + 1) % this.order.length;
    this.el.src = `assets/music/${this.order[this.i]}.mp3`;
    this.el.play().catch(() => {});
  },
  pause() { if (this.el) this.el.pause(); },
  set(on) { Settings.music = on; saveSettings(); if (on) this.start(); else this.pause(); },
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) Music.pause(); else if (Settings.music && Music.el) Music.start();
});

/* ------------------------------------------------------------------ Asset paths */
const uiImg = name => `assets/ui/${name}`;
function artFile(card, size) {
  const id = card.id === 'leader_horn' ? 'horn' : card.id;
  return `assets/cards/${size}/${id}${card.v ? '_' + card.v : ''}.jpg`;
}
const abilityIcon = a => uiImg(`card_ability_${a.startsWith('scorch') ? 'scorch' : a}.png`);

/* ------------------------------------------------------------------ Card rendering */
const FACE = { lg: 'lg', md: 'lg', db: 'db', dbl: 'db' };

/**
 * size: 'sm' (board), 'hand', 'pile' → art texture with the strength badge and icons;
 *       'lg', 'md' → the full printed card; 'db', 'dbl' → deck-builder face (name only).
 */
function cardHTML(card, o = {}) {
  const t = CARDS[card.id];
  const size = o.size || 'sm';
  const cls = ['card', size, 't-' + t.type];
  if (t.hero) cls.push('hero');
  if (o.cls) cls.push(o.cls);
  const attrs = `data-uid="${card.uid ?? ''}" data-id="${t.id}" data-v="${card.v || 0}" data-power="${o.power ?? ''}"`;
  if (FACE[size]) {
    // Deck-builder faces have a blank parchment: the name is drawn in the game's font, as in The Witcher 3
    const name = FACE[size] === 'db'
      ? `<div class="db-name${t.type === 'unit' && t.faction !== 'neutral' ? ' banner' : ''}">${t.name.split(': ').map(esc).join('<br>')}</div>` : '';
    return `<div class="${cls.join(' ')}" ${attrs}><img class="c-art" src="${artFile(card, FACE[size])}" alt="${esc(t.name)}" loading="lazy">${name}</div>`;
  }
  let over = '';
  if (t.type === 'unit') {
    const pw = o.power ?? t.strength;
    const d = t.hero ? '' : pw > t.strength ? ' buff' : pw < t.strength ? ' nerf' : '';
    over = `<div class="c-pow ${t.hero ? 'hero' : 'normal'}"><span class="${d}">${pw}</span></div>`;
    const icons = t.abilities.filter(a => a !== 'hero').map(abilityIcon);
    icons.push(uiImg(`card_row_${t.row}.png`));
    over += `<div class="c-icons">${icons.map(src => `<img src="${src}" alt="">`).join('')}</div>`;
  } else if (t.type !== 'leader') {
    over = `<div class="c-pow" style="background-image:url('${uiImg(`power_${t.ability}.png`)}')"></div>`;
  }
  return `<div class="${cls.join(' ')}" ${attrs}><img class="c-art" src="${artFile(card, 'sm')}" alt="">${over}</div>`;
}

/** Contents of the game's ability box for a card: icon, title and description. */
function abilityInfo(t) {
  if (t.type === 'leader') return { title: 'Leader Ability', text: t.desc };
  if (t.type !== 'unit') {
    const [name, ...rest] = SPECIAL_DESC[t.ability].split(': ');
    return { icon: abilityIcon(t.ability), title: name, text: rest.join(': ') };
  }
  const ab = t.abilities.find(a => a !== 'hero') || (t.hero ? 'hero' : t.row === 'agile' ? 'agile' : null);
  if (!ab) return null;
  const icon = ab === 'hero' ? uiImg('power_hero.png') : ab === 'agile' ? uiImg('card_row_agile.png') : abilityIcon(ab);
  let text = ABILITIES[ab].desc;
  if (t.muster && t.muster !== t.group) text = `Find any ${CARDS[t.muster].name} cards in your deck and play them instantly.`;
  return { icon: ab === 'hero' ? null : icon, title: ABILITIES[ab].name, text };
}

function descHTML(t, extra = '') {
  const info = abilityInfo(t);
  if (!info && !extra) return '';
  return (info ? `${info.icon ? `<img class="db-icon" src="${info.icon}" alt="">` : ''}<h4>${esc(info.title)}</h4><p>${esc(info.text)}</p>` : '') + extra;
}

/** Overlap cards in a container so they fit maxW (as the game does when a row fills up). */
function fan(el, cw, maxW) {
  const kids = el.children, n = kids.length;
  if (n < 2) return;
  const m = n * cw <= maxW ? 0 : -(n * cw - maxW) / (n - 1);
  for (let i = 1; i < n; i++) kids[i].style.marginLeft = m + 'px';
}

function sortCards(cards) {
  const rank = c => { const t = T(c); return t.type === 'unit' ? 2 : t.type === 'weather' ? 1 : 0; };
  return [...cards].sort((a, b) => rank(a) - rank(b) || T(a).strength - T(b).strength || T(a).name.localeCompare(T(b).name));
}

function hintsHTML(list) {
  return list.map(h => `<button class="hint${h.primary ? ' primary' : ''}${h.off ? ' off' : ''}" data-act="${h.act}">${h.key ? `<kbd>${h.key}</kbd>` : ''}${esc(h.label)}</button>`).join('');
}

/* ------------------------------------------------------------------ Human controller */
class HumanController {
  constructor(ui) { this.ui = ui; this.human = true; }
  mulligan(g, p) { return this.ui.mulligan(g, p); }
  chooseFirst(g, p) { return this.ui.askFirst(g, p); }
  takeTurn(g, p) { return this.ui.awaitTurn(g, p); }
  chooseCard(g, p, cards, title, opts) { return this.ui.chooseFromCards(cards, title, opts); }
  chooseRow(g, p, card, rows) { return this.ui.chooseRow(card, rows); }
  reveal(g, p, cards, title) { return this.ui.reveal(cards, title); }
}

/* ------------------------------------------------------------------ UI */
const UI = {
  me: 0, game: null, sel: null, turn: null, rowPick: null, seen: new Set(), lastDecks: null, ch: null, scale: 1,
  fly: null, passHold: null, onGameOver: null,

  init() {
    this.fit();
    this.lockScroll();
    addEventListener('resize', () => this.fit());
    const gameEl = $('#game');
    gameEl.addEventListener('click', e => this.onClick(e));
    gameEl.addEventListener('mouseover', e => {
      const c = e.target.closest('.card');
      if (c && !e.target.closest('#preview')) { this.hover = c; this.preview(c); }
    });
    gameEl.addEventListener('mouseout', e => {
      if (e.target.closest('.card') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.card'))) {
        this.hover = null;
        this.previewSelected();
      }
    });
    this.bindZoom(gameEl);
    const ph = $('#pass-hint');
    ph.addEventListener('pointerdown', e => { e.preventDefault(); this.startPassHold(); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) ph.addEventListener(ev, () => this.cancelPassHold());
    // Carousel input from pointer events (mouse, touch and pen alike): a horizontal swipe browses, a tap selects.
    const car = $('#chooser .ch-carousel');
    let down = null;
    car.addEventListener('pointerdown', e => { down = { x: e.clientX, slot: e.target.closest('.slot') }; });
    car.addEventListener('pointercancel', () => { down = null; });
    car.addEventListener('pointerup', e => {
      if (!down) return;
      const dx = e.clientX - down.x, slot = e.target.closest('.slot');
      if (Math.abs(dx) > 40 * this.scale) this.moveCarousel(dx < 0 ? 1 : -1);
      else if (slot && slot === down.slot) this.onSlotTap(slot);
      down = null;
    });
    $('#chooser .ch-hints').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && this.ch?.acts[b.dataset.act]) this.ch.acts[b.dataset.act](); });
    $('#game-hints').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'menu') this.gameMenu(); if (b.dataset.act === 'zoom' && this.hover) this.zoomEl(this.hover); });
    $('#gameover .go-hints').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) this.gameOverAct(b.dataset.act); });
    document.addEventListener('keydown', e => this.onKey(e));
    document.addEventListener('keyup', e => { if (e.key === ' ') this.cancelPassHold(); });
  },

  /** Belt and braces for browsers without overflow: clip — never let the fixed stage be scrolled. */
  lockScroll() {
    for (const el of [document.documentElement, document.body, $('#viewport'), $('#stage'), ...$$('.screen')]) {
      el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } });
    }
  },

  fit() {
    const w = innerWidth, h = innerHeight, s = Math.min(w / 1920, h / 1080);
    this.scale = s;
    $('#stage').style.transform = `translate(${(w - 1920 * s) / 2}px, ${(h - 1080 * s) / 2}px) scale(${s})`;
  },

  show(id) { $$('.screen').forEach(x => x.classList.toggle('active', x.id === id)); },
  sfx(name) { Sfx.play(name); },

  toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), 2500);
    Sfx.play('warning');
  },

  /** Right-click or long-press on any card shows it zoomed in, with its ability box. */
  bindZoom(root) {
    root.addEventListener('contextmenu', e => {
      const c = e.target.closest('.card');
      if (c) { e.preventDefault(); this.zoomEl(c); }
    });
    let timer = null;
    root.addEventListener('touchstart', e => {
      const c = e.target.closest('.card');
      if (!c) return;
      timer = setTimeout(() => {
        timer = null;
        // swallow the click that ends this touch, so it doesn't also play/add the card or close the zoom
        const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };
        document.addEventListener('click', eat, { capture: true, once: true });
        setTimeout(() => document.removeEventListener('click', eat, { capture: true }), 700);
        this.zoomEl(c);
      }, 480);
    }, { passive: true });
    const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
    root.addEventListener('touchend', cancel);
    root.addEventListener('touchmove', cancel, { passive: true });
  },

  zoomEl(el) {
    const card = { id: el.dataset.id, uid: el.dataset.uid || el.dataset.id, v: +el.dataset.v || 0 };
    const power = el.dataset.power === '' ? undefined : +el.dataset.power;
    this.zoom(card, power);
  },

  zoom(card, power) {
    if (this.ch) return;
    const t = CARDS[card.id];
    const extra = t.type === 'unit' && power !== undefined && power !== t.strength ? `<p class="cur">Current strength: ${power}</p>` : '';
    this.openChooser({
      title: '', cards: [card], dark: true, extra,
      hints: [{ act: 'close', key: 'Esc', label: 'Close' }],
      acts: { close: () => this.closeChooser() }, onPick: () => this.closeChooser(),
    });
  },

  /* -------------------------------------------------------------- game lifecycle */
  async startGame(myDeck, oppDeck) {
    this.abort();
    this.lastDecks = [myDeck, oppDeck];
    const setup = [
      { name: Settings.name || 'Geralt', human: true, leader: myDeck.leader, cards: myDeck.cards },
      { name: 'Opponent', human: false, leader: oppDeck.leader, cards: oppDeck.cards },
    ];
    const game = new Game(setup, [new HumanController(this), new AIController()], this);
    this.preload(game);
    Object.assign(this, { game, me: 0, sel: null, turn: null, rowPick: null, seen: new Set() });
    $('#game-hints').innerHTML = hintsHTML([{ act: 'zoom', key: 'Z', label: 'Zoom' }, { act: 'menu', key: 'Esc', label: 'Forfeit Game' }]);
    this.show('game');
    this.preview(null);
    this.render();
    Sfx.play('game_start');
    Music.start();
    await game.run();
  },

  /** Warm the image cache with every texture this match can show, so cards never pop in. */
  preload(game) {
    const urls = new Set();
    for (const p of game.s.players) {
      for (const c of [...p.deck, ...p.hand, p.leader]) {
        urls.add(artFile(c, 'sm'));
        const t = T(c);
        if (t.target) urls.add(artFile({ id: t.target }, 'sm'));
      }
      urls.add(uiImg(`deck_back_${p.faction}.jpg`));
    }
    for (const n of ['round_start', 'me_turn', 'op_turn', 'round_passed', 'win_round', 'lose_round', 'draw_round', 'me_coin', 'op_coin']) urls.add(uiImg(`notif_${n}.png`));
    this.preloaded = [...urls].map(u => { const i = new Image(); i.decoding = 'async'; i.src = u; return i; });
  },

  abort() {
    if (this.game) this.game.aborted = true;
    this.game = null;
    this.turn = this.rowPick = this.sel = this.ch = null;
    for (const id of ['chooser', 'dialog', 'gameover']) $('#' + id).classList.remove('show');
    $('#stage').classList.remove('overlay-open', 'dialog-open');
    $('#banner').className = '';
    this.hint('');
    this.cancelPassHold();
  },

  /* -------------------------------------------------------------- rendering */
  render() {
    const g = this.game;
    if (!g) return;
    const s = g.s, me = s.players[this.me], op = s.players[1 - this.me];
    const tg = this.targets();
    const seen = new Set();
    const fresh = c => { seen.add(c.uid); return this.seen.has(c.uid) || (this.fly && this.fly.uid === c.uid) ? '' : ' new'; };

    for (const [sk, side] of [['op', op], ['me', me]]) {
      for (const r of ROWS) {
        const el = $(`#row-${sk}-${r}`), row = side.rows[r];
        el.querySelector('.row-score').textContent = g.rowTotal(side, r);
        const sp = el.querySelector('.row-special');
        sp.innerHTML = row.special ? cardHTML(row.special, { cls: fresh(row.special) }) : '';
        sp.classList.toggle('target', tg.specials.has(sk + ':' + r));
        const cc = el.querySelector('.row-cards');
        cc.innerHTML = row.cards.map(c => cardHTML(c, {
          power: g.power(side, r, c),
          cls: fresh(c) + (tg.cards.has(c.uid) ? ' target' : ''),
        })).join('');
        fan(cc, 88, 806);
        el.classList.toggle('target', tg.rows.has(sk + ':' + r));
        el.classList.remove('w-frost', 'w-fog', 'w-rain');
        for (const w of s.weather) {
          const ab = T(w.card).ability;
          if ((WEATHER_ROWS[ab] || []).includes(r)) el.classList.add('w-' + (ab === 'storm' ? (r === 'siege' ? 'rain' : 'fog') : ab));
        }
      }
    }
    const wz = $('#weather');
    wz.innerHTML = s.weather.map(w => cardHTML(w.card, { cls: fresh(w.card) })).join('');
    wz.classList.toggle('target', tg.weather);
    this.seen = seen;

    const hand = $('#hand');
    hand.innerHTML = sortCards(me.hand).map(c => cardHTML(c, { size: 'hand', cls: c.uid === this.sel ? 'sel' : '' })).join('');
    fan(hand, 92, 940);

    for (const [sk, p] of [['op', op], ['me', me]]) {
      this.panel(sk, p);
      const lcls = p.leaderBlocked ? 'blocked' : p.leaderUsed ? 'used' : '';
      $(`#${sk}-leader`).innerHTML = cardHTML(p.leader, { size: 'pile', cls: lcls });
      const la = $(`#${sk}-leader-active`);
      la.classList.toggle('on', !p.leaderUsed && !p.leaderBlocked && !T(p.leader).passive);
      la.classList.toggle('usable', sk === 'me' && !!this.turn && g.leaderUsable(p));
      $(`#${sk}-deck`).innerHTML = p.deck.length ? `<div class="back" style="background-image:url('${uiImg(`deck_back_${p.faction}.jpg`)}')"></div><span class="cnt">${p.deck.length}</span>` : '';
      const top = p.grave[p.grave.length - 1];
      $(`#${sk}-grave`).innerHTML = top ? cardHTML(top, { size: 'pile' }) : '';
    }
    $('#pass-hint').classList.toggle('on', !!this.turn);
    if (this.fly) this.runFly();
  },

  panel(sk, p) {
    const g = this.game, el = $(`#${sk}-panel`);
    el.querySelector('.pp-shield').style.backgroundImage = `url('${uiImg(`deck_shield_${p.faction}.png`)}')`;
    el.querySelector('.pp-name').textContent = p.name;
    el.querySelector('.pp-faction').textContent = FACTIONS[p.faction].name;
    el.querySelector('.pp-hand b').textContent = p.hand.length;
    $$('.pp-gems i', el).forEach((gi, i) => gi.classList.toggle('on', i < p.gems));
    el.classList.toggle('active', !g.s.over && g.s.round > 0 && g.s.current === p.id && !p.passed);
    $(`#${sk}-passed`).classList.toggle('on', p.passed && !g.s.over);
    const tot = g.total(p), ot = g.total(g.opp(p));
    const te = $(`#${sk}-total`);
    te.querySelector('span').textContent = tot;
    te.classList.toggle('lead', tot > ot);
  },

  /** Animates a just-played card from where it came from (hand or preview) to its place on the board. */
  runFly() {
    const f = this.fly;
    const el = $(`#game .row .card[data-uid="${f.uid}"], #game .row-special .card[data-uid="${f.uid}"], #weather .card[data-uid="${f.uid}"]`);
    if (!el) { if (++f.tries > 6) this.fly = null; return; } // not on the board yet: try again on the next render
    this.fly = null;
    if (!f.rect) return;
    const r = el.getBoundingClientRect();
    const dx = (f.rect.left - r.left) / this.scale, dy = (f.rect.top - r.top) / this.scale;
    const sx = f.rect.width / r.width, sy = f.rect.height / r.height;
    el.style.transformOrigin = '0 0';
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
    el.style.zIndex = 30;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = 'transform .38s cubic-bezier(.25, .8, .3, 1)';
      el.style.transform = '';
      setTimeout(() => { el.style.zIndex = ''; }, 400);
    }));
  },

  targets() {
    const tg = { rows: new Set(), specials: new Set(), cards: new Set(), weather: false };
    const g = this.game;
    if (!g) return tg;
    const me = g.s.players[this.me];
    if (this.rowPick) { for (const r of this.rowPick.rows) tg.rows.add('me:' + r); return tg; }
    if (!this.turn || !this.sel) return tg;
    const c = me.hand.find(x => x.uid === this.sel);
    if (!c) return tg;
    const t = T(c);
    if (t.type === 'unit') {
      for (const r of g.unitRows(c)) tg.rows.add((t.abilities.includes('spy') ? 'op' : 'me') + ':' + r);
    } else if (t.type === 'weather') {
      tg.weather = true;
    } else if (t.ability === 'horn' || t.ability === 'mardroeme') {
      for (const r of ROWS) if (!me.rows[r].special) tg.specials.add('me:' + r);
    } else if (t.ability === 'decoy') {
      for (const r of ROWS) for (const x of me.rows[r].cards) if (isUnit(x) && !T(x).hero) tg.cards.add(x.uid);
    } else if (t.ability === 'scorch') {
      for (const sk of ['op', 'me']) for (const r of ROWS) tg.rows.add(sk + ':' + r);
    }
    return tg;
  },

  hint(text) { $('#hint').textContent = text || ''; },

  selHint() {
    const c = this.sel && this.game.s.players[this.me].hand.find(x => x.uid === this.sel);
    if (!c) return this.hint('');
    const t = T(c);
    if (t.type === 'unit') this.hint(t.abilities.includes('spy') ? "Place on your opponent's row" : t.row === 'agile' ? 'Choose the Close Combat or Ranged Combat row' : 'Choose a row');
    else if (t.type === 'weather' || t.ability === 'scorch') this.hint('Tap the card again (or the board) to play it');
    else if (t.ability === 'decoy') this.hint(this.targets().cards.size ? 'Choose one of your units to swap with' : 'No valid targets for Decoy');
    else this.hint('Choose a row');
  },

  /* -------------------------------------------------------------- preview (right column) */
  preview(el) {
    if (!el) { this.clearPreview(); return; }
    this.previewCard({ id: el.dataset.id, uid: el.dataset.uid, v: +el.dataset.v || 0 }, el.dataset.power === '' ? undefined : +el.dataset.power);
  },

  previewCard(card, power, label) {
    const t = CARDS[card.id];
    $('#preview').innerHTML = cardHTML(card, { size: 'lg' });
    const extra = (label ? `<p class="cur">${esc(label)}</p>` : '') +
      (t.type === 'unit' && power !== undefined && power !== t.strength ? `<p class="cur">Current strength: ${power}</p>` : '');
    const d = $('#preview-desc');
    d.innerHTML = descHTML(t, extra);
    d.classList.toggle('on', !!d.innerHTML);
  },

  previewSelected() {
    const c = this.game && this.sel && this.myHand(this.sel);
    if (c) this.previewCard(c); else this.clearPreview();
  },

  clearPreview() {
    $('#preview').innerHTML = '';
    $('#preview-desc').classList.remove('on');
  },

  /* -------------------------------------------------------------- input */
  myHand(uid) { return this.game.s.players[this.me].hand.find(x => x.uid === uid); },

  onClick(e) {
    const g = this.game;
    if (!g) return;
    const el = e.target;
    const pile = el.closest('.pile.grave');
    if (pile) return this.viewGrave(pile.dataset.pile);

    if (this.rowPick) {
      const rowEl = el.closest('.row');
      if (rowEl && rowEl.dataset.side === 'me' && this.rowPick.rows.includes(rowEl.dataset.row)) {
        const rp = this.rowPick;
        this.rowPick = null;
        this.hint('');
        this.render();
        rp.resolve(rowEl.dataset.row);
      }
      return;
    }
    if (!this.turn) return;
    if (el.closest('#me-leader') || el.closest('#me-leader-active')) return this.leaderClick();

    const cardEl = el.closest('.card');
    const handCard = el.closest('#hand .card');
    if (handCard) {
      const uid = +handCard.dataset.uid;
      if (this.sel === uid) {
        const t = T(this.myHand(uid));
        if (t.type === 'weather' || t.ability === 'scorch') return this.commit({ type: 'play', uid });
        this.sel = null;
      } else {
        this.sel = uid;
        Sfx.play('ui_card');
      }
      this.render();
      this.selHint();
      this.previewSelected();
      return;
    }
    if (!this.sel) return;

    const c = this.myHand(this.sel), t = T(c), tg = this.targets();
    const rowEl = el.closest('.row');
    if (cardEl && rowEl && tg.cards.has(+cardEl.dataset.uid)) {
      return this.commit({ type: 'play', uid: c.uid, row: rowEl.dataset.row, target: +cardEl.dataset.uid });
    }
    if (t.type === 'weather' && (el.closest('#weather') || rowEl)) return this.commit({ type: 'play', uid: c.uid });
    if (rowEl) {
      const key = rowEl.dataset.side + ':' + rowEl.dataset.row;
      if (t.ability === 'scorch' && tg.rows.has(key)) return this.commit({ type: 'play', uid: c.uid });
      if (tg.rows.has(key) || tg.specials.has(key)) return this.commit({ type: 'play', uid: c.uid, row: rowEl.dataset.row });
    }
    if (!cardEl) { this.sel = null; this.render(); this.hint(''); this.clearPreview(); }
  },

  onKey(e) {
    if ($('#dialog').classList.contains('show') || (this.ch && $('#chooser').classList.contains('show'))) {
      e.stopImmediatePropagation(); // an open overlay owns the keyboard
    }
    if ($('#dialog').classList.contains('show')) {
      if (e.key === 'Escape') {
        const btns = $$('#dialog .dlg-buttons .hint');
        (btns.find(b => b.querySelector('kbd')?.textContent === 'Esc') || btns[btns.length - 1])?.click();
      }
      return;
    }
    if (this.ch && $('#chooser').classList.contains('show')) {
      if (e.key === 'ArrowLeft' || e.key === 'a') this.moveCarousel(-1);
      else if (e.key === 'ArrowRight' || e.key === 'd') this.moveCarousel(1);
      else if (e.key === 'Enter' && this.ch.onPick) this.ch.onPick(this.ch.cards[this.ch.idx]);
      else if (e.key === 'Escape' && this.ch.acts.close) this.ch.acts.close();
      else if (e.key === 'Escape' && this.ch.acts.finish) this.ch.acts.finish();
      return;
    }
    if (!$('#game').classList.contains('active')) return;
    if ($('#gameover').classList.contains('show')) {
      if (e.key === 'Enter') this.gameOverAct('again');
      if (e.key === 'Escape') this.gameOverAct('deck');
      return;
    }
    if (e.key === 'Escape') {
      if (this.sel) { this.sel = null; this.render(); this.hint(''); this.clearPreview(); }
      else this.gameMenu();
    }
    if ((e.key === 'z' || e.key === 'Z') && this.hover) this.zoomEl(this.hover);
    if (e.key === ' ' && !e.repeat && this.turn) { e.preventDefault(); this.startPassHold(); }
  },

  /* Hold to pass, as in the game */
  startPassHold() {
    if (!this.turn || this.passHold) return;
    const el = $('#pass-hint'), t0 = performance.now(), dur = 700;
    const step = now => {
      if (!this.passHold) return;
      const p = Math.min(1, (now - t0) / dur);
      el.style.setProperty('--p', (p * 100).toFixed(1) + '%');
      if (p >= 1) { this.cancelPassHold(); this.commit(PASS); return; }
      this.passHold = requestAnimationFrame(step);
    };
    this.passHold = requestAnimationFrame(step);
  },

  cancelPassHold() {
    if (this.passHold) cancelAnimationFrame(this.passHold);
    this.passHold = null;
    $('#pass-hint').style.setProperty('--p', '0%');
  },

  commit(a) {
    const t = this.turn;
    if (!t) return;
    if (a.type === 'play') {
      const el = $(`#hand .card[data-uid="${a.uid}"]`);
      if (el) this.fly = { uid: a.uid, rect: el.getBoundingClientRect(), tries: 0 };
    }
    this.turn = null;
    this.sel = null;
    this.hint('');
    this.clearPreview();
    t.resolve(a);
    this.render();
  },

  async leaderClick() {
    const g = this.game, me = g.s.players[this.me], L = T(me.leader);
    this.previewCard(me.leader);
    if (!g.leaderUsable(me)) return;
    const i = await this.dialog(`${esc(L.name.replace(':', ' –'))}<small>${esc(L.desc)}</small>`, ['Use Leader Ability', 'Cancel'], ['Enter', 'Esc']);
    if (i === 0 && this.turn) this.commit({ type: 'leader' });
  },

  awaitTurn() {
    return new Promise(resolve => {
      this.turn = { resolve };
      this.sel = null;
      this.render();
    });
  },

  chooseRow(card, rows) {
    return new Promise(resolve => {
      this.rowPick = { rows, resolve };
      this.previewCard(card);
      this.hint(`Choose a row for ${T(card).name}`);
      this.render();
    });
  },

  /* -------------------------------------------------------------- carousel (the game's card selection screen) */
  openChooser({ title, cards, onPick = null, hints = [], acts = {}, idx = 0, dark = false, extra = '', descFor = null }) {
    const ch = $('#chooser');
    ch.classList.toggle('dark', dark);
    ch.querySelector('.ch-band').style.display = title ? '' : 'none';
    ch.querySelector('.ch-title').textContent = title;
    ch.querySelector('.ch-hints').innerHTML = hintsHTML(hints);
    this.ch = { cards, idx: Math.max(0, Math.min(idx, cards.length - 1)), onPick, acts, extra, descFor };
    this.renderCarousel();
    ch.classList.add('show');
    $('#stage').classList.add('overlay-open');
    Sfx.play('open');
  },

  renderCarousel() {
    const { cards, idx } = this.ch;
    const wrap = $('#chooser .ch-carousel');
    const X = [0, 310, 618], S = [1, 0.832, 0.689];
    let html = '';
    for (let off = -2; off <= 2; off++) {
      const c = cards[idx + off];
      if (!c) continue;
      const a = Math.abs(off);
      html += `<div class="slot${off === 0 ? ' center' : ''}" data-off="${off}" style="transform: translateX(calc(-50% + ${Math.sign(off) * X[a]}px)) scale(${S[a]}); z-index: ${10 - a}">${cardHTML(c, { size: 'md' })}</div>`;
    }
    wrap.innerHTML = html;
    const t = CARDS[cards[idx].id];
    const d = $('#chooser .ch-desc');
    d.innerHTML = this.ch.descFor ? this.ch.descFor(cards[idx]) : descHTML(t, this.ch.extra);
    d.classList.toggle('on', !!d.innerHTML);
  },

  moveCarousel(d) {
    const n = this.ch.idx + d;
    if (n < 0 || n >= this.ch.cards.length) return;
    this.ch.idx = n;
    Sfx.play('ui_card');
    this.renderCarousel();
  },

  onSlotTap(slot) {
    if (!this.ch) return;
    const off = +slot.dataset.off;
    if (off !== 0) return this.moveCarousel(off);
    if (this.ch.onPick) this.ch.onPick(this.ch.cards[this.ch.idx]);
  },

  closeChooser() { $('#chooser').classList.remove('show'); $('#stage').classList.remove('overlay-open'); this.ch = null; },

  chooseFromCards(cards, title, opts = {}) {
    if (!cards.length) return Promise.resolve(null);
    return new Promise(resolve => {
      const list = opts.purpose === 'take' || opts.purpose === 'medic' ? sortCards(cards) : cards;
      const pick = c => { this.closeChooser(); resolve(c); };
      this.openChooser({
        title, cards: list, onPick: pick,
        hints: [{ act: 'select', key: 'Enter', label: 'Select' }],
        acts: { select: () => pick(this.ch.cards[this.ch.idx]) },
      });
    });
  },

  mulligan(game, p) {
    return new Promise(resolve => {
      let n = 0;
      const done = () => { this.closeChooser(); this.render(); resolve(); };
      const open = idx => this.openChooser({
        title: `Choose a card to redraw. ${n}/2`, cards: p.hand, idx,
        onPick: c => {
          const i = p.hand.indexOf(c);
          game.redraw(p, c.uid);
          Sfx.play('redraw');
          n++;
          if (n >= 2) done(); else open(i);
        },
        hints: [{ act: 'select', key: 'Enter', label: 'Select' }, { act: 'finish', key: 'Esc', label: 'Cancel' }],
        acts: { select: () => this.ch.onPick(this.ch.cards[this.ch.idx]), finish: done },
      });
      open(0);
    });
  },

  reveal(cards, title) {
    return new Promise(resolve => {
      const close = () => { this.closeChooser(); resolve(); };
      this.openChooser({ title, cards, hints: [{ act: 'close', key: 'Esc', label: 'Close' }], acts: { close } });
    });
  },

  viewGrave(which) {
    const g = this.game, p = which === 'me-grave' ? g.s.players[this.me] : g.s.players[1 - this.me];
    if (!p.grave.length || this.ch) return;
    this.openChooser({
      title: which === 'me-grave' ? 'Your discard pile' : "Opponent's discard pile",
      cards: [...p.grave].reverse(),
      hints: [{ act: 'close', key: 'Esc', label: 'Close' }], acts: { close: () => this.closeChooser() },
    });
  },

  async askFirst(game, p) {
    const i = await this.dialog("Would you like to go first?<small>Scoia'tael faction ability: you decide who goes first.</small>", ['Go First', 'Let Opponent Start'], ['Enter', 'Esc']);
    return i === 0 ? p.id : 1 - p.id;
  },

  dialog(html, buttons, keys = []) {
    return new Promise(resolve => {
      const d = $('#dialog');
      d.querySelector('.dlg-text').innerHTML = html;
      const bw = d.querySelector('.dlg-buttons');
      bw.innerHTML = '';
      buttons.forEach((label, i) => {
        const b = document.createElement('button');
        b.className = 'hint' + (i === 0 ? ' primary' : '');
        b.innerHTML = (keys[i] ? `<kbd>${keys[i]}</kbd>` : '') + esc(label);
        b.onclick = () => { d.classList.remove('show'); $('#stage').classList.remove('dialog-open'); document.removeEventListener('keydown', onEnter, true); resolve(i); };
        bw.appendChild(b);
      });
      const onEnter = e => { if (e.key === 'Enter' && keys[0] === 'Enter') { e.stopPropagation(); bw.firstChild.click(); } };
      document.addEventListener('keydown', onEnter, true);
      d.classList.add('show');
      $('#stage').classList.add('dialog-open');
    });
  },

  async gameMenu() {
    if (!this.game || this.ch) return;
    for (;;) {
      const i = await this.dialog('Game paused', ['Resume', `Music: ${Settings.music ? 'On' : 'Off'}`, `Sound: ${Settings.sound ? 'On' : 'Off'}`, 'Forfeit Game'], ['Esc']);
      if (i === 1) { Music.set(!Settings.music); continue; }
      if (i === 2) { Settings.sound = !Settings.sound; saveSettings(); continue; }
      if (i === 3) {
        const k = await this.dialog('Forfeit this game?<small>The match will count as a loss.</small>', ['Forfeit', 'Cancel'], ['Enter', 'Esc']);
        if (k === 0) { this.abort(); if (this.onForfeit) this.onForfeit(); }
      }
      return;
    }
  },

  /* -------------------------------------------------------------- effects */
  async banner(text, ms = 1200, kind = '') {
    const b = $('#banner'), icon = b.querySelector('.bn-icon');
    b.querySelector('span').textContent = text;
    icon.className = 'bn-icon' + (kind ? '' : ' none');
    icon.style.backgroundImage = kind ? `url('${uiImg(`notif_${kind}.png`)}')` : '';
    b.className = 'show' + (text.length > 48 ? ' long' : '');
    await sleep(speed(ms));
    b.className = '';
    await sleep(speed(200));
  },

  overlayOn(cards, html) {
    for (const c of cards) $$(`#game .card[data-uid="${c.uid}"]`).forEach(el => el.insertAdjacentHTML('beforeend', html));
  },

  async fx(kind, cards) {
    this.render();
    this.overlayOn(cards, `<div class="c-anim scorch"><img src="${uiImg('anim_scorch.png')}" alt=""></div>`);
    await sleep(speed(500));
    for (const c of cards) $$(`#game .card[data-uid="${c.uid}"]`).forEach(el => el.classList.add('burn'));
    await sleep(speed(700));
  },

  async anim(kind, cards) {
    this.render();
    this.overlayOn(cards, `<div class="c-anim"><img src="${uiImg(`anim_${kind}.png`)}" alt=""></div>`);
    await sleep(speed(800));
  },

  async showPlayed(p, card) {
    this.previewCard(card, undefined, 'Your opponent plays');
    await sleep(speed(900));
    const el = $('#preview .card');
    if (el) this.fly = { uid: card.uid, rect: el.getBoundingClientRect(), tries: 0 };
    this.clearPreview();
  },

  gameOver(g) {
    const s = g.s, me = s.players[this.me], op = s.players[1 - this.me];
    const res = s.winner === null ? 'draw' : s.winner === this.me ? 'win' : 'lose';
    $('#gameover .go-title').style.backgroundImage = `url('${uiImg(`end_${res}.png`)}')`;
    Sfx.play(res === 'lose' ? 'game_lose' : 'game_win');
    const head = s.history.map((h, i) => `<th>Round ${i + 1}</th>`).join('');
    const line = p => `<tr><th>${esc(p.name)}</th>${s.history.map(h => `<td class="${h.winner === p.id ? 'w' : ''}">${h.scores[p.id]}</td>`).join('')}</tr>`;
    $('#gameover .go-table').innerHTML = `<tr><th></th>${head}</tr>${line(me)}${line(op)}`;
    $('#gameover .go-hints').innerHTML = hintsHTML([{ act: 'again', key: 'Enter', label: 'Play Again', primary: true }, { act: 'deck', key: 'Esc', label: 'Change Deck' }]);
    this.clearPreview();
    $('#gameover').classList.add('show');
    $('#stage').classList.add('overlay-open');
  },

  gameOverAct(act) {
    $('#gameover').classList.remove('show');
    $('#stage').classList.remove('overlay-open');
    if (this.onGameOver) this.onGameOver(act);
  },
};
