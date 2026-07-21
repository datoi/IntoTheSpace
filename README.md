# Into The Space 🚀

A Galaxy-Attack-style vertical space shooter for iOS/Android, built with **React Native + Expo SDK 54** (no game engine — the whole game is plain React Native views driven by a `requestAnimationFrame` loop).

You pilot a rocket climbing through deep space. Enemies drop into formation at the top of the screen and shoot back; your ship auto-fires. Clear a wave and a bigger, harder one drops in. Your health is **hearts**: you start with 3, every hit costs 1, rare ❤️ pickups restore 1 (max 10). At zero hearts: **💥 ROCKET DOWN**. Score is nice, but the real metric is **altitude** — how high did you fly?

> **Naming note:** the project folder, slug, and bundle ID are still `doomscroll` because the game started life as a "dodge the doomscroll feed" game (see [Development history](#development-history)). The display name in `app.json` is **"Into The Space"**.

---

## Quick start

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (the App Store version supports SDK 54, which this targets).

```bash
npm run ios      # expo start --ios
npm run android  # expo start --android
```

## Deploy (EAS)

```bash
eas init
eas build --platform ios --profile production
eas submit --platform ios --latest
```

Bundle ID in `app.json` is `com.davit.doomscroll` — change to your own before first submit. `eas.json` is already present.

---

## Gameplay overview

### Controls — one finger
- Touch within **80px** of the rocket to grab it (`GRAB_RADIUS` in `GameScreen.tsx`).
- The rocket sticks to your finger (keeping the grab offset) and follows it **anywhere on screen** — full 2D movement, not lane-snapped — via a tight lerp that kills jitter. Clamped to the play area.
- The ship **fires automatically**; there is no fire button.

### The ascent
- **The run starts directly in deep space** — no ground/sky/cloud intro phase (removed 2026-07-15; there is no `skyColor()`, ground strip, or `Cloud` anymore).
- Altitude climbs continuously (120 m/s at start → 300 m/s at full burn, ramping to max by 20,000 m) and drives difficulty, background scroll, and background rotation.
- **Photographic parallax background** (`assets/background/bg{0-3}_*.jpg`, from the "Space Parallax Backgrounds v1" pack): each set is a static base composite behind three layers scrolling vertically at different speeds — far stars 0.2×, nebula 0.5×, near stars 1.0× — driven directly by altitude (`alt × BG_PX_PER_M × speed`), no per-frame state. Layers tile infinitely with **mirrored copies** (`scaleY: -1` on odd tiles) so the loop is seamless even though the art isn't tileable. A black scrim (`BG_DIM`) sits on top so gameplay stays readable.
- **The background advances with the ship tiers — one new environment every 5 waves** (`SHIP_WAVES`), drifting over via a slow smoothstep-eased crossfade of `BG_FADE_S` (25 s), like cruising into a different region of space. State lives on the run (`bgIdx`/`bgFade`/`bgTier` in `GameState`), so it pauses and resumes with the game. 7 sets, ordered **dark → colorful** so every run opens in quiet dark space and the showpiece nebulae arrive as rewards: void_02 dark starfield → SBS purple haze → stellar_03 orange wisps → SBS blue/teal wisps → stellar_01 red nebula → SBS green aurora → stellar_05 pink/blue clouds, then looping.
- The upcoming set is always mounted at near-zero opacity (`0.002`) so its images stay decoded — a cold mount at fade start caused a black flash / layers popping in late while the JPEGs decoded.
- Two set flavors, one render model (`BgSet` in `constants.ts`): the layered-pack sets have a static base + 3 layers at 0.4 alpha and are **not** tileable (mirror-tiled); the SBS sets are genuinely **seamless 512px tiles** (plain repeat, no base — the nebula tile itself is the slowest opaque layer, with two shared opaque-black starfield tiles composited at partial alpha above it).
- (Planet decor and the ☄️ debris-storm hazards were removed 2026-07-15 — the parallax backgrounds carry the scenery alone; `assets/planets/` deleted.)

### Waves (the core loop)
- Enemies (cartoon alien monsters from the "2D Space Shooter 3.0 Free" pack) stream in from above and **hold in a centered formation** near the top until you destroy them all; then after a 1.1 s gap the next wave drops in.
- **Enemy art changes every 5 waves** (`SHIP_WAVES` / `ENEMY_SHIPS` / `shipForWave()` in `constants.ts`): `enemy1.png` (red demon) → `enemy2` (green squid) → `enemy3` (beetle) → `enemy4` (teal octopus) → `enemy5`/`enemy6` (recolors) for 21+. Each enemy stores its `shipIdx` when spawned, so a wave's ships keep their look even after the next wave starts.
- **Bosses**: every 5th wave is a boss wave instead of a formation — waves 5, 15, 25… bring a **mini boss** (`boss_mini.png`, ~104 px, HP `22 + wave×2`, worth 100 pts), waves 10, 20, 30… a **giant boss** (`boss_giant.png`, ~168 px, HP `50 + wave×3`, worth 250 pts). Bosses descend to the formation line, **sway side to side** across the screen (`BOSS_SWAY_*`), and **shoot an aimed fan** on top of the normal fire cadence (mini 2 shots, giant 3, slightly bigger bullets). They survive player contact (contact costs you a heart; the 0.3 s hit-flash doubles as invulnerability so overlap doesn't drain hearts per frame), never charge, and their kill triggers a big double burst + shake. Implementation: `boss`/`w` fields on `Card`; boss waves spawn in `spawnWave()`.
- **Every ship tier fires its own laser-shot sprite** (`LASERSHOTS` / `laserShotForShip()` in `constants.ts`): there are 6 tiers and 5 shots, so the shots cycle (`shipIdx % 5`). alien1 (waves 1–5) fires a fire comet, alien2 a lightning bolt, alien3 a purple energy blade, alien4 a warm orange orb, alien5 a cyan starburst, and alien6 (waves 26+) reuses the fire comet. Each `EnemyBullet` carries the shooter's `shipIdx`; sprite bullets are drawn at the source art's aspect ratio and rotated to face their direction of travel every frame (`Math.atan2(vy, vx)`), so zigzag/homing shots visibly bank as they curve.
- Wave *n* has `3 + (n-1)` enemies (capped at 12) with `2 + floor(n × 0.6)` HP each — multi-hit enemies show an HP bar.
- **Enemies shoot back**, aimed at your current position. Fire rate and volley size scale with the wave (every hit always costs exactly 1 heart). Each wave's bullets get a distinct color (8-color cycle).
- **Wave-escalating attack patterns** (thresholds in `constants.ts`):
  | Wave | New threat |
  |---|---|
  | 5+ | Shots weave in a smooth **zigzag** |
  | 15+ | Enemies fire slow **homing rockets** that track you, then dislock at 120 px and fly straight (dodgeable at the last moment) |
  | 20+ | Wounded enemies (≤2 HP) break formation and **charge** the player |

### Weapons
Default gun is a single shooter. Every ~14 s a 🎁 gift falls; collecting it grants a random gun for **16 s**:

| Gun | Behavior |
|---|---|
| 🔫 Double fire | Two parallel shots |
| 💣 Bombs | 6 dmg direct hit, slower fire rate — and the hit **explodes**: enemies within 95 px of the impact take 3 splash dmg (half of direct; `BOMB_SPLASH_*` in `constants.ts`) |
| 🔵 Laser | 4 dmg beam, fires fast-moving 60 px beams that **pierce** through everything they sweep |
| 🚀 Homing | 6 dmg rockets that lock onto the nearest hazard and never miss |

Re-collecting the **same** gun stacks it (`gunLevel` up to ×4 → more parallel shots); a different gun replaces it and resets the stack.

Player shots render with the pack's projectile art (`assets/bullets/shot_*.png`): normal/double fire a green **missile** sprite, homing fires a recolored missile, bombs fly as the **"S" crate**; the laser stays a drawn blue beam (no sprite fits a beam).

### Health — hearts
- Start with **3 hearts** (`HEARTS_START`), max **10** (`HEARTS_MAX`). No passive drain — you only lose hearts to hits.
- **Every hit costs exactly 1 heart**: enemy bullet, enemy-ship collision, or ad-popup collision.
- ❤️ heart pickups fall rarely (every ~26 s, `HEART_EVERY`) and restore 1 heart — a real prize, not a constant stream.
- The HUD shows your hearts as a row of ❤️.
- Any hit resets your combo and triggers screen shake + red vignette flash + error haptic + buzz sound.

### Other hazards & pickups
- **Ad popups** — tanky fake popup windows (drawn as a mini window with a title bar and ✕ button, no image asset). Worth more points to destroy (16 vs 10).
- **Near-miss bonus** — squeezing past a hazard with a horizontal gap < 26 px awards "CLOSE ONE +5".

### Scoring
- Kill enemy +10, kill ad +16, heart pickup +10 × combo (combo caps at ×5), near miss +5, survival trickle +2/s.
- Heart pickups also raise the combo and play one of **5 pre-pitched pop samples** — the pitch literally rises with your combo.

### Meta-progression
- Each ❤️ collected banks **1 🪙 coin** permanently (persisted across runs) — coins are scarcer now that hearts are rare.
- Coins buy **5 spaceship avatars** in the shop (`assets/avatars/pship1–5.png`, from the 2D Space Shooter pack — Ship_1/Ship_2 color variants): Ironclad (free/default), Specter (60), Raptor (150), Nova (300), Valkyrie (500). Ids/prices unchanged across art swaps so existing unlocks keep working.
- Image avatars fly as-is (the ship art). Each `AvatarDef` still carries an `emoji` fallback (🚀) that rides a little drawn rocket with a nose cone and flickering 🔥 flame — only shown if an avatar has no `image`, which currently none do.
- **Best altitude** is the persistent high score.

### Pause / resume — full run persistence
- Pause button, or backgrounding/closing the app, **snapshots the entire run state to AsyncStorage**.
- Relaunching the app restores the run, opening on the pause screen. `GameState` is deliberately fully serializable (plain arrays/objects) to make this work.
- Resumed saves are merged onto a fresh state so runs saved by an older build (missing newer fields) don't crash.
- Pause menu: Continue / New Game / Return to Home.

---

## Architecture

```
index.js                     Expo entry — registers App
App.tsx                      Phase state machine (menu/playing/gameover/shop),
                             save + paused-run persistence, avatar selection
app.json                     Expo config ("Into The Space", com.davit.doomscroll)
eas.json                     EAS build profiles
src/
  game/
    constants.ts             ALL tuning lives here (speeds, damage, wave
                             thresholds, scoring, palette, avatar list)
    types.ts                 Every game entity type + the serializable GameState
    storage.ts               AsyncStorage: SaveData (best/coins/avatars) and
                             in-progress run snapshot (separate keys)
    sounds.ts                expo-audio soundboard; one player per effect;
                             5 pre-pitched combo pops; plays in silent mode
  screens/
    GameScreen.tsx            ~90% of the game: the rAF game loop, spawning,
                             waves, enemy AI, bullets, collisions, particles,
                             rendering, pause overlay, PanResponder input
    Screens.tsx              Menu, Game Over, and Shop screens (pure UI)
  components/
    Obstacle.tsx             Enemy ship / ad popup / pickup renderer + HP bar
    Effects.tsx              Clouds, debris, particles, floating text, HUD
assets/
  avatars/pship1-5.png       Playable spaceship avatars (2D Space Shooter pack)
  obstacles/enemy1-6.png     Enemy monster sprites, one per 5-wave tier
  obstacles/boss_mini.png    Mini boss (waves 5, 15, 25, ...)
  obstacles/boss_giant.png   Giant boss (waves 10, 20, 30, ...)
  bullets/lasershot1-5.png   Enemy bullet sprites, one per 5-wave tier
  bullets/shot_*.png         Player shot sprites (normal/homing missiles, bomb crate)
  background/bg{0-3}_*.jpg   4 parallax background sets (base/far/mid/near each)
  background/sbs_*.png       SBS seamless tiles: 3 nebulae + 2 shared starfields
  sounds/*.wav               pop1–5, buzz, ding, whoosh, gameover
```

### How the game loop works
- All run state lives in **one mutable object** (`GameState`) held in a `useRef` — never in React state. The loop mutates it in place each frame, then calls `setFrame(f => f + 1)` to force a re-render. `dt` is clamped to 50 ms so a stall never teleports things.
- Because entities are mutated in place, **`ObstacleView` is deliberately not memoized** — a prop-equality check would always see the same object and freeze sprites at their spawn position (comment in `Obstacle.tsx`).
- Collisions are simple AABB / circle checks; hitboxes are **smaller than the visuals** on purpose (forgiving: 36 px hitbox under a 50 px sprite).
- Some field names are relics of the doomscroll era: `cards` = enemies+pickups, `moments`/`likes` = hearts collected/coins, `rage`/`ad` = the two hazard kinds. **They persist in save data, so don't rename casually.** (`sanity` and `bells` were finally removed in the 2026-07-15 hearts rework, with a run-key bump to v3.)

### Persistence keys (`storage.ts`)
- `doomscroll:save:v1` — `SaveData { best, likes, unlocked, selectedAvatar }` (best = highest altitude; likes = coin balance).
- `doomscroll:run:v2` — the snapshotted `GameState`. Bumped to v2 when the game became wave-based so stale falling-obstacle runs are ignored.

### Game feel ("juice") inventory
Particle bursts on every event, screen shake, red hit-flash vignette, floating score text, haptics (selection on grab, light/medium on pickups, error on hits), pitch-rising combo pops, gun-label popups, wave banners, per-wave bullet colors, rocket tilt while dragging, animated engine flame.

---

## Tuning cheat sheet

Everything numeric lives in `src/game/constants.ts`. The most commonly-touched knobs:

| What | Constants |
|---|---|
| Difficulty ramp | `RAMP_ALT`, `BASE_SPEED`/`MAX_SPEED`, `RAMP_SECONDS` |
| Wave size / toughness | `WAVE_BASE_ENEMIES`, `WAVE_MAX_ENEMIES`, HP formula in `makeEnemy()` |
| Enemy aggression | `ENEMY_FIRE_EVERY`, `ENEMY_BULLET_SPEED/DMG`, `ZIGZAG_WAVE`, `BIG_BULLET_WAVE`, `HOMING_WAVE`, `CHARGE_WAVE` |
| Player survivability | `HEARTS_START`, `HEARTS_MAX`, `HEART_EVERY` |
| Guns | `*_FIRE_RATE`, `*_DMG`, `GUN_TIME`, `GIFT_EVERY` |
| Background | `BG_PX_PER_M` (scroll rate), `BG_DIM` (scrim), `BG_FADE_S` (crossfade length), `BG_SETS` (which sets, in order; advances every `SHIP_WAVES` waves) |
| Economy | `MOMENT_POINTS`, `KILL_*_POINTS`, avatar `price`s in `AVATARS` |

---

## Development history

A log of how the game got here, so future sessions can see what was done and why.

### v1 — "Doomscroll" (original concept)
- Endless runner: you're trapped in an infinite social feed. Tap left/right or swipe to **dodge** falling rage-bait posts, sponsored ads, and notification storms; catch "real moments" to restore **sanity**.
- Lane-based movement, no shooting. Death screen said "BRAIN FRIED".
- Sanity meter instead of one-hit death; near-miss engine ("dodge into an adjacent lane within 0.4 s"); likes-based avatar shop.

### v2 — the pivot to "Into The Space"
Rebuilt on the same skeleton (which is why the internal names survived):
- **Theme**: infinite feed → rocket ascent. Distance is now altitude in meters; the background transitions ground → sky → space; solar-system planets drift by as decor; birds/meteors became space debris storms.
- **Movement**: lane tapping → free 2D finger-drag with grab offset and lerp smoothing.
- **Combat added**: auto-fire, 4 gift guns with stacking levels, bullet/laser/bomb/homing projectile types.
- **Wave system** (Galaxy Attack style): enemies stopped being falling obstacles and now descend into a held formation, per-wave HP scaling with HP bars, clear-to-advance.
- **Enemy return fire** with wave-escalating patterns (zigzag @5, big bullets @10, homing rockets with dislock @15, charging wounded enemies @20) and per-wave bullet colors.
- **Sanity reflavored as fuel/hull**: passive drain, ⛽ pickups heal, likes → 🪙 coins.
- **Run persistence**: pause / background / close snapshots the full run to AsyncStorage and resumes it on next launch (run key bumped to v2 to discard old-format runs).
- **Art**: enemy alien sprite, jet player avatar (image avatars replace the drawn rocket), planet images; best score changed from points to altitude.
- Leftover/unused bits kept around: `assets/obstacles/rocket1.png` and `balistic.png`, `SUN_FROM` constant, the near-miss code path (still active but rarer now that hazards hold formation), `NEAR_MISS_WINDOW` (defined, effectively unused — near-miss is gap-based now).

### Post-v2 tweaks (2026-07-10 – 2026-07-13)
- Enemy bullet base damage reduced 10 → 7 (`ENEMY_BULLET_DMG`); the +1/wave scaling is unchanged.
- Removed the wave-10+ **bullet-size doubling** (deleted `BIG_BULLET_WAVE`); enemy bullets now stay a constant size at all waves. Also shrank the laser-shot sprite scale (3.4× → 2.4× the base diameter).
- **Beefed up the default jet shot**: the plain 5×14 yellow `bullet` rectangle became a layered fiery plasma bolt (`bulletWrap`/`bulletGlow`/`bulletCore`/`bulletTip` in `GameScreen.tsx`) — a hot white-cored bolt inside an orange glow with a bright tip. Purely visual; damage/fire-rate unchanged.
- **Procedural space background upgrade** *(superseded the same week — see next entry)*: briefly replaced the flat starfield with a denser procedural one (150 tinted/haloed stars + 5 ellipse-stack nebula clouds). User didn't like the look; fully removed again (no `Star`/`NebulaBlob` types, no `stars`/`nebula` state).
- **Photographic parallax background** (replaces all procedural stars/nebulae): user supplied the "Space Parallax Backgrounds v1" pack (4 themes × 5 variants × base+3 layers, 1920×1080 landscape, layers opaque — the pack composites L1/L2/L3 at 0.4 alpha over the flat base, speeds 0.2/0.5/1.0). Picked **stellar_01** (most natural astrophoto look; toxic/vapor are stylized, void is near-black). Processing: rotated 90° to portrait, downscaled to 720×1280, saved as JPEG q85 (~660 KB total) in `assets/background/`. In-game: static base + 3 layers scrolled by `alt × BG_PX_PER_M × speed` with mirror-tiling for seamless infinite vertical scroll, faded in via `starAlpha`, dark scrim `BG_DIM` (0.42) on top for readability. Old-save compat: removed state fields are simply ignored on resume-merge. Tuning knobs: `BG_PX_PER_M` (scroll rate), `BG_DIM` (darkness), swap the set by re-running the processing script on a different variant.
- **Start directly in space + rotating backgrounds**: removed the whole ground→sky→space intro (ground strip, `skyColor()` lerp, clouds — `Cloud` type, `CloudView`, `clouds`/`cloudTimer` state all deleted; `CLOUD_TOP`/`STARS_FROM`/`STARS_FULL`/`SUN_FROM`/`SPACE_FROM` constants dropped, debris storms and planets now active from wave 1). Backgrounds expanded from one set to four (`BG_SETS`: stellar_01, void_02, stellar_03, stellar_05 — 16 JPEGs, ~2.9 MB): the game cycles through them by altitude, one set per `BG_CYCLE_M` (9,000 m), crossfading the next set in over the last `BG_FADE_M` (1,800 m) of each cycle via a second parallax stack rendered at increasing opacity (`renderBgSet()` in `GameScreen.tsx`).
- **SBS seamless sets added to the rotation** (user supplied "SBS - Seamless Space Backgrounds - Small 512x512": blue/green/purple nebula tiles ×8 + starfields ×8, all genuinely seamless 512×512, all opaque). `BgSet` refactored: per-layer `alpha`, per-set `aspect`, `mirror` flag, optional `base`. Three new sets (sbs_blue = Blue_Nebula_03, sbs_purple = Purple_Nebula_01, sbs_green = Green_Nebula_08; copied unmodified) tile plainly with the nebula as the slowest opaque layer plus two shared starfield tiles (Starfield_06 mid @0.5 alpha, Starfield_03 near @0.65) — rotation is now 7 sets, layered-pack and SBS interleaved for contrast. More variants in both packs remain unused if more variety is ever wanted.
- **Background pacing/transition fixes** (user feedback: sets changed too fast; crossfades black-flashed and layers popped in late; wanted runs to open dark with the shiny sets arriving later): `BG_CYCLE_M` 9,000 → 18,000 m, `BG_FADE_M` 1,800 → 2,500 m; incoming set pre-mounted invisibly from mid-cycle (`BG_PREMOUNT`) to fix the decode hitch; `BG_SETS` reordered dark → colorful starting with void_02.
- **Hearts rework + cleanup (2026-07-15)**: (1) *Planets removed* — `assets/planets/` deleted, `Deco` type, `decos`/`decoTimer`/`planetSeq` state, and the `PLANETS` spawn/render all gone. (2) *Fuel → hearts* — no bar, no passive drain; `hearts` starts at `HEARTS_START` (3), caps at `HEARTS_MAX` (10); **every** hit (bullet/ship/ad, regardless of wave) costs exactly 1 heart; ⛽ fuel drops (every ~5 s, +34 fuel) became rare ❤️ drops (`HEART_EVERY` = 26 s, +1 heart, still +1 coin & combo); HUD bar → ❤️ row; run storage key bumped to v3 (old fuel-based snapshots discarded); removed `SANITY_*`, `HIT_RAGE/AD/BELL`, `HEAL_MOMENT`, `FUEL_EVERY`, `ENEMY_BULLET_DMG` (+ `EnemyBullet.dmg`), palette `sanity*` colors. (3) *Debris/meteor hazards removed* — `Bell` type, `bells`, `stormTimer`, `STORM_EVERY`, `SPACE_HAZARDS`, `BellView` all deleted. (4) *Bomb rework* — direct hit 4 → 6 dmg (`BOMB_DMG`) and the impact now explodes: hazards within `BOMB_SPLASH_RADIUS` (95 px) take `BOMB_SPLASH_DMG` (3, half of direct) via the shared `damage()` helper (refactored to take a number instead of a Bullet), with an extra burst + small shake on detonation.
- **2D Space Shooter pack integration + bosses (2026-07-15)** (user supplied "2D_Space_Shooter_3.0_Free_1.3": 12 enemy monsters, 10 player ships, 2 bosses, 5 missiles, 15 pickup crates; Base/NoLight × Large/Medium/Small; all real alpha): enemies alien1–6 → pack monsters `enemy1–6.png` (Small/128px; tiers unchanged); avatars → pack ships `pship1–5.png` (Medium/256px; same ids/prices so unlocks survive); player shots → pack projectiles (`shot_normal`/`shot_homing` missiles, `shot_bomb` "S" crate; laser keeps the drawn beam; replaced the drawn plasma bolt, orange bomb circle, and 🚀 emoji + their styles). **Bosses**: wave%10==0 giant, else wave%5==0 mini (`spawnWave()`), `boss`/`w` on `Card`, sway movement, aimed fan fire (mini 2 / giant 3) atop normal cadence, contact-survival with hit-flash i-frames, boss-scaled points/HP/size (`BOSS_*` constants). Old `alien1–6`, `rocket1`, `balistic`, `ship1–5`, `jet` assets deleted.
- **Shooting/background polish**: bullets now spawn slightly *inside* the ship (`avatarY − 12`) — the ship renders on top of bullets, so shots stay hidden under the hull and visibly emerge from the nose regardless of sprite padding/letterboxing. (First attempt spawned at a computed "visual nose" offset, which was wrong because `resizeMode="contain"` letterboxing + transparent sprite padding shift the drawn nose; don't compute nose offsets from sprite math — overlap and let draw order hide it.) Background tiles draw 1px taller than their pitch (float rounding opened hairline seams) and all background images set `fadeDuration={0}` (Android's default 300 ms image fade-in read as a blink whenever a fresh tile mounted mid-scroll or at set swaps).
- **Background rotation re-keyed from altitude to waves** (user: change every 5 waves, slowly, "as if we are slowly going to different place in space"): altitude cycling (`BG_CYCLE_M`/`BG_FADE_M`/`BG_PREMOUNT`) replaced by a time-animated crossfade that starts when the 5-wave ship tier advances — `bgIdx`/`bgFade`/`bgTier` on `GameState` (serializable → survives pause/resume; old saves default to set 0 and, if resumed mid-run at a higher wave, catch up one fade), smoothstep easing over `BG_FADE_S` = 25 s, upcoming set permanently warm at alpha 0.002.
- **New avatar roster**: replaced the old jet + 6 emoji avatars with 5 spaceship images (`ship1–5.png` in `assets/avatars/`): Ironclad (free), Specter, Raptor, Nova, Valkyrie. Sources were 1024px JPGs on white / checkerboard backgrounds; processed with `AvatarProcessor` (border flood-fill of low-chroma bright pixels → transparent, keep largest blob, trim, downscale to ≤256px), and ship1/ship2 (which were drawn nose-right) were rotated 90° CCW to point up. `DEFAULT_SAVE` default avatar changed `happy` → `ironclad`; returning saves with a now-missing `selectedAvatar` fall back to `AVATARS[0]` (ironclad) via the existing `?? AVATARS[0]` guard, so no save wipe is needed. Avatar render boxes (`jetImg`, `menuAvatarImg`, `shopEmojiImg`) were reshaped landscape → portrait to fit the taller ships. `jet.png` is left in place but unused.
- **Enemy ship tiers**: added `alien2.png`–`alien6.png` and a new-design-every-5-waves system (`SHIP_WAVES`, `ENEMY_SHIPS`, `shipForWave()` in `constants.ts`; `shipIdx` on `Card`). The source images were 2K AI renders with solid black backgrounds; they were processed (edge-connected flood fill to remove the background, star specks dropped, trimmed, downscaled to ≤192px) before being added to `assets/obstacles/`.
- **Per-tier laser shots**: added `lasershot1.png`–`lasershot5.png` and gave every ship tier its own sprite bullet, cycling the 5 shots across the 6 tiers (`laserShotForShip` = `shipIdx % 5`). (First pass mistakenly left alien1 / waves 1–5 firing the plain dot, so the whole early game still looked like simple bullets — fixed so all tiers fire a sprite.) Source images looked transparent but were actually fully opaque with a baked-in two-tone gray checkerboard standing in for transparency (plus a small watermark sparkle) — processed by flood-filling the checker pattern (neutral color, brightness ~25–115) from the border, keeping only the largest surviving connected blob (drops the watermark and stray dust motes), then trimmed and downscaled to ≤140px. Wired up via `LASERSHOTS`/`LASERSHOT_ASPECT`/`laserShotForShip()` in `constants.ts` and `shipIdx` on `EnemyBullet`; rendered rotated to face the bullet's live direction of travel.

### Known quirks / gotchas for future work
- **Legacy naming** (`sanity`, `cards`, `rage`, `moments`, `likes`, `bells`, storage key `doomscroll:*`) — renaming breaks saved data and touches many files; do it deliberately or not at all.
- `ObstacleView` must stay un-memoized (in-place mutation, see comment in the file).
- Resume-safety: any **new field added to `GameState`** must have a default in `fresh()` — resumed runs are merged over `fresh()` precisely so old snapshots don't crash.
- `HIT_BELL` damage (14) applies to space debris; debris only spawns above 6,000 m.
- The `emoji` field on rage cards is empty — enemies render the alien PNG, not an emoji.
- No tests, no linter config, not a git repository (as of 2026-07-10).

---

## Tech stack

| | |
|---|---|
| Framework | React Native 0.81 / React 19, Expo SDK 54 |
| Language | TypeScript 5.9 (strict-ish, no linter configured) |
| Audio | `expo-audio` |
| Haptics | `expo-haptics` |
| Persistence | `@react-native-async-storage/async-storage` |
| Rendering | Plain RN `View`/`Text`/`Image` — no canvas, no Skia, no game engine |
| Build/deploy | EAS (`eas.json`) |
#   I n t o T h e S p a c e  
 