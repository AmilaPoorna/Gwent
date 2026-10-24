'use strict';
/*
 * Card database — Gwent as played in The Witcher 3: Wild Hunt
 * (base game + Hearts of Stone + Blood and Wine card sets).
 *
 * Each template:
 *   id, name, faction, type ('unit' | 'special' | 'weather' | 'leader'),
 *   strength, row ('close' | 'ranged' | 'siege' | 'agile'), abilities[],
 *   hero, count (max copies in a collection), group (name used by Muster / Tight Bond),
 *   target (card summoned by Avenger / created by Berserker transformation), token (not collectible)
 */

const FACTIONS = {
  realms: { name: 'Northern Realms', ability: 'Draw a card from your deck whenever you win a round.',
    perk: 'FACTION PERK: Draw a card from your deck whenever you win a round.' },
  nilfgaard: { name: 'Nilfgaardian Empire', ability: 'Wins any round that ends in a draw.',
    perk: 'FACTION PERK: Win whenever there is a draw.' },
  scoiatael: { name: "Scoia'tael", ability: 'Decides who takes the first turn.',
    perk: 'FACTION PERK: You decide who goes first at the start of a battle.' },
  monsters: { name: 'Monsters', ability: 'Keeps a random Unit Card out after each round.',
    perk: 'FACTION PERK: One randomly-chosen Monsters Unit Card stays on the battlefield after each round.' },
  skellige: { name: 'Skellige', ability: '2 random cards from the graveyard are placed on the battlefield at the start of the third round.',
    perk: '2 random cards from the graveyard are placed on the battlefield at the start of the third round.' },
  neutral: { name: 'Neutral', ability: '', perk: '' },
};
/* Order of the factions in the deck builder's faction selector (as in The Witcher 3) */
const FACTION_ORDER = ['nilfgaard', 'realms', 'scoiatael', 'skellige', 'monsters'];
const PLAYABLE_FACTIONS = ['realms', 'nilfgaard', 'scoiatael', 'monsters', 'skellige'];

const ROW_NAMES = { close: 'Close Combat', ranged: 'Ranged Combat', siege: 'Siege', agile: 'Agile' };

const ABILITIES = {
  hero: { name: 'Hero', desc: 'Not affected by any Special Cards or abilities.' },
  agile: { name: 'Agile', desc: 'Can be placed in either the Close Combat or the Ranged Combat row. Cannot be moved once placed.' },
  medic: { name: 'Medic', desc: 'Choose one card from your discard pile and play it instantly (no Heroes or Special Cards).' },
  morale: { name: 'Morale Boost', desc: 'Adds +1 to all units in the row (excluding itself).' },
  muster: { name: 'Muster', desc: 'Find any cards with the same name in your deck and play them instantly.' },
  spy: { name: 'Spy', desc: "Place on your opponent's battlefield (counts towards opponent's total) and draw 2 cards from your deck." },
  bond: { name: 'Tight Bond', desc: 'Place next to a card with the same name to double the strength of both cards.' },
  scorch: { name: 'Scorch', desc: 'Kills the strongest card(s) on the battlefield.' },
  scorch_c: { name: 'Scorch - Close Combat', desc: "Destroy your enemy's strongest Close Combat unit(s) if the combined strength of all his or her Close Combat units is 10 or more." },
  scorch_r: { name: 'Scorch - Ranged', desc: "Destroy your enemy's strongest Ranged Combat unit(s) if the combined strength of all his or her Ranged Combat units is 10 or more." },
  scorch_s: { name: 'Scorch - Siege', desc: "Destroy your enemy's strongest Siege unit(s) if the combined strength of all his or her Siege units is 10 or more." },
  horn: { name: "Commander's Horn", desc: 'Doubles the strength of all other unit cards in that row. Limited to 1 per row.' },
  avenger: { name: 'Summon Avenger', desc: 'When this card is removed from the battlefield, it summons a powerful new Unit Card to take its place.' },
  berserker: { name: 'Berserker', desc: 'Transforms into a bear when a Mardroeme card is on its row.' },
  mardroeme: { name: 'Mardroeme', desc: 'Triggers transformation of all Berserker cards on the same row.' },
};

const SPECIAL_DESC = {
  decoy: 'Decoy: Swap with a card on the battlefield to return it to your hand.',
  horn: "Commander's Horn: Doubles the strength of all unit cards in that row. Limited to 1 per row.",
  scorch: 'Scorch: Discard after playing. Kills the strongest card(s) on the battlefield.',
  mardroeme: 'Mardroeme: Triggers transformation of all Berserker cards on the same row.',
  frost: 'Biting Frost: Sets the strength of all Close Combat cards to 1 for both players.',
  fog: 'Impenetrable Fog: Sets the strength of all Ranged Combat cards to 1 for both players.',
  rain: 'Torrential Rain: Sets the strength of all Siege Combat cards to 1 for both players.',
  storm: 'Skellige Storm: Reduces the Strength of all Range and Siege Units to 1.',
  clear: 'Clear Weather: Removes all Weather Card (Biting Frost, Impenetrable Fog and Torrential Rain) effects.',
};

const CARDS = {};

function defUnits(faction, list) {
  for (const [id, name, strength, row, abil, count = 1, extra = {}] of list) {
    const abilities = abil ? abil.split(' ') : [];
    CARDS[id] = Object.assign({
      id, name, faction, type: 'unit', strength, row, abilities,
      hero: abilities.includes('hero'), count, group: id,
    }, extra);
  }
}

function defSpecial(id, name, faction, type, ability, count) {
  CARDS[id] = { id, name, faction, type, ability, abilities: [ability], strength: 0, row: '', hero: false, count, group: id };
}

function defLeader(id, name, faction, ability, desc, passive = false) {
  CARDS[id] = { id, name, faction, type: 'leader', ability, abilities: [], desc, passive, strength: 0, row: '', hero: false, count: 1, group: id };
}

/* ---------------------------------------------------------------- Neutral */
defUnits('neutral', [
  ['geralt', 'Geralt of Rivia', 15, 'close', 'hero muster', 1, { muster: 'roach' }],
  ['ciri', 'Cirilla Fiona Elen Riannon', 15, 'close', 'hero muster', 1, { muster: 'roach' }],
  ['yennefer', 'Yennefer of Vengerberg', 7, 'ranged', 'hero medic'],
  ['triss', 'Triss Merigold', 7, 'close', 'hero'],
  ['avallach', "Avallac'h", 0, 'close', 'hero spy'],
  ['vesemir', 'Vesemir', 6, 'close', ''],
  ['zoltan', 'Zoltan Chivay', 5, 'close', ''],
  ['dandelion', 'Dandelion', 2, 'close', 'horn'],
  ['villen', 'Villentretenmerth', 7, 'close', 'scorch_c'],
  ['regis', 'Emiel Regis Rohellec Terzieff', 5, 'close', ''],
  ['gaunter', "Gaunter O'Dimm", 2, 'siege', 'muster', 1, { muster: 'gaunter_darkness' }], // summons every Darkness card
  ['gaunter_darkness', "Gaunter O'Dimm: Darkness", 4, 'ranged', 'muster', 3], // summons the other Darkness cards, not Gaunter
  ['olgierd', 'Olgierd von Everec', 6, 'agile', 'morale'],
  ['cow', 'Cow', 0, 'ranged', 'avenger', 1, { target: 'chort' }],
  ['chort', 'Bovine Defense Force', 8, 'close', '', 0, { token: true }],
  ['roach', 'Roach', 3, 'close', '', 1],
]);
defSpecial('frost', 'Biting Frost', 'neutral', 'weather', 'frost', 3);
defSpecial('fog', 'Impenetrable Fog', 'neutral', 'weather', 'fog', 3);
defSpecial('rain', 'Torrential Rain', 'neutral', 'weather', 'rain', 3);
defSpecial('storm', 'Skellige Storm', 'neutral', 'weather', 'storm', 3);
defSpecial('clear', 'Clear Weather', 'neutral', 'weather', 'clear', 3);
defSpecial('horn', "Commander's Horn", 'neutral', 'special', 'horn', 3);
defSpecial('decoy', 'Decoy', 'neutral', 'special', 'decoy', 3);
defSpecial('scorch', 'Scorch', 'neutral', 'special', 'scorch', 3);
// Horn placed by leader abilities (not a real card, never goes to the graveyard)
defSpecial('leader_horn', "Commander's Horn", 'neutral', 'special', 'horn', 0);
CARDS.leader_horn.virtual = true;

/* ---------------------------------------------------------------- Northern Realms */
defUnits('realms', [
  ['roche', 'Vernon Roche', 10, 'close', 'hero'],
  ['natalis', 'John Natalis', 10, 'close', 'hero'],
  ['esterad', 'Esterad Thyssen', 10, 'close', 'hero'],
  ['philippa', 'Philippa Eilhart', 10, 'ranged', 'hero'],
  ['ves', 'Ves', 5, 'close', ''],
  ['siegfried', 'Siegfried of Denesle', 5, 'close', ''],
  ['yarpen', 'Yarpen Zigrin', 2, 'close', ''],
  ['dijkstra', 'Sigismund Dijkstra', 4, 'close', 'spy'],
  ['stennis', 'Prince Stennis', 5, 'close', 'spy'],
  ['redanian', 'Redanian Foot Soldier', 1, 'close', '', 2],
  ['blue_stripes', 'Blue Stripes Commando', 4, 'close', 'bond', 3],
  ['pfi', 'Poor Fucking Infantry', 1, 'close', 'bond', 4],
  ['dethmold', 'Dethmold', 6, 'ranged', ''],
  ['keira', 'Keira Metz', 5, 'ranged', ''],
  ['sabrina', 'Sabrina Glevissig', 4, 'ranged', ''],
  ['sheldon', 'Sheldon Skaggs', 4, 'ranged', ''],
  ['sile', 'Síle de Tansarville', 5, 'ranged', ''],
  ['crinfrid', 'Crinfrid Reavers Dragon Hunter', 5, 'ranged', 'bond', 3],
  ['ballista', 'Ballista', 6, 'siege', '', 2],
  ['catapult', 'Catapult', 8, 'siege', 'bond', 2],
  ['trebuchet', 'Trebuchet', 6, 'siege', '', 2],
  ['siege_tower', 'Siege Tower', 6, 'siege', ''],
  ['kaedweni', 'Kaedweni Siege Expert', 1, 'siege', 'morale', 3],
  ['dun_banner', 'Dun Banner Medic', 5, 'siege', 'medic'],
  ['thaler', 'Thaler', 1, 'siege', 'spy'],
]);
defLeader('foltest_king', 'Foltest: King of Temeria', 'realms', 'weather_fog', 'Pick an Impenetrable Fog card from your deck and play it instantly.');
defLeader('foltest_lord', 'Foltest: Lord Commander of the North', 'realms', 'clear', 'Clear any weather effects (resulting from Biting Frost, Torrential Rain or Impenetrable Fog cards) in play.');
defLeader('foltest_siegemaster', 'Foltest: the Siegemaster', 'realms', 'horn_siege', "Doubles the strength of all your Siege units (unless a Commander's Horn is also present on that row).");
defLeader('foltest_steelforged', 'Foltest: the Steel-Forged', 'realms', 'scorch_siege', "Destroy your enemy's strongest Siege unit(s) if the combined strength of all his or her Siege units is 10 or more.");
defLeader('foltest_son', 'Foltest: Son of Medell', 'realms', 'scorch_ranged', "Destroy your enemy's strongest Ranged Combat unit(s) if the combined strength of all his or her Ranged Combat units is 10 or more.");

/* ---------------------------------------------------------------- Nilfgaard */
defUnits('nilfgaard', [
  ['letho', 'Letho of Gulet', 10, 'close', 'hero'],
  ['menno', 'Menno Coehoorn', 10, 'close', 'hero medic'],
  ['morvran', 'Morvran Voorhis', 10, 'siege', 'hero'],
  ['tibor', 'Tibor Eggebracht', 10, 'ranged', 'hero'],
  ['cahir', 'Cahir Mawr Dyffryn aep Ceallach', 6, 'close', ''],
  ['morteisen', 'Morteisen', 3, 'close', ''],
  ['rainfarn', 'Rainfarn', 4, 'close', ''],
  ['vreemde', 'Vreemde', 2, 'close', ''],
  ['shilard', 'Shilard Fitz-Oesterlen', 7, 'close', 'spy'],
  ['skellen', 'Stefan Skellen', 9, 'close', 'spy'],
  ['vattier', 'Vattier de Rideaux', 4, 'close', 'spy'],
  ['impera', 'Impera Brigade Guard', 3, 'close', 'bond', 4],
  ['nausicaa', 'Nausicaa Cavalry Rider', 2, 'close', 'bond', 3],
  ['young_emissary', 'Young Emissary', 5, 'close', 'bond', 2],
  ['albrich', 'Albrich', 2, 'ranged', ''],
  ['assire', 'Assire var Anahid', 6, 'ranged', ''],
  ['cynthia', 'Cynthia', 4, 'ranged', ''],
  ['fringilla', 'Fringilla Vigo', 6, 'ranged', ''],
  ['renuald', 'Renuald aep Matsen', 5, 'ranged', ''],
  ['sweers', 'Sweers', 2, 'ranged', ''],
  ['vanhemar', 'Vanhemar', 4, 'ranged', ''],
  ['puttkammer', 'Puttkammer', 3, 'ranged', ''],
  ['black_archer', 'Black Infantry Archer', 10, 'ranged', '', 2],
  ['etolian', 'Etolian Auxiliary Archers', 1, 'ranged', 'medic', 2],
  ['heavy_scorpion', 'Heavy Zerrikanian Fire Scorpion', 10, 'siege', ''],
  ['scorpion', 'Zerrikanian Fire Scorpion', 5, 'siege', ''],
  ['siege_engineer', 'Siege Engineer', 6, 'siege', ''],
  ['mangonel', 'Rotten Mangonel', 3, 'siege', ''],
  ['siege_technician', 'Siege Technician', 0, 'siege', 'medic'],
]);
defLeader('emhyr_imperial', 'Emhyr var Emreis: His Imperial Majesty', 'nilfgaard', 'weather_rain', 'Pick a Torrential Rain card from your deck and play it instantly.');
defLeader('emhyr_emperor', 'Emhyr var Emreis: Emperor of Nilfgaard', 'nilfgaard', 'emperor', "Look at 3 random cards from your opponent's hand.");
defLeader('emhyr_whiteflame', 'Emhyr var Emreis: the White Flame', 'nilfgaard', 'whiteflame', "Cancel your opponent's Leader Ability.", true);
defLeader('emhyr_relentless', 'Emhyr var Emreis: the Relentless', 'nilfgaard', 'relentless', "Draw a card from your opponent's discard pile.");
defLeader('emhyr_invader', 'Emhyr var Emreis: Invader of the North', 'nilfgaard', 'invader', 'Abilities that restore a unit to the battlefield restore a randomly-chosen unit. Affects both players.', true);

/* ---------------------------------------------------------------- Scoia'tael */
defUnits('scoiatael', [
  ['eithne', 'Eithné', 10, 'ranged', 'hero'],
  ['saesenthessis', 'Saesenthessis', 10, 'ranged', 'hero'],
  ['iorveth', 'Iorveth', 10, 'ranged', 'hero'],
  ['isengrim', 'Isengrim Faoiltiarna', 10, 'close', 'hero morale'],
  ['dennis', 'Dennis Cranmer', 6, 'close', ''],
  ['dwarven_skirmisher', 'Dwarven Skirmisher', 3, 'close', 'muster', 3],
  ['havekar_smuggler', 'Havekar Smuggler', 5, 'close', 'muster', 3],
  ['mahakaman', 'Mahakaman Defender', 5, 'close', '', 5],
  ['milva', 'Milva', 10, 'ranged', 'morale'],
  ['ida', 'Ida Emean aep Sivney', 6, 'ranged', ''],
  ['riordain', 'Riordain', 1, 'ranged', ''],
  ['toruviel', 'Toruviel', 2, 'ranged', ''],
  ['dol_archer', 'Dol Blathanna Archer', 4, 'ranged', ''],
  ['vrihedd_recruit', 'Vrihedd Brigade Recruit', 4, 'ranged', ''],
  ['elven_skirmisher', 'Elven Skirmisher', 2, 'ranged', 'muster', 3],
  ['havekar_healer', 'Havekar Healer', 0, 'ranged', 'medic', 3],
  ['barclay', 'Barclay Els', 6, 'agile', ''],
  ['ciaran', 'Ciaran aep Easnillien', 3, 'agile', ''],
  ['dol_scout', 'Dol Blathanna Scout', 6, 'agile', '', 3],
  ['filavandrel', 'Filavandrel aén Fidháil', 6, 'agile', ''],
  ['vrihedd_veteran', 'Vrihedd Brigade Veteran', 5, 'agile', '', 2],
  ['yaevinn', 'Yaevinn', 6, 'agile', ''],
  ['schirru', 'Schirrú', 8, 'siege', 'scorch_s'],
]);
defLeader('francesca_queen', 'Francesca Findabair: Queen of Dol Blathanna', 'scoiatael', 'scorch_close', "Destroy your enemy's strongest Close Combat unit(s) if the combined strength of all his or her Close Combat units is 10 or more.");
defLeader('francesca_beautiful', 'Francesca Findabair: the Beautiful', 'scoiatael', 'horn_ranged', "Doubles the strength of all your Ranged Combat units (unless a Commander's Horn is also present on that row).");
defLeader('francesca_daisy', 'Francesca Findabair: Daisy of the Valley', 'scoiatael', 'daisy', 'Draw an extra card at the beginning of the battle.', true);
defLeader('francesca_pureblood', 'Francesca Findabair: Pureblood Elf', 'scoiatael', 'weather_frost', 'Pick a Biting Frost card from your deck and play it instantly.');
defLeader('francesca_hope', 'Francesca Findabair: Hope of the Aen Seidhe', 'scoiatael', 'hope', "Move agile units to whichever valid row maximizes their strength (don't move units already in optimal row).");

/* ---------------------------------------------------------------- Monsters */
defUnits('monsters', [
  ['draug', 'Draug', 10, 'close', 'hero'],
  ['imlerith', 'Imlerith', 10, 'close', 'hero'],
  ['leshen', 'Leshen', 10, 'ranged', 'hero'],
  ['kayran', 'Kayran', 8, 'agile', 'hero morale'],
  ['toad', 'Toad', 7, 'ranged', 'scorch_r'],
  ['arachas', 'Arachas', 4, 'close', 'muster', 3, { group: 'arachas' }],
  ['arachas_behemoth', 'Arachas Behemoth', 6, 'siege', 'muster', 1, { muster: 'arachas' }], // calls every Arachas; an Arachas calls only other Arachas
  ['botchling', 'Botchling', 4, 'close', ''],
  ['crone_brewess', 'Crone: Brewess', 6, 'close', 'muster', 1, { group: 'crone' }],
  ['crone_weavess', 'Crone: Weavess', 6, 'close', 'muster', 1, { group: 'crone' }],
  ['crone_whispess', 'Crone: Whispess', 6, 'close', 'muster', 1, { group: 'crone' }],
  ['fiend', 'Fiend', 6, 'close', ''],
  ['foglet', 'Foglet', 2, 'close', ''],
  ['forktail', 'Forktail', 5, 'close', ''],
  ['frightener', 'Frightener', 5, 'close', ''],
  ['ghoul', 'Ghoul', 1, 'close', 'muster', 3],
  ['griffin', 'Griffin', 5, 'close', ''],
  ['nekker', 'Nekker', 2, 'close', 'muster', 3],
  ['plague_maiden', 'Plague Maiden', 5, 'close', ''],
  ['vampire_bruxa', 'Vampire: Bruxa', 4, 'close', 'muster', 1, { group: 'vampire' }],
  ['vampire_ekimmara', 'Vampire: Ekimmara', 4, 'close', 'muster', 1, { group: 'vampire' }],
  ['vampire_fleder', 'Vampire: Fleder', 4, 'close', 'muster', 1, { group: 'vampire' }],
  ['vampire_garkain', 'Vampire: Garkain', 4, 'close', 'muster', 1, { group: 'vampire' }],
  ['vampire_katakan', 'Vampire: Katakan', 5, 'close', 'muster', 1, { group: 'vampire' }],
  ['werewolf', 'Werewolf', 5, 'close', ''],
  ['cockatrice', 'Cockatrice', 2, 'ranged', ''],
  ['endrega', 'Endrega', 2, 'ranged', ''],
  ['gargoyle', 'Gargoyle', 2, 'ranged', ''],
  ['grave_hag', 'Grave Hag', 5, 'ranged', ''],
  ['wyvern', 'Wyvern', 2, 'ranged', ''],
  ['harpy', 'Harpy', 2, 'agile', ''],
  ['celaeno_harpy', 'Celaeno Harpy', 2, 'agile', ''],
  ['earth_elemental', 'Earth Elemental', 6, 'siege', ''],
  ['fire_elemental', 'Fire Elemental', 6, 'siege', ''],
  ['ice_giant', 'Ice Giant', 5, 'siege', ''],
]);
defLeader('eredin_commander', 'Eredin: Commander of the Red Riders', 'monsters', 'horn_close', "Doubles the strength of all your Close Combat units (unless a Commander's Horn is also present on that row).");
defLeader('eredin_bringer', 'Eredin: Bringer of Death', 'monsters', 'bringer', 'Restore a card from your discard pile to your hand.');
defLeader('eredin_destroyer', 'Eredin: Destroyer of Worlds', 'monsters', 'destroyer', 'Discard 2 cards and draw 1 card of your choice from your deck.');
defLeader('eredin_king', 'Eredin: King of the Wild Hunt', 'monsters', 'king_wild', 'Pick any weather card from your deck and play it instantly.');
defLeader('eredin_treacherous', 'Eredin Bréacc Glas: The Treacherous', 'monsters', 'treacherous', 'Doubles the strength of all spy cards (affects both players).', true);

/* ---------------------------------------------------------------- Skellige */
defUnits('skellige', [
  ['cerys', 'Cerys', 10, 'close', 'hero muster', 1, { group: 'shieldmaiden' }],
  ['ermion', 'Ermion', 8, 'ranged', 'hero mardroeme'],
  ['hjalmar', 'Hjalmar', 10, 'ranged', 'hero'],
  ['kambi', 'Kambi', 0, 'close', 'avenger', 1, { target: 'hemdall' }],
  ['hemdall', 'Hemdall', 11, 'close', 'hero', 0, { token: true }],
  ['birna', 'Birna Bran', 2, 'close', 'medic'],
  ['blueboy', 'Blueboy Lugos', 6, 'close', ''],
  ['madman', 'Madman Lugos', 6, 'close', ''],
  ['donar', 'Donar an Hindar', 4, 'close', ''],
  ['udalryk', 'Udalryk', 4, 'close', ''],
  ['svanrige', 'Svanrige', 4, 'close', ''],
  ['armorsmith', 'Clan Tordarroch Armorsmith', 4, 'close', ''],
  ['skald', 'Clan Heymaey Skald', 4, 'close', ''],
  ['an_craite', 'Clan an Craite Warrior', 6, 'close', 'bond', 3],
  ['shieldmaiden', 'Clan Drummond Shield Maiden', 4, 'close', 'bond', 3, { group: 'shieldmaiden' }],
  ['berserker', 'Berserker', 4, 'close', 'berserker', 1, { target: 'vildkaarl' }],
  ['vildkaarl', 'Transformed Vildkaarl', 14, 'close', 'morale', 0, { token: true }],
  ['brokvar', 'Clan Brokvar Archer', 6, 'ranged', '', 3],
  ['dimun_pirate', 'Clan Dimun Pirate', 6, 'ranged', 'scorch'],
  ['light_longship', 'Light Longship', 4, 'ranged', 'muster', 3],
  ['young_berserker', 'Young Berserker', 2, 'ranged', 'berserker', 3, { target: 'young_vildkaarl' }],
  ['young_vildkaarl', 'Transformed Young Vildkaarl', 8, 'ranged', 'bond', 0, { token: true }],
  ['draig', 'Draig Bon-Dhu', 2, 'siege', 'horn'],
  ['holger', 'Holger Blackhand', 4, 'siege', ''],
  ['war_longship', 'War Longship', 6, 'siege', 'bond', 3],
  ['olaf', 'Olaf', 12, 'agile', 'morale'],
]);
defSpecial('mardroeme', 'Mardroeme', 'skellige', 'special', 'mardroeme', 3);
defLeader('crach', 'Crach an Craite', 'skellige', 'crach', "Shuffle all cards from each player's graveyards back into their decks.");
defLeader('bran', 'King Bran', 'skellige', 'bran', 'Units only lose half their Strength in bad weather.', true);

/* ---------------------------------------------------------------- Default decks */
function parseDeck(str) {
  const out = [];
  for (const tok of str.split(/[\s,]+/).filter(Boolean)) {
    const [id, n] = tok.split('*');
    for (let i = 0; i < (+n || 1); i++) out.push(id);
  }
  return out;
}

const DEFAULT_DECKS = {
  realms: {
    leader: 'foltest_siegemaster',
    cards: parseDeck(`roche natalis esterad philippa ves siegfried dijkstra stennis thaler ballista catapult*2
      trebuchet siege_tower dethmold keira sabrina sile blue_stripes*3 kaedweni*2 dun_banner crinfrid*3
      geralt roach dandelion horn decoy*2 scorch frost fog rain clear`),
  },
  nilfgaard: {
    leader: 'emhyr_whiteflame',
    cards: parseDeck(`letho menno morvran tibor cahir fringilla assire renuald black_archer*2 heavy_scorpion
      siege_engineer shilard skellen vattier impera*4 nausicaa*3 young_emissary*2 etolian*2 siege_technician
      geralt vesemir decoy*2 horn scorch frost fog rain clear`),
  },
  scoiatael: {
    leader: 'francesca_daisy',
    cards: parseDeck(`eithne iorveth saesenthessis isengrim milva barclay filavandrel yaevinn ida dol_scout*3
      mahakaman*3 dwarven_skirmisher*3 havekar_healer*2 havekar_smuggler*3 elven_skirmisher*3 vrihedd_veteran*2
      geralt villen decoy*2 horn*2 scorch frost fog clear`),
  },
  monsters: {
    leader: 'eredin_commander',
    cards: parseDeck(`draug imlerith leshen kayran ghoul*3 nekker*3 arachas*3 arachas_behemoth vampire_bruxa
      vampire_ekimmara vampire_fleder vampire_garkain vampire_katakan crone_brewess crone_weavess crone_whispess
      fiend earth_elemental fire_elemental griffin toad geralt dandelion decoy*2 horn scorch frost fog rain clear`),
  },
  skellige: {
    leader: 'crach',
    cards: parseDeck(`cerys hjalmar ermion kambi olaf shieldmaiden*3 an_craite*3 brokvar*3 light_longship*3
      war_longship*3 berserker young_berserker*3 birna dimun_pirate madman draig geralt
      mardroeme*2 decoy*2 horn storm clear scorch`),
  },
};

/* Number of art variants per card (copies cycle through them, as in TW3): assets/cards/{lg,sm}/<id>[_n].jpg */
const ART_VARIANTS = {"redanian": 2, "ballista": 2, "trebuchet": 2, "kaedweni": 3, "young_emissary": 2, "black_archer": 2, "etolian": 2, "dwarven_skirmisher": 3, "havekar_smuggler": 3, "mahakaman": 5, "elven_skirmisher": 3, "havekar_healer": 3, "dol_scout": 3, "vrihedd_veteran": 2, "arachas": 3, "ghoul": 3, "nekker": 3, "shieldmaiden": 3};

const DECK_RULES = { minUnits: 22, maxSpecials: 10 };

function deckStats(deck) {
  let units = 0, specials = 0, strength = 0, heroes = 0;
  for (const id of deck.cards) {
    const t = CARDS[id];
    if (!t) continue;
    if (t.type === 'unit') { units++; strength += t.strength; if (t.hero) heroes++; } else specials++;
  }
  return { units, specials, strength, heroes, total: deck.cards.length };
}

function deckProblems(deck) {
  const errs = [];
  const L = CARDS[deck.leader];
  if (!L || L.type !== 'leader') { errs.push('No leader selected.'); return errs; }
  const counts = {};
  for (const id of deck.cards) {
    const t = CARDS[id];
    if (!t || t.token || t.type === 'leader') { errs.push(`Unknown card: ${id}`); continue; }
    if (t.faction !== 'neutral' && t.faction !== L.faction) errs.push(`${t.name} does not belong to ${FACTIONS[L.faction].name}.`);
    counts[id] = (counts[id] || 0) + 1;
    if (counts[id] === t.count + 1) errs.push(`Too many copies of ${t.name}.`);
  }
  const st = deckStats(deck);
  if (st.units < DECK_RULES.minUnits) errs.push(`You need at least ${DECK_RULES.minUnits} Unit Cards (${st.units}).`);
  if (st.specials > DECK_RULES.maxSpecials) errs.push(`You can have at most ${DECK_RULES.maxSpecials} Special Cards (${st.specials}).`);
  return errs;
}

/* A random, legal and fairly strong deck for the computer opponent, so every match plays differently: heroes, spies
   and medics are favoured, Muster and Tight Bond cards come with their whole family, a unit brings the cards it
   summons, and the rest are the strongest units of a random selection. */
const AI_SPECIALS = { decoy: 2, horn: 2, scorch: 1, frost: 1, fog: 1, rain: 1, storm: 1, clear: 1, mardroeme: 2 };

function randomDeck(faction) {
  const pool = Object.values(CARDS).filter(t => !t.token && !t.virtual && t.type !== 'leader' && t.count > 0 &&
    (t.faction === faction || t.faction === 'neutral'));
  const cards = [], copies = id => cards.filter(x => x === id).length;
  const units = () => cards.filter(id => CARDS[id].type === 'unit').length, specials = () => cards.length - units();
  const add = (t, n = t.count) => { while (n-- > 0 && copies(t.id) < t.count) cards.push(t.id); };
  const unitPool = shuffle(pool.filter(t => t.type === 'unit'));
  const families = ab => Object.values(unitPool.filter(t => t.abilities.includes(ab))
    .reduce((g, t) => ((g[t.group] ||= []).push(t), g), {}));

  for (const t of unitPool) if (t.hero && Math.random() < .75) add(t, 1);
  for (const ab of ['spy', 'medic']) unitPool.filter(t => t.abilities.includes(ab) && !t.hero).slice(0, 2).forEach(t => add(t, 1));
  for (const ab of ['muster', 'bond']) shuffle(families(ab)).slice(0, 2).forEach(f => f.forEach(t => add(t)));
  for (const t of unitPool) if (copies(t.id) && t.muster) unitPool.filter(x => x.group === t.muster).forEach(x => add(x));
  const score = new Map(unitPool.map(t => [t.id, t.strength + Math.random() * 4]));
  for (const t of [...unitPool].sort((a, b) => score.get(b.id) - score.get(a.id))) {
    if (units() >= 25) break;
    if (!t.hero) add(t, 1);
  }

  const berserkers = cards.some(id => CARDS[id].abilities.includes('berserker'));
  const wanted = 5 + Math.floor(Math.random() * 4);
  let weather = 0;
  for (const t of shuffle(pool.filter(t => t.type !== 'unit'))) {
    if (specials() >= wanted) break;
    if ((t.ability === 'mardroeme' && !berserkers) || (t.type === 'weather' && weather >= 3)) continue;
    const n = Math.min(AI_SPECIALS[t.ability] || 0, wanted - specials());
    add(t, n);
    if (t.type === 'weather') weather += Math.min(n, 1);
  }
  const leader = pickRandom(Object.values(CARDS).filter(t => t.type === 'leader' && t.faction === faction)).id;
  return { leader, cards };
}
