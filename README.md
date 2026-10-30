# Gwent — The Witcher 3 card game

A recreation of Gwent as played in *The Witcher 3: Wild Hunt* (base game, Hearts of Stone, Blood and Wine and
the next-gen update), against a computer opponent. It runs in any modern browser on PC and Android, installs as
an app, and can be packaged as an Android APK.

## How it works (same flow as the game)

1. **Play**: the home screen is plain black with the title, *Play*, a small *How to Play* link and the *Music* and
   *Sound* switches.
2. **Deck builder**: this is TW3's pre-match screen. Your deck for each faction is saved automatically, every
   time you change it, so next time you only edit it.
   - Switch faction with **Q / E** (LB / RB in the game) or by clicking the faction names.
   - Click a card in **Card Collection** to add it, or a card in **Cards in Deck** to remove it.
   - Filter with the row/hero/weather/special icons.
   - **X** (or click the leader) opens *Choose a Leader*.
   - **Z**, right-click or long-press zooms a card.
   - **Enter** starts the game, **Esc** closes.
   - The deck rules are TW3's: at least 22 unit cards and at most 10 special cards ("Special card limit reached").
3. **Match**: on the original board, with TW3's notifications, ability animations, sound effects and music.
   - Redraw up to 2 cards, then play.
   - **Hold Space** (or hold the *[HOLD] Pass* button) to pass.
   - **Esc** (or *Menu*) opens the menu: *How to Play*, music and sound, *Restart Match*, *Change Deck*, *Forfeit Game*
     (shown as a defeat) and *Quit to Menu*.
4. **Results**: Victory, Defeat or Draw with the round scores. **Enter** plays again, **Esc** goes back to the deck.

On phones and tablets, including the Android app, the hints are plain buttons without the keys. A card is zoomed by
pressing and holding it, and *How to Play* explains only the touch controls.

## Rules and content

- **Factions:** all 5, with their faction perks.
- **Leaders:** all 22, with their abilities.
- **Cards:** the full card list with original strengths, rows, abilities and copy limits.
- **Abilities:** Agile, Medic, Morale Boost, Muster, Spy, Tight Bond, Scorch (global and per row),
  Commander's Horn, Hero, Summon Avenger, Berserker and Mardroeme.
- **Special and weather cards:** all of them.
- **Strength order:** as in TW3: base → weather → Tight Bond → Morale → Horn. Heroes are never affected.
- **Next-gen update:** the Roach card is included.

## Original assets and where they came from

All graphics, sounds and music are the original *Witcher 3* Gwent assets, in `www/assets/`:

| folder | contents | source |
|---|---|---|
| `cards/lg` | full card faces (previews, zoom, carousels) | [asundr/gwent-classic](https://github.com/asundr/gwent-classic), checked against [matt77hias/Gwent](https://github.com/matt77hias/Gwent) |
| `cards/sm` | art-only textures for the board and hand, one per art variant | same |
| `cards/db` | deck-builder faces (blank parchment, name drawn in the game font) | made from `cards/lg` by `tools/make_deck_faces.py` |
| `ui` | board, notification emblems, gems, score tokens, icons, weather overlays, shields, card backs, end banners | gwent-classic |
| `sfx` | sound effects | gwent-classic |
| `music` | the five Gwent tracks from TW3's taverns and matches ("The Nightingale", "Back on the Path", "Another Round for Everyone", "A Story You Won't Believe", and the unreleased Gwent theme) | cut from a recording of the in-game Gwent music |
| `fonts` | D-DIN Condensed | [Datto D-DIN](https://github.com/amcchord/datto-d-din), SIL Open Font License |

**Changes to the sources**
- Only the assets were taken from those repositories, not their code or additions.
- Several leader cards in the source had their art paired with another leader's name. I checked each one
  against footage of the game's *Choose a Leader* screen and fixed them (`tools/fix_leader_art.py`).
- The card data was checked against the printed card faces.
- The board art is 16:9. On wider screens (most phones) its plain outer wood is mirrored to fill the sides
  (`tools/make_board_sides.py`), so the board reaches both edges of the screen.

**Font.** TW3's interface font is PF DinText Cond Pro, which is commercial and therefore not bundled. If it is
installed on your system the game uses it; otherwise it uses D-DIN Condensed, a free DIN condensed that is very
close.

The assets are the property of CD PROJEKT RED. This is a non-commercial fan project. Don't sell it or put it
behind a paywall.

## Play

- **In a browser, on PC or phone:** https://amilapoorna.github.io/Gwent/
- **Android app:** [gwent.apk](https://github.com/AmilaPoorna/Gwent/releases/latest/download/gwent.apk)

Step-by-step instructions for players are in [HOW_TO_INSTALL_AND_PLAY.md](HOW_TO_INSTALL_AND_PLAY.md).

## Publishing

Every push to `master` runs two GitHub Actions workflows:

- `pages.yml` publishes `www/` on GitHub Pages.
- `android.yml` builds the release APK with Capacitor and publishes it as the latest release (`gwent.apk`). It
  signs the APK with the keystore in the repository secrets `GWENT_KEYSTORE_BASE64` and
  `GWENT_KEYSTORE_PASSWORD` (alias `gwent`). Keep a copy of that keystore: Android only installs an update over
  an existing app when both are signed with the same key.

## Running locally

```sh
npm start                              # serves www/ at http://localhost:8080
npm install && npm run android:build   # debug APK; needs JDK 21 and the Android SDK
```

## Tests

```sh
npm test               # rule scenario tests + several hundred AI-vs-AI games checked for invariants
npm run test:browser   # complete matches played through the UI in Chromium, at desktop and phone sizes
```

`test:browser` needs `npm i --no-save playwright-core`, a Chromium build (`CHROMIUM=/path/to/chromium`) and the
game being served (`npm start`).

## Project layout

```
www/
  index.html            screens and board markup
  css/style.css         styling; the 1920×1080 stage (the size of the board art) is scaled to fit any screen,
                        and on wider screens the board and overlays reach the edges
  js/cards.js           card, leader and faction data, starter decks, deck rules
  js/engine.js          rules engine (pure, cloneable state)
  js/ai.js              computer opponent
  js/ui.js              board, card carousel, input, sound and music
  js/deckbuilder.js     deck builder (auto-saved decks per faction)
  js/main.js            app flow
  assets/               original card art, UI, sound effects, music; bundled font
android/                the Android app (Capacitor), built by .github/workflows/android.yml
.github/workflows/      GitHub Pages and APK builds
tools/                  scripts that produced the derived assets
tests/                  rule tests, self-play and browser playtests
```
