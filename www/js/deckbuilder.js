'use strict';
/*
 * Deck builder, laid out like The Witcher 3's: choose a faction, pick its leader and edit its deck.
 * Each faction has one deck; every change is saved immediately, so a deck only ever needs editing.
 */

function savedDecks() { const d = Store.get('decks', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; }

/** The saved deck for a faction (or its starter deck the first time). */
function loadDeck(faction) {
  const d = savedDecks()[faction];
  if (d && CARDS[d.leader] && CARDS[d.leader].faction === faction && Array.isArray(d.cards)) {
    return { leader: d.leader, cards: d.cards.filter(id => CARDS[id] && !CARDS[id].token) };
  }
  return structuredClone(DEFAULT_DECKS[faction]);
}

const FILTERS = [
  ['all', 'ALL CARDS'], ['close', 'CLOSE COMBAT'], ['ranged', 'RANGED COMBAT'], ['siege', 'SIEGE'],
  ['hero', 'HERO CARDS'], ['weather', 'WEATHER CARDS'], ['special', 'SPECIAL CARDS'],
];

function matchesFilter(t, f) {
  switch (f) {
    case 'close': return t.type === 'unit' && (t.row === 'close' || t.row === 'agile');
    case 'ranged': return t.type === 'unit' && (t.row === 'ranged' || t.row === 'agile');
    case 'siege': return t.type === 'unit' && t.row === 'siege';
    case 'hero': return t.hero;
    case 'weather': return t.type === 'weather';
    case 'special': return t.type === 'special';
  }
  return true;
}

/* Special cards first, then weather, then units from strongest to weakest (the game's ordering) */
function builderOrder(a, b) {
  const rank = t => t.type === 'special' ? 0 : t.type === 'weather' ? 1 : 2;
  return rank(a) - rank(b) || b.strength - a.strength || a.name.localeCompare(b.name);
}

const DeckBuilder = {
  faction: 'realms', deck: null, filters: { pool: 'all', deck: 'all' }, focus: 'pool', hover: null,
  onStart: null, onClose: null,

  init() {
    $('#db-prev').onclick = () => this.cycle(-1);
    $('#db-next').onclick = () => this.cycle(1);
    for (const el of $$('#builder .db-filters')) {
      el.innerHTML = FILTERS.map(([k]) => `<button data-k="${k}"><img src="${uiImg(`filter_${k}.png`)}" alt="${k}"></button>`).join('');
      el.onclick = e => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        this.filters[el.dataset.side] = b.dataset.k;
        Sfx.play('ui_card');
        this.render();
      };
    }
    $('#db-pool').onclick = e => { const c = e.target.closest('.db-item'); if (c) this.add(c.dataset.id); };
    $('#db-deck').onclick = e => { const c = e.target.closest('.db-item'); if (c) this.remove(c.dataset.id); };
    $('#db-leader').onclick = () => this.pickLeader();
    const builder = $('#builder');
    builder.addEventListener('mouseover', e => {
      const c = e.target.closest('.card');
      this.hover = c;
      const side = e.target.closest('#db-pool') ? 'pool' : e.target.closest('#db-deck') ? 'deck' : null;
      if (side && side !== this.focus) { this.focus = side; this.renderHints(); }
    });
    UI.bindZoom(builder);
    $('#db-hints').addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      ({ leader: () => this.pickLeader(), zoom: () => this.hover && UI.zoomEl(this.hover), decks: () => this.cycle(1),
        start: () => this.start(), close: () => this.close() })[b.dataset.act]?.();
    });
    document.addEventListener('keydown', e => {
      if (!$('#builder').classList.contains('active') || UI.ch || $('#dialog').classList.contains('show')) return;
      const k = e.key.toLowerCase();
      if (k === 'q' || e.key === 'ArrowLeft') this.cycle(-1);
      else if (k === 'e' || e.key === 'ArrowRight') this.cycle(1);
      else if (k === 'x') this.pickLeader();
      else if (k === 'z' && this.hover) UI.zoomEl(this.hover);
      else if (e.key === 'Enter') this.start();
      else if (e.key === 'Escape') this.close();
    });
  },

  open(faction) {
    UI.show('builder');
    this.load(faction || Store.get('lastFaction', 'realms'));
  },

  load(f) {
    this.faction = f;
    Store.set('lastFaction', f);
    this.deck = loadDeck(f);
    this.render();
  },

  current() { return structuredClone(this.deck); },

  save() {
    const all = savedDecks();
    all[this.faction] = this.deck;
    Store.set('decks', all);
  },

  cycle(d) {
    const n = FACTION_ORDER.length, i = FACTION_ORDER.indexOf(this.faction);
    Sfx.play('ui_card_bank');
    this.load(FACTION_ORDER[(i + d + n) % n]);
  },

  pool() {
    return Object.values(CARDS).filter(t => !t.token && !t.virtual && t.type !== 'leader' && t.count > 0 &&
      (t.faction === this.faction || t.faction === 'neutral'));
  },

  copies(id) { return this.deck.cards.filter(x => x === id).length; },

  add(id) {
    const t = CARDS[id];
    if (this.copies(id) >= t.count) return;
    if (t.type !== 'unit' && deckStats(this.deck).specials >= DECK_RULES.maxSpecials) {
      UI.toast('Special card limit reached');
      return;
    }
    this.deck.cards.push(id);
    this.save();
    Sfx.play('ui_card');
    this.render();
  },

  remove(id) {
    const i = this.deck.cards.indexOf(id);
    if (i < 0) return;
    this.deck.cards.splice(i, 1);
    this.save();
    Sfx.play('discard');
    this.render();
  },

  pickLeader() {
    if (UI.ch) return;
    const leaders = Object.values(CARDS).filter(t => t.type === 'leader' && t.faction === this.faction).map(t => ({ uid: t.id, id: t.id }));
    const choose = c => {
      this.deck.leader = c.id;
      this.save();
      UI.closeChooser();
      this.render();
    };
    UI.openChooser({
      title: 'Choose a Leader', cards: leaders, dark: true,
      idx: Math.max(0, leaders.findIndex(c => c.id === this.deck.leader)),
      onPick: choose,
      hints: [{ act: 'select', key: 'Enter', label: 'Select' }, { act: 'close', key: 'Esc', label: 'Cancel' }],
      acts: { select: () => choose(UI.ch.cards[UI.ch.idx]), close: () => UI.closeChooser() },
    });
  },

  start() {
    const st = deckStats(this.deck);
    if (st.units < DECK_RULES.minUnits) { UI.toast(`Your deck needs at least ${DECK_RULES.minUnits} Unit Cards`); return; }
    if (st.specials > DECK_RULES.maxSpecials) { UI.toast('Special card limit reached'); return; }
    if (this.onStart) this.onStart(this.current());
  },

  close() { if (this.onClose) this.onClose(); },

  // Updates the grid in place: adding or removing a card only changes counts and moves single items, so the card
  // faces aren't rebuilt (and their images re-decoded) on every click
  grid(el, ids, filter, countFn) {
    const sorted = ids.map(id => CARDS[id]).filter(t => matchesFilter(t, filter)).sort(builderOrder);
    const old = new Map([...el.children].map(x => [x.dataset.id, x]));
    sorted.forEach((t, i) => {
      let item = old.get(t.id);
      if (item) old.delete(t.id);
      else {
        item = document.createElement('div');
        item.className = 'db-item';
        item.dataset.id = t.id;
        item.innerHTML = `${cardHTML({ id: t.id }, { size: 'db' })}<span class="db-count"></span>`;
      }
      const badge = item.querySelector('.db-count'), n = String(countFn(t.id));
      if (badge.textContent !== n || !badge.firstChild) badge.replaceChildren(document.createElement('i'), n);
      if (el.children[i] !== item) el.insertBefore(item, el.children[i] || null);
    });
    for (const x of old.values()) x.remove();
  },

  renderHints() {
    $('#db-hints').innerHTML = hintsHTML([
      { act: 'info', label: this.focus === 'deck' ? 'Remove a card' : 'Add a card', key: TOUCH ? 'Tap' : 'Click' },
      { act: 'leader', key: 'X', label: 'Change leaders' },
      { act: 'zoom', key: 'Z', label: 'Zoom' },
      { act: 'decks', key: 'Q/E', label: 'Change decks' },
      { act: 'start', key: 'Enter', label: 'Start game', primary: true },
      { act: 'close', key: 'Esc', label: 'Close' },
    ]);
  },

  render() {
    const f = this.faction, n = FACTION_ORDER.length, i = FACTION_ORDER.indexOf(f);
    $('#builder .db-shield').style.backgroundImage = `url('${uiImg(`deck_shield_${f}.png`)}')`;
    $('#builder .db-fname').textContent = FACTIONS[f].name;
    $('#builder .db-dots').innerHTML = FACTION_ORDER.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    $('#db-prev .db-side-name').textContent = FACTIONS[FACTION_ORDER[(i - 1 + n) % n]].name;
    $('#db-next .db-side-name').textContent = FACTIONS[FACTION_ORDER[(i + 1) % n]].name;
    $('#db-perk').textContent = FACTIONS[f].perk;

    for (const el of $$('#builder .db-filters')) {
      $$('[data-k]', el).forEach(b => b.classList.toggle('sel', b.dataset.k === this.filters[el.dataset.side]));
    }
    const [left, right] = $$('#builder .db-filter-name');
    left.textContent = FILTERS.find(x => x[0] === this.filters.pool)[1];
    right.textContent = FILTERS.find(x => x[0] === this.filters.deck)[1];

    const poolIds = this.pool().filter(t => this.copies(t.id) < t.count).map(t => t.id);
    this.grid($('#db-pool'), poolIds, this.filters.pool, id => CARDS[id].count - this.copies(id));
    this.grid($('#db-deck'), [...new Set(this.deck.cards)], this.filters.deck, id => this.copies(id));

    $('#db-leader').innerHTML = cardHTML({ id: this.deck.leader }, { size: 'dbl' });
    const st = deckStats(this.deck);
    const stat = (label, icon, val, cls = '') => `<div class="st-label">${label}</div><div class="st-val ${cls}"><img src="${uiImg(`deck_stats_${icon}.png`)}" alt="">${val}</div>`;
    const unitsOk = st.units >= DECK_RULES.minUnits;
    $('#db-stats').innerHTML =
      stat('Total cards in deck', 'count', st.total) +
      stat('Number of Unit Cards', 'unit', unitsOk ? st.units : `${st.units}/${DECK_RULES.minUnits}`, unitsOk ? '' : 'bad') +
      stat('Special Cards', 'special', `${st.specials}/${DECK_RULES.maxSpecials}`, st.specials > DECK_RULES.maxSpecials ? 'bad' : 'good') +
      stat('Total Unit Card Strength', 'strength', st.strength) +
      stat('Hero Cards', 'hero', st.heroes);
    this.renderHints();
  },
};
