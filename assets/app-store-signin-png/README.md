# Sign-in screenshots (opaque PNG)

Upload **`01-signin.png`** from the folder that matches the slot heading in App
Store Connect. Every file is 8-bit RGB PNG with no alpha channel.

| Slot in App Store Connect | Folder | Pixels |
| --- | --- | --- |
| 6.9" Display | `iphone-6.9-inch-1320x2868` | 1320 × 2868 |
| 6.9" Display (alternate) | `iphone-6.9-inch-1290x2796` | 1290 × 2796 |
| 6.5" Display | `iphone-6.5-inch-1284x2778` | 1284 × 2778 |
| 6.5" Display (alternate) | `iphone-6.5-inch-1242x2688` | 1242 × 2688 |
| 5.5" Display | `iphone-5.5-inch-1242x2208` | 1242 × 2208 |
| iPad 13" Display | `ipad-13-inch-2064x2752` | 2064 × 2752 |
| iPad 13" Display (alternate) | `ipad-13-inch-2048x2732` | 2048 × 2732 |

Regenerate from the device sources in `assets/app-store-screenshots/`:

```bash
npm run export:app-store-signin-png
```

The JPEG set in `assets/app-store-screenshots/` is unchanged.
