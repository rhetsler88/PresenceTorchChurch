# iPad App Store screenshots (opaque PNG)

Upload into the **iPad 13" Display** slot in App Store Connect. Pick **one**
folder (both sizes are accepted, not both):

| Slot heading | Folder | Pixels |
| --- | --- | --- |
| iPad 13" Display | `ipad-13-inch-2064x2752` | 2064 × 2752 |
| iPad 13" Display (alternate) | `ipad-13-inch-2048x2732` | 2048 × 2732 |

Files in each folder:

- `01-signin.png` — iPad-width sign-in (from `source-ipad-signin.png`)
- `02-daily-code.png` — daily code (phone capture padded to iPad canvas until you add `source-ipad-daily-code.png`)
- `03-talk.png` — Talk (phone capture padded until you add `source-ipad-talk.png`)

All PNG, 8-bit RGB, **no alpha**.

Regenerate:

```bash
npm run export:app-store-ipad-png
```

For native iPad daily code and Talk, capture on an iPad Pro 13-inch simulator
(Cmd+S), save as `assets/app-store-screenshots/source-ipad-daily-code.png` and
`source-ipad-talk.png`, then re-run the command above.
