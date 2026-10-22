// Headless AI-vs-AI games to exercise the rules engine: node tests/selfplay.js [games]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, structuredClone, setTimeout, Math });
for (const f of ['cards.js', 'engine.js', 'ai.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js', f), 'utf8'), ctx, { filename: f });
}

const code = `
(async (N) => {
  for (const f of PLAYABLE_FACTIONS) {
    const errs = deckProblems(DEFAULT_DECKS[f]);
    if (errs.length) throw new Error(f + ' default deck invalid: ' + errs.join('; '));
  }
  const results = { 0: 0, 1: 0, draw: 0 }, byFaction = {};
  let rounds = 0;
  for (let i = 0; i < N; i++) {
    const fa = PLAYABLE_FACTIONS[i % 5], fb = PLAYABLE_FACTIONS[Math.floor(i / 5) % 5];
    const leaders = f => Object.values(CARDS).filter(c => c.type === 'leader' && c.faction === f).map(c => c.id);
    const la = pickRandom(leaders(fa)), lb = pickRandom(leaders(fb));
    const setup = [
      { name: 'A', leader: la, cards: DEFAULT_DECKS[fa].cards },
      { name: 'B', leader: lb, cards: DEFAULT_DECKS[fb].cards },
    ];
    const g = new Game(setup, [new AIController(), new AIController()], null);
    const sizes = g.s.players.map(p => p.deck.length);
    await g.run();
    // Card conservation: every real card is in deck, hand, grave or on the board
    const all = g.s.players.flatMap(p => {
      const board = ROWS.flatMap(r => p.rows[r].cards.concat(p.rows[r].special ? [p.rows[r].special] : []));
      return [...p.deck, ...p.hand, ...p.grave, ...board];
    }).concat(g.s.weather.map(w => w.card)).filter(c => !CARDS[c.id].token && !CARDS[c.id].virtual);
    if (new Set(all.map(c => c.uid)).size !== all.length) throw new Error('duplicate card instance');
    if (all.length > sizes[0] + sizes[1]) throw new Error('cards created from nothing');
    if (!g.s.over) throw new Error('game did not finish');
    if (g.s.round > 3) throw new Error('too many rounds');
    rounds += g.s.round;
    const w = g.s.winner;
    results[w === null ? 'draw' : w]++;
    const key = w === null ? 'draw' : (w === 0 ? fa : fb);
    byFaction[key] = (byFaction[key] || 0) + 1;
  }
  console.log('games', N, 'avg rounds', (rounds / N).toFixed(2), results, byFaction);
})(${+process.argv[2] || 200}).catch(e => { console.error(e); throw e; });
`;
vm.runInContext(code, ctx);
