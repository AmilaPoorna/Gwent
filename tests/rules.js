// Scenario tests for individual Gwent rules: node tests/rules.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, structuredClone, setTimeout, Math });
for (const f of ['cards.js', 'engine.js', 'ai.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js', f), 'utf8'), ctx, { filename: f });
}

const code = `
(async () => {
  let pass = 0, fail = 0;
  const eq = (name, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) pass++;
    else { fail++; console.log('FAIL', name, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); }
  };
  // Scripted controller: picks the first offered option (or a given id)
  const scripted = (pickId) => Object.assign(new AIController(), {
    chooseCard: async (g, p, cards) => cards.find(c => c.id === pickId) || cards[0],
  });
  function game(la = 'foltest_lord', lb = 'foltest_lord', deckA = [], deckB = [], ctrlA, ctrlB) {
    const g = new Game([
      { name: 'A', leader: la, cards: deckA },
      { name: 'B', leader: lb, cards: deckB },
    ], [ctrlA || new AIController(), ctrlB || new AIController()], null);
    g.sim = true;
    return g;
  }
  const put = (g, p, r, ...ids) => ids.map(id => { const c = makeCard(id); g.s.players[p].rows[r].cards.push(c); return c; });
  const hand = (g, p, id) => { const c = makeCard(id); g.s.players[p].hand.push(c); return c; };
  const play = (g, p, c, row, target) => g.applyAction(g.s.players[p], { type: 'play', uid: c.uid, row, target });
  const powers = (g, p, r) => g.s.players[p].rows[r].cards.map(c => g.power(g.s.players[p], r, c));

  // Tight bond
  { const g = game(); put(g, 0, 'close', 'blue_stripes', 'blue_stripes', 'blue_stripes'); eq('bond x3', powers(g, 0, 'close'), [12, 12, 12]); }
  // Morale boost excludes itself
  { const g = game(); put(g, 0, 'siege', 'kaedweni', 'ballista'); eq('morale', powers(g, 0, 'siege'), [1, 7]); }
  // Horn special doubles, heroes unaffected
  { const g = game(); put(g, 0, 'close', 'ves', 'roche'); g.s.players[0].rows.close.special = makeCard('horn'); eq('horn', powers(g, 0, 'close'), [10, 10]); }
  // Dandelion doubles others but not himself; doesn't stack with horn
  { const g = game(); put(g, 0, 'close', 'dandelion', 'ves'); eq('dandelion', powers(g, 0, 'close'), [2, 10]);
    g.s.players[0].rows.close.special = makeCard('horn'); eq('dandelion+horn no stack', powers(g, 0, 'close'), [4, 10]); }
  // Weather → 1, then bond, morale, horn applied on top
  { const g = game(); put(g, 0, 'close', 'blue_stripes', 'blue_stripes', 'geralt');
    const c = hand(g, 0, 'frost'); await play(g, 0, c);
    eq('frost+bond', powers(g, 0, 'close'), [2, 2, 15]);
    g.s.players[0].rows.close.special = makeCard('horn'); eq('frost+bond+horn', powers(g, 0, 'close'), [4, 4, 15]);
    const cl = hand(g, 1, 'clear'); await play(g, 1, cl);
    eq('clear weather', g.s.weather.length, 0);
    eq('weather card to owner grave', g.s.players[0].grave.map(c => c.id), ['frost']); }
  // Storm hits ranged + siege
  { const g = game(); put(g, 0, 'ranged', 'keira'); put(g, 0, 'siege', 'ballista'); put(g, 0, 'close', 'ves');
    await play(g, 0, hand(g, 0, 'storm')); eq('storm', [g.total(g.s.players[0])], [7]); }
  // King Bran halves in weather
  { const g = game('bran'); put(g, 0, 'close', 'ves'); await play(g, 1, hand(g, 1, 'frost')); eq('bran', powers(g, 0, 'close'), [2]); }
  // Scorch kills all strongest non-hero units on both sides
  { const g = game(); put(g, 0, 'close', 'ves', 'geralt'); put(g, 1, 'close', 'siegfried', 'yarpen');
    await play(g, 0, hand(g, 0, 'scorch'));
    eq('scorch A', g.s.players[0].rows.close.cards.map(c => c.id), ['geralt']);
    eq('scorch B', g.s.players[1].rows.close.cards.map(c => c.id), ['yarpen']); }
  // Villentretenmerth: only when enemy close >= 10
  { const g = game(); put(g, 1, 'close', 'ves', 'siegfried'); await play(g, 0, hand(g, 0, 'villen'), 'close');
    eq('villen kills', g.s.players[1].rows.close.cards.length, 0); }
  { const g = game(); put(g, 1, 'close', 'ves', 'yarpen'); await play(g, 0, hand(g, 0, 'villen'), 'close');
    eq('villen below 10', g.s.players[1].rows.close.cards.length, 2); }
  // Spy goes to opponent and draws 2
  { const g = game('foltest_lord', 'foltest_lord', ['ves', 'ves', 'ves']);
    await play(g, 0, hand(g, 0, 'dijkstra'), 'close');
    eq('spy side', g.s.players[1].rows.close.cards.map(c => c.id), ['dijkstra']);
    eq('spy draw', g.s.players[0].hand.length, 2); }
  // Muster pulls from deck (not hand)
  { const g = game('eredin_commander', 'foltest_lord', ['ghoul', 'ghoul', 'ves']);
    await play(g, 0, hand(g, 0, 'ghoul'), 'close');
    eq('muster', g.s.players[0].rows.close.cards.map(c => c.id), ['ghoul', 'ghoul', 'ghoul']);
    eq('muster deck', g.s.players[0].deck.map(c => c.id), ['ves']); }
  // Geralt (next-gen) musters Roach from the deck
  { const g = game('foltest_lord', 'foltest_lord', ['roach', 'ciri']);
    await play(g, 0, hand(g, 0, 'geralt'), 'close');
    eq('geralt musters roach', g.s.players[0].rows.close.cards.map(c => c.id), ['geralt', 'roach']); }
  // Gaunter O'Dimm summons the Darkness cards; a Darkness card summons nothing
  { const g = game('foltest_lord', 'foltest_lord', ['gaunter_darkness', 'gaunter_darkness', 'gaunter_darkness']);
    await play(g, 0, hand(g, 0, 'gaunter'), 'siege');
    eq('gaunter musters darkness', g.s.players[0].rows.ranged.cards.map(c => c.id), ['gaunter_darkness', 'gaunter_darkness', 'gaunter_darkness']); }
  { const g = game('foltest_lord', 'foltest_lord', ['gaunter', 'gaunter_darkness', 'gaunter_darkness']);
    await play(g, 0, hand(g, 0, 'gaunter_darkness'), 'ranged');
    eq('darkness musters nothing', [g.s.players[0].rows.ranged.cards.length, g.s.players[0].rows.siege.cards.length, g.s.players[0].deck.length], [1, 0, 3]); }
  // Muster across names (vampires, arachas behemoth to siege)
  { const g = game('eredin_commander', 'foltest_lord', ['arachas', 'arachas_behemoth', 'vampire_fleder']);
    await play(g, 0, hand(g, 0, 'arachas'), 'close');
    eq('arachas muster close', g.s.players[0].rows.close.cards.length, 2);
    eq('arachas muster siege', g.s.players[0].rows.siege.cards.map(c => c.id), ['arachas_behemoth']); }
  // Medic revives (no heroes), chains into revived abilities
  { const g = game('foltest_lord', 'foltest_lord', [], [], scripted('ves'));
    const P = g.s.players[0];
    P.grave.push(makeCard('geralt'), makeCard('ves'));
    await play(g, 0, hand(g, 0, 'dun_banner'), 'siege');
    eq('medic', P.rows.close.cards.map(c => c.id), ['ves']);
    eq('medic grave', P.grave.map(c => c.id), ['geralt']); }
  // Decoy returns unit to hand
  { const g = game(); const [v] = put(g, 0, 'close', 'ves'); const d = hand(g, 0, 'decoy');
    await play(g, 0, d, 'close', v.uid);
    eq('decoy board', g.s.players[0].rows.close.cards.map(c => c.id), ['decoy']);
    eq('decoy hand', g.s.players[0].hand.map(c => c.id), ['ves']); }
  // Avenger: Kambi → Hemdall when removed at round end
  { const g = game(); put(g, 0, 'close', 'kambi'); g.s.players[0].hand.push(makeCard('ves')); g.s.players[1].hand.push(makeCard('ves'));
    await g.endRound();
    eq('kambi->hemdall', g.s.players[0].rows.close.cards.map(c => c.id), ['hemdall']); }
  // Cow → Bovine Defense Force when scorched
  { const g = game(); const [cw] = put(g, 0, 'ranged', 'cow'); g.destroy(g.s.players[0], 'ranged', cw);
    eq('cow->chort', g.s.players[0].rows.close.cards.map(c => c.id), ['chort']); }
  // Berserker + Mardroeme
  { const g = game('crach'); put(g, 0, 'close', 'berserker'); await play(g, 0, hand(g, 0, 'mardroeme'), 'close');
    eq('mardroeme', g.s.players[0].rows.close.cards.map(c => c.id), ['vildkaarl']); }
  { const g = game('crach'); put(g, 0, 'ranged', 'ermion'); await play(g, 0, hand(g, 0, 'young_berserker'), 'ranged');
    eq('ermion transforms later berserker', g.s.players[0].rows.ranged.cards.map(c => c.id), ['ermion', 'young_vildkaarl']); }
  // Leader horn doesn't stack with horn
  { const g = game('foltest_siegemaster'); put(g, 0, 'siege', 'ballista');
    eq('siegemaster usable', g.leaderUsable(g.s.players[0]), true);
    await g.applyAction(g.s.players[0], { type: 'leader' }); eq('siegemaster', powers(g, 0, 'siege'), [12]);
    eq('leader once', g.leaderUsable(g.s.players[0]), false); }
  // White Flame cancels opponent leader (checked at start)
  { const g = game('emhyr_whiteflame', 'foltest_siegemaster');
    for (const p of g.s.players) if (CARDS[p.leader.id].ability === 'whiteflame') g.opp(p).leaderBlocked = true;
    eq('white flame', g.leaderUsable(g.s.players[1]), false); }
  // Treacherous doubles spies on both sides
  { const g = game('eredin_treacherous'); put(g, 1, 'close', 'dijkstra'); eq('treacherous', powers(g, 1, 'close'), [8]); }
  // Round results: Nilfgaard wins ties, Northern Realms draws on win, Monsters keep a unit
  { const g = game('emhyr_imperial', 'foltest_lord'); put(g, 0, 'close', 'ves'); put(g, 1, 'close', 'ves');
    await g.endRound(); eq('nilfgaard tie', [g.s.players[0].gems, g.s.players[1].gems], [2, 1]); }
  { const g = game('foltest_lord', 'eredin_commander'); put(g, 0, 'close', 'ves'); put(g, 1, 'close', 'ves');
    await g.endRound(); eq('normal tie', [g.s.players[0].gems, g.s.players[1].gems], [1, 1]); }
  { const g = game('foltest_lord', 'eredin_commander', ['ves', 'ves']); put(g, 0, 'close', 'roche');
    await g.endRound(); eq('realms draw', g.s.players[0].hand.length, 1); eq('winner starts', g.s.first, 0); }
  { const g = game('foltest_lord', 'eredin_commander'); put(g, 1, 'close', 'fiend', 'griffin');
    await g.endRound(); eq('monsters keep', g.s.players[1].rows.close.cards.length, 1); eq('monsters grave', g.s.players[1].grave.length, 1); }
  // Skellige: 2 units from grave at start of round 3
  { const g = game('crach'); g.s.round = 2; g.s.players.forEach(p => p.gems = 1);
    g.s.players[0].grave.push(makeCard('madman'), makeCard('blueboy'), makeCard('hjalmar'));
    await g.skelligeAbility(g.s.players[0]);
    eq('skellige r3', g.s.players[0].rows.close.cards.length, 2); }
  // Destroyer of Worlds
  { const g = game('eredin_destroyer', 'foltest_lord', ['geralt']); hand(g, 0, 'ves'); hand(g, 0, 'yarpen');
    await g.applyAction(g.s.players[0], { type: 'leader' });
    eq('destroyer', g.s.players[0].hand.map(c => c.id), ['geralt']); eq('destroyer grave', g.s.players[0].grave.length, 2); }
  // Hope of the Aen Seidhe moves agile units to a horned row
  { const g = game('francesca_hope'); put(g, 0, 'close', 'barclay'); g.s.players[0].rows.ranged.special = makeCard('horn');
    await g.applyAction(g.s.players[0], { type: 'leader' });
    eq('hope', g.s.players[0].rows.ranged.cards.map(c => c.id), ['barclay']); }
  // Mulligan never redraws the same card
  { const g = game('foltest_lord', 'foltest_lord', ['geralt']); const v = hand(g, 0, 'ves'); g.redraw(g.s.players[0], v.uid);
    eq('redraw', [g.s.players[0].hand[0].id, g.s.players[0].deck[0].id], ['geralt', 'ves']); }

  console.log(pass + ' passed, ' + fail + ' failed');
  if (fail) throw new Error('rule tests failed');
})().catch(e => { console.error(e); throw e; });
`;
vm.runInContext(code, ctx);
