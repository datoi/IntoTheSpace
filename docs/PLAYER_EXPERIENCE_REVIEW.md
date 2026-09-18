# Into The Space — Player Experience Review

**Reviewer role:** Technical Director / Player Experience
**Scope:** What it is like to *play* this game, from first launch to run #20. No implementation.
**Build reviewed:** `chore/sdk-57-upgrade` @ `c40552a` **plus the uncommitted working tree**
(18 modified files, +569/−254 — the music removal is in that uncommitted set and it matters, see §0.2).
**Verification:** `npx tsc --noEmit` clean · `npm test` 930/930 across 36 suites, run twice, no flakes.

---

## 0. Before the findings — what has already changed, and what has not

`DESIGN_REVIEW.md`, `PERF_AUDIT.md` and `VISUAL_SPEC.md` were written against
`feat/pickup-guide-and-perf`. The code has moved a long way since. Re-running
those documents would waste your time, so here is the reconciliation first.

### 0.1 Landed since those documents (do not re-litigate these)

| Doc | Recommendation | State in this tree |
|---|---|---|
| DR §3 | Chain + graze replace altitude-as-score | **Landed** — `src/game/chain.ts`, `GameScreen.tsx:996` |
| DR §3 | Wave-clear ribbons | Landed as *scoring*, **removed as feedback** — see §3.6 |
| DR §5 | Energy earned, not passive; overcharge | **Landed** — `constants.ts:1355-1368` |
| DR §5 | Ironclad gets a special (Bulwark) | **Landed** — `constants.ts:1738`, `BULWARK_*` at `1621-1631` |
| DR §5 | Specials read as different fantasies | **Landed** — `SPECIALS` at `constants.ts:1664` |
| DR §6 | Boss phases, health bar, per-boss weapon clock | **Landed** — `src/game/bosses.ts`, `Effects.tsx` `BossBar` |
| DR §8 | Use `orbit` and `missile`; ship a splitter | **Landed** — `sentinel`, `seeker`, `splitter` in `enemies.ts` |
| DR §14 | Firing sound, kill-pitch ladder, hit-stop | **Landed** — `sounds.ts`, `HITSTOP_*` at `constants.ts:1397` |
| PERF 1.1–4.3 | All seven items marked Done | **Confirmed still in place** |
| VS §1–7 | Palette, type scale, HUD slot map, segment health bar, menu rework, icon set | **Landed** — `PALETTE` at `constants.ts:34`, `type.ts`, `Icon.tsx`, `Effects.tsx` regions A–E |

This is a lot of ground covered, and the craft on it is good. The HUD region map
in particular (`Effects.tsx:118-175`) is better than most shipped mobile shooters.

### 0.2 Drift — where the code has moved *away* from those documents

Three of these, and one is serious.

**(a) The soundtrack has been deleted, and nothing in the commit trail explains why.**
`DESIGN_REVIEW.md` §14 named "no music at all" as the single largest audio gap.
Two commits then fixed it: `67c6b83` and `3ee6c24` shipped `src/game/music.ts`
— a per-sky, two-track alternating soundtrack with a proper lifecycle, a mixer
channel, and a slider that re-levels the *playing* track. The current working
tree deletes `src/game/music.ts`, deletes both its test files, moves all ten
tracks from `assets/music/` to `art-src/music/`, and removes the `music` channel
from `mixer.ts:31-35`.

The only rationale on record is a comment in `mixer.ts:10-15` — "until the
soundtrack was cut" — which explains why the *slider* went, not why the *music*
went. The SDK 57 commit message (`c40552a`) lists three things RN 0.86 broke and
music is not among them; `expo-audio` is still a dependency at `~57.0.5`; the ten
mp3s are intact and distinct (I hashed them). So this does not look like a
technical forced move. **As of this tree the game is silent apart from effects.**
That is a regression against the prior review's top audio finding and it is the
largest single perceived-quality loss in the build. Whatever the reason was, it
should be written down — and if it was scope, it should be reversed before ship.

**(b) Wave-clear ribbons are paid but no longer announced.** `GameScreen.tsx:1613`
carries the comment "Still paid, just no longer announced". `ribbonTotal(earned)`
goes onto the score and a chime plays. Nothing is drawn. `VISUAL_SPEC.md` §9
specifies a ribbon slam as "the reward beat — give it the only bounce in the
game", and it is now the only reward in the game with no visual at all. Detail in §3.6.

**(c) Wave composition is unchanged.** DR §7 (formation entrances, formation
advance, a wave-type deck) and DR §8.1 (squad templates instead of per-enemy
rolls) are not implemented. `spawnWave` (`GameScreen.tsx:2977-2989`) still fills
centred rows, and `rollArchetype` (`enemies.ts:501`) is still an independent
weighted roll per enemy. That is *unbuilt*, not drift, and I am not going to
re-argue it — but it is load-bearing for §3.3 below, so it gets referenced.

### 0.3 What the test suite tells me about the game

930 tests, 36 suites, clean twice. Coverage tracks what the team treated as
load-bearing, and the shape is informative:

- **Heavily covered:** save/migration (`storage`, `migration` — 562 lines),
  economy and quest rollover (`missions` — 618), balance constants
  (`constants` — 705), the loop's state transitions (`GameScreen.test` — 1326).
  These are the things that silently corrupt a player's account, and they are
  well defended.
- **Covered as *state*, not as *experience*:** `chain.test.ts` asserts
  `ribbonsFor` returns the right kinds, never that a ribbon is *shown*.
  `bosses.test.ts` asserts `card.windup` is set — the file's own header
  (`bosses.ts:76-87`) records that this exact pattern already shipped a
  telegraph that was set and never drawn, and the tests all passed. The lesson
  was written down; the same class of gap still exists elsewhere.
- **Uncovered, and a regression here would ship unnoticed:**
  1. **Input under multi-touch.** No test presses FIRE or BOMB while a drag is
     live. See §3.1 — I believe this is currently broken.
  2. **Reward legibility.** Nothing asserts that any reward — ribbon, callout,
     bounty float — reaches the screen.
  3. **Attainability of the scoring system.** `chain.test.ts` verifies the
     multiplier *function*; nothing verifies a multiplier above ×2 is reachable
     in a real wave. It is not. See §3.2.
  4. **Boss time-to-kill.** `constants.test.ts` guards the projectile ceiling
     and the tier promises, but no test bounds how long a boss takes to die
     against base stats. That number is currently 112 seconds. See §3.4.
  5. **The audio mixer's coverage followed the feature out.** `music.test.ts`
     and `music.volume.test.ts` are deleted, so if music comes back it comes
     back unguarded.

---

## 1. VERDICT

**The core loop is no longer the problem. The tuning of it is, and the effect on
the player is the same as if the loop were broken.**

That is the most useful sentence in this document, so let me be precise about
what I mean. `DESIGN_REVIEW.md` was right that the old game measured a clock and
asked for no decisions, and that has genuinely been fixed: score is now
`kills × chain`, the chain is sustained by grazing, energy is earned rather than
trickled, bosses run five phases on their own weapon clock, and every hull has an
ultimate with its own fantasy. The verbs are correct now. The architecture behind
them is better than the genre average by a distance — `chain.ts` is pure and
testable, `bosses.ts` reasons explicitly about which *verb* each phase demands,
`haptics.ts` implements a priority budget most shipped games do not have.

What this game is good at today, honestly: **it feels good to touch.** Forgiving
hitboxes (`AVATAR_HIT_W = AVATAR_SIZE - 12`, `constants.ts:742`), hit-stop tuned
at 2–5 frames with a re-trigger guard, a kill sound pitched by chain, a haptic
budget that makes damage legible inside a graze storm, a steering scheme that
tracks finger *travel* rather than finger *position* and is right for the reason
its comment gives. Moment-to-moment, this is a competent, polished arcade shooter
and it competes on feel.

Where it does not compete: **the player cannot see the game they are playing.**
Three numbers do the damage, and all three are tuning, not architecture.

1. The chain multiplier tops out at **×2** in real play against a designed
   ceiling of ×10. Every chain callout, the HUD's white-hot state, and the top
   80% of the scoring curve are unreachable. (§3.2)
2. A fresh install's first boss takes **54 seconds** of continuous perfect fire;
   the first giant takes **112 seconds**; wave 20's giant takes **176 seconds**.
   (§3.4)
3. Two of the three wave-clear ribbons are the **same condition**, and none of
   the three is drawn. (§3.6)

The consequence is a game that has been rebuilt around skill and then hides the
skill. A new player finishes their first run having never seen a multiplier above
×1.5, never fired the ultimate, never been told they earned a bonus, and having
spent the back half of the run shooting one slow-moving sprite. They did not
experience the game that this codebase implements.

**Compared to the market:** on feel it is competitive with Sky Force Reloaded. On
run structure it is behind everything — Brotato runs 20 bounded waves in 15–20
minutes and *ends*; Vampire Survivors ends at 30 minutes by spawning a Reaper;
Survivor.io runs 15 minutes with bosses at 5-minute intervals. Into The Space is
endless with unbounded wave length: at base stats wave 19 alone is 73 seconds and
there is no wave after which anything happens. On reward legibility it is behind
Sky Force by the widest margin of anything here — Sky Force states four medal
objectives per level *up front*, tracks them *during* play, and that is the whole
engine of its replay loop. This game already computes the identical thing and
shows the player nothing.

**Ship-readiness:** the systems are ready. The numbers are not. I would not put
this in front of a publisher until §3.2, §3.4 and §3.6 are fixed — and all three
are constants files, not rewrites.

---

## 2. THE FIRST 60 SECONDS

Fresh install, Ironclad, all upgrade tracks at level 0, no prior save. Times are
from `freshRunState` (`runstate.ts`) and a DPS of **3.125** (`BULLET_DMG = 1`
every `FIRE_RATE = 0.32`s, `constants.ts:506-509`), assuming 100% accuracy, which
is generous.

| t | What happens | What the player understands |
|---|---|---|
| 0.0s | Boot gate. `MIN_LOADING_MS = 350`, decode grace 900ms, fonts 4s | "It's loading." Fine. |
| — | Menu: wordmark, hull on a lit pedestal with its special named, LIFT OFF, four-icon rail, a `PICK-UPS` link | Good. The menu is the best screen in the game. |
| 0.8s | Wave 1 spawns: 3 enemies, 3 HP each | "Things are coming down." |
| ~1.5s | Auto-fire is already running. Player drags; hull follows | Movement and shooting are learned instantly, with no text. **This part is right.** |
| ~4s | Wave 1 clear. Chime. Score jumps by an unexplained amount | "Something good happened?" The FLAWLESS + FULL CHAIN ribbons just paid **500 points** with no visual. |
| 3.0s | First coin drops (`coinTimer: 3`) | "Grab things." Good. |
| 7.8s | First boon drops (`boonTimer: BOON_EVERY * 0.6`) | Depends entirely on the roll. |
| 8.0s | First gun drop (`giftTimer: 8`) | "My gun changed." Good — the drop wears its own projectile art. |
| ~9s | Wave 2 (4 enemies) clear | |
| ~18s | Wave 3 clear | |
| ~30s | Wave 4 clear | |
| ~31s | **Wave 5: MINI BOSS.** 170 HP | "A big one." |
| **60s** | **Still fighting it. ~35% of its health is gone.** | — |
| ~85s | Boss dies. First special probably fires somewhere around here | |

### The points of confusion, dead air and unearned difficulty

**2.1 — The first minute ends in the middle of a 54-second fight against a
sprite that moves left and right.** This is the headline. `BOSS_MINI_HP(5) = 90 + 5×16
= 170` (`constants.ts:652`) against 3.125 DPS. The mini's three phases
(`bosses.ts:141-145`) are genuinely different verbs — fan, then rake, then lash —
but the player meets them at 18 seconds each, and the *first* phase is an aimed
fan, the least interesting of the eight. A new player's first boss is
structurally a 54-second hold-still-and-shoot. Brotato's entire first wave is 20
seconds.

**2.2 — The player earns 500 points twice in the first 30 seconds and is never
told.** Waves 1–4 are trivially flawless, so every one of them pays FLAWLESS
(300) + FULL CHAIN (200) — `chain.ts:66-67`, awarded at `GameScreen.tsx:1606`.
That is 2,000 points of the opening minute, delivered as a score counter that
moves and a single `waveClear` chime. The player has no way to learn that playing
cleanly is worth anything, which is the exact lesson the first minute exists to
teach.

**2.3 — The FIRE button does not fire in the first minute.** This is the one that
disappoints me most, because it was *specifically* the fix for DR §5. Ironclad
now has Bulwark, the button is no longer locked — and the energy economy puts it
out of reach anyway. Accumulating from `ENERGY_PER_KILL = 0.012`,
`ENERGY_PER_FLAWLESS_WAVE = 0.06`, `ENERGY_PER_GRAZE = 0.004`
(`constants.ts:1355-1359`): waves 1–4 give 18 kills (0.216) + 4 flawless waves
(0.24) ≈ **0.46 of a meter at the 30-second mark**. The rest has to come from
grazing the boss, so the first Bulwark lands somewhere around t=70–85s, deep
inside the boss fight. The new player's first minute still contains a button they
watch fill and never press. The lock came off; the wait did not.

**2.4 — Nothing teaches the graze, and the graze is the game.** Grazing is what
sustains a chain (`grazeChain`, `chain.ts:157`), what pays energy, and per
`bosses.ts:57-62` it is the *intended* way to survive a long boss fight. A new
player's instinct is to fly away from bullets. The only place grazing is
explained is the third paragraph of a scrolling modal behind a 12px `PICK-UPS`
link on the menu (`Screens.tsx:283-287`). In-game, a graze produces a throttled
tick, a 0.12s flick on the bullet, and an ambient haptic — deliberately
restrained (`GameScreen.tsx:2032`), and the restraint is correct *once you know
what it is*. Nothing ever performs the introduction. Compare Super Mario 1-1,
where the first Goomba cannot be passed without jumping: the mechanic you must
teach should be the mechanic the first encounter *requires*.

**2.5 — Dead air at every wave boundary.** `WAVE_GAP = 1.1`s
(`constants.ts:530`) plus the formation's descent from above plus bullet travel
means roughly 2.5–3 seconds between the last kill of one wave and the first kill
of the next, during which the board is empty, there is nothing to shoot, nothing
to graze, and the chain is decaying. Repeated every wave, forever.

**2.6 — Two things are never explained and cannot be inferred.** The four
currencies (`likes`/coins, crystals, chips, alloy) appear as floats during play
with no context; and the altitude readout in region D counts up continuously
while the score — the thing that now matters — sits in region A. The player sees
two rising numbers and no signal which one they are playing for. (The pause menu
compounds this: `GameScreen.tsx:3378` still shows metres, not score.)

**What the first 60 seconds gets right, and should not be touched:** movement and
auto-fire teach themselves with zero text; the gun drop at t=8s is early enough
to feel like a reward and wears its own art so the player reads it before
committing; pickups fall at `PICKUP_FALL_SCALE = 0.55` of world speed so they can
actually be lined up; hitboxes are forgiving in the player's favour on both
sides. That is a well-judged opening. It is let down by what happens at t=31s.

---

## 3. WHAT'S MISSING — ranked by impact

Ordered by how much player experience each one costs per unit of work.
"**Broken**" means the code does not do what it claims. "**Choice**" means it
works as written and I would design it differently.

---

### 3.1 — Pressing FIRE or BOMB cancels your steering **[Broken]**

*Moment-to-moment feel · input · fairness*

`GameScreen.tsx:758-791` builds a `PanResponder` and spreads its handlers onto
the **root** view at `:2492`, the same view that contains the FIRE button
(`Effects.tsx` `SpecialButton`) and the `BombButton` (`GameScreen.tsx:507`).

The config passes `onStartShouldSetPanResponder`, `onMoveShouldSetPanResponder`,
`onPanResponderGrant`, `onPanResponderMove`, `onPanResponderRelease` and
`onPanResponderTerminate`. It does **not** pass
`onPanResponderTerminationRequest`, and PanResponder's default returns `true`
(`node_modules/react-native/Libraries/Interaction/PanResponder.js:519-523`).

React Native's responder system is single-responder. When a second finger lands
on the FIRE button, the negotiation in `ReactFabric-dev.js:16430-16465` runs: the
button (deeper in the tree) wins `startShouldSetResponder`, the current responder
— the root view — is asked `responderTerminationRequest`, PanResponder says yes,
`responderTerminate` is dispatched, and the responder changes. That fires
`onPanResponderTerminate` at `GameScreen.tsx:788`, which sets
`g.current.dragging = false`.

**The failure, concretely:** you are threading a `twin` pinwheel at wave 20, you
tap FIRE with your other thumb, and your steering thumb stops working. The hull
freezes mid-dodge. It does not resume when you keep dragging — the responder is
gone. You have to lift and re-place your finger, which costs you the two or three
frames in which the lattice closes.

This is the single worst thing an input scheme can do, and the code comment at
`:743-748` says exactly that about a different failure mode. It is not covered by
any test: the drag tests at `GameScreen.test.tsx:1030-1075` all use a single
synthetic touch.

**Confidence:** high, from reading RN's implementation — but it is thirty seconds
to confirm on a device, so confirm before acting. **What I'd do:** pass
`onPanResponderTerminationRequest: () => false` so the drag keeps the responder,
and move the two buttons out from under the pan root (or give them their own
responder island). Add a test that presses FIRE mid-drag and asserts
`dragging === true` afterwards.

---

### 3.2 — The scoring system is unreachable above ×2 **[Broken]**

*Meaningful choice · reward legibility · mastery ceiling*

This is the most damaging finding in the document, because the chain is the
entire reason the score means anything.

The tuning: `CHAIN_WINDOW = 2.5`s, `CHAIN_STEP = 5` kills per step,
`CHAIN_STEP_MULT = 0.5`, `CHAIN_MAX_MULT = 10`, `CHAIN_DECAY_EVERY = 0.5`
(`chain.ts:26-34`). ×10 therefore requires **chain 90** — ninety kills held
inside overlapping windows.

Two hard ceilings make that impossible:

1. **A formation caps at `WAVE_MAX_ENEMIES = 12`** (`constants.ts:532`).
   Twelve chained kills is `1 + floor(12/5) × 0.5` = **×2.0**.
2. **The chain cannot survive a wave boundary.** After a clear there is
   `WAVE_GAP = 1.1`s, then the next formation descends at
   `ENEMY_DESCEND_SPEED = 150`px/s, then your bullet has to travel. The
   effective grace is `CHAIN_WINDOW + CHAIN_DECAY_EVERY` = 3.0s for a chain
   below 5 (`tickChain` sheds to `floor((chain-1)/5)×5`, which is 0). The gap is
   longer than the grace, and — critically — **there is nothing to graze during
   it either**, because the board is empty. The chain resets at every wave, by
   construction.

I simulated the real functions against real DPS. Best multiplier reached clearing
one full wave, fresh install:

| wave | time-to-kill per enemy | no grazing | 1 graze/s | 3 graze/s |
|---|---|---|---|---|
| 1 | 0.96s | ×1 | ×1 | ×1 |
| 3 | 1.60s | ×1.5 | ×1.5 | ×1.5 |
| 6 | 2.56s | ×1.5 | ×1.5 | ×1.5 |
| 8 | 2.88s | ×2 | ×2 | ×2 |
| 12 | 4.16s | **×1** | ×2 | ×2 |
| 20 (lv3/lv3 ship) | 4.14s | **×1** | ×2 | ×2 |

**Everything above ×2 is dead content:**

- `CHAIN_CALLOUTS = [3, 5, 8, 10]` (`chain.ts:39`) — `calloutFor` never returns
  a value, so the `CHAIN ×n` float and `playSystem('chain')` at
  `GameScreen.tsx:1010-1013` never fire. A whole sound and a whole callout,
  never heard.
- `const hot = multiplier >= 5` (`Effects.tsx:115`) — the white-hot chain
  styling, `CHAIN_HUD_HOT`, and `styles.chainMultHot` never render.
- `mult >= 5 ? CHAIN_HUD_HOT : CHAIN_HUD_COLOR` on the kill float
  (`GameScreen.tsx:1021`) — always the second branch.
- Eight of the ten multiplier steps the system can express.

Note the third column of that table: at wave 12+ grazing is not a *bonus*, it is
the only thing keeping the multiplier off ×1. The design intent (`chain.ts:150-156`,
"grazing sustains a chain but cannot build one") is coherent and I like it — but
it means a player who plays safely gets ×1 permanently and never learns a
multiplier exists. That is a teaching failure sitting on top of a tuning failure.

**What I'd do.** Pick one of two directions, not both:

- **Match the ceiling to the content** (cheap, safe): `CHAIN_MAX_MULT = 3`,
  `CHAIN_CALLOUTS = [1.5, 2, 3]`, `hot` at `>= 2.5`. One line each. The system
  instantly delivers on everything it draws.
- **Match the content to the ceiling** (better, more work): let the chain cross
  wave boundaries. Extend the grace during `waveClearTimer`, or — much better —
  make the wave gap *not empty*, which is DR §7's formation-entrance idea and
  would fix §3.3 and §2.5 at the same time. Then chain 90 is a real, visible,
  extremely satisfying goal across four or five waves, and the whole ×10 ladder
  comes alive.

I would do the first this week and the second next quarter.

---

### 3.3 — Runs do not differ, and enemies do not force different play **[Choice]**

*Variety · replayability*

Two runs on the same hull with the same upgrades are mechanically identical apart
from drop luck. The only in-run variables are: which gun falls
(`GIFT_EVERY = 9`s, 4 kinds, expires after `GUN_TIME = 16`s), which boon falls
(`BOON_EVERY = 13`s, 13 kinds), and which archetypes roll.

The archetype engine is genuinely good — 14 behaviours × 8 elites, art chosen by
behaviour so a silhouette reliably means a threat (`enemies.ts:74-80`, a real
piece of design). But `rollArchetype` (`enemies.ts:501`) rolls **independently per
enemy**, so a wave is a random bag with no identity. You never fight "a sniper
nest"; you fight four unrelated things. Recognition is the precondition for
strategy, and there is nothing to recognise.

And enemies **never advance**. They descend to `holdY` and sit there until killed
(`spawnWave`, `GameScreen.tsx:2977`). A patient player is never punished. There
is no clock, no pressure, no fail-forward — which is why the game feels slack
even when the screen is full. Brotato's waves are 20→60 seconds *on a timer*;
here a wave lasts exactly as long as your DPS says it does, which is why §3.4
happens.

DR §7 and §8.1 cover the fix and I am not going to restate them. What I will add
that those documents do not: **the chain fix in §3.2 and the variety fix are the
same fix.** Formation entrances and a wave-type deck both keep something
killable on screen across the boundary, which is exactly what the chain needs to
break ×2. Build them as one piece of work, not two.

---

### 3.4 — Bosses are 20–60% of a run's duration and they are the flattest part of it **[Broken — tuning]**

*Run structure and pacing · fairness*

`bosses.ts` is good work. Five phases for a giant, three for a mini, each phase
swapping both attack pattern *and* movement, and the module header reasons
explicitly about which *verb* each pattern demands (position / commit / orbit /
predict / react / time). That is real design and the sway integration fix
(`bossSway`, `:180-200`) is the kind of thing most teams never find.

Then the health numbers undo it. `BOSS_MINI_HP(w) = 90 + 16w`,
`BOSS_GIANT_HP(w) = 150 + 20w` (`constants.ts:652-653`), against 3.125 DPS:

| wave | fight | fresh install | lv3 dmg + lv3 rate | fully maxed (lv10/10/10) |
|---|---|---|---|---|
| 5 | mini, 170 HP | **54s** | 35s | 9s |
| 10 | giant, 350 HP | **112s** | 73s | 19s |
| 15 | mini, 330 HP | **106s** | 68s | 18s |
| 20 | giant, 550 HP | **176s** | 114s | 30s |

Cumulative time to reach wave 20 on a fresh install: **18 minutes**, of which
**~7 minutes is three boss fights**. A giant at wave 20 is a *three-minute*
engagement with one enemy.

The module header anticipates this ("length alone is what turns a boss into a
chore, so it is bought back by subdivision") and the argument is right in
principle — five phases at 22 seconds each is a defensible structure. But it is
only bought back if the *player* can perceive the subdivision, and the boss's
identity is `GIANT BOSS` in 10.5px text with a phase counter (`Effects.tsx:305`).
There is no name, no entrance, no taunt, no death sequence beyond
`HITSTOP_BOSS_KILL = 0.08` and a fireball. Five phases of an anonymous sprite
reads as one long phase.

It also breaks the difficulty curve's honesty: the fight is 6× shorter for a
maxed ship than a fresh one, so "the boss got easier" is entirely a function of
the shop, never of the player's skill. And it kills the SPEED ribbon (§3.6).

**What I'd do, in order:**
1. **Cut boss HP by ~50% at low investment and scale it against resolved DPS,
   not against wave number.** A boss should be a 25–40 second fight for
   *everyone*. Target: five giant phases × ~7s. `BOSS_*_HP` should take
   `stats.dmgMult` and `stats.fireRate` as inputs.
2. **Give bosses names and an entrance.** 2.5 seconds, invulnerable, name slams
   in, HUD ducks. Costs almost nothing and buys the perceived production value
   the phases have already earned.
3. **Add a soft timer** (`ESCAPING IN 45s` — the boss flees with the reward
   rather than killing you). This is what makes damage upgrades *matter* instead
   of merely shortening a chore, and it converts the fight's length from a
   constant into a stake.

---

### 3.5 — There is no reason to start run #20, and a weak one to start run #2 **[Choice]**

*Short- and long-term replay*

**Run #2.** The game-over screen (`Screens.tsx:318-380`) shows score, best chain,
grazes, depth, wave and coins. What it does *not* show is anything that moved:
no quest progress, no mission completions, no achievement unlocked, no "2 more
elite kills for Elite Problem", no comparison to your last run — only to your
all-time best. The player is asked to decide whether to press LAUNCH AGAIN at the
exact moment the game has told them the least about what they gained. `App.tsx:253`
already computes the full `applyRun` delta one call away from this screen.

**Run #20.** There is no leaderboard, no seed, no season, no event, no run
history, no codex, no daily mode. The retention surface is: 51 fixed one-shot
goals, 3 dailies, 2 weeklies, a 30-day login calendar. The fixed catalogue is
perhaps two weeks of play. After that the only recurring hook is the login
stipend.

And the dailies do not help, because **every one of the 12 daily templates asks
the player to do more of what they were already doing** (`missions.ts:248-262`):
kills, coins, wave reached, bosses, pickups, bombs, specials, altitude, elites,
flawless waves, time, hearts. Twelve volume counters. Not one asks for a
different *way* of playing. DR §11.5 made this point; what it could not have said
is what §3.2 now makes visible — **the game's three headline metrics are absent
from the entire meta layer**:

- `bestScore`, `totalScore`, `bestMult` and `grazes` are tracked in `Stats`
  (`progression.ts:85-89`) and banked every run (`GameScreen.tsx:2424-2427`).
- They appear in exactly two places: the menu's top-left BEST, and three rows of
  the game-over breakdown.
- They appear in **zero** of the 20 achievements, 10 milestones, 20 missions, 12
  daily templates or 8 weekly templates.
- They are absent from all 21 rows of the STATS screen (`Progress.tsx:251-292`),
  which still leads with "Best altitude" and "Total distance".
- They have no entries in `METRIC_LABELS` (`missions.ts:88-110`), so a
  challenge written against them today would render the raw key `bestMult` to
  the player.

The meta layer is still rewarding the pre-chain game. A player grinding
objectives is being trained, by the objective list, to ignore the scoring system.

---

### 3.6 — Two of the three ribbons are the same condition, and none of them is visible **[Broken]**

*Reward legibility*

Three problems stacked in one 20-line block.

**(a) FLAWLESS and FULL CHAIN are identical.** `ribbonsFor` (`chain.ts:216-231`)
awards `flawless` when `waveHits === 0` and `fullChain` when `chainHeld`. Both
flags are written in exactly one place — adjacent lines inside `takeHit`:

```
GameScreen.tsx:1076    s.waveHits += 1;
GameScreen.tsx:1081    s.waveChainHeld = false;
```

and reset together at `:1626-1627`. They are therefore logically equivalent. The
two ribbons always fire together or not at all: the award is always 500, never
300 and never 200. Two of the three ribbons carry no information.

**(b) FULL CHAIN does not measure what its name says.** `chain.ts:212` labels it
"chain never broke". A chain also breaks by *lapsing* — `tickChain` decays it to
0 whenever the window runs out, which per §3.2 happens between every wave and
between most kills past wave 12. That is not tracked. You can let the chain hit
zero six times in a wave and still be awarded FULL CHAIN.

**(c) None of the three is drawn.** `GameScreen.tsx:1606-1618` computes the
ribbons, adds `ribbonTotal(earned)` to the score, plays `waveClear`, fires a
Medium haptic — and renders nothing. The comment explains the removal ("the
banner was three gold slabs across the middle of the play field at the exact
moment a new formation arrives"), and that diagnosis is correct. The conclusion
is not: the answer to a badly-placed reward is to move it, not to delete it.
`VISUAL_SPEC.md` §9 even specifies the motion — a 180ms slam with the only
overshoot in the game.

This matters more than it looks, because **the ribbons are how the player learns
what the game wants**. Sky Force Reloaded's entire replay engine is four stated
medal objectives per level — not getting hit, destroying everything — declared
before the level and tracked during it. That game's "just one more go" is
manufactured by exactly this mechanism. This codebase already computes the same
thing, pays it, and hides it.

**What I'd do:** make the three ribbons genuinely independent (`flawless` =
no hits, `fullChain` = chain never reached 0, `speed` = under par), and draw them
in region B — where `WaveHeader` already lives and where the incoming formation
is not — as a slam-in row of small marks. Then put the same three marks on the
game-over breakdown as a per-run tally.

---

### 3.7 — The SPEED ribbon becomes unreachable at wave 6 **[Broken — tuning]**

*Reward legibility · difficulty curve honesty*

`WAVE_PAR_SECONDS = 18` (`chain.ts:70`), a single constant applied to every wave
regardless of how much HP that wave contains. Against the table in §3.4, the
time to clear a non-boss wave on a fresh install:

| wave | 6 | 7 | 8 | 12 | 19 |
|---|---|---|---|---|---|
| clear time | 20.5s | 23.0s | 28.8s | 49.9s | 73.0s |

**SPEED is unattainable from wave 6 onward on a fresh install**, and from about
wave 8 even on a lv3/lv3 ship. It never fires on a boss wave at any investment
below roughly lv8. So the third ribbon — the only one of the three that measures
*aggression* rather than *safety* — switches itself off permanently, six waves
into every run, and the player is never told it existed.

**Fix:** par must scale with the wave's content. `WAVE_PAR_SECONDS` should be a
function of the wave's total HP divided by the ship's resolved DPS — something
like `1.3 × (waveHp / stats.dps)`. Same constant, made relative.

---

### 3.8 — Death is a wall, and the last heart is nearly a beat **[Choice]**

*Failure and retry*

`GameScreen.tsx:2398`: hearts hit zero, `play('gameover')`, `hapticFailure()`,
`onGameOver(...)`, results screen. No death animation, no slow-motion, no final
explosion held for a beat, no second chance. The run's most emotionally loaded
moment is two function calls.

Credit where due: `LowHullPulse` at `:2910` fires at exactly one heart, which is
`VISUAL_SPEC.md` §6 delivered, and it is the right instinct. But the beat stops
there — no audio layer enters, no bullet outlining, and then the wall.

DR §13 specified the fix (Emergency Power: time at 0.1× for 3 real seconds, one
free revive, clears bullets). I would still do it, and I will add one argument
that document does not make: **with an 18-minute time-to-wave-20, losing a run to
one mistake at minute 14 is a much bigger loss than it was when runs were
shorter.** The longer you make runs, the more you owe the player a second chance.
Fix §3.4 and this gets less urgent; leave §3.4 and this becomes critical.

Also missing: **no resume countdown.** `PauseMenu`'s CONTINUE
(`GameScreen.tsx:3386`) drops you straight back into live bullets that have been
frozen mid-flight. A 3-2-1 is standard for a reason.

---

### 3.9 — Audio: the soundtrack is gone and the board is doing all the work **[Broken — regression]**

*Feedback and impact*

Covered in §0.2(a); here is what it costs the player. The sound board is genuinely
good — 26 samples, a kill-pitch ladder driven by the chain, per-gun shot voices
generated by a script so every character decision is a number, pickup voices by
family, a throttle on the graze tick. `sounds.ts` is one of the better files here.

But with music cut, **every single thing the player hears is an event**. There is
no floor, no tone, no sense of place, and nothing that changes when the boss
arrives. A boss fight sounds exactly like a wave, which — at 54 to 176 seconds —
is a long time to spend in an acoustically identical space. The game had a
per-sky soundtrack that made buying a background change how the game *sounds*;
that was a genuinely smart piece of design and it is sitting in `art-src/`.

Remaining gaps beyond music, all small:
- **No per-special SFX.** Five ultimates share `sys_special`
  (`sounds.ts:457-468`). The climax of each hull sounds the same.
- **No boss audio identity.** No entrance sting, no phase-transition sound, no
  low warning when the last phase begins — despite `bossPhaseIndex` making all
  three trivial to hook.
- **The graze tick is the game's most important skill signal** and it is
  deliberately (and correctly) quiet. Once music returns it will need a reserved
  frequency slot or it will vanish under the floor.

---

### 3.10 — Meta progression: the grind is priced for a game nobody will play that long **[Choice]**

*Does it respect the player's time?*

Upgrades are per-hull (`UpgradeBook` is `shipId → track → level`,
`storage.ts:57`). DR §9 argued this is an economy error and I agree with every
word, so I will not re-argue it. What that document did not do is price it.

Summing `upgradeCost` (`upgrades.ts:170-190`) across all levels of all nine tracks:

| | coins |
|---|---|
| Max every track on **one** hull | **34,345** |
| × 5 hulls (upgrades are per-ship) | **171,725** |
| Hull purchase prices on top | 1,010 |

A 5-minute run reaching wave 10 yields roughly 100–150 coins (bounties of 1–3 per
kill across ~56 enemies, a coin drop every `COIN_EVERY = 6`s of which you catch
maybe 60%, plus `BOSS_MINI_COINS = 6` and `BOSS_GIANT_COINS = 14`). That is
**~250 runs — around 20 hours — to max a single hull**, and roughly 100 hours to
max the game, *before* the per-ship reset means buying the 500-coin Nova hands
you a level-0 ship with 3 hearts instead of your fully-built Ironclad's 8.

Survivor.io's post-mortem is the cautionary tale here: D1 in the mid-40s, and the
structural diagnosis was that a rogue-like's grind-for-mastery and a
progression-curve's constant-escalation are fundamentally in tension — you either
progress too fast and break difficulty, or hold it back and make upgrades feel
unrewarding. This economy has chosen "hold it back", hard.

The right shape is DR §9's split — account-wide numeric tracks, per-hull mastery
earned by *flying* rather than buying — and it fixes three things at once: the
shop stops punishing purchases, the grind drops by 5×, and coins get a reason to
exist after maxing.

---

### 3.11 — Accessibility and one-handed use **[Choice]**

*Mobile usability*

Genuinely good, and rare:
- `useReduceMotion` is respected in `RollingNumber`, `ChipSlide` and the game
  loop — the OS setting is honoured rather than reimplemented.
- The FIRE button's three states each carry a **non-colour** signal (rim weight,
  glyph dimming, an inner ring, the attack being named) — `Effects.tsx:390-420`.
  That comment is the best accessibility reasoning in the codebase.
- The health bar is countable segments, not a proportion.
- `accessibilityRole` / `accessibilityLabel` on the menu's interactive elements.

Missing:
- **The game requires two hands and cannot be reconfigured.** FIRE is pinned
  bottom-right (`SPECIAL_BTN_RIGHT = 18`), BOMB bottom-left
  (`BOMB_BTN_LEFT = 18`). Steering is a drag anywhere. There is no left-handed
  mode, no way to move or merge the buttons, and — per §3.1 — you currently
  cannot even use a button *and* steer. One-handed play is impossible.
- **Settings contains audio and nothing else** (`Settings.tsx`). No haptics
  toggle (the motor is a real accessibility and battery concern and there is no
  off switch), no control-sensitivity option despite `DRAG_LERP` being a tuned
  number, no colourblind assist, no difficulty option.
- **Elite modifiers have no legend.** Eight elite types are distinguished by
  aura colour with no in-game key anywhere. `VISUAL_SPEC.md` §2b specified glyph
  badges; the auras moved to the threat family but the badges did not land, so
  colourblind players now have *three* similar reds and no other signal.
- **`ARCHETYPES[].desc` is still written and still never shown.** Fourteen
  player-facing descriptions sit in `enemies.ts` that no player will ever read.

---

## 4. WHAT I'D ADD

Five proposals. Each is scoped to the systems that already exist.

---

### 4.1 — Re-scale the chain to the content it actually has

**Idea.** `CHAIN_MAX_MULT = 3`, `CHAIN_CALLOUTS = [1.5, 2, 3]`, `hot` at `>= 2.5`,
and a HUD ceiling marker so the player can see the top of the ladder.

**Player motivation.** A visible ceiling you can actually touch. Right now the
player is climbing a ladder whose top eight rungs do not exist, and the game
never tells them where the top is.

**Gameplay value.** Immediately activates the chain callout float, `sys_chain`,
`CHAIN_HUD_HOT`, and the hot kill-float branch — four pieces of already-built
feedback that currently never fire. The moment-to-moment scoring loop becomes
legible for the first time.

**Systems touched.** `chain.ts` (4 constants), `Effects.tsx:115` (1 comparison),
`chain.test.ts` and `constants.test.ts` (assertions on the new ceiling).

**Cost.** Zero runtime, zero bundle, zero battery.

**Risk.** Low, and the risk is that it is the *wrong* fix — it makes the system
honest at a lower ceiling rather than raising the content to meet the ceiling.
Do it as a stopgap, and treat 4.2 as the real answer.

---

### 4.2 — Formation entrances, so the wave gap is not empty

**Idea.** DR §7.1's four entrance patterns (`SWEEP` / `SNAKE` / `DIVE` / `SPLIT`),
plus the chain's grace extended across a wave boundary.

**Player motivation.** The classic genre pleasure of watching a formation *fly*.
It is the highest ratio of perceived quality to cost available anywhere in this
project.

**Gameplay value.** This is the one item on the list that fixes three separate
findings. It removes the dead air of §2.5; it gives the chain something to kill
and something to graze across the boundary, which is what breaks the ×2 ceiling
in §3.2 *properly*; and it gives waves the identity §3.3 says they lack.

**Systems touched.** `spawnWave` (`GameScreen.tsx:2945`) gains an entrance-path
roll; `stepEnemy` (`enemies.ts`) gains a pre-`hold` travel state; `Card` gains an
entrance field. The formation's resting behaviour is unchanged, so nothing
downstream of `holdY` needs to know.

**Cost.** No new entities — the same ≤12 cards, on different paths. Negligible.

**Risk.** Medium. Enemies in transit are enemies whose collision and fire clocks
run in a state they have not run in before; the existing `MAX_ENEMY_BULLETS = 72`
ceiling protects the projectile side, but a `DIVE` entrance that passes the
player is a new contact case. Needs collision tests at each entrance.

---

### 4.3 — Ribbons that mean three different things, shown where the player is looking

**Idea.** Split the conditions properly (`fullChain` tracks actual chain lapses;
`speed` pars against the wave's HP ÷ the ship's DPS), and slam them into region B
on clear — the slot `WaveHeader` already owns, above the play field rather than
across it.

**Player motivation.** "I did that on purpose." A reward the player cannot see is
not a reward, and two rewards that always arrive together are one reward.

**Gameplay value.** This is the teaching mechanism for the entire skill layer.
Sky Force's four-medals-per-level is the proven form and this codebase is one
render away from it. It also makes `flawlessWaves` — already a lifetime stat and
already an achievement metric — mean something during play.

**Systems touched.** `chain.ts` (`ribbonsFor`, new `chainLapsed` flag),
`GameScreen.tsx:1606` (render instead of discard), `Effects.tsx` (a ribbon row),
`GameState` (one boolean).

**Cost.** Three text views for ~1 second per wave clear. Nothing.

**Risk.** Low — but it is the exact thing that was removed once for occluding the
play field, so the placement is the whole job. Region B, above `FORMATION_TOP = 150`,
never over the incoming formation.

---

### 4.4 — Boss identity: a name, an entrance, and a timer that matters

**Idea.** Halve boss HP and scale it against resolved DPS. Add a 2.5-second
invulnerable entrance with a name banner. Add a soft escape timer — the boss
flees with the reward rather than killing you.

**Player motivation.** Boss fights are the memory-formation events in an action
game. They are what a player describes to someone else. Right now there is
nothing to describe.

**Gameplay value.** The escape timer is the important half: it converts damage
upgrades from "shortens a chore" into "determines whether I get paid", which is
the first genuine risk/reward decision in the game and the first time the shop
means anything mid-run. And it caps the fight's duration independently of the
player's investment, which is what fixes §3.4's 6× spread between a fresh and a
maxed ship.

**Systems touched.** `constants.ts` (`BOSS_*_HP` take `ShipStats`),
`spawnWave`, `bosses.ts` (an entrance phase), `Effects.tsx` (`BossBar` name +
timer), `sounds.ts` (one entrance sting).

**Cost.** One more text layer during boss waves. Negligible.

**Risk.** Medium-high on balance. HP is currently the *only* thing making a boss
hard; halving it without the phases being tight enough turns the climax into a
speed bump. Tune phase `every` values down in the same pass.

---

### 4.5 — A game-over screen that tells the player what they gained

**Idea.** Add to the existing breakdown: quest/mission/achievement progress that
moved this run, the three ribbon counts, a comparison to the *previous* run (not
just the all-time best), and one "closest goal" nudge — "2 more elite kills:
Elite Problem".

**Player motivation.** This is the screen where the player decides whether to
press LAUNCH AGAIN. It should be the most persuasive screen in the game and it is
currently the most neutral.

**Gameplay value.** Makes the meta layer visible at the only moment it can
influence behaviour. A player who can see they are two kills from an unlock
plays again immediately; a player who has to go to a separate Quests screen to
find that out mostly does not.

**Systems touched.** `App.tsx:245` already computes the full delta via `applyRun`
— it just is not passed to `GameOverScreen`. `Screens.tsx:318`. `missions.ts`
needs one helper for "nearest incomplete objective".

**Cost.** Static screen. Nothing.

**Risk.** Low. Watch screen height — the breakdown is already six rows on a small
phone and this could push LAUNCH AGAIN below the fold, which would be worse than
the problem it solves.

---

## 5. WHAT I'D CUT OR SIMPLIFY

Five things. The section is mandatory and I did find real candidates.

---

### 5.1 — Cut two of the four currencies

`coins` (via `likes`), `crystals`, `chips`, `alloy`. Three of the four come from
the same activity (kill big things), are spent in the same place (upgrade gates
at `chipsFrom` / `crystalsFrom` / `alloyFrom`, `upgrades.ts:58-64`), and differ
only in drop rate. That is one currency expressed at three precisions.

It costs: a wallet row on every screen, three icons, three float types during
play, `Balance`/`Price`/`priceParts` plumbing through `progression.ts`,
`storage.ts` and every shop surface, and a new player's attention in minute one
for no return. `DESIGN_REVIEW.md` §10 reached the same conclusion; pricing the
upgrade tree in §3.10 makes it worse, not better, because the deep currencies
gate the exact levels nobody will reach.

**Cut to two:** coins for everything everyday, one prestige currency for boss
kills and gates. One rare currency reads as valuable; three read as clutter.

---

### 5.2 — Cut the unreachable half of the chain ladder

Per §3.2 and §4.1. `CHAIN_MAX_MULT = 10`, the callouts at 5/8/10, the `hot`
threshold at ≥5, `CHAIN_HUD_HOT`, `styles.chainMultHot`, and the hot branch of
the kill float are all unreachable code paths that exist to make the system look
deeper than it is. Either raise the content to meet them (4.2) or delete them.
Shipping a ceiling nobody can touch is worse than shipping a lower one.

---

### 5.3 — Cut `GUN_TIME`'s expiry, or cut the gun drop's randomness

`GIFT_EVERY = 9`s, `GUN_TIME = 16`s, four kinds, rolled at spawn. The player
flies into a lottery ticket every nine seconds and loses it sixteen seconds
later. Re-collecting the same kind stacks to `MAX_GUN_LEVEL = 4`, which is the
one genuinely good part — it is the only thing in a run that *accumulates*.

As built, the system is high-frequency, low-agency: it fires constantly, it never
asks a question, and its best property (stacking) is destroyed by its expiry.
Pick one:
- **Keep expiry, add choice:** spawn two drops side by side with different guns;
  the player takes one and the other despawns (DR §4). Same code path, same
  frequency, now a decision every nine seconds.
- **Keep the lottery, remove expiry:** a gun lasts until you pick up a different
  one. The stacking mechanic becomes a real in-run build.

The second is nearly free. The current arrangement is the worst of both.

---

### 5.4 — Cut or rewrite the daily challenge templates

Twelve templates, twelve volume counters (`missions.ts:248-262`). A daily that
asks you to do what you were going to do anyway is a checkbox, not a hook — and
these ones are actively counterproductive now, because they train the player to
value altitude, kills and pickups over the chain and the score.

The generation machinery (seeded, deterministic, baseline-offset for weeklies) is
genuinely well engineered and should be kept exactly as it is. Only the template
table needs replacing, with objectives that demand a different *way* of playing:
"reach ×3 chain", "graze 60 bullets", "clear 3 waves flawless", "beat a boss
without firing your special". Same code, same tests, entirely different
psychological effect — and `bestMult` / `grazes` / `bestScore` are already
tracked and already `HIGH_WATER_STATS`-aware. They just need `METRIC_LABELS`
entries.

---

### 5.5 — Cut the dead tuning constants

Small, but CLAUDE.md asks for it and each one is a trap for the next person who
tries to tune the game by grepping constants:

| Constant | `constants.ts` | Status |
|---|---|---|
| `SPECIAL_CHARGE_SEC` | :1348 | **Dead** — energy is earned now; nothing reads it |
| `RAMP_SECONDS` | :99 | **Dead** — difficulty ramps on altitude, not time |
| `BASE_ROW_INTERVAL` | :100 | **Dead** — waves are formation-based, not row-based |
| `MIN_ROW_INTERVAL` | :101 | **Dead** — same |

`SPECIAL_CHARGE_SEC = 5` is the dangerous one: it is the *old* design's headline
number, it still reads as authoritative, and the pickup guide's text near it was
already rewritten around the new model.

---

## 6. PRIORITIZED ROADMAP

Sorted by player impact per unit of effort. Effort is rough dev-days for someone
who knows this codebase.

### DO NOW — small, high-impact, mostly constants

| # | Item | § | Effort | Files |
|---|---|---|---|---|
| 1 | Fix FIRE/BOMB cancelling the drag; add a mid-drag input test | 3.1 | 0.5d | `GameScreen.tsx:758`, `GameScreen.test.tsx` |
| 2 | Re-scale the chain ceiling + callouts to what is reachable | 3.2 / 4.1 | 0.5d | `chain.ts:26-39`, `Effects.tsx:115`, `chain.test.ts` |
| 3 | Make the three ribbons independent and draw them in region B | 3.6 / 4.3 | 1.5d | `chain.ts:216`, `GameScreen.tsx:1606`, `Effects.tsx`, `types.ts` |
| 4 | Scale `WAVE_PAR_SECONDS` to wave HP ÷ ship DPS | 3.7 | 0.5d | `chain.ts:70`, `GameScreen.tsx:1608` |
| 5 | Halve boss HP; scale against resolved DPS | 3.4 | 1d | `constants.ts:652`, `GameScreen.tsx:2954`, `constants.test.ts` |
| 6 | **Decide on the soundtrack** — restore it, or write down why not | 0.2a / 3.9 | 0.5d–1d | `music.ts`, `mixer.ts`, `AudioMixer.tsx`, `assets/music/` |
| 7 | Add `bestScore` / `bestMult` / `grazes` to the STATS screen and `METRIC_LABELS` | 3.5 | 0.5d | `Progress.tsx:251`, `missions.ts:88` |
| 8 | Delete the four dead constants | 5.5 | 0.25d | `constants.ts` |
| 9 | Resume countdown on CONTINUE | 3.8 | 0.5d | `GameScreen.tsx:3386` |

**~6 days, and it changes what the player actually experiences more than
anything else on this list.** Items 2, 3, 4 and 5 together are the difference
between a game whose skill layer is invisible and one where it is the point.

### DO NEXT — real features, real value

| # | Item | § | Effort | Files |
|---|---|---|---|---|
| 10 | Game-over screen shows what progressed + nearest goal | 4.5 | 2d | `App.tsx:245`, `Screens.tsx:318`, `missions.ts` |
| 11 | Formation entrances + chain grace across the wave boundary | 4.2 | 4–5d | `GameScreen.tsx:2945`, `enemies.ts`, `types.ts` |
| 12 | Boss names, entrances, escape timer | 4.4 | 4d | `bosses.ts`, `constants.ts`, `Effects.tsx`, `sounds.ts` |
| 13 | Rewrite the daily templates around chain/graze/flawless | 5.4 | 1.5d | `missions.ts:248`, `missions.test.ts` |
| 14 | Gun drops: remove expiry *or* offer two (pick one) | 5.3 | 2d | `GameScreen.tsx:1794`, `constants.ts:519` |
| 15 | Per-special SFX + boss phase/entrance stings | 3.9 | 2d | `sounds.ts`, `scripts/make-*.mjs` |
| 16 | Emergency Power (one free revive per run) | 3.8 | 3d | `GameScreen.tsx:2398`, `types.ts`, `Effects.tsx` |
| 17 | Settings: haptics toggle, control sensitivity, left-handed layout | 3.11 | 2d | `Settings.tsx`, `storage.ts`, `constants.ts` |
| 18 | Elite glyph badges (finish `VISUAL_SPEC.md` §2b) | 3.11 | 2d | `Obstacle.tsx`, `Icon.tsx`, `enemies.ts` |

### WORTH CONSIDERING — bigger bets, later

| # | Item | § | Effort | Files |
|---|---|---|---|---|
| 19 | Wave-type deck (Swarm / Sniper Alley / Gauntlet / Bonus / Ambush) | 3.3 | 8–10d | `GameScreen.tsx`, `enemies.ts`, new `waves.ts` |
| 20 | Squad-template wave composition instead of per-enemy rolls | 3.3 | 4d | `enemies.ts:501`, `GameScreen.tsx:2977` |
| 21 | Account-wide Pilot tracks + per-hull Mastery (DR §9) | 3.10 | 8d | `progression.ts`, `upgrades.ts`, `storage.ts` + migration |
| 22 | Currency consolidation to two | 5.1 | 5d | `progression.ts`, `storage.ts` + migration, every shop surface |
| 23 | Enemy Codex — ship the 14 `desc` strings already written | 3.11 | 3d | new screen, `enemies.ts`, `progression.ts` |
| 24 | Daily Gauntlet: one seeded run a day (`seededRng`/`dayIndex` exist) | 3.5 | 8d | `missions.ts`, `GameScreen.tsx`, new screen |
| 25 | Bounded run structure — a win condition at wave N | 3.5 | 5d | `GameScreen.tsx`, `Screens.tsx`, `missions.ts` |

On #25: I would genuinely consider it. Brotato ends at wave 20 and counts it as a
win; Vampire Survivors ends at 30 minutes; Survivor.io at 15. An endless climb
with no terminus means no run ever ends in success, which makes every single
session end in failure. That is a lot of negative affect to ask a player to
absorb twenty times.

---

## 7. RISKS

**What could regress**

- **Boss HP (#5) is the highest-variance change here.** HP is currently the only
  thing making a boss hard. Halve it without tightening the phase cadence and
  wave 10 becomes a speed bump — you would trade a 112-second chore for a
  15-second non-event, which is the failure the phase rework was built to fix.
  Change `BOSS_PHASES[].every` in the same commit and playtest both.
- **The chain re-scale (#2) changes every score in the game.** `save.stats.bestScore`
  is a stored high-water mark (`progression.ts:185`). Existing players' bests
  were set under the old maths; new bests will be set under the new. Nothing
  breaks, but the leaderboard-in-waiting is now inconsistent and it will be worse
  to fix later than now.
- **Formation entrances (#11) touch the hottest path in the codebase.**
  `PERF_AUDIT.md` §2.4 already flags that `spawnWave` mounts up to 12
  `ObstacleView`s in one frame; entrance paths mean those 12 are also *moving*
  through a state that has no `holdY` anchor. Stagger the spawn (as
  `releaseCoins` already does) in the same change, and turn `PERF_OVERLAY` on
  before and after.
- **Currency consolidation (#22) and the Pilot/Mastery split (#21) both need
  save migrations.** `SAVE_VERSION` is still 2 (`storage.ts:38`) and the
  normalizers have absorbed every change so far. These two cannot be absorbed —
  they change what existing fields *mean*. `migration.test.ts` is 253 lines and
  good; extend it before touching either.

**What is fragile**

- **`GameScreen.tsx` is 3,423 lines** and holds the loop, the render, the input,
  and eleven closures over mutable run state. Every item in "do next" adds to it.
  Nothing here is *wrong* — the ref-based simulation is the right architecture
  for RN — but the file is past the size where a reader can hold it, and the
  next feature is the one that makes a subtle ordering bug cheap to introduce and
  expensive to find. I would extract the update pass into `src/game/step.ts`
  before #11, not after.
- **The telegraph class of bug is not solved, only documented.**
  `bosses.ts:76-87` records that a wind-up was faithfully simulated, asserted by
  passing tests, and never drawn — because `Obstacle`'s boss branch returned
  early. The ribbons (§3.6) are the same bug with a different shape: state
  computed, tests green, nothing on screen. There is no test in this repo that
  asserts *any* reward reaches the player. That is the single most valuable
  category of test this project does not have.
- **`assetBundlePatterns` remains a live trap.** `assetBundle.test.ts` guards it
  well in both directions, and the music move (§0.2a) is exactly the operation it
  exists to catch. If music comes back, the assets move back into `assets/music/`
  *and* the pattern list needs the directory — the test will tell you, but only
  if someone runs it.

**What lacks test coverage** (repeating §0.3 as a checklist)

1. Input under multi-touch — nothing presses a button mid-drag. **Highest value.**
2. Reward legibility — nothing asserts a ribbon, callout or float is rendered.
3. Attainability — nothing asserts a multiplier above ×2, or an unreachable
   `WAVE_PAR_SECONDS`, is a failing condition.
4. Boss time-to-kill — no bound on how long a fight lasts at base stats.
5. Music — both suites deleted with the feature.
6. `ENERGY_IDLE_PER_SEC`'s gate (`!enemiesOnBoard && charge < 1`): correct today,
   but a boss counts as "on board", so a player who arrives at a boss with an
   empty meter has no floor at all for up to 176 seconds. Untested and one
   refactor away from being a soft-lock on the mechanic.

---

## 8. The one-paragraph version

The rewrite worked. Score measures skill now, energy is earned, bosses have
phases, every hull has a fantasy, and the thing feels good under the thumb. Then
four constants hide all of it: a chain ceiling eight steps above anything
reachable, bosses that take 54 to 176 seconds to kill, a par time that switches
itself off at wave 6, and three wave bonuses that are two conditions and zero
pixels. Fix those four and the game you already built becomes visible to the
person playing it — that is about six days of work and it is worth more than
everything else in this document combined. After that, the real gaps are
structural rather than numeric: runs do not differ from each other, nothing
accumulates inside a run, and there is no reason to open the app tomorrow. And
somewhere between the last commit and this working tree, the music was deleted.
Find out why, because right now the game is silent.

---

## Sources

Competitive research, §1 / §3.5 / §3.10 / §4.3 / §6:

- [Vampire Survivors for 30-Minute Runs and Build Chaos — Delayed Respawnse](https://delayedrespawnse.com/games/vampire-survivors/)
- [Is 30 minutes the maximum time limit? — Steam Community](https://steamcommunity.com/app/1794680/discussions/0/3734079567829009940/)
- [Waves — Brotato Wiki](https://brotato.wiki.spellsandguns.com/Waves)
- [Brotato guide — Rogueliker](https://rogueliker.com/brotato-guide/)
- [Survivor.io: Will It Follow in Archero's Footsteps? — Naavik](https://naavik.co/deep-dives/survivorio-archeros-footsteps/)
- [Survivor.io Skills and Evolution Guide — BlueStacks](https://www.bluestacks.com/blog/game-guides/survivor-io/sio-skills-evolution-guide-en.html)
- [Review: Sky Force Reloaded — Digitally Downloaded](https://www.digitallydownloaded.net/2017/12/review-sky-force-reloaded-sony.html)
- [Sky Force Reloaded Review — Nintendo Life](https://www.nintendolife.com/reviews/switch-eshop/sky_force_reloaded)
- [Sky Force Reloaded Review — XBLAFans](https://xblafans.com/sky-force-reloaded-review-right-danger-zone-95787.html)
- [How Affordances Teach Game Mechanics Without Tutorials](https://salivity.github.io/game-development/article/how-affordances-teach-game-mechanics-without-tutorials)
- [Instructive Level Design — TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/InstructiveLevelDesign)
- [Onboarding Decides Your D1 — Playio](https://blog.playio.co/mobile-game-onboarding-retention)
- [Mobile Game Retention Benchmarks 2026 — Segwise](https://segwise.ai/blog/mobile-gaming-app-user-retention-strategies)
- [GameAnalytics mobile gaming benchmarks 2025 — GameDev Reports](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)
- [There Are Too Many Bullet Sponges In Action Games — Den of Geek](https://www.denofgeek.com/games/bullet-sponges-v/)
