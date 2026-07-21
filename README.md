# Into The Space 🚀

A Galaxy-Attack–style vertical space shooter for iOS and Android, built with
**React Native + Expo (SDK 54)** — no game engine, just React Native views driven
by a `requestAnimationFrame` loop.

Pilot a rocket climbing through deep space. Enemies drop into formation and shoot
back; your ship auto-fires. Clear a wave and a harder one arrives. You start with
3 hearts — every hit costs 1, and rare ❤️ pickups restore them. At zero hearts,
it's **rocket down**. Fly as high as you can: your score is your **altitude**.

## Quick start

```bash
npm install
npm start
```

Then scan the QR code with **Expo Go**, or launch straight onto a device:

```bash
npm run ios      # iOS simulator / device
npm run android  # Android emulator / device
```

## Controls

- **One finger** — touch near the rocket and drag; it follows your finger anywhere
  on screen with smooth 2D movement.
- The ship **fires automatically** — no fire button.

## Project structure

```
src/game/        types, constants, sounds, storage (game logic)
src/components/  Obstacle, Effects, Coin (render layer)
src/screens/     GameScreen, LoadingScreen, Screens (flow)
assets/          ships, enemies, backgrounds, bullets, sounds
```

## Tech

TypeScript · Expo SDK 54 · expo-audio · expo-haptics · AsyncStorage · Jest

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` / `npm run android` | Launch on a device/emulator |
| `npm test` | Run the Jest test suite |
| `npx tsc --noEmit` | Type-check |
