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

## If the website shows “used for all sizes” but nothing uploads

That line is **not** a file upload. It only tells Apple to **reuse** screenshots
you already uploaded for another device size. It never opens a file picker.

Upload the iPad PNGs here instead:

1. App Store Connect → **Apps** → your app → **App Store** tab (not TestFlight).
2. Open the version in **Prepare for Submission** (or Rejected).
3. Under **Previews and Screenshots**, click **View All Sizes in Media Manager**.
4. In the left column, choose **iPad 13" Display** (not iPhone).
5. Click an **empty screenshot slot** (gray phone/iPad outline) or **+**.
6. **Choose File** and pick `01-signin.png`, then repeat for 02 and 03.
7. Click **Save** top right, then return to the version page.

Use **Chrome** with extensions off. Drag-and-drop often fails on the banner
text; use **Choose File** on the empty slot.

### Upload without the browser (API)

If you have an App Store Connect API key (Users and Access → Integrations):

```bash
export ASC_KEY_ID=...
export ASC_ISSUER_ID=...
export ASC_PRIVATE_KEY_PATH=~/Downloads/AuthKey_XXXXX.p8
export ASC_SCREENSHOT_DIR=assets/app-store-ipad-png

npm run upload:app-store-screenshots -- --dry-run --only=ipad-13-inch-2064x2752
npm run upload:app-store-screenshots -- --only=ipad-13-inch-2064x2752 --replace
```
