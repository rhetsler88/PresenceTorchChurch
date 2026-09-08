# App Store Connect screenshots

Every folder holds the same two portrait frames at one accepted size:

- `01-signin.png` — sign-in screen
- `02-talk.png` — Talk channel with protection level, voice messages, and hold-to-talk

All files are PNG, 8-bit RGB, no alpha channel. App Store Connect rejects
transparency and any size not listed below.

## Which folder goes in which slot

App Store Connect validates the pixel size against the slot you drop files
into, so match the folder to the slot heading on the page.

| Slot in App Store Connect | Folder | Pixels |
| --- | --- | --- |
| 6.9" Display | `iphone-6.9-inch-1320x2868` | 1320 × 2868 |
| 6.9" Display (alternate) | `iphone-6.9-inch-1290x2796` | 1290 × 2796 |
| 6.5" Display | `iphone-6.5-inch-1284x2778` | 1284 × 2778 |
| 6.5" Display (alternate) | `iphone-6.5-inch-1242x2688` | 1242 × 2688 |
| 5.5" Display | `iphone-5.5-inch-1242x2208` | 1242 × 2208 |
| iPad 13" Display | `ipad-13-inch-2064x2752` | 2064 × 2752 |

The 6.5" slot accepts either 1284 × 2778 or 1242 × 2688; upload one folder, not
both. `iphone-5.5-inch-1242x2208` is a different slot from
`iphone-6.5-inch-1242x2688` despite the shared 1242 width.

The iPad set is required because `TARGETED_DEVICE_FAMILY` is `1,2`.

## Regenerating

```bash
npm run export:app-store-screenshots                             # raster frames (Talk)
APP_URL=http://127.0.0.1:5173 npm run capture:app-store-login    # native-resolution sign-in
```

The capture script renders `/login?storePreview=1`, which shows the Fingerprint
controls and hides the PWA install prompt so the frame matches native iOS.

`source-signin.png` and `source-talk.png` are the full-resolution originals the
export script scales from. Frames whose aspect ratio does not match a target are
fit inside it and padded with the page background `#080c16` rather than cropped.

`src/lib/appStoreScreenshots.test.js` asserts the exact pixel size, PNG format,
and absence of alpha for every file here.
