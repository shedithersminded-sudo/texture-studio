# Ultimate Texture Studio

A private, password-protected texture production and asset business studio that runs in your browser. No install, no account server, no uploads.

## Run it

```
python devserver.py 8770
```

Then open http://localhost:8770 in Chrome or Edge. (Firefox works too, but it can't do folder exports or automatic folder backups.) The first launch shows the one-time owner setup.

## Where things are

| Path | What it does |
|---|---|
| `js/app.js` | Sign-in screens, app shell, router, global search, idle lock |
| `js/core/db.js` | IndexedDB storage. Swap this file to move to server or local file storage |
| `js/core/store.js` | Encrypted records and images, settings, logs, versions |
| `js/core/auth.js`, `crypto.js` | PBKDF2 password, AES-GCM data key, recovery codes, security questions, TOTP |
| `js/core/img.js` | Codecs. Reads PNG, JPG, WEBP, BMP, GIF, TIFF, TGA, PSD (flattened), HDR, EXR. Writes PNG 8/16, JPG, WEBP, TIFF 8/16, BMP, TGA, EXR, HDR |
| `js/core/procedural.js` | Seamless procedural recipes for 31 material categories, plus patterns. Runs in a Web Worker |
| `js/core/pbr.js` | Map building, channel packing |
| `js/core/exporter.js` | Export presets for engines and tools, naming, packing, mipmaps, ZIP and folder output |
| `js/core/qc.js` | Product quality-control checks |
| `js/core/backup.js` | Verified encrypted backups, restore, scheduled folder backups |
| `js/sections/*` | One file per page |
| `js/content/*` | Academy courses and Help articles (plain data, easy to extend) |

## Honest limits (current stage)

- Pixels are edited in 8-bit per channel. 16-bit and float exports keep that data in a bigger container. They don't add precision.
- HDR and EXR imports are tone mapped for editing. The original file is kept.
- Some files can't be read yet: tiled or planar TIFF, EXR with PIZ, B44 or DWA compression, and CMYK or indexed PSD. The app shows a clear message when it rejects one.
- PSD can't be written. DDS and KTX aren't produced; engines compress on import.
- The text prompt mode is local keyword matching, not AI. The AI tab needs your own API endpoint and key (Admin, Integrations).
- Maps built from a single image are labeled as estimated. Maps from the procedural generator come from exact data.
- Nothing is published to marketplaces, and no sales are imported. Listings are prepared and sales are entered by hand.
- License templates are not legal advice.
