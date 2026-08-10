import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { PALETTE } from '../game/constants';
import { FONTS } from '../game/type';

interface Props {
  children: React.ReactNode;
  /** Throw away the stored snapshot — whatever is in it just failed to run. */
  onDiscardRun: () => void;
  /** Leave to the menu, so the player is never stranded on a dead screen. */
  onHome: () => void;
}

/**
 * Last line of defence around a run.
 *
 * The game loop resumes from a stored snapshot, and a snapshot it cannot make
 * sense of used to throw out of render with nothing to catch it. That is worse
 * than a crash: the same snapshot is read again on the next launch, so the app
 * fails identically every time and the player has no way back — they cannot
 * reach a menu to start a fresh run, because the crash happens before one
 * paints. Uninstalling is the only exit.
 *
 * loadRun's normalizeRun fixes the known cause. This catches the unknown ones.
 * The rule it enforces is narrow but important: a broken run may cost you the
 * run, never the app.
 *
 * A class component because React only offers error boundaries as classes —
 * there is no hook equivalent.
 */
interface State {
  failed: boolean;
}

export class RunBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Discard the snapshot BEFORE the player can relaunch into it again —
    // breaking the loop is the whole point, so it must not wait for a tap.
    this.props.onDiscardRun();
    if (__DEV__) console.error('[RunBoundary] run crashed:', error);
  }

  private handleHome = () => {
    this.setState({ failed: false });
    this.props.onHome();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>RUN LOST</Text>
        <Text style={styles.body}>
          Something went wrong mid-flight and the run could not be recovered. Your coins,
          upgrades and progress are safe.
        </Text>
        <Pressable
          onPress={this.handleHome}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        >
          <Text style={styles.btnTxt}>RETURN TO HOME</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PALETTE.void,
    paddingHorizontal: 32,
  },
  title: {
    color: PALETTE.ink,
    fontSize: 22,
    fontFamily: FONTS.display,
    letterSpacing: 3,
    marginBottom: 14,
  },
  body: {
    color: PALETTE.inkDim,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 28,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: PALETTE.plasma,
  },
  pressed: { opacity: 0.7 },
  btnTxt: {
    color: PALETTE.plasma,
    fontSize: 13,
    fontFamily: FONTS.display,
    letterSpacing: 1.5,
  },
});

export default RunBoundary;
