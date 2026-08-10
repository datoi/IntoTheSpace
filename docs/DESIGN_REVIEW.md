# Into The Space — Production Design Review

**Reviewer role:** Senior Game Designer / Creative Director
**Scope:** Full design audit ahead of production. Design only — no implementation estimates.
**Build reviewed:** `feat/pickup-guide-and-perf` @ `d4bd0de`

---

## 0. Verdict

The **craft** here is above the genre average. The **design** is below it.

What I mean: the code shows a developer who cares about feel — forgiving hitboxes
(`OB_HIT` 36 against a 50px visual, a 6px inset on the player box), a telegraphed
sniper wind-up, elite auras that categorise a threat before you read it, a Nova
implementation that solves a real Android rasterisation problem to keep the blast
smooth. That instinct is the most valuable thing on this project. Keep it.

But underneath the polish, the game currently asks the player to make **almost no
decisions**, and rewards them with a score that **doesn't measure anything they did**.
A run of Into The Space is: drag your finger, watch your ship auto-fire, tap FIRE
every five seconds because it's free, occasionally drift into a pickup that fell on
a timer. The score goes up on a clock whether you play brilliantly or hide in a
corner. Then a boss appears that moves left and right.

That is a game a player finishes in one sitting and never opens again — not because
it's bad, but because there is nothing to come back *for*. There's no mastery
ceiling, no build to chase, no story of "that one run."

The good news: the systems layer is unusually well factored (archetypes as data,
boons as a catalog, a stat resolver boundary). This game is one design pass away
from being genuinely excellent, and almost every fix below is content and rules,
not architecture.

**Ship-readiness: not yet.** Fix P0 and P1 and I'd be proud to put this in front of
a publisher.

---

## 1. What's already good (do not touch)

I'm listing these so nobody "improves" them out of the build:

- **Hitbox generosity.** Visual > hitbox on hazards, hitbox < visual on the player.
  This is the difference between "I got hit" and "that's bullshit." Correct.
- **Elite auras + colour families.** `ELITES[].color` on an aura and boon colour
  families (cyan defensive / red offensive / violet control / gold economy) mean a
  player categorises a threat or a drop *before* reading it. This is real design.
- **The sniper wind-up ring.** A fast shot that's earned rather than a surprise.
- **Pickups falling slower than the world** (`PICKUP_FALL_SCALE` 0.55) so you have
  time to line up. Small, invisible, exactly right.
- **Gun drops wearing their own projectile art.** The player reads the reward
  before committing to the grab. Steal this pattern for everything.
- **The archetype/elite matrix.** 13 archetypes × 8 elites is a genuinely strong
  content engine. It is under-used, not badly built (see §6).

---

## 2. Priority order

| P | System | The problem in one line |
|---|---|---|
| **P0** | Scoring & core loop (§3) | The score is a clock. Skill is not measured. |
| **P0** | Run variety (§4) | Zero player decisions inside a run. No build, no draft. |
| **P0** | Bosses (§6) | 20% of content is one bullet sponge that sways. |
| **P1** | The FIRE special (§5) | A 5-second free ultimate, and the starter ship has none. |
| **P1** | Wave design (§7) | Every non-boss wave is structurally identical. |
| **P1** | Economy & per-ship upgrades (§9) | Buying a new ship makes you *weaker*. |
| **P2** | Retention spine (§11) | No reason to open the app tomorrow. |
| **P2** | Onboarding (§12) | First 60 seconds teach nothing; FIRE is locked. |
| **P2** | Game feel & audio (§14) | No music. No firing sound. No hit-stop. |
| **P3** | Currencies (§10) | Four currencies, one identity between them. |
| **P3** | Death & second chances (§13) | Death is a wall, not a beat. |

---

## 3. P0 — Scoring and the core loop

### Analysis
Score is altitude. Altitude accrues on a timer:

```
s.alt += (ALT_RATE_MIN + (ALT_RATE_MAX - ALT_RATE_MIN) * r) * altitudeMult * dt
```

120 m/s ramping to 300 m/s over 20,000m. Nothing the player *does* affects it except
the `scoreMult` boon (×1.5 for 10s). Kills don't score. Dodging doesn't score.
Precision doesn't score. Clearing a wave faster doesn't score.

Meanwhile *waves* are the actual content and difficulty axis, and they are surfaced
as a floating text on spawn and one line on the game-over screen.

### Problems
1. **The score measures time survived, not skill.** A player who hides at the bottom
   of the screen and never kills anything scores the same per second as one who
   flawlessly clears wave 30. That is the single most damaging design fact in the build.
2. **Two competing progress metrics** (altitude and wave) with no relationship, so
   neither carries weight. "BEST 24,000m" tells the player nothing about how well
   they played.
3. **No moment-to-moment feedback loop.** There is no number on screen that responds
   to a good play. Nothing rises when you're doing well and drops when you slip.
4. **No risk/reward.** There is never a reason to take a dangerous action.

### Why players lose interest
Arcade shooters retain on *mastery legibility*: the player needs to see themselves
getting better. Here they can't. Run 50 looks exactly like run 5 with a bigger
number on it, and the number was mostly the clock's doing. Within two sessions the
player concludes there is no skill ceiling, and they're right.

### Redesign — the Chain

Replace altitude-as-score with **Score = Σ (enemy value × chain multiplier)**, and
demote altitude to a *pace/depth* readout (it's a nice flavour HUD element, it's a
terrible score).

**The Chain meter:**
- Every kill adds `+1` to the chain and refreshes a **2.5s chain window**.
- Multiplier = `1 + floor(chain / 5) × 0.5`, capped at ×10 (chain 90).
- The window ticks down visibly as a thin ring or bar under the multiplier.
- **Taking a hit drops the multiplier to 1 immediately.** Not to zero — to 1. Losing
  a heart already hurts; a total wipe on top of it feels punitive and makes players
  play scared, which is the opposite of what you want.
- Letting the window lapse *decays* one step per 0.5s rather than resetting, so a
  brief lull isn't a cliff.

**Graze (this is the one that makes it sing):**
- Passing within ~22px of an enemy bullet without being hit = **graze**: +1 chain
  window refresh, small energy gain, a soft tick sound rising in pitch, and a
  one-frame white flick on the bullet.
- Suddenly the correct way to play is to fly *close to danger*. That converts the
  game's biggest existing asset — dense, readable bullet patterns — into the primary
  source of score and satisfaction. It also makes the existing bullet-hell
  archetypes (spiraller, gunner, layer) *desirable* rather than just annoying.

**Wave bonuses, shown as a slam-in banner on clear:**
- `FLAWLESS` (no hits) — already tracked as `waveHits`, currently only feeds a stat.
  Make it worth 3× the wave's base value and show it big.
- `SPEED` — wave cleared under a par time.
- `FULL CHAIN` — chain never broke.
Three ribbons on a wave clear is a dopamine beat you currently have zero of.

### Expected impact
This is the change that turns Into The Space from a toy into a game. Concretely:
session length up (players chase a chain), retention up (a leaderboard becomes
meaningful because the score is skill), and every existing system gets more
interesting for free — elites become chain fuel, bullet-dense enemies become graze
farms, the shield boon becomes "protect my ×8."

### Extra ideas
- **Chain milestone callouts** at ×3/×5/×10 with a voice-free but escalating audio
  sting. Cheap, enormously satisfying.
- **Risk bonus**: score per kill scales with how close to the top of the screen you
  killed it — rewards pushing forward instead of turtling at the bottom.
- **End-of-run breakdown screen** that itemises where the score came from (kills,
  chains, flawless waves, graze count, boss bonuses). Players who see the breakdown
  learn how to score higher. Players who learn come back.

---

## 4. P0 — Run variety: there are no decisions

### Analysis
Inside a run the player controls: (a) where the ship is, (b) whether to tap FIRE,
(c) whether to tap BOMB. Fire is automatic. Guns are RNG on a 9-second timer and
expire after 16s. Boons are RNG on a 13-second timer. Upgrades are chosen *before*
the run and are then fixed. Two runs with the same ship and the same upgrades are
mechanically identical apart from drop luck.

### Problems
1. **No build.** Nothing accumulates within a run. At wave 30 you're playing the same
   ship you were at wave 1, just against more enemies.
2. **Power comes from RNG, not choice.** A gun drop is a lottery ticket you fly into,
   and 16 seconds later it's gone. The player never *decides* anything about their
   power.
3. **No escalating fantasy.** The best runs in this genre end with the player
   absurdly overpowered — that's the payoff for surviving. Here, wave 40 has the same
   damage output as wave 4 plus whatever fell in the last 16 seconds.

### Why players lose interest
Replayability in a run-based game comes from **different runs**, and different runs
come from **choices under uncertainty**. With neither, the game has exactly one run
in it, played repeatedly at varying lengths.

### Redesign — Jump Points (roguelite draft)

**Every 5 waves — immediately after each boss dies — the run pauses on a JUMP POINT
screen offering 3 cards from a pool. Pick 1. It lasts the whole run and stacks.**

Rules that make this work:
- Cards are drawn weighted by rarity, and the pool respects what you've already
  taken (no offering "+Talon count" on a hull with no talons).
- Every card must change *how you play*, not just a number. A good test: if the card
  could be replaced by "+5% damage" without the player noticing, cut it.
- One of the three is always a **Curse** — a strong effect with a real cost. Curses
  are where the memorable runs come from.

**Starter pool sketch (~40 cards at ship, 12 shown here):**

| Card | Effect | Family |
|---|---|---|
| Split Barrel | Your bolt splits into 2 on impact, each 40% damage | Weapon |
| Ricochet | Shots that miss bounce off screen edges once | Weapon |
| Overheat | Fire rate ramps +80% while firing continuously, resets on a hit | Weapon |
| Piercing Rounds | Shots pass through the first enemy they kill | Weapon |
| Hull Spikes | Contact kills small enemies instead of costing a heart (2s cooldown) | Defensive |
| Second Wind | The first heart you lose each wave comes back on wave clear | Defensive |
| Deflector | Every 4th enemy bullet that would hit you is reflected as your shot | Defensive |
| Chain Feeder | Kills at ×5 or higher drop a coin | Economy |
| Scavenger | Boons last 60% longer | Economy |
| **Glass Cannon** | +100% damage. Max hearts −2. | **Curse** |
| **Blood Engine** | Fire rate scales with missing hearts, up to +120% | **Curse** |
| **Overdrive Core** | Special charges 3× faster. Every special use costs 1 heart. | **Curse** |

**Also fix gun drops:** replace the pure-RNG timer drop with a **choice**. When a
gun drop spawns, spawn **two side by side, falling together, with different guns**.
The player flies into the one they want and the other despawns. Same code path, same
frequency, but now it's a decision every nine seconds instead of a lottery.

Extend gun duration to 24s, and make **re-collecting the same gun during a run
permanently raise its base level for that run** — so a player who commits to lasers
gets a laser build.

### Expected impact
This single feature is the difference between ~3 sessions of interest and ~3 months.
Roguelite drafting is the most reliably retentive structure in mobile action right
now for exactly this reason: it manufactures a new story every run at near-zero
content cost, and it makes the *player* the author of it.

### Extra ideas
- **Draft rerolls** as a resource (1 free per run, more purchasable) — gives players
  agency over bad draws without removing the tension.
- **Synergy tags** on cards (Fire / Kinetic / Void). Three of a tag unlocks a bonus
  effect. Players hunting a synergy will replay dozens of times to hit it.
- Show the run's drafted cards as small icons on the pause screen — players love
  looking at their build.

---

## 5. P1 — The FIRE special is designed backwards

### Analysis
`SPECIAL_CHARGE_SEC = 5`. The meter refills passively, unconditionally, from empty,
in five seconds (down to 1.2s at max Energy Cell). The starter hull, **Ironclad, has
`special: 'none'`** — its button is locked and its meter is pinned at zero forever.

### Problems
1. **A 5-second ultimate is not an ultimate.** It's a second weapon on a short
   cooldown that the player must remember to tap ~12 times a minute. Tapping a
   button on cooldown for a guaranteed identical effect is admin, not climax.
2. **It's free.** Charge accrues from existing, not from playing. There is no
   decision in when to spend it, because another one is 5 seconds away.
3. **The starter ship has a dead button on screen.** This is the worst decision in
   the build from an onboarding standpoint. The first thing a new player sees is a
   locked, greyed, throbbing-less button telling them the interesting part of the
   game is behind a paywall of grind. The comment in the source says this is
   deliberate ("what its locked button is advertising"). It's advertising the wrong
   thing: it teaches *"I don't have the good stuff"* in minute one instead of
   *"this verb feels amazing — I want more of it."*

### Why players lose interest
Two failures at once: the mechanic is boring for owners (spam it) and absent for new
players (the majority, and the ones you're trying to hook).

### Redesign

**1. Earned energy, not passive.** Energy comes from play:
- +1.2% per kill, +0.4% per graze, +6% per flawless wave, +15% per boss phase break.
- No passive trickle at all, *except* a slow 1%/s floor while no enemy is on screen
  so a player can't be softlocked out of the mechanic during a quiet beat.
- Full charge should take **~18–25 seconds of good play**, not 5 seconds of existing.

**2. Overcharge.** The meter keeps filling past 100% to 200%. Firing at 100% is the
normal special; firing at 200% is an enhanced version (bigger, longer, adds a
secondary effect). Now there's a genuine decision every time the button lights up:
**spend now to survive, or bank it for the boss?** That decision, repeated, is the
whole game's texture.

**3. Give Ironclad a special.** Every hull gets one. Ironclad's should be
*defensive*, matching its "armour, not tricks" identity:

> **BULWARK** — A hard shell snaps around the hull for 4s. Absorbs everything, and
> every bullet it eats is fired back as your own shot.

This is excellent starter design: it teaches the button, it teaches that enemy
bullets are *material*, it rewards flying *into* danger (which supports the graze
system in §3), and it's strong without being an aim-free clear button. Then every
paid hull is a *different flavour* of a verb the player already loves — which is
what actually sells hulls.

**4. Make the specials read as different fantasies, not different damage numbers.**
Currently: phantom (triple output), talons (spray), spears (all-board damage), nova
(damage + clear shots). Three of the four are "deal damage in a shape." Re-cast:

| Hull | Special | Fantasy |
|---|---|---|
| Ironclad | **Bulwark** | Invincible juggernaut, reflects fire |
| Specter | **Phantoms** | Two ghosts fly with you — *and they're targetable decoys enemies shoot at* |
| Raptor | **Talons** | Sustained rake — *and each claw that kills refunds energy* |
| Valkyrie | **Spear Rain** | Board-wide judgment — *marks struck enemies to take +50% for 5s* |
| Nova | **Nova Burst** | Panic button / screen clear — the only one that erases bullets |

Each now has a *use case*, not just a bigger number. Players choose hulls by
playstyle instead of by price.

### Expected impact
Turns 12 mindless taps a minute into 3–4 genuinely tense decisions. Makes the shop
sell playstyles instead of DPS. And it fixes the first-session experience, which is
where you lose 60% of your installs.

### Extra ideas
- **Special-specific SFX and a 0.15s hit-stop on activation.** Right now every
  special plays `whoosh` + `ding`. Five ultimates, one sound. That's a wasted
  climax.
- Let the special button **charge-hold** for a different effect on some hulls
  (tap = burst, hold = beam). Adds depth without adding buttons.

---

## 6. P0 — Bosses are the weakest system, and they're 20% of the content

### Analysis
The entire boss design, from `spawnWave` and the loop:

- Wave % 10 == 0 → giant (HP `50 + wave×3`), wave % 5 == 0 → mini (HP `22 + wave×2`).
- Descends to `FORMATION_TOP + 10/30`.
- Then: `cx = W/2 + sin((t - t0) × 0.7) × W × 0.3`. It sways.
- Fires a fan of 2 (mini) or 3 (giant) aimed bullets on the global volley timer,
  `size × 1.3`.
- On death: shake, two particle bursts, a fan of 6/14 coins, currency floats.

That's it. Mini and giant are **the same fight at two scales** — a size slider, not
variety. There are no phases, no attack patterns, no telegraphs, no weak points, no
arena change, no entrance, no music, no death sequence, no health bar.

### Problems
1. **It's a bullet sponge with one attack.** The player's optimal strategy is to
   park under it and hold still. There is no fight.
2. **The player meets it every 60–90 seconds.** Repetition of a non-event is worse
   than no event: it actively teaches the player that the game's climaxes are hollow.
3. **No health bar.** The player can't tell if they're winning. Boss fights live or
   die on the tension of a draining bar.
4. **No reason to be good at it.** Kill it fast or slow, the reward is identical.
5. **"Perfect boss" is tracked but never surfaced during the fight** — the tension
   of "I'm still untouched, 30% to go" is sitting right there in `bossDamageTaken`,
   unused.

### Why players lose interest
Boss fights are the memory-formation events in an action game. They're what a player
describes to a friend. Currently there is nothing to describe. A player who has
fought your boss twice has seen everything the game's climax has to offer, at wave 10.

### Redesign — a boss cast with phases

**Structure every boss the same way, vary the content:**

- **Entrance (2.5s):** HUD pulls back, music ducks to a single held note, the boss
  looms in from the top with a name banner slamming in — `⟨ THE WARDEN ⟩` and a
  subtitle. The player cannot be hit during the entrance. This costs almost nothing
  and buys enormous perceived production value.
- **Health bar:** top of screen, segmented into pips by phase, with a lagging
  "damage taken" ghost bar behind it so big hits read as big.
- **Three phases at 100/66/33%.** Each phase transition: screen-wide white flash,
  the boss screams (pitch-shifted), a brief invulnerable radial burst that forces
  the player to move, then a **new attack pattern**. Phase breaks grant +15% energy.
- **A soft timer.** `ESCAPING IN 45s` — if it runs out the boss flees with the
  crystal. It doesn't kill you, it denies you the reward. This makes damage upgrades
  and drafted weapon cards *matter*, and creates real urgency without cheap deaths.
- **Weak points.** A glowing sub-target that takes 3× damage and moves between
  phases. Turns "hold still and hold fire" into aiming.
- **Death sequence (1.2s):** time scales to 0.35, the boss cracks apart in 3 stages
  with escalating explosions, THEN the coin fan bursts outward. Hold the game-over
  of the boss for a full beat — this is the payoff moment of the last 90 seconds.

**A cast of six, rotating (not scaling):**

| Boss | Identity | Signature pattern |
|---|---|---|
| **The Warden** | Rotating shield panels | Only the gap between panels takes damage; panels rotate faster each phase |
| **Hive Mother** | Spawner | Continuously births drones; her core only opens *while* spawning |
| **Dreadlance** | Zoner | Sweeping arena-wide lasers with clearly telegraphed safe lanes |
| **Twin Fangs** | Two-body | Two half-HP bosses; killing one enrages the other |
| **The Gorge** | Grappler | Pulls the player toward it; you fight the drag while dodging |
| **Null Choir** | Bullet-hell | Pure pattern boss — no aimed shots, geometric curtains to graze through |

Assign by wave: mini bosses (wave %5) are single-phase versions from the same cast;
giants (wave %10) are full three-phase. Now "mini vs giant" is a *fight length*
difference on a *varied* cast, not a scale slider on one non-fight.

### Expected impact
Bosses go from the weakest 20% of the experience to the reason people play. This is
also your best marketing asset — boss fights are what a store video shows.

### Extra ideas
- **Boss Codex** with per-boss best time and a "perfect kill" seal. Players will
  grind for the seal.
- **A weekly Boss Rush mode**: five bosses back to back, one life, leaderboard.
  Enormous retention value from content you'd already have built.
- Give each boss **one line of taunt text** on entrance. Cheapest personality in
  games.

---

## 7. P1 — Wave design is flat

### Analysis
```
count = min(12, 3 + (wave - 1))
```
Rows of up to 5, centred, descending to `FORMATION_TOP + row × 66`, then hold
forever until killed. Every non-boss wave, from wave 1 to wave 100, is structurally
the same event: *N enemies drop in and sit there.* The only variables are N, HP
(`2 + wave×0.6`), and the archetype roll.

### Problems
1. **No formation identity.** Enemies arrive in a grid and hold. Nothing arcs,
   sweeps, snakes, or flanks. The classic genre pleasure of watching a formation fly
   a *pattern* is entirely absent.
2. **Enemies never advance.** They hold at the top indefinitely. There is no
   pressure, no clock, no fail-forward — a patient player is never punished. This is
   why the game feels slack even when the screen is busy.
3. **No pacing.** No calm beats, no crescendos, no breathers. A good shooter
   breathes: tension, release, tension, release. This one is a flat hum.
4. **No wave types.** One structure for the whole game.

### Why players lose interest
Difficulty rises, but *variety* doesn't. The player's brain stops registering new
information around wave 8 and the rest is arithmetic.

### Redesign

**1. Formation entrances.** Enemies fly a path in, *then* settle. Four entrance
patterns, rolled per wave: `SWEEP` (arc in from one side), `SNAKE` (single-file
serpentine), `DIVE` (drop past the player and climb back to slots), `SPLIT` (two
columns from both edges crossing at centre). Purely cosmetic to the fight; enormous
to the feel. This is the single highest ratio of perceived-quality to design-cost in
this document.

**2. Slow formation advance.** The whole formation creeps downward at ~6px/s,
resetting on wave clear. Stalling is now punished, urgency is constant, and the
existing `holdY` model barely changes.

**3. A wave-type deck.** Cycle so no two consecutive waves are the same shape:

| Wave type | Shape |
|---|---|
| **Formation** | Today's wave. The baseline. |
| **Swarm Rush** | 20 fragile enemies streaming down fast, no formation. Chain fodder — a power fantasy beat. |
| **Sniper Alley** | 4 snipers, widely spaced, heavy telegraphs. A precision/dodging beat. |
| **Gauntlet** | No enemies to kill — survive 20s of a scrolling minefield. A pure dodging beat. |
| **Hunt** | One elite with 4 escort drones. A focus-fire beat. |
| **Bonus** | No threats. A dense coin/boon field on a 12s timer. **The breather.** |
| **Ambush** | Enemies enter from the bottom and sides. Breaks the player's habit. |

**Pacing rule:** never two high-intensity waves in a row; always a Bonus or Gauntlet
in the two waves *before* a giant boss so the player enters the climax rested and
topped up. Deliberate pacing is what separates a designed game from a generated one.

### Expected impact
Waves stop being a spreadsheet. Combined with §3's wave-clear ribbons, each wave
becomes a small self-contained satisfying unit — which is what makes "one more wave"
happen at 1am.

### Extra ideas
- **Wave progress pips** in the HUD (`▮▮▮▯▯ 3/5`). Players need to see the end of
  the current unit of work.
- **Named wave milestones** every 10 waves with a sector name ("ENTERING THE
  SCATTER"), a background crossfade, and a difficulty step. Gives the endless
  climb a sense of *place*.
- **Elite-only waves** at wave 25+, rare and terrifying and lucrative.

---

## 8. Enemies and elites — good engine, under-driven

### Analysis
13 archetypes × 8 elites is a strong matrix, well built. But:
- `rollArchetype` is pure weighted RNG per enemy. A wave is a random bag, so it has
  no *character* — you never fight "a sniper nest," you fight "four random things."
- Elite chance caps at 32% (`0.03 + wave × 0.012`).
- **The archetype descriptions in `ARCHETYPES[].desc` are never shown to the
  player.** There's a written codex sitting in the source that nobody will ever read.
- `orbit` is defined as a `MoveKind` and implemented in `stepEnemy` but **no
  archetype uses it** — dead content.
- `missile` is defined as a `FireKind` and implemented but **no archetype uses it**.

### Redesign
1. **Compose waves from squad templates, not per-enemy rolls.** A wave picks a
   *theme* ("Sniper Nest": 3 snipers + 2 tanks; "Swarm": 8 scouts; "Mixed Patrol":
   the current random bag) and fills from a restricted pool. Same content, but now
   each wave has an identity the player can recognise and counter. Recognition →
   strategy → mastery.
2. **Ship the codex.** An Enemy Codex screen that fills in as you kill one of each
   archetype/elite, showing the existing `desc`, its behaviour, and your kill count.
   Completion rewards. This is a free retention feature already 80% written.
3. **Use `orbit` and `missile`.** Two archetypes are sitting unbuilt in your own
   vocabulary: a **Sentinel** (orbit + missile — circles its post lobbing slow
   seekers) and a **Warden Drone** (orbit + spiral). Free variety.
4. **Elite telegraphs on spawn.** When an elite enters, a brief tag floats above it
   with its modifier name in its aura colour (`⟨REGENERATING⟩`). The player currently
   has to learn eight aura colours with no legend. Teach in-context, once per run per
   type.
5. **Give the tank a reason to exist.** `hp: 3.4` and a 3-round burst is "the same
   fight but longer," which is the boring kind of difficulty. Give it a *frontal
   shield* that only breaks from the sides or from a bomb — now it changes how the
   player positions.

---

## 9. P1 — Economy: per-ship upgrades punish the shop

### Analysis
`UpgradeBook` is `shipId → track → level`. Upgrade levels are per-hull. The stated
reason (in the source) is "that's what keeps coins valuable long after every ship is
unlocked."

### Problems
**This is a serious economy design error, and it's worth being blunt about it.**

A player grinds their Ironclad to level 6 across several tracks. They save 500 coins
— the game's single largest purchase — and buy the Nova. They equip it and it is
**dramatically weaker than the ship they already had**: level 0 damage, level 0 fire
rate, 3 starting hearts instead of 8, no crit, no bombs.

The game charged its highest price to make the player worse. They will feel cheated,
correctly. Then one of two things happens:
1. They switch back to the Ironclad, and the ship shop — along with all five
   specials, your best content — is dead to them forever; or
2. They regrind from zero, resent it, and churn.

Compounding this: **9 tracks × 5 hulls = 45 tracks to fund**, with exponential costs
(`growth` 1.4–1.7). The total cost to max the game is astronomical, which reads as
either a grind wall or an IAP shakedown. Neither is what you want in a premium-feeling
arcade shooter.

### Redesign — split the two jobs

**Account-wide "Pilot" tracks** (permanent, shared by every hull) — the linear
numeric ones, which are boring precisely because they're *supposed* to be a smooth
baseline: `damage`, `fireRate`, `hull`, `critChance`, `critDamage`, `bulletSpeed`,
`agility`. Keep the existing costs and the chips/alloy gating. Buying a new hull
now *keeps* your investment, so the shop becomes exciting instead of punitive.

**Per-hull "Mastery"** — short (5 levels), earned through *use* rather than bought:
flying a hull earns Mastery XP for that hull. Each level grants a hull-*unique*
perk, never a generic stat:

> **Nova Mastery** — L1: +20% Nova radius · L2: Nova leaves a burning field for 3s ·
> L3: killing 8+ enemies with one Nova instantly refunds 30% energy · L4: Nova
> knocks back survivors · L5: **Overcharged Nova fires twice.**

This gives players a reason to fly *each* hull (chasing mastery), makes hulls feel
distinct at the top end, and costs no coins — so it never competes with the coin sink.

**Where do coins go, then?** Coins need a *repeatable* sink or they inflate:
- Jump Point **draft rerolls** (in-run, consumable).
- **Pre-run loadout**: pick 1 of 3 starting boons or start with a banked special —
  a small pre-run gamble that costs coins each run. This is the ideal endless sink:
  repeatable, optional, and it makes coins meaningful *forever* without gating power
  behind a wall.
- Cosmetics: trails, hull skins, kill effects, background packs.

### Expected impact
Fixes the highest-value purchase in the game from a punishment into a reward.
Directly lifts ship purchases, which lifts engagement with specials, which is your
differentiation.

---

## 10. P3 — Four currencies, one identity

### Analysis
- `coins` — everywhere.
- `crystals` — elites + giant bosses.
- `chips` — mini bosses + deep waves.
- `alloy` — giant bosses only.

Three of the four come from the same activity (kill big things), are used in the
same place (upgrade costs), and differ only in drop rate. That is one currency
expressed at three precisions. It costs HUD space, a wallet row on every screen,
and player cognitive load, and it returns nothing.

### Redesign
**Two currencies and one non-fungible drop.**
- **Coins** — everything everyday. Kills, pickups, bosses.
- **Cores** — the prestige currency. Only from boss kills, perfect clears and
  milestone waves. Gates the top 3 levels of every Pilot track and hull unlocks.
  One rare currency reads as valuable; three read as clutter.
- **Blueprints** — *not* a counter. A named, non-fungible drop that unlocks a
  *thing*: a new draft card, a new gun, a new hull skin, a boss key. "You found:
  **RICOCHET BLUEPRINT**" is a memorable event. "+3 🔩" is not. This is the single
  biggest upgrade available to your reward feel, and it costs one screen.

---

## 11. P2 — The retention spine is missing

### Analysis
What exists: a 30-day login calendar, 3 daily challenges, 2 weeklies, 20 missions,
21 achievements, 10 milestones. The generated-challenge system with baseline
offsetting is genuinely well engineered.

What's missing: **any reason to open the app tomorrow that isn't a coin stipend.**
The achievement/mission lists are finite and one-shot — once claimed, gone. There
are no leaderboards, no seasons, no events, no social layer, no run history.

### Problems
1. Dailies are the only recurring hook, and they're all *"do the thing you were
   already going to do, N times."* They add no novelty, only a checkbox.
2. Achievements are a claim list, not a pursuit. 51 fixed goals is maybe two weeks.
3. Nothing compares the player to anyone else. In a score-based arcade game, that's
   leaving the primary retention mechanic on the table.

### Redesign, in order of value

**1. The Daily Gauntlet (highest value single feature after the P0s).**
One fixed-seed run per day: same waves, same drops, same draft offers, for every
player in the world. One attempt (a second costs coins). A leaderboard — global,
plus friends. This is *the* reason to open the app daily, it's inherently fair
because everyone plays the identical run, and your seeded-RNG infrastructure
(`seededRng`, `dayIndex`) already exists for it.

**2. Seasons (6 weeks).** A 50-tier ladder driven by score earned across the season.
Free track + premium track. Rewards are cosmetics, draft cards, Cores, and one
exclusive hull per season. Seasons give the metagame a heartbeat and a deadline,
which is what converts "I'll play sometime" into "I'll play tonight."

**3. Weekly Boss Event.** One boss from the cast, buffed, 3 attempts a week,
ranked by damage dealt. Uses content you already have.

**4. Ship the Codex** (§8) — enemies, elites, bosses, draft cards, hulls. A
completion metre is a quiet, extremely durable retention hook.

**5. Redesign dailies to demand *variety*, not volume.** Instead of "40 kills,"
ask for things that make the player play differently: *"Clear 3 waves without
firing your special," "Graze 40 bullets," "Beat a boss using only the starter gun,"
"Finish a run with 3 curse cards."* Same system, same code, entirely different
psychological effect — these teach the game instead of counting it.

---

## 12. P2 — Onboarding and the first session

### Analysis
The menu presents four lines of instructional text and an optional pickup-guide
modal. LIFT OFF drops the player straight into wave 1 with a locked FIRE button, an
empty bomb-adjacent HUD, and no scripting.

### Problems
1. **Text is not teaching.** Nobody reads the menu blurb.
2. **The FIRE button is locked in the first session** (§5) — the game leads with
   what the player can't do.
3. **No scripted first minute.** The most important 60 seconds in the product are
   left to RNG. A bad drop roll means a new player's first run has no gun pickup, no
   boon, and no boss.
4. **The first boss is at wave 5** — a good instinct — but it's the boss described
   in §6, so the first "wow" moment isn't one.

### Redesign — a scripted first run (~90 seconds)
- **Wave 1:** 3 drones, no return fire. A coin trail arcs across the screen to teach
  movement by making the player *want* to follow it. No text.
- **Wave 2:** a gun drop lands directly in the player's lane. They can't miss it.
  They feel powerful. First `FLAWLESS` ribbon fires here — teaches the scoring goal.
- **Wave 3:** first return fire, 2 slow aimed shots, and the first **graze** triggers
  a big callout: `GRAZE +CHAIN`. Teaches the core skill.
- **Wave 4:** energy fills to full and the FIRE button lights up with a one-time
  hand-pointer pulse. Player fires **Bulwark**. Enemy bullets reflect and kill three
  enemies. This is the hook moment.
- **Wave 5:** a one-phase mini boss, tuned so a competent first-timer wins. Full
  entrance banner, health bar, kill-cam death.
- **End of run 1:** grant the **Specter** hull free. The player now owns two hulls
  and a special they love, before they've spent a coin. The shop is now a place
  they've already received something from, not a wall.

### Expected impact
This is where installs are won or lost. A scripted, guaranteed-good first 90 seconds
is standard practice for a reason.

---

## 13. P3 — Death is a wall, not a beat

Hearts hit zero → `gameover` sound → results screen. That's the end of every run in
the game, and it's abrupt.

**Redesign:**
- **The last-heart beat.** At 1 heart: screen edges pulse red, a low heartbeat layer
  enters the music, enemy bullets get a subtle outline for readability. The player
  should *feel* the danger, and be given the tools to survive it.
- **Emergency Power (once per run, free).** At zero hearts, time freezes at 0.1×
  for 3 real seconds and a single prompt appears: `EMERGENCY POWER`. Tap it: 1 heart,
  2s invulnerability, all bullets cleared. Don't tap: the run ends. It's free, it's
  once, and it turns the most negative moment in the game into the most exciting
  one. (If you later monetise continues, a *second* revive is the natural, honest
  place for it — never the first.)
- **A results screen that tells a story.** Currently: distance, best, wave, coins.
  It should show the **score breakdown** (§3), the drafted build, longest chain,
  graze count, bosses killed, and one **"best moment"** callout ("Longest chain: ×9
  on wave 14"). Players screenshot and share results screens that say something
  about them.

---

## 14. P2 — Game feel and audio

The visual feel work is good. The audio is the least developed system in the build
and it's carrying half the perceived quality of an action game.

### Current state
Nine sound files. **No music at all.** **No firing sound.** Enemy death is always
`playPop(3)` — a single constant pitch, despite five pre-pitched samples existing in
the asset folder. All five ship specials share `whoosh` + `ding`. Bosses have no
audio identity.

### Redesign
1. **Music, layered.** Three stems that mix in and out on game state: exploration,
   combat, boss. Even one 90-second loop per state transforms perceived production
   value more than any visual work you could do.
2. **A firing sound.** The player's primary action is currently silent. Make it
   quiet, short, and slightly randomised in pitch so it doesn't fatigue.
3. **The kill-streak pitch ladder.** You already ship `pop1`–`pop5`. Map kill pitch
   to the chain multiplier: consecutive kills rise in pitch and reset on chain break.
   This costs nothing, uses assets already on disk, and is one of the most
   satisfying feedback mechanisms in the genre. **Do this one first.**
4. **Hit-stop.** Freeze the simulation for 45ms on a kill, 80ms on an elite kill,
   150ms on a boss phase break, 250ms on a boss kill. The cheapest, most dramatic
   "this feels expensive now" change available to you.
5. **Per-special SFX**, per-boss entrance stings, a wave-clear chord that rises with
   the wave number, a distinct low warning tone when a boss reaches its last phase.
6. **Haptics** are used well already. Add a soft tick on graze — a physical
   sensation for the skill mechanic will make it addictive.

---

## 15. Suggested phasing

**Phase 1 — Make it a game.** Chain + graze scoring, wave-clear ribbons, hit-stop,
kill-pitch ladder, firing sound, Ironclad gets Bulwark, energy becomes earned +
overcharge. *These are small, and together they change everything about how the
game feels to play.*

**Phase 2 — Make it replayable.** Jump Point drafting (~20 cards to start),
dual gun-drop choice, wave-type deck, formation entrances, slow formation advance.

**Phase 3 — Make it memorable.** The boss rework: phases, health bars, entrances,
kill-cams, and three of the six-boss cast.

**Phase 4 — Make it retain.** Pilot/Mastery upgrade split, currency
consolidation, Daily Gauntlet + leaderboard, Codex, scripted first run.

**Phase 5 — Make it a business.** Seasons, weekly boss event, cosmetics economy,
Emergency Power and the results-screen redesign.

---

## 16. The one-paragraph version

Into The Space is built with real care and currently plays like a screensaver you
can lose. The three things standing between it and a game people talk about are:
**a score that measures skill** (chain + graze), **decisions inside a run**
(roguelite drafting), and **bosses that are actually fights**. Everything else in
this document is refinement. Those three are the product.
