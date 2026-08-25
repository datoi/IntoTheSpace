import { createAudioPlayer, AudioPlayer } from 'expo-audio';

/**
 * Background music — one pair of tracks per sky.
 *
 * The sky a player buys and equips is the most personal choice in the game and
 * the only one they look at for an entire run, so it is the right thing to
 * hang a soundtrack on: picking a background picks how the game SOUNDS, not
 * just how it looks, and that turns a cosmetic purchase into something you can
 * hear from the first second of the run.
 *
 * Two tracks rather than one, because a single ~32 s loop is recognisable
 * within one run and grating by the third. Two alternating gives ~65 s before
 * anything repeats, at no extra machinery — when one finishes, the other
 * starts, forever.
 *
 * Kept OUT of sounds.ts on purpose. The sound board is many tiny buffers all
 * held in memory and fired by the game loop; music is one long stream with a
 * lifecycle (start, pause, resume, stop) tied to the run rather than to
 * events. Sharing a module would mean one set of rules for two problems.
 */

/**
 * Which pair each sky plays, keyed by BackgroundDef.id.
 *
 * Deliberately a table here rather than a field on BackgroundDef: this is the
 * only place that requires an mp3, and putting require()s of 6 MB of audio in
 * constants.ts would pull the whole music bundle into every module that reads
 * a colour from it. `music.test.ts` asserts this stays in step with
 * BACKGROUNDS, so a new sky cannot ship silent.
 *
 * Pairing is by mood, not by order:
 *  • violet  — the free starter, so the calmest pair. It is the first thing a
 *              new player hears and it should invite rather than press.
 *  • azure   — drifting, spacious; the reverb-heavy pair.
 *  • ember   — the hot sky gets the driving pair.
 *  • jade    — alien green, so the two most synthetic/unsettled tracks.
 *  • rosette — bloom: one percussive, one distorted, the busiest pair.
 *
 * `againsttheclock` and `doom` are deliberately NOT here. They are held back
 * in art-src/music/ for the sixth sky, and kept out of assets/ so the bundle
 * does not carry 1.3 MB of audio nothing plays — see the asset pipeline note
 * in CLAUDE.md.
 */
export const BG_MUSIC: Record<string, [number, number]> = {
  violet: [require('../../assets/music/arrival.mp3'), require('../../assets/music/void.mp3')],
  azure: [require('../../assets/music/bass.mp3'), require('../../assets/music/perc1reverb.mp3')],
  ember: [require('../../assets/music/hardkick.mp3'), require('../../assets/music/perc3.mp3')],
  jade: [require('../../assets/music/glitchy.mp3'), require('../../assets/music/perc2.mp3')],
  rosette: [require('../../assets/music/perc1.mp3'), require('../../assets/music/distort.mp3')],
};

/**
 * Music sits well under the effects.
 *
 * The sound board carries the information — kills, pickups, saves — and music
 * is the floor it stands on. At parity the two fight, and the loser is always
 * the one the player actually needs to hear.
 */
const MUSIC_VOLUME = 0.35;

/** The currently mounted pair, and which half of it is playing. */
let players: AudioPlayer[] = [];
let index = 0;
let currentBg: string | null = null;
let subscription: { remove(): void } | null = null;

function releaseAll(): void {
  subscription?.remove();
  subscription = null;
  for (const p of players) {
    try {
      p.pause();
      p.remove();
    } catch {
      // A player that is already gone is not a problem worth crashing a run for.
    }
  }
  players = [];
  index = 0;
  currentBg = null;
}

/** Start the half at `index`, and arm the handoff to the other half. */
function playCurrent(): void {
  const p = players[index];
  if (!p) return;
  try {
    subscription?.remove();
    // Advance on the track's own end event rather than on a timer. A timer
    // would have to know each file's duration and would drift against real
    // decoding; didJustFinish is the player telling us, which is exact and free.
    subscription = p.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        index = (index + 1) % players.length;
        playCurrent();
      }
    });
  } catch {
    // No handoff means this track plays once and the pair stops rotating —
    // degraded, but a run with quiet music beats a run that crashed. Kept in
    // its own try so a missing listener API cannot stop the track below from
    // playing at all.
    subscription = null;
  }
  try {
    p.volume = MUSIC_VOLUME;
    p.seekTo(0);
    p.play();
  } catch {
    // Music failing is never worth interrupting a run.
  }
}

/**
 * Begin (or switch to) the pair belonging to `bgId`.
 *
 * Re-calling with the sky already playing is a no-op, so this is safe to drive
 * from an effect that re-runs: restarting the track every time a component
 * re-rendered would be its own bug, and an audible one.
 */
export function startMusic(bgId: string): void {
  if (currentBg === bgId && players.length) {
    resumeMusic();
    return;
  }
  releaseAll();
  const pair = BG_MUSIC[bgId];
  if (!pair) return; // A sky with no pair simply plays nothing.
  try {
    players = pair.map((src) => createAudioPlayer(src));
  } catch {
    players = [];
    return;
  }
  currentBg = bgId;
  index = 0;
  playCurrent();
}

export function pauseMusic(): void {
  try {
    players[index]?.pause();
  } catch {
    // ignore
  }
}

export function resumeMusic(): void {
  try {
    const p = players[index];
    if (p && !p.playing) p.play();
  } catch {
    // ignore
  }
}

/**
 * Stop and release.
 *
 * Releasing rather than merely pausing matters: these are multi-megabyte
 * decoded streams, and a run that ends is a run whose music will not be
 * resumed. Holding both players alive across every run of a session is how a
 * low-end device runs out of audio memory an hour in.
 */
export function stopMusic(): void {
  releaseAll();
}

/** Which sky's pair is mounted, or null. Exported for tests. */
export function currentMusicBg(): string | null {
  return currentBg;
}
