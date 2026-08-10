# Performance & Game-Feel Audit — Into The Space

Scope: thermal load ("phone gets hot") and frame hitches ("lags when graphics
load"), plus a game-feel pass. Read of `src/screens/GameScreen.tsx`,
`src/components/*`, `src/game/*`, `assets/`, `app.json`.

**Context first, because it changes how you should read the rest:** this codebase
has already had a serious performance pass. The simulation runs in refs, the
parallax scrolls through `Animated.Value.setValue()` with no React involvement,
particles are pooled, Nova and the bomb flash are native-driven, there is a
working adaptive quality governor, and effect budgets are throttled three ways.
The cheap wins are gone. What follows is what's left, and two of the items are
real bugs rather than tuning.

---

## The three that matter

| # | Finding | Effect | Confidence |
|---|---------|--------|-----------|
| 1 | Frame gate quantizes to **45 fps on 90 Hz panels** | Game runs 25% slower than intended on the most common mid-range Android config | Confirmed by simulation |
| 2 | Whole React tree re-renders every frame | The sustained JS load that heats the phone | Confirmed by reading; needs device profile to size |
| 3 | 6 MB of duplicate art ships in the binary | Download size only, but free to fix | Confirmed |

---

# Part 1 — Thermal (sustained load)

## 1.1 The frame gate lands on 45 fps on 90 Hz displays — BUG

`src/screens/GameScreen.tsx:327`

```ts
const FRAME_MIN_MS = 1000 / 70;   // 14.29 ms
```

and `GameScreen.tsx:739`:

```ts
if (now - last < FRAME_MIN_MS) return;
```

The intent (per the comment) is "throttle 90/120 Hz panels back toward ~60 fps."
It does that on 120 Hz. It does not on 90 Hz. Simulated against real vsync
intervals:

| Panel | vsync | Accepted interval | Effective |
|-------|-------|-------------------|-----------|
| 60 Hz | 16.67 ms | every vsync | **60 fps** ✅ |
| 90 Hz | 11.11 ms | every 2nd (22.2 ms) | **45 fps** ❌ |
| 120 Hz | 8.33 ms | every 2nd (16.7 ms) | **60 fps** ✅ |
| 144 Hz | 6.94 ms | every 3rd (20.8 ms) | **48 fps** ❌ |

On 90 Hz, 11.11 ms < 14.29 ms so every other vsync is rejected, and the game
simulates at 45 fps. 90 Hz is the single most common refresh rate in the Android
mid-range — likely the phone you're testing on. A twitch bullet-hell at 45 fps
reads as sluggish input and mushy dodging, which may be a chunk of the "lag" you
are feeling independent of any actual hitch.

**Root cause:** thresholding on elapsed time can only ever accept an integer
number of vsyncs, so the achievable rates on a 90 Hz panel are 90, 45, 30 — never
60. No choice of `FRAME_MIN_MS` fixes this.

**Recommended fix, in order of quality:**

1. **Ask the OS for a 60 Hz display mode on Android.** This is the correct answer
   and it fixes feel *and* thermals together: the panel itself drops to 60 Hz,
   which cuts display power and compositor work on top of giving you a true,
   even 60 fps. Needs `Surface.setFrameRate()` / `preferredDisplayModeId` via a
   small Expo config plugin — the only item in this report that needs native code.
2. If you don't want native code: make the divisor **explicit and deliberate**
   rather than an accident of a time threshold. Measure the vsync period over the
   first ~30 frames, derive `stride`, and accept every *n*-th vsync by counting.
   You still can't get 60 on a 90 Hz panel — you're choosing between 45 (cooler,
   smooth, slower) and 90 (hot) — but at least the choice becomes visible and
   testable instead of emergent.

Either way, **decouple the simulation from the render rate** with a fixed
timestep accumulator so that whatever the panel does, physics and fire rates stay
identical. Right now `dt` varies with the panel, which means fire rate, bullet
travel and difficulty pacing are subtly different on a 90 Hz phone than a 60 Hz
one.

## 1.2 The whole component tree re-renders 60×/second

`GameScreen.tsx:780` — `setFrame((f) => f + 1);`

This is the architecture's central cost and the main sustained heat source. Every
frame, React re-executes GameScreen's render body and rebuilds elements plus
**fresh inline style objects** for:

- every player bullet (`:2320`) — 6 branches, each allocating a style + transform array
- every enemy bullet (`:2454`) — plus `Math.atan2`/`Math.hypot` per bullet at render time
- every card (`:2543`) → `ObstacleView`, deliberately unmemoized (`Obstacle.tsx:238`)
- all 40 particle slots (`ParticleLayer.tsx:42`), live or not
- every float (`:2659`)
- the HUD

Each new style object is a new props object that Fabric must diff against the
previous shadow node. With a full board that is a few hundred prop diffs and a
tree commit, every frame, on the JS thread. Sustained ~100% JS-thread occupancy is
exactly what heats a phone — far more than GPU fill in this game's case.

To be fair to the existing code: the comments show this was a considered
trade-off, and folding the particle field into the parent render was the right
call given the parent renders anyway. The issue is the premise — that the parent
*must* render every frame.

**What I'd actually recommend, honestly:**

- **Short term (cheap, safe):** hoist the per-entity style construction out of the
  render. Precompute the static half of each style once (`position/left/top/width/
  height/borderRadius`) and only build the `transform` array per frame. This cuts
  allocation and gives Fabric far fewer changed keys to walk. Same for the
  `transform` array on the shake layer (`:2289`), which is rebuilt every frame even
  when `shake` is 0.
- **Short term:** memoize `HUD`. It is the only unmemoized component in
  `Effects.tsx` (`:73` — `WaveHeader`, `BossBar`, `HealthBar`, `SpecialButton` are
  all `React.memo`), it is text-heavy, and it re-runs a `filter().sort()` on
  every frame (`Effects.tsx:93`). Its props are primitives except `boons`. Since
  the loop mutates `boons` in place, memoizing needs a cheap derived key — a
  packed bitmask of active boons plus their ceil'd seconds would do it, and that's
  much cheaper than the sort it replaces.
- **Structural (the real answer, larger job):** a bullet-hell drawing hundreds of
  moving quads is not a good fit for RN's view tree at all. `@shopify/react-native-skia`
  draws the entire play field into one GPU canvas — one view, no shadow tree, no
  per-entity prop diffing, and it can run the draw off the JS thread. That is the
  change that would take your thermals from "manageable" to "not a problem."
  It's a significant rewrite of the render layer only (the sim in refs stays as-is,
  which is exactly why it's feasible) and it adds ~3–4 MB to the bundle. I'd
  scope it as a separate project, not a fix in this pass — but it is where this
  game ends up if entity counts keep growing.

## 1.3 Haptics are unthrottled on graze

`GameScreen.tsx:1877`

```ts
playGraze(multiplierFor(s.chain));
Haptics.selectionAsync().catch(() => {});
```

The graze latches per bullet (`b.grazed`), so this is not per-frame — but a dense
scattergun/spinner pattern produces dozens of grazes within a second, and the
design *deliberately encourages flying into them*. Note the asymmetry: the sound
is throttled to 110 ms (`sounds.ts:78`), the haptic is not.

Two costs:

- **Power/heat.** Every call is a JSI hop plus a vibrator actuation. The motor is
  a meaningful current draw and it's being driven near-continuously during the
  exact moments the CPU is also busiest.
- **Feel — the bigger problem.** When the motor is already buzzing continuously
  from grazes, the haptics that carry real information (taking a hit at
  `:966`/`:2205`, a boss phase at `:1183`) are physically imperceptible. You have
  spent your haptic bandwidth on the least important event.

**Fix:** give haptics the same throttle the audio has, and add a priority rule so
a damage/boss haptic always pre-empts and cancels an ambient graze tick. A simple
"one haptic per 120 ms, highest priority wins" budget would sharpen every
important hit in the game.

## 1.4 Background compositing — already well handled, one note

The parallax is genuinely well built: mounted once, scrolled natively, tiles
opaque with group-level alpha, clipped so off-screen tiles are culled, and the
`BG_DIM` scrim baked into the art instead of drawn per frame. All correct.

One dead lever: `QUALITY_TIERS[].bgLayers` (`constants.ts:315-317`) binds on
nothing, because every set ships exactly one layer — the code comments already
say so. So the governor's background LOD only really drops the planet field.
That's fine, but it means **tier 2 has less headroom than it looks like it has**.
If you need more, the planet field (`Parallax.tsx:61`, 7 mounted `Image`s) and
the full-screen `base` layer are the remaining candidates.

---

# Part 2 — Hitches ("lags when graphics load")

I could not fully disambiguate your report from code alone, so here are the
candidates ranked, and how to tell them apart in one run.

## 2.1 Ruled out: the run's background is cold on entry

I expected this and it's **not** the problem. `App.tsx:323` mounts
`AmbientParallax` with the same `selectedBackground.set` that `App.tsx:344` passes
to `GameScreen`, so the chosen sky is already decoded while you sit on the menu.

## 2.2 Likely: switching backgrounds in the shop

`App.tsx:323` keys `AmbientParallax` on `selectedBackground.id`. Changing
background **remounts the whole subtree**, forcing a cold decode of a new set's
base JPEG (720×1280 → 3.5 MB decoded), its wisp PNG, and 3 planet PNGs. That's a
visible stall at exactly the moment the player is browsing, and it repeats on
every selection change. Worth confirming — this matches "lag when graphics load"
better than anything in the run loop does.

## 2.3 Likely: the boot gate decodes ~104 images simultaneously

`LoadingScreen.tsx:51` mounts every entry of `PRELOAD_SPRITES` at once:
5 avatars + 14 enemy ships + 2 bosses + 3 gun shots + 5 avatar shots + 5 enemy
shots + 60 explosion frames + 10 boss-scale explosion frames ≈ **104 concurrent
decodes**. The download pass is politely batched at `PRELOAD_BATCH = 4`
(`constants.ts:1005`), but the decode pass has no such limit — it's one giant
mount. On a low-end device that's a memory spike and a long unresponsive stretch.
Batching the decode the way the download is batched would smooth it out.

## 2.4 Possible: wave spawn mount cost

`spawnWave` pushes up to `WAVE_MAX_ENEMIES = 12` cards in one frame, each mounting
an `ObstacleView` with an `Image`, glow, glow ring and optional aura/HP bar — call
it 4–6 native views each, so ~60 view creations on a single frame, landing exactly
when the previous wave's death effects are still burning. Boss payouts are
correctly staggered already (`COIN_DROP_RELEASE = 3` per `COIN_DROP_EVERY = 0.05 s`,
`constants.ts:1060`), which is the right pattern — consider applying the same
stagger to formation spawn (2–3 enemies per frame across a few frames). It would
also look better: a formation that assembles reads more deliberate than one that
pops.

## 2.5 How to tell which one it is — you already have the instrument

`constants.ts:348` — `export const PERF_OVERLAY = false;`

Flip it to `true` and run a **release** build (the comment correctly notes a dev
build would blame the wrong thing). `PerfOverlay` already reports `frameMs`,
`simMs`, `renderMs` and live entity counts. That single run tells you whether
your hitches are sim, React commit, or native/GPU — and whether `renderMs`
dominates, which would confirm §1.2 as the thermal driver. Please do this before
acting on §1.2; it's the difference between tuning and guessing.

---

# Part 3 — Game feel

## 3.1 Your primary action has a placeholder sound — highest-value feel fix

`sounds.ts:101`

```ts
// Uses `whoosh` at a low volume as a placeholder — the pack has no dedicated
// shot sample...
play('whoosh', 0.1 + Math.random() * 0.05);
```

Shooting is the thing the player does more than everything else combined, and it
is currently a borrowed sample at volume 0.1 — effectively inaudible. The code
already knows this. In an arcade shooter the gun sound *is* the game's texture;
a short, dry, punchy sample here would do more for perceived quality than any
other single change in this report, and it costs one asset. Layer a slightly
different sample per gun kind (bomb/laser/homing already differ visually but not
audibly) and the weapon variety starts to *feel* like variety.

The volume jitter to avoid fatigue (`:106`) is a nice touch — keep that.

## 3.2 Camera shake pulls a bare strip in at the screen edge — known, still open

`constants.ts:407` — `SHAKE_MAX_PX = 0`, documented as disabled pending diagnosis
of a device-only black screen. So on every hard hit the play field translates up
to ±7 px (`GameScreen.tsx:2262`) while the sky is exactly screen-sized, exposing a
strip of `PALETTE.void` along one edge.

You're carrying a known cosmetic regression to dodge a bug you couldn't
reproduce. I'd suggest sidestepping it entirely rather than re-testing the
inflation: **take the background out of the shake layer.** Shake the entities,
HUD and effects; leave the sky still.

- The punch of a screen shake comes from the *foreground* moving against a stable
  reference. Shaking the distant backdrop too actually reduces the sense of impact,
  because nothing stays fixed for the eye to measure motion against.
- It removes the need for `SHAKE_MAX_PX` at all — no inflation, no seam, no
  black-screen risk to diagnose.
- It's a small perf win: the largest views in the tree stop being re-composited
  under a changing transform during every hit.

Cheaper, better-looking, and it closes an open bug.

## 3.3 Haptic priority

Covered in §1.3 — it's a feel issue as much as a thermal one. Currently a coin
pickup (`:1657`), a heart (`:1649`) and a graze (`:1877`) all fire haptics of
similar weight to a shield save (`:948`). Rank them; spend the motor on the
events that change the player's decisions.

## 3.4 Things that are genuinely well designed — don't change these

Noting these so a future pass doesn't "optimize" them away:

- **The graze system** (`:1866`). Paying score, energy *and* a chain refresh for
  near-misses makes flying toward dense patterns correct rather than suicidal.
  That's what turns the bullet-hell archetypes into something desirable. Good design.
- **Hit-stop values** (`constants.ts:1146-1150`). 0.03 s (~2 frames) base with a
  0.1 s ceiling and a re-trigger guard is well judged — enough to register, not
  enough to stutter, and the guard correctly stops a Nova from playing as a series
  of freezes.
- **Forgiving hitboxes.** `OB_HIT = 36` against a larger visual, and the enemy
  hitbox smaller than the sprite. Correct for the genre.
- **Layout stability under combat** (`Effects.tsx:100-104`). Always mounting the
  chain slot and gun chip and only fading contents, so nothing jumps mid-fight.
  This is a detail most games get wrong.
- **The adaptive quality governor.** Sampling over a window with drop/raise
  hysteresis (`constants.ts:331-338`) is textbook, and judging on delivered frame
  interval rather than self-timed JS is the right call for the reason the comment
  gives.

---

# Part 4 — Free wins

## 4.1 `assets/background/original/` ships to users

36 duplicate source images, **6.0 MB on disk**, currently untracked in git but
matched by `app.json:32`:

```json
"assetBundlePatterns": ["**/*"]
```

That bundles them into the binary. Nothing in `constants.ts` references them —
they're the pre-bake originals for `scripts/bake-bg-dim.mjs`. Move them outside
`assets/` (e.g. `art-src/`), or narrow `assetBundlePatterns`. Pure download-size
saving, zero risk.

## 4.2 App icons are oversized for what they are

`icon.png`, `adaptive-icon.png`, `splash-icon.png` are each 1024×1024 (4 MB
decoded each). That's correct for `icon.png` (stores require it) but
`splash-icon.png` is displayed far smaller. Minor.

## 4.3 `Math.random()` in the render body

`GameScreen.tsx:2262-2263`. Makes the render impure — it will misbehave under
React strict mode / concurrent re-entry, and it makes the render non-reproducible
for debugging. Compute the shake offset in `update()` and store it on `g.current`
like every other piece of frame state.

---

# Status

Everything below is implemented and verified (`npx tsc --noEmit` clean,
543/543 tests passing across 25 suites).

| § | Item | State |
|---|------|-------|
| 1.1 | 45 fps on 90 Hz panels | **Done** — `plugins/withPreferred60Hz.js` |
| 1.2 | HUD re-rendering every frame | **Done** — memoised on displayed values |
| 1.2 | Per-frame transform allocation on the play field | **Done** — frozen `NO_SHAKE` |
| 1.3 | Unthrottled haptics | **Done** — `src/game/haptics.ts` + budget |
| 3.1 | Silent primary action | **Done** — 3 generated voices |
| 3.2 | Shake dragging the sky's edge into view | **Done** — sky moved out of the shake layer |
| 4.1 | 6 MB of dead art in the bundle | **Done** — narrowed patterns + guard test |
| 4.3 | `Math.random()` in the render body | **Done** — rolled in `update()` |
| — | Uncapped enemy projectiles | **Done** — see the addendum below |
| 1.2 | Skia render layer | **Not done** — separate project, only if entity counts keep growing |
| 2.3 | Boot decodes ~104 images at once | **Not done** — see "next" in the addendum |

## What was built

**§1.1 — the 45 fps bug.** No value of `FRAME_MIN_MS` can fix this in JS: 90 is
not a multiple of 60, so the achievable rates on that panel are 90, 45 and 30.
`plugins/withPreferred60Hz.js` asks Android for a 60 Hz display mode via
`preferredRefreshRate`, after which the panel runs at 60, rAF fires at 60, and
the existing gate accepts every vsync. It also *lowers* display power, so it
helps the thermals the gate was added for. iOS needs nothing — rAF is already
capped at 60 there. The plugin is idempotent across prebuilds and **throws
rather than silently no-opping** if the Expo template moves the anchor, because
a silent no-op would quietly reintroduce 45 fps. Verified against the real SDK 54
Kotlin `MainActivity`. Takes effect on the next native build; does nothing in
Expo Go.

**§1.2 — HUD.** A plain `React.memo` could not work here: `alt` and `gunTime`
are raw floats that differ every frame, and `boons` is mutated in place so its
reference never differs at all. The comparator therefore runs on the *quantised*
values — exactly what each field is rounded to where it is drawn — plus a
`boonKey` signature the caller builds from the same `Math.ceil` the chips
display. The chain bar compares at whole percents, which is all a percentage
width can render.

**§1.3 — haptics.** A weight scale (`Ambient`/`Light`/`Medium`/`Heavy`) with
per-weight minimum gaps, plus a 220 ms shadow after anything heavy during which
ambient texture is suppressed. Heavy is never rationed. The point is as much
feel as power: a motor buzzing continuously from grazes physically cannot also
deliver "you took a hit", so the budget is what makes damage legible again. 10
tests.

**§3.1 — the gun.** Three short, dry, generated voices — bolt, beam, lob —
under 110 ms each, peaking around −6 dBFS, 26 KB total. Generated by
`scripts/make-shot-sfx.mjs` rather than sourced, so every character decision is
a number you can move and re-running the script is the whole edit loop. They sit
deliberately under the kill-pitch ladder, which is the sound that carries
information. **Listen to these and retune if they are not to taste** — they are
a large improvement on an inaudible borrowed `whoosh`, not a finished sound pack.

**§3.2 — the sky.** Moved out of the shake layer rather than re-testing the
inflation that caused the device-only black screen. A shake reads as impact
because the foreground moves against a *fixed* reference, so this looks better
as well as costing less, and it retires `SHAKE_MAX_PX` permanently — there is
nothing left for it to compensate for. The black screen was never diagnosed and
now never needs to be.

**§4.1 — the bundle.** `assetBundlePatterns` has no negation, so the patterns
are now explicit per directory. That is easy to get quietly wrong — a missed
asset still works in development and only fails as a missing sprite on a real
device — so `assetBundle.test.ts` scans every `require()` in `src/` and asserts
each one matches, that the icons match, and that `background/original/` does
not.

---

---

# Addendum — high-load lag: what was changed

Follow-up to the request "replace assets with CSS during gameplay to lower
graphic load."

## Why that specific approach was not taken

In a browser, "CSS instead of an image" saves a download. On this engine the
trade runs the other way:

- Every gameplay sprite is **already decoded and cached** before the run starts
  (`preload.ts` + `LoadingScreen`). A cached sprite draws as one textured quad —
  the cheapest operation a mobile GPU performs.
- The React Native equivalent of a CSS shape is a `<View>`. `borderRadius` +
  `borderWidth` draws through a path, not a quad, and a shape usually needs
  *several* views where a sprite needs one.
- The codebase already demonstrates the cost difference: an enemy is 2 views
  (wrapper + `Image`), while a drawn pickup is 4+ (wrapper + glow + ring + icon)
  — see `Obstacle.tsx:142-234`.

Converting sprites to drawn shapes would have raised per-frame cost. The
profiling in Part 2 pointed somewhere else entirely.

## Root cause of the high-load lag

**The two entity pools that scale with difficulty had no ceiling.** Particles
(40) and explosions (8) were capped and tier-governed; projectiles were not.
By wave 20 a formation is `WAVE_MAX_ENEMIES = 12` enemies on independent weapon
clocks — scattergun spreads of 5, death bursts of 10, mines that never expire on
their own — plus the global volley and a boss fan. Live enemy shots could reach
100+, each one a native view, a fresh style object, **and an `atan2` plus an
object allocation at render time, every frame**.

## Changes made

| Change | File | Effect |
|---|---|---|
| `MAX_ENEMY_BULLETS = 72` ceiling, enforced at all 3 spawn sites | `constants.ts`, `GameScreen.tsx` | Bounds the worst case |
| Cached sprite heading + box on the bullet at spawn | `types.ts`, `GameScreen.tsx` | Removes an `atan2`, a divide and an object allocation **per shot per frame** |
| Sparks drop `borderRadius` at tier > 0 | `ParticleLayer.tsx`, `GameScreen.tsx` | Cheaper draw primitive when the device is already struggling |
| 3 tests for the ceiling's invariants | `constants.test.ts` | — |

Two design decisions worth recording:

- **The ceiling is enforced by refusing to spawn, never by deleting a live
  shot.** Dropping the oldest would delete the bullet nearest the player — the
  one being dodged — and a shot vanishing mid-flight is indistinguishable from a
  rendering bug.
- **The ceiling is deliberately not a `QUALITY_TIERS` entry.** The tiers promise
  they only change how lavishly events are *drawn*; an enemy shot is something
  the player acts on, so tier-scaling it would quietly make the game easier on a
  slow phone. A fixed ceiling keeps every device playing the same game. There's a
  test guarding that promise.

The spark change is the one place the "cheaper drawing primitive" instinct
genuinely applies, and it's gated behind the governor so a phone holding its
frame budget keeps its round sparks.

Verified: `npx tsc --noEmit` clean, 526/526 tests pass.

**Player bullets were left uncapped, deliberately.** They're bounded by fire rate
and culled fast, and the two big fans (`TALON_COUNT = 7` per sweep,
`SPEAR_COUNT = 30` per rain) are brief scripted payoff moments. Capping the
player's power fantasy to save a few frames is the wrong trade.

## Next, and why it's not done yet

The largest remaining high-load cost is likely **explosion frame animation**.
`GameScreen.tsx:2631` swaps the `source` prop on an `Image` ten times per
explosion across 0.45 s; at 8 concurrent that's ~178 source swaps a second, each
going through the native image pipeline even on a cache hit — and it peaks
exactly when many enemies die at once, which is your reported symptom.

The fix is a **sprite sheet**: one strip per colour family, drawn inside an
`overflow: hidden` view and stepped with `translateX`, so the source never
changes and the animation becomes a pure transform. It would also cut 60 preload
images to 6, which directly helps the boot hitch in §2.3.

It is not done here because it needs new generated assets (a `scripts/` bake, as
`bake-bg-dim.mjs` does), touches `constants.ts` / `preload.ts` / the render and
their tests — and because §2.5 says to profile before large refactors. That
advice applies to me too. Turn on `PERF_OVERLAY`, watch `renderMs` during a
multi-kill, and if it spikes there, the sprite sheet is the next job.

Note also that pooling the explosion views (stable keys, as `ParticleLayer`
does) is **not** a safe drop-in: `playExplosion` recycles via `Array.shift()`,
so index-keyed slots would make a live 92–220px fireball jump position and frame
mid-animation. Slot-based allocation would have to come first.

---

## What I verified and ruled out

So you don't re-investigate these:

- **`react-native-svg` in the hot path** — no. Confined to `Icon.tsx`, and `Icon`
  is `React.memo`'d on primitives (`Icon.tsx` tail). `CoinIcon` is plain Views,
  not SVG.
- **Audio** — clean. One pre-created player per sample, no per-shot allocation,
  throttles on shot and graze (`sounds.ts`).
- **Backgrounding** — correct. `AppState` pauses and snapshots (`:665-675`), and
  the rAF loop returns early when `pausedRef` is set (`:729`), so nothing runs
  behind the lock screen.
- **Per-frame allocation in `update()`** — mostly clean. The `s.cards.filter()` at
  `:1708` is gated behind the fire timer, not per-frame. Three `filter()` calls do
  run per frame (`:2172`, `:2178`, `:2185`) allocating three arrays; minor, but
  in-place compaction would remove them if you're chasing GC pressure.
- **Boss coin payout** — already staggered, no spike.
