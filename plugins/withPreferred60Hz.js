const { withMainActivity } = require('@expo/config-plugins');

/**
 * Ask Android for a 60 Hz display mode.
 *
 * --- The bug this fixes ---------------------------------------------------
 *
 * The loop drops vsyncs that arrive sooner than FRAME_MIN_MS (1000/70 ≈
 * 14.29 ms) so a high-refresh panel doesn't simulate and repaint twice as often
 * — and twice as hot — as a 60 Hz one. Thresholding on elapsed time can only
 * ever accept a WHOLE number of vsyncs, though, and on a 90 Hz panel the two
 * candidates are 11.11 ms (rejected, under the threshold) and 22.22 ms
 * (accepted). So the game ran at 45 fps:
 *
 *     60 Hz  → every vsync        → 60 fps  ✅
 *     90 Hz  → every 2nd (22.2ms) → 45 fps  ❌
 *     120 Hz → every 2nd (16.7ms) → 60 fps  ✅
 *     144 Hz → every 3rd (20.8ms) → 48 fps  ❌
 *
 * No value of FRAME_MIN_MS fixes that: 90 is not a multiple of 60, so the
 * achievable rates on that panel are 90, 45 or 30 and none of them is 60. 90 Hz
 * is the most common refresh rate in the Android mid-range, so this was most
 * likely the single biggest hit to how the game FELT.
 *
 * The fix has to happen below the JS: ask the OS to run the display itself at
 * 60 Hz. Then rAF fires at a clean 60, FRAME_MIN_MS accepts every vsync, and
 * the panel draws 60 rather than 90 times a second — which also cuts display
 * and compositor power, so it helps the thermals the frame cap was added for in
 * the first place.
 *
 * iOS needs nothing: rAF is already capped at 60 there unless an app opts into
 * ProMotion via CADisableMinimumFrameDuration, which this one does not.
 *
 * --- Note ------------------------------------------------------------------
 *
 * `preferredRefreshRate` is a REQUEST. A device with no 60 Hz mode keeps its
 * own rate and the old 45 fps behaviour, which is exactly the status quo — so
 * this can only improve things, never regress them.
 *
 * Takes effect on the next native build (`expo prebuild` / EAS). It does
 * nothing in Expo Go, which does not rebuild MainActivity.
 */

const TARGET_HZ = 60;

const GUARD = 'preferredRefreshRate';
const SNIPPET = `    // Prefer a ${TARGET_HZ} Hz display mode — see plugins/withPreferred60Hz.js.
    // On a 90 Hz panel the JS frame gate can only land on 45 or 90 fps; asking
    // the OS for ${TARGET_HZ} Hz is what makes a clean ${TARGET_HZ} fps reachable at all.
    window.attributes = window.attributes.also { it.preferredRefreshRate = ${TARGET_HZ}f }`;

module.exports = function withPreferred60Hz(config) {
  return withMainActivity(config, (cfg) => {
    const { language, contents } = cfg.modResults;

    if (language !== 'kt') {
      throw new Error(
        `[withPreferred60Hz] Expected a Kotlin MainActivity, found "${language}". ` +
          'Update this plugin for the new template rather than dropping it — ' +
          'without it the game runs at 45 fps on every 90 Hz Android device.'
      );
    }

    // Idempotent: prebuild can run repeatedly against an existing android/ dir.
    if (contents.includes(GUARD)) return cfg;

    // Anchored on super.onCreate so the window exists before we touch it.
    const anchor = /(super\.onCreate\([^)]*\))/;
    if (!anchor.test(contents)) {
      throw new Error(
        '[withPreferred60Hz] Could not find super.onCreate(...) in MainActivity. ' +
          'The Expo template changed; re-point this plugin at the new anchor. ' +
          'Failing the build deliberately — a silent no-op here would quietly ' +
          'reintroduce 45 fps on 90 Hz devices.'
      );
    }

    cfg.modResults.contents = contents.replace(anchor, `$1\n${SNIPPET}`);
    return cfg;
  });
};
