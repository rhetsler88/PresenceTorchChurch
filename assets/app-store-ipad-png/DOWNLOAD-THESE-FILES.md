# How to get the iPad screenshot files (private repo)

The GitHub **raw** links (`raw.githubusercontent.com/...`) **do not work** for this
repo — it is private. They return a text file that says `404: Not Found`. If
that text is saved as `.png`, App Store Connect shows **wrong format** with no
other explanation.

## Download while logged into GitHub (Mac)

1. Sign in at **https://github.com** in Safari or Chrome (same browser you use
   for App Store Connect).
2. Open this file in the repo (branch
   `cursor/app-store-signin-screenshots-e0f6`):

   **PresenceTorch-iPad-screenshots-2064x2752.zip**

   Path: `assets/app-store-ipad-png/PresenceTorch-iPad-screenshots-2064x2752.zip`

3. Click the file name → click **Download** (or **View raw** on the zip, then
   save).
4. Double‑click the zip on your Mac or external drive. You get three PNGs:
   - `01-signin.png`
   - `02-daily-code.png`
   - `03-talk.png`

**Or** download the whole branch zip (logged in):

https://github.com/rhetsler88/PresenceTorchChurch/archive/refs/heads/cursor/app-store-signin-screenshots-e0f6.zip

Then open `assets/app-store-ipad-png/ipad-13-inch-2064x2752/` inside it.

## Before upload — confirm the file is really a PNG

1. Select `01-signin.png` → **File → Get Info** (⌘I).
2. **Kind** should be **PNG image**.
3. **Dimensions:** **2064 × 2752**.
4. Open in **Preview**. If Preview says it cannot open the file, the download
   failed (often a `404` text file renamed to `.png`).

## If App Store Connect still says wrong format

Try the **JPEG** copies (same pixels, no alpha):

`assets/app-store-ipad-jpg/ipad-13-inch-2064x2752/`

Upload `01-signin.jpg`, `02-daily-code.jpg`, `03-talk.jpg` to the same iPad
13" slots. Apple accepts JPG or PNG.

Do **not** save images from the Cursor chat — those are previews, not upload
files.
