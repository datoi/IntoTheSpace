# Into The Space — Visual & UI Implementation Spec

Companion to `DESIGN_REVIEW.md`. That document argues; this one specifies.
Every value here is final and implementation-ready.

**Status of the codebase this was written against:** `feat/pickup-guide-and-perf`,
after the chain/graze/overcharge/hit-stop pass landed. Usage counts below were
measured against that tree — re-check with grep if you've moved on.

---

## 1. Colour tokens

Replace `PALETTE` in `src/game/constants.ts` with this. Semantic names, not
inherited ones.

```ts
export const PALETTE = {
  // --- Ground -----------------------------------------------------------------
  // Blue-biased black. The bias is the point: a neutral #0B0D10 reads as
  // "dark mode", a blue-black reads as space.
  void:      '#05070E', // app background, menu backdrop
  hull:      '#0D1320', // every card, row, panel, sheet
  hullHi:    '#151D2E', // raised / pressed surface
  edge:      '#223049', // every border
  edgeSoft:  'rgba(24,34,53,0.55)', // internal dividers inside a card

  // --- Player / brand ---------------------------------------------------------
  // The one bold colour. Ship, special meter, graze, shields, primary CTA,
  // equipped state, focus rings. NEVER on an enemy, a hazard, or a price.
  plasma:     '#35D6FF',
  plasmaDeep: '#0A84FF', // gradient end, pressed state
  plasmaGlow: 'rgba(53,214,255,0.35)',

  // --- Hostile ----------------------------------------------------------------
  // Enemy fire, enemy auras, mines, hull damage, health, boss bars, death.
  // NEVER on a pickup, a reward, a button, or the chain multiplier.
  threat:     '#FF2E5B',
  threatDeep: '#B0113A',
  threatGlow: 'rgba(255,46,91,0.35)',

  // --- Reward -----------------------------------------------------------------
  gold:   '#FFC93C', // coins, prices, chain, ribbons, unlocks
  goldHi: '#FFE9A8',

  // --- Boon families (these two + plasma + gold = all four) -------------------
  violet: '#A46BFF', // control: freeze, slow motion
  amber:  '#FF9F1C', // offensive: damage, fire rate, bombs

  // --- Ink --------------------------------------------------------------------
  ink:     '#EAF1FF', // primary text — cool white, not grey
  inkDim:  '#7E90AE', // secondary
  inkMute: '#4C5C78', // tertiary, disabled, hairline labels
} as const;
```

### Migration map

Measured usage counts. `rageDim`, `momentDim` and `adDim` are **unused — delete
them**, don't port them.

| Old | Uses | New | Notes |
|---|---|---|---|
| `bg` `#0B0D10` | 5 | `void` | |
| `card` `#171A20` | 11 | `hull` | |
| `cardBorder` `#232830` | 14 | `edge` | |
| `text` `#E8EAED` | 23 | `ink` | |
| `textDim` `#8B929D` | 37 | `inkDim` | Largest single change; mechanical |
| `rage` `#FF4757` | 12 | **split** | See below — this one is not 1:1 |
| `moment` `#2ED573` | 25 | **split** | See below — this one is not 1:1 |
| `bell` `#FFD32A` | 16 | `gold` | |
| `ad` `#FFA502` | 5 | `amber` | |
| `rageDim` / `momentDim` / `adDim` | 0 | — | Delete |

**`rage` must split by meaning, not be renamed.** It currently does three
unrelated jobs: damage/danger, the title accent, and the Damage Boost pickup.

- damage feedback, hit vignette, death screen, notification badge → `threat`
- title accent (`titleAccent`) → `plasma`
- `BOONS.damageBoost.color` in `src/game/pickups.ts` → `amber`
  *(a helpful pickup is currently painted in the danger colour — this is the fix)*

**`moment` must split the same way.** It's currently the primary CTA, the
selected/equipped state, "NEW BEST", and the Repair Kit and Altitude Surge boons.

- primary CTA, active tab, selected shop row, equipped state → `plasma`
- "NEW BEST", flawless-wave float → `gold`
- `BOONS.repair.color`, `BOONS.scoreMult.color` → `plasma` (repair is defensive),
  `gold` (surge is economy)

Acceptance: `grep -r "PALETTE.rage\|PALETTE.moment\|PALETTE.bell\|PALETTE.ad" src App.tsx`
returns nothing, and no hex literal outside `constants.ts` except the ones
explicitly listed in §3.

---

## 2. The friend/foe rule

> One hue family per allegiance, enforced everywhere. Cool cyan is the player.
> Hot magenta-red is hostile. Gold is reward. **Wave variety comes from sprite
> and scale, never from re-tinting the thing that ends the run.**

### 2a. Enemy bullets — read this before touching `WAVE_COLORS`

`WAVE_COLORS` is **not** what the player mostly sees. In the bullet renderer
(`GameScreen.tsx`, `s.enemyBullets.map`), `enemyShotForShip()` returns a valid
index for every ship tier, so bullets draw as an `<Image>` of `ENEMY_SHOTS[i]`.
`b.color` only reaches two paths:

- the plain-dot fallback (`artIdx < 0`) — currently unreachable
- mines (`b.mine`) — the pulsing ring

So the visible hue of an enemy bullet comes from the **sprite art**:
`eshot1` green, `eshot2` teal, `eshot3` red, `eshot4` blue, `eshot5` pink,
cycled by ship tier. That is the actual source of the readability defect.

**Two steps:**

1. **Now, one line.** Add `tintColor: PALETTE.threat` to the enemy-bullet
   `<Image>` style. React Native tints the whole non-transparent silhouette flat.
   You lose the sprite's internal shading; you gain an unambiguous friend/foe
   read the same day. Ship this first and judge it in motion.

2. **Then, art.** Commission the five missile sprites recoloured into the threat
   family (see §8), differing by **silhouette and size** rather than hue. Drop
   the tint once they land, so internal shading comes back.

Also required regardless:

```ts
// Wave identity moves to sprite + scale. This stays an array so the existing
// test (length > 0, /^#[0-9A-Fa-f]{6}$/) still passes, and so callers need
// no change — they just always resolve to the same hostile hue.
export const WAVE_COLORS = ['#FF2E5B'];
```

Four runtime call sites, all of which keep working unchanged:
`enemies.ts:714` (`enemyFire`), `enemies.ts:815` (`explosiveBurst`),
`GameScreen.tsx:1140` (`spawnEnemyShot` fallback), `GameScreen.tsx:1703`/`1737`
(global volley + boss fan).

**Contrast underlay.** Enemy fire has to read over both near-black void and a
bright nebula. Draw a dark disc 3px larger than the bullet behind every enemy
projectile at `rgba(4,6,14,0.55)`, or add a 1.5px `#06080F` outline to the dot
path. Without this, threat-on-crimson-nebula (the `crimson` background) loses
the bullet.

**Mines.** `enemies.ts` mine case hardcodes `color: '#FFE94D'` and the renderer
fills `rgba(255,233,77,0.20)` — yellow, which is now chain/reward gold. Move
both to the threat family: border `PALETTE.threat`, fill
`rgba(255,46,91,0.18)`. Keep the pulse; it's doing its job.

### 2b. Elite auras

Eight aura hues today, several of them stolen from the friend side:

| Elite | Current | Problem |
|---|---|---|
| `shielded` | `#48D6FF` | Identical to `SHIELD_COLOR` — the player's own shield bubble |
| `regen` | `#3DDC84` | Green; collides with the Repair Kit and the old wave-4 bullet |
| `swift` | `#FFE94D` | Yellow; collides with coins and the chain multiplier |
| `volatile` | `#FF6BD6` | Fine (hostile family) |

**Redesign:** all auras use the threat family at three intensities
(`#FF2E5B` / `#D8214A` / `#FF4FA8`), and elite *identity* moves to a **glyph
badge** drawn above the enemy (§8, 8 glyphs). Benefits: the friend/foe rule holds,
and colourblind players get a readable signal — today they have eight hues and no
legend anywhere in the game.

`ELITE_AURA_ALPHA` (0.26) and `ELITE_AURA_SCALE` (1.5) stay as they are.

### 2c. Player shot art — art dependency

`AVATARS[].shot` maps to `pshot1`–`pshot5`: blue, green, red, magenta, gold.
**Raptor's red bolt (`pshot3`) is nearly indistinguishable from enemy fire**, and
Specter's green was the old wave-4 bullet colour. Constrain player shots to the
cool half of the wheel plus gold:

| Hull | Now | Target |
|---|---|---|
| Ironclad | blue | keep — `#35D6FF` family |
| Specter | green | **teal** `#3DE0C0` |
| Raptor | red | **violet** `#A46BFF` |
| Valkyrie | magenta | **ice blue** `#9FD4FF` |
| Nova | gold | keep — `#FFC93C` |

Blocked on recoloured art. Until then it's a known conflict, not a bug you can
fix in code.

### 2d. Chain colour — correction to what shipped

`CHAIN_HUD_HOT` is `#FF6BD6`, a hot magenta. Under this rule magenta is hostile,
so the moment the player is doing *best* currently lights up in the colour of
danger. Ramp gold → white-hot instead:

```ts
export const CHAIN_HUD_COLOR = '#FFE94D'; // unchanged
export const CHAIN_HUD_HOT   = '#FFF6D0'; // was '#FF6BD6'
```

Escalation comes from a `goldHi` glow on the numeral, not a hue change.

---

## 3. Permitted hex literals outside `constants.ts`

After migration these are the only raw colour values allowed in components, and
each has a reason:

| Value | Where | Why |
|---|---|---|
| `rgba(0,0,0,0.4–0.8)` | HUD chip / button backgrounds | Scrim over live gameplay; not a brand colour |
| `rgba(255,255,255,0.16–0.30)` | Inactive borders | Neutral lift |
| `#06080F` | Bullet outlines | Contrast underlay, §2a |
| `#04121A` / `#221703` | Text on `plasma` / `gold` fills | Legible dark-on-bright pairs |

Everything else goes through a token.

---

## 4. Typography

`expo-font` is **not currently a dependency.** Step one:

```
npx expo install expo-font
```

Two faces, both OFL, both free. Load in `App.tsx` before the boot gate resolves —
you already have a loading screen holding the UI back for assets, so add the font
load to that same gate rather than introducing a second flash.

| Role | Face | Weights | Used for |
|---|---|---|---|
| **Display** | Chakra Petch | 600, 700 + italic | Wordmark, screen titles, button labels, ribbons, boss names |
| **Data** | JetBrains Mono | 700, 800 | Score, multiplier, timers, prices, wallet, every stat |
| **Body** | Inter (or system) | 500, 600 | Descriptions, guide rows, quest text |

**Chakra Petch ships a real italic.** Every `fontStyle: 'italic'` in the codebase
today is a synthetic slant on Android — the OS shears the glyphs — and it's a
large part of why the UI reads as unfinished. Once the face is loaded, use the
italic *file*; never `fontStyle` on the display face.

**Tabular figures are mandatory on the score.** It's the headline number and it
counts up constantly; in a proportional font the digit widths differ and the
whole number jitters sideways as it climbs.

```ts
{ fontFamily: 'JetBrainsMono-ExtraBold', fontVariant: ['tabular-nums'] }
```

### Type scale

Replace ad-hoc sizes with these. Sizes in px.

| Token | Size / LH | Weight | Tracking | Use |
|---|---|---|---|---|
| `display-xl` | 72 / 0.94 | 700 | `-0.025em` | Game-over score |
| `display-l` | 44 / 1.0 | 700 | `-0.02em` | Screen titles, wordmark |
| `score` | 34 / 1.0 | 800 mono | `-0.03em` | HUD score |
| `title` | 20 / 1.2 | 700 | `0` | Card names, section heads |
| `body` | 14 / 1.45 | 500 | `0` | Descriptions |
| `label` | 12 / 1.2 | 700 | `+0.16em` | Buttons, eyebrows, tabs |
| `micro` | 10.5 / 1.2 | 700 | `+0.14em` | Chips, ribbons, pips |

**Never below 12.5px for reading text**, and **never below 10.5px for labels.**
Drop `letterSpacing: 5` (currently on the menu kicker and `DISTANCE`) to
`+0.16em` — past roughly 2px at 12px, tracking stops reading as style and starts
costing legibility.

---

## 5. HUD geometry

### The defect to fix first

Everything sits in one column at `top: 52, left: 16, right: 66`: score, chain
row, altitude, coins, ribbons, gun readout, up to four boon chips. Because the
chain row only renders when `multiplier > 1`, **every element below it jumps
vertically the instant the player gets a second kill.** Layout instability during
combat is the worst readability failure in the current build.

### Slot map

Five fixed regions. Nothing outside its region, nothing reflowing.

| Region | Anchor | Contents |
|---|---|---|
| **A — Score** | `top: 44, left: 16` | Score (`score` token), then a **reserved 20px slot** for the chain row |
| **B — Wave** | `top: 46`, centred | `WAVE n` label + enemies-remaining pips |
| **C — System** | `top: 44, right: 14` | Pause, 44×44 tap target |
| **D — Wallet** | `top: 84, right: 14`, right-aligned | Coins, then altitude beneath in `inkMute` |
| **E — Status** | `left: 16, bottom: 88` | Boon chips *and* the gun timer, one system, column, newest on top |

Plus, in the play field:
- **Boss bar** — `top: 108, left: 14, right: 14`, full width
- **Ribbons** — centred, `top: 42%`
- **Health** — centred, `bottom: 16%` (see §6)

```
┌──────────────────────────────────┐
│ 12,480        WAVE 7        ❚❚  │  A / B / C
│ ×6 ▬▬▬▭                  1,240  │  reserved slot · D
│               ▮▮▮▯▯      8,420m  │
│ ─── THE WARDEN ──── PHASE 2 ───  │  boss bar
│                                  │
│            FLAWLESS              │  ribbons
│                                  │
│              ▲                   │  ship
│           ▮▮▮▮▯▯                 │  health
│  ⬛ SHIELD 4                      │  E
│  ⬛ DAMAGE 6                      │
│ (BOMB)                    (FIRE) │
└──────────────────────────────────┘
```

**Rule: region A's height is constant** whether or not a chain is active. Render
the chain row's container always; toggle the *contents*' opacity. Same for the
gun chip.

### Wave pips

- 7×3px, 2.5px gap, `borderRadius: 1`
- Filled = enemy alive (`threat`), empty = killed (`rgba(255,255,255,0.15)`)
- Cap at 12 (matches `WAVE_MAX_ENEMIES`); above that show `n ×` + one pip
- On a boss wave, replace the pip strip with the boss name

### Boss bar

- 5px tall, segmented into 3 (giant) or 1 (mini) phase blocks, 2px gaps
- Fill `threat`, spent segments `rgba(255,255,255,0.09)`, border `1px threatDeep`
- A lagging "damage ghost" layer behind the fill, easing to the true value over
  ~300ms, so a big hit reads as a big hit
- Name left, `PHASE n` right, `micro` token, `threat`

### Chips (region E)

One component for boons *and* the gun timer. No emoji at 8–11px.

- Height 20px, `paddingHorizontal: 6`, `borderRadius: 4`
- Background `rgba(0,0,0,0.5)`, **2px left rail** in the family colour
- 9px tinted glyph, then `NAME n` in `micro`
- Slide in from the left over 140ms; fade out in place — a chip appearing must
  never shove its neighbours

---

## 6. Health bar

Current: 7px wide, 24% of screen height, at `left: 16, top: 36%`, a 16-band
faked gradient, a `✚` emoji above and `❤️` below, **no segment ticks**.

Two problems. Hearts are discrete integers but the bar is continuous, so the
player has to judge a proportion instead of counting. And at 36% down the left
edge it sits level with the enemy formation, not with the ship the player is
watching.

**Spec — primary (recommended):**
- Horizontal, centred, `bottom: 16%` — directly beneath the ship's rest position
- One segment per heart: 13×5px, 2.5px gap, `borderRadius: 2`
- Filled `threat` + `0 0 7px threatGlow`; empty `rgba(255,255,255,0.11)`, no glow
- `maxHearts` is the run's live ceiling (the Extra Heart boon raises it) — keep
  reading it, don't draw against `HEARTS_MAX`
- `pointerEvents: none`, and keep it thin: it sits in the drag zone
- On loss: the lost segment flashes `#FFFFFF` for 80ms before going empty
- At 1 segment: slow `threatGlow` vignette at the screen edge, 1.2s cycle —
  **never faster**, or it reads as a rendering bug rather than a warning

**Fallback if the drag zone proves a problem in playtest:** keep it on the left
edge but widen to 12px, add the segment ticks, and drop to `top: 55%` so it's in
peripheral vision of the ship. *The countable segments are the non-negotiable
part; the position is a judgement call.*

Drop both emoji. If the bar needs a label, it's a 10.5px `HULL` in `inkMute`.

---

## 7. Components

### Buttons

| Variant | Fill | Border | Label |
|---|---|---|---|
| Primary | `linear-gradient(plasmaDeep → plasma)` at 0.9 | none | `#04121A`, `label` token |
| Secondary | `hull` | `1px edge` | `ink` |
| Ghost | none | none | `inkDim` |
| Disabled | `hull` at 0.5 | `1px edge` | `inkMute` |

Radius 10 everywhere (down from the current mix of 11/14). Minimum tap target
44×44. Pressed = `scale: 0.97` + opacity 0.85, 90ms.

**FIRE button:** keep the rising-fill vessel — it's good. Ready state gets a
`2px plasma` rim and the existing throb. Overcharged gets `2.5px goldHi` and the
fill goes `amber`. Locked (no special) is the Disabled variant — and per
`DESIGN_REVIEW.md` §5, Ironclad should get a special so this state stops
appearing in the first session at all.

### Cards (shop / hangar / quests)

Everything is currently the same flex row: `card` fill, 1.5px border, 14px
radius, emoji thumb. Correct for a settings screen; wrong for the moment a player
spends the biggest number they've ever saved.

- `hull → hullHi` vertical gradient, `1px edge`, radius 12
- **2px top edge in the tier colour**, which is *the same colour as that hull's
  shot and its special's effects* — the player learns "gold means Nova" once, and
  then every gold thing on screen belongs to them
- Hull rendered large (60px tall) with a `drop-shadow` in the tier colour
- Special name in the tier colour, `micro` token, above the description
- Price as a pill: coin glyph + `JetBrainsMono` tabular figure in `gold`
- State: `EQUIPPED` = filled `plasma` pill with `#04121A` text; `OWNED` =
  `1px edge` outline pill in `inkDim`
- **Locked hulls still show the silhouette and the special's name.** Sell the
  fantasy; don't hide it behind a padlock.

### Menu

Eleven stacked elements on a flat `#0B0D10` rectangle — while the game ships
seven parallax nebula sets and fifteen planet sprites the menu never shows.

- **Run the equipped background live behind the menu**, same `BG_DIM` scrim,
  drifting slowly. Largest perceived-quality gain per line changed anywhere in
  this document, using assets already on disk.
- Wordmark asset, not two lines of synthetic-italic system text
- Ship on a glow pedestal, slow bob (±4px, 3.2s), special name beneath
- **One** primary CTA in `plasma` with an outer glow
- Everything else → a four-icon rail: hangar, shop, objectives, stats. Badge on
  objectives. Removes five vertical elements and three competing button weights.
- Wallet chips top-right, best score top-left — persistent and identical on
  every screen
- **Delete the four-line instruction paragraph.** Nobody reads it, and the
  scripted first run (`DESIGN_REVIEW.md` §12) teaches all four verbs in 90s.

---

## 8. Icon assets

Emoji do load-bearing UI work in ~40 places. They render differently per OS (you
aren't art-directing 🔺 — Apple and Google are), can't be tinted so each arrives
with its own baked palette, have wildly inconsistent visual weight, and at
`boonChipIcon: fontSize 11` several are indistinguishable blobs.

### Commission spec

- **24×24 grid**, 2px stroke, rounded caps and joins, 1px min inner spacing
- **Pure white on transparent** — no colour, no gradients, no inner shadows.
  The app tints them with tokens; that's what keeps the colour rule enforceable
  in one place.
- **SVG masters + PNG @1x/@2x/@3x.** PNG@3x alone is acceptable if you'd rather
  not add an SVG dependency.
- **Every glyph must survive a 12px test** — that's the chip size
- **Solid-fill variants** for the four drawn on falling pickups, which need to
  punch through a nebula at speed

### Manifest — 46 glyphs + brand

| Group | Count | Items |
|---|---|---|
| Currency & vitals | 5 | coin, core, blueprint, heart/hull-pip, hull-full |
| Boons | 14 | shield, repair, extra-heart, damage-up, firerate-up, nuke, bomb, freeze, slowmo, magnet, double-coins, altitude-surge, energy-cell, lucky-drop |
| Guns | 4 | double, bomb, laser, homing *(match existing projectile silhouettes)* |
| Elite badges | 8 | armored, rapid, regen, shielded, explosive, vampiric, swift, volatile |
| Navigation & state | 12 | play, hangar, shop, objectives, stats, pause, close, back, lock, check, chevron, info |
| Brand | 3 | wordmark (horizontal + stacked), app icon (1024², must read at 48px), ribbon marks (flawless / speed / full-chain) |

**Also needed (art, not icons):** 5 recoloured enemy missile sprites (§2a) and
5 recoloured player bolts (§2c).

**Staging.** The 14 boons + 5 currency/vitals are on screen during play — they
buy the most visible improvement, do them first. Elite badges can wait until the
aura-hue rule lands. Brand can come last.

### Integration

`assets/icons/<name>.png` (+`@2x`,`@3x`), kebab-case, matching the manifest names
exactly. One component so tinting is never ad-hoc:

```tsx
<Icon name="shield" size={12} color={PALETTE.plasma} />
```

Add the icon set to `preloadAssets()` in `src/game/preload.ts` — the boot gate
already exists to stop un-decoded art appearing mid-play, and HUD chips are
exactly the case it protects.

---

## 9. Motion

Four micro-interactions. Everything else stays still — the play field is already
busy, and the interface's job is to be legible inside that noise.

| What | Spec |
|---|---|
| Score roll-up | Count to the new value over 250ms, `ease-out`. Tabular figures keep it still while it climbs. |
| Ribbon slam | Enter at `scale 1.35` → `1.0` over 180ms with slight overshoot. The reward beat — give it the only bounce in the game. |
| Chip slide | In from the left over 140ms; fade out in place. |
| Low-hull pulse | `threatGlow` edge vignette, 1.2s cycle, at 1 segment only. |

Respect the OS reduce-motion setting: drop the roll-up and the overshoot, keep
the state changes.

---

## 10. Ordered work list

Cheapest first. Each row is independently shippable.

| # | Change | Cost | Acceptance |
|---|---|---|---|
| 1 | `tintColor: threat` on enemy bullets; `WAVE_COLORS = ['#FF2E5B']`; mines to threat family | 3 lines | No friendly-coloured projectile can kill you |
| 2 | Reserve the chain slot; region A height constant | 1 style | Nothing in the HUD moves when a chain starts or a boon expires |
| 3 | Health bar → discrete segments | Small | Hearts countable at a glance |
| 4 | New `PALETTE`; migrate per §1; delete the three unused `*Dim` keys | Find-and-replace | No `PALETTE.rage`/`moment`/`bell`/`ad` remain |
| 5 | Parallax behind the menu | Reuse | Menu no longer flat black |
| 6 | `expo-font` + the two faces; kill every `fontStyle: 'italic'` | Small | No synthetic italic on Android |
| 7 | Contrast underlay on enemy fire | Small | Bullets readable on the `crimson` background |
| 8 | Icon set replaces all UI emoji | Commission | No emoji in any component |
| 9 | Wave pips, boss bar, tiered cards | New UI | — |

Items 1–3 are the readability defects. If you only ever do three things from this
document, do those.
