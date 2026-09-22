# App Store Connect screenshots

Each iPhone folder holds three portrait frames at one accepted size, ordered
to follow the flow a reviewer walks through:

- `01-signin.jpg` — sign-in screen
- `02-daily-code.jpg` — verse of the day and daily access code gate
- `03-talk.jpg` — Talk channel with protection level, voice and text messages,
  and hold-to-talk

The iPad folders hold `01-signin.jpg` only, rendered at an iPad viewport. See
[iPad frames](#ipad-frames) for why, and for how to add the other two.

All files are baseline JPEG with an embedded sRGB profile, 3 channels, no
alpha. App Store Connect takes JPG or PNG and rejects transparency, a non-RGB
color space, and any size not listed below. They are encoded at quality 92 with
4:4:4 chroma so the small UI text stays crisp.

## If an upload will not stick

Check the exact file you are about to drag into the browser, which is not
always the file that was exported here — anything re-saved out of a preview,
a chat, or an image viewer is usually a different size or format:

```bash
npm run check:app-store-screenshots -- ~/Downloads/01-signin.jpg
```

It names the slot each file belongs in, or every reason Apple would refuse it.
If files pass that check and still vanish from the upload box, the cause is on
the App Store Connect side rather than in the image: the version has to be in
an editable state (Prepare for Submission, Rejected, or Developer Rejected),
the pixel size has to match the slot heading you dropped it under, and the
page needs a Save before the thumbnails persist.

## Uploading without the browser

When the web uploader keeps dropping files, upload through Apple's API
instead, which reports the objection the browser swallows. Create a key under
Users and Access > Integrations > App Store Connect API with the App Manager
role, download the `.p8` once, then:

```bash
export ASC_KEY_ID=XXXXXXXXXX
export ASC_ISSUER_ID=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
export ASC_PRIVATE_KEY_PATH=~/Downloads/AuthKey_XXXXXXXXXX.p8

npm run upload:app-store-screenshots -- --dry-run
npm run upload:app-store-screenshots -- --only=iphone-6.5-inch-1284x2778
```

`--dry-run` changes nothing and prints the app, every version with its state,
and the screenshot sets that already exist, which is usually enough to show
why the browser was refusing. `--replace` clears a set before uploading, and
`--locale` defaults to `en-US`.

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
| iPad 13" Display (alternate) | `ipad-13-inch-2048x2732` | 2048 × 2732 |

Where a slot lists two folders, either is accepted; upload one, not both.
`iphone-5.5-inch-1242x2208` is a different slot from
`iphone-6.5-inch-1242x2688` despite the shared 1242 width.

The iPad set is required because `TARGETED_DEVICE_FAMILY` is `1,2`. Only
portrait is exported: iPhone is portrait-locked in `Info.plist`, and the source
frames are phone captures, so a landscape canvas would be mostly padding.

## iPad frames

An iPad slot is only fed by a capture taken at an iPad viewport. Scaling a
phone screenshot onto a 3:4 canvas leaves an iPhone status bar and keyboard
bar stranded in the middle of a wide screen, which reads as the wrong device
to anyone looking at the listing.

`source-ipad-signin.png` is a real iPad-width render of the sign-in screen,
which is the one screen that draws before authentication:

```bash
npm run dev
npm run capture:app-store-login -- --ipad
npm run export:app-store-screenshots signin
```

The daily code gate and Talk both sit behind a signed-in account, so they
cannot be rendered headlessly. To add them, run the app on an iPad simulator
in Xcode (iPad Pro 13-inch), sign in, and press Cmd+S on each screen; the
files land on the Desktop at 2064 × 2752. Drop them in as
`source-ipad-daily-code.png` and `source-ipad-talk.png`, add their names to
`sources.ipad` in `scripts/export-app-store-screenshots.mjs`, add the frames
to `IPAD_FRAMES` in `src/lib/appStoreScreenshotSpec.js`, then re-export.

Apple requires at least one screenshot per device size, so the single iPad
frame is enough to submit with.

## Regenerating

`source-signin.png`, `source-daily-code.png`, and `source-talk.png` are device
screenshots. They stay PNG so each re-export starts from a lossless master
rather than recompressing a JPEG. Replace any one and re-export every size:

```bash
npm run export:app-store-screenshots           # all frames
npm run export:app-store-screenshots talk      # just one
```

Frames whose aspect ratio does not match a target are fit inside it and padded
with the page background `#080c16` rather than cropped, so no UI is lost.

`npm run capture:app-store-login -- --phone` overwrites `source-signin.png`
with a headless browser render. That render has no iOS status bar, so prefer
the device screenshot for the iPhone listing.

`src/lib/appStoreScreenshotSpec.js` holds the accepted sizes and the rejection
rules, shared by both generators, the validator, and the tests.
`src/lib/appStoreScreenshots.test.js` runs those rules against every file here
and asserts its exact pixel size.
