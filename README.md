# REDUPLINK GAMES

Small browser games for the quiet between bigger ones. This repo is the studio uplink: open a live signal, or leave the next frequency dark.

**Play:** [yf52vmhvs5-coder.github.io/reduplink](https://yf52vmhvs5-coder.github.io/reduplink/)

## Signals

| Game | Kind | Path |
| --- | --- | --- |
| **Nebula Void** | Survival arena | [`NebulaVoid/`](NebulaVoid/) |
| **Cosmic Quiz** | Trivia | [`CosmicQuiz/`](CosmicQuiz/) |
| **Cell Wars** | Mass-and-split arena | [`Cell War/`](Cell%20War/) |

## Local

Open `index.html` in a browser, or serve the repo root (needed for some multiplayer bits):

```bash
npx --yes serve .
```

Nebula Void multiplayer on this machine also needs the relay: `NebulaVoid/server/start-relay.bat`. Both players open the game on `localhost`.

The public site uses `wss://reduplink-nebula-relay.onrender.com` (`render.yaml`). A localhost game and the public site do not share a room.

## License

All rights reserved — see [LICENSE](LICENSE). Viewing / playing is fine; copying, reuse, or sale is not allowed without permission.
