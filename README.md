# dsh-download-indicator

A draggable, semi-transparent download-progress widget for the DeepSeek Harness Web UI — **it only appears while something is actually downloading**.

Point it at one or more folders, and it watches large files there: when a file is still growing, the widget fades in at the top-right corner showing its progress bar, downloaded size and **live speed**. When nothing is growing, it fades out and stays out of your way.

No configuration is needed for the common case — it defaults to watching `F:\ComfyUI\models` and `F:\training\downloads`.

## Install

```sh
dsh plugin --profile desktop add dsh-download-indicator
```

Restart the client once (the desktop shell collects its index-injection table at startup), then refresh the page if you were already looking at it.

## Features

- **Shows up only when it matters** — polls every 2s; after two consecutive empty results it fades out.
- **Draggable** — grab it anywhere and drop it where it doesn't cover your work. Position is remembered in `localStorage` and survives refreshes and restarts.
- **Live speed** — the server compares file sizes between polls, so the speed is measured, not guessed. The last three samples are averaged to keep the number readable.
- **Auto-discovery** — you don't declare each download. It scans the watched folders (depth ≤ 3), keeps files over 20 MB with a known archive/model extension, and reports the ones that are growing.
- **Stays in view** — it can't be dragged off-screen, and a window resize pulls it back if it ends up out of bounds.
- **Total speed** — the header shows the aggregate of all active downloads.
- **Graceful without totals** — when the final size is unknown it shows an indeterminate striped bar plus the downloaded amount, instead of a fake percentage.

## Configuration

Everything is optional.

| Variable | Default | Meaning |
|---|---|---|
| `DSH_DOWNLOAD_WATCH` | `F:\ComfyUI\models;F:\training\downloads` | Semicolon-separated folders to scan |

Known total sizes (for the percentage) live in `KNOWN_TOTALS` inside `lib/index.js`, keyed by lower-cased file name. Unknown files simply show progress without a percentage.

Tune these constants at the top of `lib/index.js` if your setup differs:

```js
const MIN_SIZE = 20 * 1024 * 1024   // ignore files smaller than this
const MAX_DEPTH = 3                 // folder scan depth
const MIN_GROWTH = 128 * 1024       // growth needed to count as "downloading"
```

## How it works

Two halves, because the desktop client only accepts one kind of injection:

1. **Server** (`lib/index.js`) registers two routes on the DSH web server — `/dsh-download/status` (JSON: active downloads, sizes, speeds) and `/dsh-download/widget.js` (the client script) — and pushes a single structured index-injection row so the script gets loaded.
2. **Client** (`assets/widget.js`) builds the floating element, polls the status route, and renders.

The injection deliberately uses an **inline `script` row rather than a `script-src` row**: a failed `script-src` load rejects the client boot outright, so a missing route would take the whole UI down with it. The inline row creates the `<script>` tag itself and swallows `onerror`, which means this plugin can never prevent the client from starting.

## Uninstall

```sh
dsh plugin --profile desktop remove dsh-download-indicator
```

## License

MIT
