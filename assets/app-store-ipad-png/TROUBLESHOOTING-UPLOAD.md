# iPad screenshots upload and then disappear

The files in this folder pass every check we can run locally (size, RGB, no
alpha, under 8MB). When the thumbnail flashes and vanishes, App Store Connect
accepted the file in the browser and **rejected it on the server** without a
clear message.

Work through this list in order.

## 1. Save twice

After thumbnails appear, click **Save** in Media Manager, then **Save** again on
the version page. Refresh the page. Uploads often vanish on refresh when Save
was skipped.

## 2. Upload one file, in the right slot

1. **Media Manager** → left column → **iPad 13" Display** (not iPhone).
2. Delete any empty or broken slots (trash icon).
3. Upload **only** `01-signin.png` first via **Choose File** on an empty slot.
4. Wait until the progress bar finishes.
5. **Save**, refresh, confirm it stayed.

Then add `02` and `03`.

## 3. Try JPEG instead of PNG

Apple accepts both. Some browsers handle JPG more reliably:

```text
assets/app-store-ipad-jpg/ipad-13-inch-2064x2752/01-signin.jpg
```

Same three files, same pixels, baseline JPEG with sRGB profile.

## 4. Match the build on the version

iPad screenshots are required only when the **build attached to this version**
supports iPad (`TARGETED_DEVICE_FAMILY` includes iPad).

- If you turned off iPad in Xcode but the version still has an **older
  universal build**, iPad slots stay and uploads can fail silently. Either upload
  a new **iPhone-only** build and select it on the version (iPad slots should
  drop), or keep iPad checked and upload these iPad images.
- On the version page, note the **build number** you selected. That binary
  decides which screenshot sizes are required.

## 5. Turn off “use for all sizes” for iPad

In Media Manager, open **iPad 13" Display** and clear any option that reuses
iPhone screenshots for iPad. Upload native iPad files into the iPad slots
instead.

## 6. Version must be editable

**Prepare for Submission**, **Rejected**, or **Developer Rejected** only. In
**Waiting for Review** / **In Review**, uploads are discarded silently.

## 7. Browser

Chrome private window, extensions and VPN off. Use **Choose File**, not drag
onto the page header.

## 8. Upload via API (shows the real error)

If the website never keeps files, the API returns Apple’s rejection text:

```bash
export ASC_KEY_ID=...
export ASC_ISSUER_ID=...
export ASC_PRIVATE_KEY_PATH=~/Downloads/AuthKey_XXXXX.p8
export ASC_SCREENSHOT_DIR=assets/app-store-ipad-png

npm run upload:app-store-screenshots -- --dry-run --only=ipad-13-inch-2064x2752
npm run upload:app-store-screenshots -- --only=ipad-13-inch-2064x2752 --replace
```

Use `ASC_SCREENSHOT_DIR=assets/app-store-ipad-jpg` for the JPEG set.
