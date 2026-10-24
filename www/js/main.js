'use strict';
/* App flow, as in the game: Play → deck builder (choose faction, leader and deck) → match → results. */

function startMatch(deck) {
  UI.startGame(deck, randomDeck(pickRandom(PLAYABLE_FACTIONS))); // a new opponent every match
}

// Inside the Android app (Capacitor), full screen and landscape come from the app itself
const NATIVE = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

function enterFullscreen() {
  const el = document.documentElement;
  if (NATIVE || document.fullscreenElement || !matchMedia('(pointer: coarse)').matches) return;
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

// Android back button: works like Esc (closes overlays, opens the pause menu, leaves the deck builder); on the home screen it exits
if (NATIVE && Capacitor.Plugins.App) {
  Capacitor.Plugins.App.addListener('backButton', () => {
    if ($('#menu').classList.contains('active')) Capacitor.Plugins.App.exitApp();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  });
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !NATIVE) {
  // When an updated version takes over, reload once so the new files are used straight away
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}
