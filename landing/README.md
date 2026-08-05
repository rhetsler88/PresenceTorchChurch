# Presence Torch Landing Page

Marketing site extracted from https://presencetorch.netlify.app/

## Local development

```bash
cd landing
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output goes to `landing/dist/`.

## Netlify deployment

Connect the GitHub repo and set:

| Setting | Value |
|---------|-------|
| Base directory | `landing` |
| Build command | `npm run build` |
| Publish directory | `landing/dist` |

## Key files

- `src/LandingPage.jsx` — main page component (hero, #capabilities, #safety, #organizations)
- `src/landing.css` — all styles
- `public/` — wordmark, icon, and lockup images

## Links to update

In `LandingPage.jsx`:

- `APP_URL` — points to the live app (`https://app.presencetorch.net`)
- `STRIPE_URL` — organization signup Stripe payment link
