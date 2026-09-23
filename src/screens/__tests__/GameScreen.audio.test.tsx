import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react-native';
import { createAudioPlayer } from 'expo-audio';
import GameScreen from '../GameScreen';
import { freshRunState } from '../../game/runstate';
import { BASE_SHIP_STATS } from '../../game/upgrades';
import { GameState, Card } from '../../game/types';
import { initSounds, resetSoundBudget, SOUND_NAMES } from '../../game/sounds';
import {
  AVATARS,
  BACKGROUNDS,
  LANES,
  OB_HIT,
  WAVE_MAX_ENEMIES,
  laneX,
} from '../../game/constants';

/**
 * What ONE mass-resolution event is allowed to cost at the native boundary.
 *
 * The caps this game already had — MAX_FLOATS, MAX_PARTICLES, MAX_EXPLOSIONS,
 * QUALITY_TIERS — all bound the LIVE COUNT of something. None of them bounded
 * the WORK DONE IN A SINGLE TICK, and none of them reached audio at all, which
 * is why a detonation could fire a dozen native audio starts on one player and
 * every safeguard in the game let it through.
 *
 * Measured before the budget landed: twelve enemies resolving in one tick
 * produced 14 `play()` calls, 12 of them on a single AudioPlayer. On device
 * that read as a game-wide stutter, and muting the effects channel made it
 * vanish.
 *
 * So this asserts the bound, not the entity counts — "a nuke is smooth" is
 * exactly the kind of property that rots silently otherwise.
 */
const MAX_STARTS_PER_DETONATION = 6;

const mockCreate = createAudioPlayer as jest.Mock;

jest.useFakeTimers();

const enemy = (i: number): Card =>
  ({
    id: 5000 + i,
    kind: 'rage',
    lane: i % LANES,
    y: 120 + (i % 4) * 55,
    h: OB_HIT,
    emoji: '',
    // 1 hp so the detonation resolves every one of them in the same pass —
    // the worst case, and the one the player actually triggers with a nuke.
    hp: 1,
    maxHp: 1,
    hitT: 0,
    shipIdx: i % 5,
    dead: false,
    deadT: 0,
    nearMissChecked: false,
  }) as unknown as Card;

const startsSoFar = () =>
  SOUND_NAMES.reduce(
    (n, name) =>
      n + (mockCreate.mock.results[SOUND_NAMES.indexOf(name)]?.value.play.mock.calls.length ?? 0),
    0
  );

describe('a detonation resolving a full board', () => {
  beforeAll(() => initSounds());
  beforeEach(() => resetSoundBudget());

  it(`fires at most ${MAX_STARTS_PER_DETONATION} native audio starts`, async () => {
    const resume: GameState = {
      ...freshRunState(),
      wave: 20,
      waveClearTimer: 999,
      fireTimer: 999,
      giftTimer: 999,
      heartTimer: 999,
      coinTimer: 999,
      boonTimer: 999,
      enemyFireTimer: 999,
      nextId: 9000,
      bombs: 3,
      cards: Array.from({ length: WAVE_MAX_ENEMIES }, (_, i) => enemy(i)),
    } as GameState;

    await render(
      <GameScreen
        best={0}
        avatarImage={AVATARS[0].image}
        avatarShot={AVATARS[0].shot}
        avatarSpecial={AVATARS[0].special}
        shipStats={BASE_SHIP_STATS}
        background={BACKGROUNDS[0].set}
        resume={resume}
        onGameOver={jest.fn()}
        onPersist={jest.fn()}
        onClearRun={jest.fn()}
        onHome={jest.fn()}
      />
    );
    await act(async () => {
      jest.advanceTimersByTime(32);
    });

    const before = startsSoFar();
    await act(async () => {
      fireEvent.press(screen.getByTestId('bomb'));
    });
    const fired = startsSoFar() - before;

    // Bounded, and still audible — a silent nuke would pass a bound and fail
    // the player, so the floor matters as much as the ceiling.
    expect(fired).toBeGreaterThan(0);
    expect(fired).toBeLessThanOrEqual(MAX_STARTS_PER_DETONATION);
  });
});
