'use strict';
/*
 * Gwent rules engine. Pure game state lives in `game.s` (plain, cloneable data);
 * decisions are delegated to per-player controllers (human UI or AI), and
 * presentation goes through the optional `ui` object.
 */

const ROWS = ['close', 'ranged', 'siege'];
const WEATHER_ROWS = { frost: ['close'], fog: ['ranged'], rain: ['siege'], storm: ['ranged', 'siege'] };
const LEADER_WEATHER = { weather_fog: 'fog', weather_rain: 'rain', weather_frost: 'frost' };
const LEADER_ROW = { horn_close: 'close', horn_ranged: 'ranged', horn_siege: 'siege', scorch_close: 'close', scorch_ranged: 'ranged', scorch_siege: 'siege' };
const PASS = { type: 'pass' };

let SPEED = 1; // animation speed multiplier, set by the UI
const speed = ms => ms * SPEED;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let NEXT_UID = 1;
const makeCard = (id, v = 0) => ({ uid: NEXT_UID++, id, v });
const T = c => CARDS[c.id];
const hasAb = (c, a) => T(c).abilities.includes(a);
const isUnit = c => T(c).type === 'unit';

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pickRandom = a => a[Math.floor(Math.random() * a.length)];

class GameAborted extends Error {}

class Game {
  /** setup: [{ name, human, leader, cards: [ids] }, x2] */
  constructor(setup, controllers, ui) {
    this.controllers = controllers || [];
    this.ui = ui || null;
    this.sim = false;
    this.aborted = false;
    if (setup) {
      this.s = {
        round: 0, first: 0, current: 0, over: false, winner: null,
        weather: [], history: [],
        players: setup.map((d, i) => this.newPlayer(i, d)),
      };
    }
  }

  newPlayer(id, d) {
    const row = () => ({ cards: [], special: null });
    const seen = {};
    const deck = d.cards.map(id => {
      const n = seen[id] = (seen[id] || 0) + 1;
      return makeCard(id, (n - 1) % (ART_VARIANTS[id] || 1));
    });
    return {
      id, name: d.name, human: !!d.human, faction: CARDS[d.leader].faction,
      leader: makeCard(d.leader), leaderUsed: false, leaderBlocked: false,
      deck: shuffle(deck), hand: [], grave: [],
      rows: { close: row(), ranged: row(), siege: row() },
      gems: 2, passed: false,
    };
  }

  clone() {
    const g = new Game(null, [SIM_CONTROLLER, SIM_CONTROLLER], null);
    g.s = structuredClone(this.s);
    g.sim = true;
    return g;
  }

  ctrl(p) { return this.controllers[p.id]; }
  opp(p) { return this.s.players[1 - p.id]; }
  leaderAbility(p) { return p.leaderBlocked ? null : T(p.leader).ability; }
  anyLeader(ab) { return this.s.players.some(p => this.leaderAbility(p) === ab); }
  check() { if (this.aborted) throw new GameAborted(); }

  /* ------------------------------------------------------------ presentation hooks */
  async notify(text, ms, kind) { this.check(); if (!this.sim && this.ui) await this.ui.banner(text, ms, kind); }
  refresh() { if (!this.sim && this.ui) this.ui.render(); }
  async fx(kind, cards) { if (!this.sim && this.ui && cards.length) await this.ui.fx(kind, cards); }
  sfx(name) { if (!this.sim && this.ui) this.ui.sfx(name); }
  /** Ability animation (TW3 shows the ability emblem over the card that triggered it). */
  async anim(kind, cards) { if (!this.sim && this.ui && cards.length) await this.ui.anim(kind, cards); }

  /* ------------------------------------------------------------ strength */
  weatherOn(row) {
    return this.s.weather.some(w => (WEATHER_ROWS[T(w.card).ability] || []).includes(row));
  }

  power(side, rowKey, c) {
    const t = T(c);
    if (t.type !== 'unit') return 0;
    if (t.hero) return t.strength;
    const row = side.rows[rowKey];
    let v = t.strength;
    if (this.weatherOn(rowKey)) {
      v = this.leaderAbility(side) === 'bran' ? Math.floor(v / 2) : Math.min(v, 1); // original: Math.max(0, floor(power / 2)), so 1 becomes 0
    }
    if (t.abilities.includes('spy') && this.anyLeader('treacherous')) v *= 2; // doubled before Tight Bond, Morale and Horn
    if (t.abilities.includes('bond')) {
      const n = row.cards.filter(x => isUnit(x) && hasAb(x, 'bond') && T(x).group === t.group).length;
      if (n > 1) v *= n;
    }
    v += row.cards.filter(x => x.uid !== c.uid && hasAb(x, 'morale')).length;
    const horn = (row.special && hasAb(row.special, 'horn')) || row.cards.some(x => x.uid !== c.uid && hasAb(x, 'horn'));
    if (horn) v *= 2;
    return v;
  }

  rowTotal(side, r) { return side.rows[r].cards.reduce((s, c) => s + this.power(side, r, c), 0); }
  total(side) { return ROWS.reduce((s, r) => s + this.rowTotal(side, r), 0); }

  rowHasMardroeme(side, r) {
    const row = side.rows[r];
    return (row.special && hasAb(row.special, 'mardroeme')) || row.cards.some(c => hasAb(c, 'mardroeme'));
  }

  /* ------------------------------------------------------------ cards in/out */
  draw(p, n) {
    for (let i = 0; i < n && p.deck.length; i++) p.hand.push(p.deck.pop());
  }

  /** Mulligan: draw a replacement first, then shuffle the old card back into the deck. */
  redraw(p, uid) {
    const i = p.hand.findIndex(c => c.uid === uid);
    if (i < 0 || !p.deck.length) return;
    const [old] = p.hand.splice(i, 1);
    p.hand.splice(i, 0, p.deck.pop());
    p.deck.unshift(old); // original (GwintDeck.readdCard): back to the bottom of the deck
  }

  destroy(side, r, c) {
    const row = side.rows[r];
    const i = row.cards.findIndex(x => x.uid === c.uid);
    if (i < 0) return;
    row.cards.splice(i, 1);
    if (!c.banish) side.grave.push(c);
    if (hasAb(c, 'avenger')) this.summonAvenger(side, c);
  }

  summonAvenger(side, c) {
    const tok = makeCard(T(c).target);
    tok.banish = true; // original: BanishInsteadOfGraveyard - it vanishes instead of entering a graveyard
    side.rows[T(tok).row === 'agile' ? 'close' : T(tok).row].cards.push(tok);
  }

  transform(side, r, c) {
    const row = side.rows[r];
    const i = row.cards.findIndex(x => x.uid === c.uid);
    if (i >= 0) row.cards[i] = makeCard(T(c).target);
  }

  applyMardroeme(side, r) {
    for (const c of [...side.rows[r].cards]) if (hasAb(c, 'berserker')) this.transform(side, r, c);
  }

  clearWeather() {
    for (const w of this.s.weather) this.s.players[w.owner].grave.push(w.card);
    this.s.weather = [];
  }

  /* ------------------------------------------------------------ targeting */
  unitRows(c) { const t = T(c); return t.row === 'agile' ? ['close', 'ranged'] : [t.row]; }

  /** All legal actions for player p. */
  listActions(p) {
    const acts = [];
    for (const c of p.hand) {
      const t = T(c);
      if (t.type === 'unit') {
        for (const r of this.unitRows(c)) acts.push({ type: 'play', uid: c.uid, row: r });
      } else if (t.type === 'weather') {
        acts.push({ type: 'play', uid: c.uid });
      } else if (t.ability === 'horn' || t.ability === 'mardroeme') {
        for (const r of ROWS) if (!p.rows[r].special) acts.push({ type: 'play', uid: c.uid, row: r });
      } else if (t.ability === 'decoy') {
        for (const r of ROWS) for (const x of p.rows[r].cards) {
          if (isUnit(x) && !T(x).hero) acts.push({ type: 'play', uid: c.uid, row: r, target: x.uid });
        }
      } else if (t.ability === 'scorch') {
        acts.push({ type: 'play', uid: c.uid });
      }
    }
    if (this.leaderUsable(p)) acts.push({ type: 'leader' });
    return acts;
  }

  leaderUsable(p) {
    if (p.leaderUsed || p.leaderBlocked) return false;
    const L = T(p.leader), o = this.opp(p);
    if (L.passive) return false;
    switch (L.ability) {
      case 'weather_fog': case 'weather_rain': case 'weather_frost':
        return p.deck.some(c => c.id === LEADER_WEATHER[L.ability]);
      case 'clear': return this.s.weather.length > 0;
      case 'horn_close': case 'horn_ranged': case 'horn_siege': return !p.rows[LEADER_ROW[L.ability]].special;
      case 'scorch_close': case 'scorch_ranged': case 'scorch_siege': {
        const r = LEADER_ROW[L.ability];
        return this.rowTotal(o, r) >= 10 && o.rows[r].cards.some(c => isUnit(c) && !T(c).hero); // needs 10+ in that enemy row
      }
      case 'emperor': return o.hand.length > 0;
      case 'relentless': return o.grave.some(c => isUnit(c) && !T(c).hero);
      case 'bringer': return p.grave.some(c => isUnit(c) && !T(c).hero);
      case 'destroyer': return p.hand.length >= 2 && p.deck.length > 0;
      case 'king_wild': return p.deck.some(c => T(c).type === 'weather');
      case 'hope': return this.agileMoves(p).length > 0;
      case 'crach': return this.s.players.some(x => x.grave.some(c => isUnit(c) && !T(c).hero));
    }
    return false;
  }

  /* ------------------------------------------------------------ game flow */
  async run() {
    try {
      const ps = this.s.players;
      for (const p of ps) if (T(p.leader).ability === 'whiteflame') this.opp(p).leaderBlocked = true;
      for (const p of ps) {
        if (p.leaderBlocked) await this.notify(p.human ? "Opponent's leader cancels your leader's ability." : "Your leader cancels opponent's leader's ability", 1600);
      }
      const sco = ps.filter(p => p.faction === 'scoiatael');
      if (sco.length === 1) {
        const p = sco[0];
        if (!p.human) await this.notify("Opponent used the Scoia'tael faction perk to go first.", 1600, 'scoiatael');
        this.s.first = await this.ctrl(p).chooseFirst(this, p);
      } else {
        this.s.first = Math.random() < 0.5 ? 0 : 1;
      }
      const f = ps[this.s.first];
      await this.notify(f.human ? 'You will go first' : 'Your opponent will go first', 1500, f.human ? 'me_coin' : 'op_coin');
      for (const p of ps) this.draw(p, 10 + (this.leaderAbility(p) === 'daisy' ? 1 : 0));
      this.refresh();
      for (const p of [...ps].sort((a, b) => b.human - a.human)) await this.ctrl(p).mulligan(this, p);
      this.refresh();

      while (!this.s.over) await this.playRound();
      if (!this.sim && this.ui) await this.ui.gameOver(this);
    } catch (e) {
      if (!(e instanceof GameAborted)) throw e;
    }
  }

  async playRound() {
    const s = this.s;
    s.round++;
    for (const p of s.players) p.passed = false;
    this.sfx(s.round === 1 ? 'round1_start' : 'game_start');
    await this.notify('Round Start', 1400, 'round_start');
    if (s.round === 3) {
      for (const p of s.players) if (p.faction === 'skellige') await this.skelligeAbility(p);
    }

    let cur = s.first, lastActor = null;
    s.lastToAct = s.first;
    while (!(s.players[0].passed && s.players[1].passed)) {
      this.check();
      const p = s.players[cur];
      s.current = cur;
      if (!p.passed) {
        if (p.hand.length === 0 && !this.leaderUsable(p)) {
          p.passed = true;
          this.refresh();
          this.sfx('pass');
          await this.notify(p.human ? 'Round passed' : 'Your opponent has passed', 1100, 'round_passed');
        } else {
          if (lastActor !== cur && !this.sim && this.ui) {
            this.refresh();
            this.sfx(p.human ? 'turn_me' : 'turn_op');
            await this.notify(p.human ? 'Your turn!' : "Opponent's turn", 900, p.human ? 'me_turn' : 'op_turn');
          }
          lastActor = cur;
          const action = await this.ctrl(p).takeTurn(this, p);
          this.check();
          await this.applyAction(p, action);
          s.lastToAct = cur;
          // original (BasePlayerController.currentRoundStatus): no cards left and no usable leader = passed right now
          if (!p.passed && p.hand.length === 0 && !this.leaderUsable(p)) {
            p.passed = true;
            this.refresh();
            this.sfx('pass');
            await this.notify(p.human ? 'Round passed' : 'Your opponent has passed', 1100, 'round_passed');
          }
        }
      }
      if (!s.players[1 - cur].passed) cur = 1 - cur;
      this.refresh();
    }
    await this.endRound();
  }

  async applyAction(p, a) {
    if (!a || a.type === 'pass') {
      p.passed = true;
      this.refresh();
      this.sfx('pass');
      await this.notify(p.human ? 'Round passed' : 'Your opponent has passed', 1100, 'round_passed');
      return;
    }
    if (a.type === 'leader') {
      if (!this.leaderUsable(p)) return;
      if (!p.human && !this.sim && this.ui) await this.ui.showPlayed(p, p.leader);
      await this.useLeader(p);
      this.refresh();
      return;
    }
    const i = p.hand.findIndex(c => c.uid === a.uid);
    if (i < 0) return;
    const [card] = p.hand.splice(i, 1);
    if (!p.human && !this.sim && this.ui) { this.refresh(); await this.ui.showPlayed(p, card); }
    await this.playCard(p, card, a.row, a.target);
    this.refresh();
  }

  async playCard(p, card, row, target) {
    const t = T(card);
    if (t.type === 'weather') return this.playWeather(p, card);
    if (t.type === 'special') {
      switch (t.ability) {
        case 'horn':
          if (p.rows[row] && !p.rows[row].special) {
            p.rows[row].special = card;
            this.sfx('horn');
            this.refresh();
            await this.anim('horn', [card]);
          } else p.grave.push(card);
          return;
        case 'mardroeme':
          if (p.rows[row] && !p.rows[row].special) {
            p.rows[row].special = card;
            this.sfx('mardroeme');
            this.applyMardroeme(p, row);
          } else p.grave.push(card);
          return;
        case 'decoy': {
          for (const r of ROWS) {
            const cards = p.rows[r].cards;
            const j = cards.findIndex(x => x.uid === target);
            if (j >= 0) {
              p.hand.push(cards[j]);
              cards[j] = card;
              this.sfx('decoy');
              return;
            }
          }
          p.grave.push(card);
          return;
        }
        case 'scorch':
          this.refresh();
          await this.scorch();
          p.grave.push(card);
          return;
      }
    }
    await this.placeUnit(p, card, row);
  }

  async playWeather(p, card) {
    this.sfx({ frost: 'frost', fog: 'fog', rain: 'rain', storm: 'rain', clear: 'clear' }[T(card).ability]);
    if (T(card).ability === 'clear') {
      this.clearWeather();
      p.grave.push(card);
      return;
    }
    const ab = T(card).ability, W = this.s.weather;
    if (ab === 'storm') {
      // the new Storm stays; an older Storm, Fog or Rain goes to its owner's graveyard (it covers the same rows)
      for (const w of [...W]) if (['storm', 'fog', 'rain'].includes(T(w.card).ability)) { W.splice(W.indexOf(w), 1); this.s.players[w.owner].grave.push(w.card); }
      W.push({ card, owner: p.id });
      return;
    }
    // Frost / Fog / Rain: discarded if a card in play already covers its row (the same card, or a Storm)
    if (W.some(w => WEATHER_ROWS[T(w.card).ability].includes(WEATHER_ROWS[ab][0]))) p.grave.push(card);
    else W.push({ card, owner: p.id });
  }

  async placeUnit(p, c, r, opts = {}) {
    const t = T(c);
    if (!this.unitRows(c).includes(r)) r = this.unitRows(c)[0];
    const spy = t.abilities.includes('spy');
    const side = spy ? this.opp(p) : p;
    side.rows[r].cards.push(c);
    if (!opts.noMuster) this.sfx(spy ? 'spy' : t.hero ? 'hero' : 'common_' + r);
    this.refresh();
    if (spy) { await this.anim('spy', [c]); this.draw(p, 2); this.sfx('draw'); }
    if (t.abilities.includes('bond') && side.rows[r].cards.filter(x => T(x).group === t.group && hasAb(x, 'bond')).length > 1) {
      this.sfx('bond');
      await this.anim('bond', side.rows[r].cards.filter(x => T(x).group === t.group && hasAb(x, 'bond')));
    }
    if (t.abilities.includes('morale')) { this.sfx('morale'); await this.anim('morale', [c]); }
    if (t.abilities.includes('horn')) { this.sfx('horn'); await this.anim('horn', [c]); }
    if (t.abilities.includes('berserker') && this.rowHasMardroeme(side, r)) this.transform(side, r, c);
    if (t.abilities.includes('mardroeme')) this.applyMardroeme(side, r);
    if (t.abilities.includes('muster') && !opts.noMuster) await this.muster(p, c);
    if (t.abilities.includes('scorch_c')) await this.rowScorch(this.opp(p), 'close');
    if (t.abilities.includes('scorch_r')) await this.rowScorch(this.opp(p), 'ranged');
    if (t.abilities.includes('scorch_s')) await this.rowScorch(this.opp(p), 'siege');
    if (t.abilities.includes('scorch')) await this.scorch();
    if (t.abilities.includes('medic')) await this.medic(p, c);
    this.refresh();
  }

  async muster(p, c) {
    const g = T(c).muster !== undefined ? T(c).muster : T(c).group; // muster: null shows the ability but summons nothing
    const same = x => x.uid !== c.uid && isUnit(x) && T(x).group === g;
    const fromDeck = p.deck.filter(same), fromHand = p.hand.filter(same); // deck AND hand (CardInstance.summonFXEnded)
    if (!fromDeck.length && !fromHand.length) return;
    this.sfx('muster');
    await this.anim('muster', [c]);
    p.deck = p.deck.filter(x => !fromDeck.includes(x));
    p.hand = p.hand.filter(x => !fromHand.includes(x));
    for (const x of [...fromDeck, ...fromHand]) await this.placeUnit(p, x, this.unitRows(x)[0], { noMuster: true });
  }

  async medic(p, medicCard) {
    const options = p.grave.filter(c => isUnit(c) && !T(c).hero);
    if (!options.length) return;
    this.sfx('medic');
    let pick;
    if (this.anyLeader('invader') && !T(medicCard).hero) pick = pickRandom(options); // hero medics (Yennefer, Menno) still let you choose
    else pick = await this.ctrl(p).chooseCard(this, p, options, 'Choose a card to restore', { purpose: 'medic' });
    this.check();
    if (!pick) return;
    p.grave.splice(p.grave.findIndex(x => x.uid === pick.uid), 1);
    const rows = this.unitRows(pick);
    const r = rows.length > 1 ? this.bestRow(p, pick, rows) : rows[0]; // not the player's choice in the original
    await this.placeUnit(p, pick, r);
  }

  /** Row where a unit would be strongest right now (random among equals), as CardInstance.recalculatePowerPotential decides for revived cards. */
  bestRow(p, c, rows) {
    const side = hasAb(c, 'spy') ? this.opp(p) : p;
    let best = [], bv = -1;
    for (const r of rows) {
      side.rows[r].cards.push(c);
      const v = this.power(side, r, c);
      side.rows[r].cards.pop();
      if (v > bv) { bv = v; best = [r]; } else if (v === bv) best.push(r);
    }
    return pickRandom(best);
  }

  async scorch() {
    const all = [];
    for (const side of this.s.players) for (const r of ROWS) for (const c of side.rows[r].cards) {
      if (isUnit(c) && !T(c).hero) all.push({ side, r, c, v: this.power(side, r, c) });
    }
    if (!all.length) return;
    const max = Math.max(...all.map(x => x.v)); // original starts from 0 with >=, so 0-strength units die when nothing is stronger
    const victims = all.filter(x => x.v === max);
    this.sfx('scorch');
    await this.fx('scorch', victims.map(x => x.c));
    for (const x of victims) this.destroy(x.side, x.r, x.c);
  }

  async rowScorch(side, r) {
    if (this.rowTotal(side, r) < 10) return;
    const units = side.rows[r].cards.filter(c => isUnit(c) && !T(c).hero).map(c => ({ c, v: this.power(side, r, c) }));
    if (!units.length) return;
    const max = Math.max(...units.map(x => x.v));
    const victims = units.filter(x => x.v === max).map(x => x.c);
    this.sfx('scorch');
    await this.fx('scorch', victims);
    for (const c of victims) this.destroy(side, r, c);
  }

  async useLeader(p) {
    p.leaderUsed = true;
    const L = T(p.leader), o = this.opp(p), ctrl = this.ctrl(p);
    const takeFrom = (list, c) => list.splice(list.findIndex(x => x.uid === c.uid), 1)[0];
    switch (L.ability) {
      case 'weather_fog': case 'weather_rain': case 'weather_frost': {
        const c = p.deck.find(x => x.id === LEADER_WEATHER[L.ability]);
        if (c) await this.playWeather(p, takeFrom(p.deck, c));
        break;
      }
      case 'clear': this.sfx('clear'); this.clearWeather(); break;
      case 'horn_close': case 'horn_ranged': case 'horn_siege': {
        const row = p.rows[LEADER_ROW[L.ability]];
        if (!row.special) { row.special = makeCard('leader_horn'); this.sfx('horn'); }
        break;
      }
      case 'scorch_close': case 'scorch_ranged': case 'scorch_siege':
        await this.rowScorch(o, LEADER_ROW[L.ability]);
        break;
      case 'emperor': {
        const cards = shuffle([...o.hand]).slice(0, 3);
        await ctrl.reveal(this, p, cards, "Your opponent's hand (3 random cards)");
        break;
      }
      case 'relentless': case 'bringer': {
        // only non-hero units; with Emhyr Invader of the North in play the card is random, a single candidate is taken without asking
        const from = L.ability === 'relentless' ? o : p;
        const list = from.grave.filter(x => isUnit(x) && !T(x).hero);
        const c = this.anyLeader('invader') ? pickRandom(list) : list.length === 1 ? list[0]
          : await ctrl.chooseCard(this, p, list, L.ability === 'relentless' ? "Draw a card from your opponent's discard pile" : 'Restore a card from your discard pile to your hand', { purpose: 'take' });
        if (c) p.hand.push(takeFrom(from.grave, c));
        break;
      }
      case 'destroyer': {
        for (let i = 0; i < 2; i++) {
          const c = await ctrl.chooseCard(this, p, [...p.hand], `Choose a card to discard (${i + 1}/2)`, { purpose: 'discard' });
          if (c) p.grave.push(takeFrom(p.hand, c));
        }
        const c = await ctrl.chooseCard(this, p, [...p.deck], 'Choose a card to draw from your deck', { purpose: 'take' });
        if (c) p.hand.push(takeFrom(p.deck, c));
        break;
      }
      case 'king_wild': {
        const seen = new Set();
        const opts = p.deck.filter(x => T(x).type === 'weather' && !seen.has(x.id) && seen.add(x.id));
        const c = await ctrl.chooseCard(this, p, opts, 'Pick a weather card to play', { purpose: 'weather' });
        if (c) await this.playWeather(p, takeFrom(p.deck, c));
        break;
      }
      case 'hope': this.moveAgile(p); break;
      case 'crach':
        // only non-hero units go back (each into its owner's deck, at random places); specials, weather and heroes stay in the graveyard
        for (const x of this.s.players) {
          const back = x.grave.filter(c => isUnit(c) && !T(c).hero);
          x.grave = x.grave.filter(c => !back.includes(c));
          for (const c of back) x.deck.splice(Math.floor(Math.random() * (x.deck.length + 1)), 0, c);
        }
        break;
    }
    this.check();
  }

  /** Agile units (never heroes) that would be stronger in the other row. The original compares the unit's own strength, ranged row first. */
  agileMoves(p) {
    const moves = [];
    for (const r of ['ranged', 'close']) {
      for (const c of p.rows[r].cards) {
        if (T(c).row !== 'agile' || T(c).hero) continue;
        const other = r === 'close' ? 'ranged' : 'close';
        const now = this.power(p, r, c);
        p.rows[other].cards.push(c);
        const then = this.power(p, other, c);
        p.rows[other].cards.pop();
        if (then > now) moves.push({ c, from: r, to: other });
      }
    }
    return moves;
  }

  moveAgile(p) {
    for (const r of ['ranged', 'close']) {
      for (const c of [...p.rows[r].cards]) {
        if (T(c).row !== 'agile' || T(c).hero) continue;
        const other = r === 'close' ? 'ranged' : 'close';
        const now = this.power(p, r, c);
        const from = p.rows[r].cards, to = p.rows[other].cards, i = from.indexOf(c);
        from.splice(i, 1);
        to.push(c);
        if (this.power(p, other, c) <= now) { to.pop(); from.splice(i, 0, c); }
      }
    }
  }

  async skelligeAbility(p) {
    const units = shuffle(p.grave.filter(c => isUnit(c) && !T(c).hero)).slice(0, 2);
    if (!units.length) return;
    await this.notify(p.human ? 'Skellige Ability Triggered!' : 'Opponent Skellige Ability Triggered!', 1600, 'skellige');
    for (const c of units) p.grave.splice(p.grave.indexOf(c), 1);
    // placed like any revived card, so spies change sides, Muster / Medic / Scorch / Morale / Bond / Mardroeme all trigger
    for (const c of units) await this.placeUnit(p, c, this.unitRows(c)[0]);
    this.refresh();
  }

  async endRound() {
    const s = this.s, [a, b] = s.players;
    const ta = this.total(a), tb = this.total(b);
    let winner = null;
    if (ta !== tb) winner = ta > tb ? a : b;
    else {
      const ng = s.players.filter(p => p.faction === 'nilfgaard');
      if (ng.length === 1) {
        winner = ng[0];
        await this.notify('Nilfgaard faction ability triggered - Nilfgaard wins the tie.', 1600, 'draw_round');
      }
    }
    s.history.push({ scores: [ta, tb], winner: winner ? winner.id : null });
    if (winner) this.opp(winner).gems--; else { a.gems--; b.gems--; }
    this.refresh();
    if (!this.sim && this.ui) {
      const me = s.players.find(p => p.human);
      const msg = !winner ? 'The round ended in a draw' : (me ? (winner === me ? 'You won the round!' : 'Your opponent won the round') : `${winner.name} won the round`);
      this.sfx(winner && me && winner !== me ? 'round_lose' : 'round_win');
      await this.notify(msg, 1700, !winner ? 'draw_round' : me && winner !== me ? 'lose_round' : 'win_round');
    }

    const gameOver = a.gems <= 0 || b.gems <= 0;
    if (!gameOver && winner && winner.faction === 'realms' && winner.deck.length) {
      this.draw(winner, 1);
      await this.notify('Northern Realms faction ability triggered - North draws an additional card.', 1600, 'north');
    }

    // Monsters keep one random unit card on the battlefield
    const keep = new Set();
    if (!gameOver) {
      for (const p of s.players) {
        if (p.faction !== 'monsters') continue;
        const units = ROWS.flatMap(r => p.rows[r].cards).filter(c => isUnit(c) && !T(c).hero);
        if (units.length) {
          keep.add(pickRandom(units).uid);
          await this.notify('Monsters faction ability triggered - one randomly-chosen Monster Unit Card stays on the board', 1600, 'monsters');
        }
      }
    }

    const avengers = [];
    for (const p of s.players) {
      for (const r of ROWS) {
        const row = p.rows[r];
        const stay = [];
        for (const c of row.cards) {
          if (keep.has(c.uid)) { stay.push(c); continue; }
          if (!c.banish) p.grave.push(c);
          if (hasAb(c, 'avenger')) avengers.push([p, c]);
        }
        row.cards = stay;
        if (row.special) {
          if (!T(row.special).virtual) p.grave.push(row.special);
          row.special = null;
        }
      }
    }
    this.clearWeather();
    if (!gameOver) for (const [p, c] of avengers) this.summonAvenger(p, c);

    if (gameOver) {
      s.over = true;
      s.winner = a.gems > 0 ? 0 : b.gems > 0 ? 1 : null;
    } else {
      s.first = winner ? winner.id : (s.lastToAct ?? s.first); // a drawn round: the player who acted last starts again
    }
    this.refresh();
  }
}
