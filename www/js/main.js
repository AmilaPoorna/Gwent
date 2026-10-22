'use strict';
/* App flow, as in the game: Play → deck builder (choose faction, leader and deck) → match → results. */

function startMatch(deck) {
  const faction = pickRandom(PLAYABLE_FACTIONS);
  const opp = structuredClone(DEFAULT_DECKS[faction]);
  opp.leader = pickRandom(Object.values(CARDS).filter(t => t.type === 'leader' && t.faction === faction)).id;
  UI.startGame(deck, opp);
}

function enterFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !matchMedia('(pointer: coarse)').matches) return;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  Promise.resolve(req.call(el, { navigationUI: 'hide' }))
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => {});
}

UI.init();
DeckBuilder.init();

DeckBuilder.onStart = deck => startMatch(deck);
DeckBuilder.onClose = () => UI.show('menu');
UI.onGameOver = act => { if (act === 'again') startMatch(DeckBuilder.current()); else DeckBuilder.open(DeckBuilder.faction); };
UI.onForfeit = () => DeckBuilder.open(DeckBuilder.faction);

$('#btn-play').onclick = () => {
  enterFullscreen();
  Music.start();
  Sfx.play('menu_opening');
  DeckBuilder.open();
};
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && $('#menu').classList.contains('active')) $('#btn-play').click();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // When an updated version takes over, reload once so the new files are used straight away
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}
