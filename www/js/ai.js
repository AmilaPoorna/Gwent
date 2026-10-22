'use strict';
/*
 * Computer opponent. Each turn it simulates every legal move on a cloned game,
 * scores the result (board swing + value of cards kept in hand), and then applies
 * round-level strategy: when to pass, when to fight, how to win a round cheaply.
 */

const AI = {
  /** How much a card is worth while it is still in hand. */
  handValue(c) {
    const t = T(c);
    if (t.type === 'unit') {
      if (t.abilities.includes('spy')) return 2;
      if (t.abilities.includes('medic')) return 4 + t.strength * 0.5;
      return t.strength * 0.8 + 1;
    }
    switch (t.ability) {
      case 'decoy': return 5;
      case 'horn': return 6;
      case 'scorch': return 5;
      case 'clear': return 2;
      case 'mardroeme': return 2;
      default: return 3; // weather
    }
  },

  handSum(p) { return p.hand.reduce((s, c) => s + AI.handValue(c), 0); },

  /** Preference when picking a card (medic, take from graveyard, draw from deck). */
  pickValue(c) {
    const t = T(c);
    if (t.type !== 'unit') return { decoy: 7, horn: 9, scorch: 8, clear: 3, mardroeme: 3 }[t.ability] ?? 4;
    let v = t.strength;
    if (t.abilities.includes('spy')) v += 15;
    if (t.abilities.includes('medic')) v += 10;
    if (t.abilities.includes('muster')) v += 4;
    if (t.hero) v += 3;
    return v;
  },
};

class AIController {
  constructor() { this.human = false; }

  async mulligan(game, p) {
    for (let i = 0; i < 2; i++) {
      const c = this.mulliganPick(p);
      if (!c) break;
      game.redraw(p, c.uid);
    }
  }

  mulliganPick(p) {
    const seen = new Set();
    for (const c of p.hand) {
      const t = T(c);
      const key = t.abilities.includes('muster') ? 'm:' + t.group : t.type === 'weather' ? 'w:' + c.id : null;
      if (!key) continue;
      if (seen.has(key)) return c;
      seen.add(key);
    }
    return null;
  }

  async chooseFirst(game, p) { return 1 - p.id; } // going second is the advantage

  async chooseCard(game, p, cards, title, opts = {}) {
    if (!cards.length) return null;
    if (opts.purpose === 'discard') return cards.reduce((a, b) => AI.pickValue(b) < AI.pickValue(a) ? b : a);
    if (opts.purpose === 'weather') return this.bestWeather(game, p, cards);
    return cards.reduce((a, b) => AI.pickValue(b) > AI.pickValue(a) ? b : a);
  }

  async bestWeather(game, p, cards) {
    let best = cards[0], bv = -Infinity;
    for (const c of cards) {
      const g = game.clone();
      const me = g.s.players[p.id];
      await g.playWeather(me, structuredClone(c));
      const v = g.total(me) - g.total(g.opp(me));
      if (v > bv) { bv = v; best = c; }
    }
    return best;
  }

  async chooseRow(game, p, card, rows) {
    let best = rows[0], bv = -Infinity;
    const side = hasAb(card, 'spy') ? game.opp(p) : p;
    for (const r of rows) {
      side.rows[r].cards.push(card);
      const v = game.total(p) - game.total(game.opp(p));
      side.rows[r].cards.pop();
      if (v > bv) { bv = v; best = r; }
    }
    return best;
  }

  async reveal() {}

  async evaluate(game, p, a, handWeight) {
    const g = game.clone();
    const me = g.s.players[p.id], op = g.s.players[1 - p.id];
    const lead0 = g.total(me) - g.total(op), hv0 = AI.handSum(me);
    let bonus = 0, leader = 0;
    if (a.type === 'leader') leader = 8;
    if (a.target) {
      for (const r of ROWS) {
        const tgt = me.rows[r].cards.find(x => x.uid === a.target);
        if (tgt && hasAb(tgt, 'spy')) bonus += 12;
        else if (tgt && hasAb(tgt, 'medic')) bonus += 5;
      }
    }
    await g.applyAction(me, a);
    const lead = g.total(me) - g.total(op);
    const dHand = AI.handSum(me) - hv0;
    return {
      a, lead,
      dBoard: lead - lead0,
      cost: -dHand - bonus + leader,
      score: (lead - lead0) + (dHand + bonus) * handWeight - leader,
    };
  }

  /** Greedy look-ahead (opponent has passed): keep playing the biggest swing until ahead. */
  async planToWin(game, p, tieWins) {
    const g = game.clone();
    const me = g.s.players[p.id], op = g.s.players[1 - p.id];
    let first = null, cost = 0;
    for (let step = 0; step < 5; step++) {
      const acts = g.listActions(me);
      if (!acts.length) return null;
      let best = null;
      for (const a of acts) {
        const e = await this.evaluate(g, me, a, 1);
        if (!best || e.dBoard - e.cost * 0.25 > best.dBoard - best.cost * 0.25) best = e;
      }
      if (best.dBoard <= 0) return null;
      first = first || best.a;
      cost += Math.max(0, best.cost);
      await g.applyAction(me, best.a);
      const lead = g.total(me) - g.total(op);
      if (lead > 0 || (lead === 0 && tieWins)) return { first, cost };
    }
    return null;
  }

  async takeTurn(game, p) {
    if (!game.sim && game.ui) await sleep(speed(650));
    const o = game.opp(p);
    const lead = game.total(p) - game.total(o);
    const tieWins = p.faction === 'nilfgaard' && o.faction !== 'nilfgaard';
    const ahead = lead > 0 || (lead === 0 && tieWins);
    const mustWin = p.gems === 1;        // losing this round loses the game
    const winEndsGame = o.gems === 1;     // winning this round wins the game
    const handDiff = p.hand.length - o.hand.length;

    // Dedupe identical moves (e.g. two copies of the same card)
    const seen = new Set(), actions = [];
    for (const a of game.listActions(p)) {
      const c = p.hand.find(x => x.uid === a.uid);
      const tgt = a.target && ROWS.flatMap(r => p.rows[r].cards).find(x => x.uid === a.target);
      const key = `${a.type}|${c ? c.id : ''}|${a.row || ''}|${tgt ? tgt.id : ''}`;
      if (!seen.has(key)) { seen.add(key); actions.push(a); }
    }
    if (!actions.length) return PASS;

    const evals = [];
    for (const a of actions) evals.push(await this.evaluate(game, p, a, 1));
    // Moves that hurt our own position without gaining cards are never worth making
    const useful = evals.filter(e => e.dBoard > 0 || e.cost < 0);
    if (!useful.length) return PASS;
    const best = useful.reduce((x, y) => y.score > x.score ? y : x);
    const bestBoard = useful.reduce((x, y) => (y.dBoard - y.cost * 0.1) > (x.dBoard - x.cost * 0.1) ? y : x);

    if (o.passed) {
      if (ahead) return PASS;
      const winners = evals.filter(e => e.lead > 0 || (e.lead === 0 && tieWins));
      const budget = mustWin || winEndsGame ? Infinity : 10 + 5 * Math.max(0, handDiff);
      if (winners.length) {
        const cheapest = winners.reduce((x, y) => y.cost < x.cost ? y : x);
        return cheapest.cost <= budget ? cheapest.a : PASS;
      }
      // No single card wins: plan a short sequence of plays and commit only if it is affordable
      const plan = await this.planToWin(game, p, tieWins);
      if (plan && plan.cost <= budget) return plan.first;
      return mustWin ? bestBoard.a : PASS;
    }

    if (mustWin) return best.a;

    if (winEndsGame) {
      // Already a round up: make the opponent spend cards, but don't overcommit.
      if (lead > 15) return PASS;
      if (lead < -10 || handDiff < -1) return PASS;
      return best.score > -2 ? best.a : PASS;
    }

    // Opening round (both players on two gems): never fall behind on both points and cards
    if (lead >= 15 || (lead >= 10 && handDiff <= 0)) return PASS;
    if (lead < -20 && handDiff <= 1) return PASS;
    if (lead < 0 && handDiff < 0 && best.dBoard < -lead) return PASS;
    if (p.hand.length <= 5 && lead < -8 && handDiff <= 0) return PASS;
    if (p.hand.length <= 4 && lead > 0) return PASS;
    if (best.score < -4) return PASS;
    return best.a;
  }
}

const SIM_CONTROLLER = new AIController();
