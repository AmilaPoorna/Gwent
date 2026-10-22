// Plays complete matches in a real browser through the UI (clicks, holds, carousel picks), on desktop and phone sizes.
//
//   npm i --no-save playwright-core
//   npm start            (in another terminal; serves www/ on :8080)
//   CHROMIUM=/usr/bin/chromium node tests/browser-playtest.js [games=2]
//
// Fails on any page error, console error or failed request.
'use strict';
const { chromium } = require('playwright-core');

const URL = process.env.GWENT_URL || 'http://127.0.0.1:8080/';
const GAMES = +(process.argv[2] || 2);

async function playMatch(browser, opts, faction) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => errors.push('request failed: ' + r.url()));
  await page.goto(URL);
  await page.evaluate(() => { localStorage.clear(); Settings.sound = false; Settings.music = false; SPEED = 0.25; });
  const tap = (sel, o) => (opts.hasTouch ? page.tap(sel, o) : page.click(sel, o));
  await tap('#btn-play');
  await page.evaluate(f => DeckBuilder.load(f), faction);
  await tap('#db-hints [data-act=start]');

  let turns = 0;
  const t0 = Date.now();
  for (let i = 0; i < 4000 && Date.now() - t0 < 300000; i++) {
    const st = await page.evaluate(() => ({
      turn: !!UI.turn, rowPick: !!UI.rowPick, over: $('#gameover').classList.contains('show'),
      chooser: !!UI.ch, dialog: $('#dialog').classList.contains('show'),
      redraw: !!UI.ch && $('#chooser .ch-title').textContent.startsWith('Choose a card to redraw'),
    }));
    if (st.over) break;
    if (st.dialog) { await tap('#dialog .dlg-buttons .hint'); continue; }
    if (st.redraw) { await tap('#chooser .ch-hints [data-act=finish]'); continue; }
    if (st.chooser) {
      await page.evaluate(async () => {
        const g = UI.game, pick = await new AIController().chooseCard(g, g.s.players[0], UI.ch.cards, '', { purpose: 'medic' });
        UI.ch.idx = UI.ch.cards.indexOf(pick); UI.renderCarousel();
      });
      await tap('#chooser .slot.center .card');
      continue;
    }
    if (st.rowPick) { await tap('.row.target .row-score', { force: true }); continue; }
    if (!st.turn) { await page.waitForTimeout(100); continue; }
    turns++;
    // Let the computer's own logic pick a sensible move for us, then make it with real input.
    const a = await page.evaluate(async () => {
      const g = UI.game, sim = Object.assign(Object.create(Object.getPrototypeOf(g)), g, { ui: null, sim: true });
      return new AIController().takeTurn(sim, g.s.players[0]);
    });
    if (a.type === 'pass') {
      if (opts.hasTouch) {
        const b = await page.locator('#pass-hint').boundingBox();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
        await page.waitForTimeout(900);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.keyboard.down(' '); await page.waitForTimeout(900); await page.keyboard.up(' ');
      }
      continue;
    }
    if (a.type === 'leader') { await tap('#me-leader .card'); continue; }
    await tap(`#hand .card[data-uid="${a.uid}"]`);
    const kind = await page.evaluate(uid => { const t = T(UI.myHand(uid)); return t.type === 'unit' ? (t.abilities.includes('spy') ? 'spy' : 'unit') : t.ability; }, a.uid);
    if (a.target) await tap(`.row .card[data-uid="${a.target}"]`);
    else if (kind === 'unit') await tap(`#row-me-${a.row} .row-score`, { force: true });
    else if (kind === 'spy') await tap(`#row-op-${a.row} .row-score`, { force: true });
    else if (kind === 'horn' || kind === 'mardroeme') await tap(`#row-me-${a.row} .row-special`, { force: true });
    else await tap(`#hand .card[data-uid="${a.uid}"]`);
  }
  const result = await page.evaluate(() => UI.game && { over: UI.game.s.over, winner: UI.game.s.winner, rounds: UI.game.s.history.length });
  await ctx.close();
  return { turns, result, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const sizes = [
    ['desktop', { viewport: { width: 1600, height: 900 } }],
    ['phone', { viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ];
  let failed = false;
  for (let i = 0; i < GAMES; i++) {
    for (const [name, opts] of sizes) {
      const faction = PLAYABLE[(i * 2 + (name === 'phone')) % PLAYABLE.length];
      const r = await playMatch(browser, opts, faction);
      const ok = r.result && r.result.over && !r.errors.length;
      failed = failed || !ok;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${faction}: ${r.turns} turns, ${r.result ? r.result.rounds : '?'} rounds`, r.errors.length ? r.errors : '');
    }
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();

const PLAYABLE = ['realms', 'nilfgaard', 'scoiatael', 'monsters', 'skellige'];
