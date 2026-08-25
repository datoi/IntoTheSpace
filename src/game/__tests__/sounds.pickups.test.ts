import { BOONS, type BoonKind } from '../pickups';
import { PALETTE } from '../constants';
import { SOUND_NAMES, pickupSemitones, type PickupKind } from '../sounds';

/**
 * Guards the pickup audio taxonomy.
 *
 * The pickup voices deliberately mirror the COLOUR families in pickups.ts, so
 * a player learns one categorisation rather than two: amber sounds like amber,
 * violet sounds like violet. Nothing in the type system enforces that — a boon
 * can be given a new colour without anyone remembering it also has a voice —
 * so these tests are the only thing keeping the two in agreement.
 *
 * They also guard the pitch assignment, which is derived from a hash and
 * therefore CANNOT guarantee that two members of a family land on different
 * offsets. Three pairs already collided when the offsets were first generated;
 * without this test a fourth would ship as two boons that sound identical.
 */

// Mirrors PICKUP_VOICE in sounds.ts. Duplicated on purpose: a test that
// imported the map would pass no matter what the map said.
const EXPECTED_VOICE: Record<PickupKind, string> = {
  coin: 'pickup_coin',
  magnet: 'pickup_coin',
  doubleCoins: 'pickup_coin',
  luckyDrop: 'pickup_coin',
  heart: 'pickup_vital',
  repair: 'pickup_vital',
  extraHeart: 'pickup_vital',
  shield: 'pickup_shield',
  damageBoost: 'pickup_power',
  fireBoost: 'pickup_power',
  nuke: 'pickup_power',
  bombPack: 'pickup_power',
  freeze: 'pickup_control',
  slowmo: 'pickup_control',
  energy: 'pickup_charge',
  gift: 'pickup_gift',
};

/** Which voice each palette colour should speak with. */
const COLOUR_VOICE: Record<string, string> = {
  [PALETTE.gold]: 'pickup_coin',
  [PALETTE.vital]: 'pickup_vital',
  [PALETTE.plasma]: 'pickup_shield',
  [PALETTE.amber]: 'pickup_power',
  [PALETTE.violet]: 'pickup_control',
  [PALETTE.energy]: 'pickup_charge',
};

const ALL_KINDS = Object.keys(EXPECTED_VOICE) as PickupKind[];

describe('pickup voices', () => {
  it('covers every boon in the catalog', () => {
    // A boon added without a voice would fall through to undefined and play
    // nothing at all — silence being the one failure a player cannot report.
    for (const kind of Object.keys(BOONS) as BoonKind[]) {
      expect(EXPECTED_VOICE[kind]).toBeDefined();
    }
  });

  it('only names voices that exist on the sound board', () => {
    for (const voice of Object.values(EXPECTED_VOICE)) {
      expect(SOUND_NAMES).toContain(voice);
    }
  });

  it('agrees with the colour family each boon is painted in', () => {
    for (const kind of Object.keys(BOONS) as BoonKind[]) {
      const expected = COLOUR_VOICE[BOONS[kind].color];
      expect(expected).toBeDefined();
      expect(`${kind}:${EXPECTED_VOICE[kind]}`).toBe(`${kind}:${expected}`);
    }
  });
});

describe('pickup pitch', () => {
  it('gives every member of a family its own offset', () => {
    const byVoice = new Map<string, { kind: PickupKind; semis: number }[]>();
    for (const kind of ALL_KINDS) {
      const voice = EXPECTED_VOICE[kind];
      if (!byVoice.has(voice)) byVoice.set(voice, []);
      byVoice.get(voice)!.push({ kind, semis: pickupSemitones(kind) });
    }
    for (const [voice, members] of byVoice) {
      const semis = members.map((m) => m.semis);
      const dupes = members.filter((m, i) => semis.indexOf(m.semis) !== i);
      // Named in the failure so the fix is obvious: pin the newcomer.
      expect(`${voice}: ${dupes.map((d) => `${d.kind}(+${d.semis})`).join(', ')}`).toBe(`${voice}: `);
    }
  });

  it('keeps the card kinds untransposed', () => {
    // The three card kinds are the canonical voice of their family.
    expect(pickupSemitones('coin')).toBe(0);
    expect(pickupSemitones('heart')).toBe(0);
    expect(pickupSemitones('gift')).toBe(0);
  });

  it('stays inside the playback rate range expo-audio supports', () => {
    // playbackRate is documented as 0.5..2.0 on mobile; anything outside is
    // clamped or ignored, which would silently collapse a family to one pitch.
    for (const kind of ALL_KINDS) {
      const rate = Math.pow(2, pickupSemitones(kind) / 12);
      expect(rate).toBeGreaterThanOrEqual(0.5);
      expect(rate).toBeLessThanOrEqual(2);
    }
  });

  it('is consonant — every offset comes from the pentatonic set', () => {
    // Chromatic neighbours inside one family sound like a mistake rather than
    // a variation, and nobody would think to check by ear.
    for (const kind of ALL_KINDS) {
      expect([0, 2, 3, 5, 7]).toContain(pickupSemitones(kind));
    }
  });
});
