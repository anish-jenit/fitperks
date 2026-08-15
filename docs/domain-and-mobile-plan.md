# FitPerks Domain And Mobile Plan

## Web Domain Migration To fitperks.ai

Goal: make `https://fitperks.ai` the production website, with `https://www.fitperks.ai` redirecting to the canonical domain.

Current domain setup:

- `fitperks.org` is currently hosted on Hostinger.
- `fitperks.ai` is registered at Namecheap.
- The FitPerks app is a Vite + React SPA and is already compatible with Vercel-style static hosting.

Recommended production setup:

- Keep `fitperks.ai` registered at Namecheap.
- Deploy the React app on Vercel.
- Point `fitperks.ai` DNS to Vercel.
- Keep `fitperks.org` live during the transition, then redirect it to `fitperks.ai` when ready.

### Current App Fit

- The app is a Vite + React single page app.
- `vercel.json` already rewrites all paths to `index.html`, which is correct for deep links like `/solo`, `/launch/...`, `/trial/...`, and `/setup/...`.
- Supabase URL and anon key are controlled by Vite environment variables.
- Camera and MediaPipe run in the browser, so HTTPS is required for production camera access.

### Recommended Path: Namecheap DNS Directly To Vercel

This is the simplest path if the new `fitperks.ai` website should run on Vercel and you do not need Hostinger to serve that domain.

1. Prepare the Vercel project
   - Connect the GitHub repo to Vercel if it is not connected yet.
   - Build command: `npm run build`.
   - Output directory: `dist`.
   - Keep `vercel.json` because it supports SPA deep links.

2. Configure production environment variables in Vercel
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_USE_FLOW_STUBS=false`

3. Add domains in Vercel
   - Add `fitperks.ai`.
   - Add `www.fitperks.ai`.
   - Choose canonical behavior:
     - Recommended: canonical `fitperks.ai`, redirect `www.fitperks.ai` to `fitperks.ai`.
     - Alternative: canonical `www.fitperks.ai`, redirect `fitperks.ai` to `www.fitperks.ai`.

4. Configure DNS at Namecheap
   - Log in to Namecheap.
   - Go to Domain List -> `fitperks.ai` -> Manage -> Advanced DNS.
   - Remove conflicting website records for:
     - Host `@`
     - Host `www`
   - Add the records Vercel shows for this exact project.
   - Typical Vercel pattern:
     - `A` record, Host `@`, Value `76.76.21.21`
     - `CNAME` record, Host `www`, Value from Vercel, often `cname.vercel-dns.com` or a project-specific Vercel target
   - Use Vercel's exact displayed values if they differ from the typical values.
   - Do not add `https://` or a path in DNS values.
   - Do not set a CNAME for `@`.

5. Check for email records before changing DNS
   - If `fitperks.ai` will use email, preserve or configure:
     - MX
     - SPF TXT
     - DKIM TXT/CNAME
     - DMARC TXT
   - If there is no email on `fitperks.ai` yet, this can wait, but plan it before sending email from the domain.

6. Wait for DNS and SSL
   - Vercel domain verification can be quick, but DNS propagation may take hours.
   - Namecheap and Hostinger docs both mention propagation can take up to 24 hours.
   - Once Vercel verifies DNS, SSL should provision automatically.

7. Configure Supabase Auth URLs
   - Site URL: `https://fitperks.ai`
   - Redirect URLs:
     - `https://fitperks.ai/*`
     - `https://www.fitperks.ai/*`
     - Current Vercel preview URL patterns if preview auth testing is needed.

8. Deploy and verify
   - Run `npm run build`.
   - Deploy production from the main branch.
   - Verify these routes:
     - `/`
     - `/solo`
     - `/admin`
     - `/setup/{token}`
     - `/launch/{country}/{org-slug}`
     - `/trial/{code}/workout`
   - Test camera permission on iOS Safari, Android Chrome, desktop Chrome, and desktop Safari.
   - Confirm SSL certificate is active before announcing the domain.

9. Cutover communications
   - Update generated QR codes and invite links after the domain is live.
   - Update social profiles, email signatures, pitch decks, and customer docs.
   - Keep old production URLs available during the transition if existing pilots are active.

### Alternative Path: Point Namecheap Domain To Hostinger

Use this only if `fitperks.ai` should be hosted by Hostinger instead of Vercel.

1. In Hostinger, add `fitperks.ai` to the hosting plan.
2. In Hostinger, locate the nameservers or A record method for the new site.
3. In Namecheap:
   - Go to Domain List -> `fitperks.ai` -> Manage -> Nameservers.
   - Choose Custom DNS if using Hostinger nameservers.
   - Enter the Hostinger nameservers exactly as shown in hPanel.
4. Wait for nameserver propagation.
5. Manage all future DNS records for `fitperks.ai` in Hostinger hPanel.

Tradeoff: this matches the current `fitperks.org` hosting pattern, but it is less ideal for this repo because the app is already configured as a modern Vite SPA and Vercel will handle SPA routing, SSL, previews, and GitHub deploys more smoothly.

### Alternative Path: Namecheap Nameservers To Vercel

Use this only if Vercel should manage the full DNS zone for `fitperks.ai`.

1. Add `fitperks.ai` to the Vercel project.
2. In Vercel, choose the nameserver/delegation method.
3. Copy Vercel's nameservers.
4. In Namecheap:
   - Go to Domain List -> `fitperks.ai` -> Manage -> Nameservers.
   - Choose Custom DNS.
   - Enter the Vercel nameservers.
5. Recreate any needed records in Vercel DNS:
   - MX
   - SPF
   - DKIM
   - DMARC
   - TXT verification records

Tradeoff: this centralizes DNS in Vercel, but it is easier to break email or verification records if they are not copied first.

### fitperks.org Transition Plan

Keep `fitperks.org` stable until `fitperks.ai` is fully verified and tested.

Recommended sequence:

1. Launch `fitperks.ai` first.
2. Keep `fitperks.org` live for active users and pilots.
3. Update QR codes, admin-generated links, email templates, pitch decks, and support docs.
4. Add a visible notice or redirect strategy only after confirming no active pilot depends on old links.
5. Later, redirect:
   - `https://fitperks.org` -> `https://fitperks.ai`
   - `https://www.fitperks.org` -> `https://fitperks.ai`

If old invite, setup, launch, or scoreboard links exist on `fitperks.org`, prefer a domain-level redirect that preserves paths, such as:

```text
https://fitperks.org/setup/ABC -> https://fitperks.ai/setup/ABC
https://fitperks.org/launch/us/company -> https://fitperks.ai/launch/us/company
```

### DNS Validation Commands

Use these after changing records:

```bash
dig fitperks.ai A
dig www.fitperks.ai CNAME
dig www.fitperks.ai A
```

Expected:

- `fitperks.ai` resolves to Vercel's apex IP or the exact Vercel-provided value.
- `www.fitperks.ai` resolves through Vercel's CNAME target.
- Vercel shows the domain as verified and SSL-ready.

### Smoke Test Commands

```bash
npm run build
npm run lint
npm run test:e2e
```

## iOS And Android Plan

Recommendation: start with a Capacitor wrapper around the existing Vite app. This lets FitPerks reuse the current React, Supabase, MediaPipe, admin, leaderboard, and solo-mode logic while adding native iOS/Android packaging.

### Phase 1: Mobile Readiness Audit

- Confirm all core flows work in mobile browser first:
  - Solo player signup and workout.
  - Guest challenge creation and attempt submission.
  - Organization trial workout.
  - Admin login and usage dashboard.
- Review camera behavior:
  - front camera selection.
  - permission retry flow.
  - device rotation.
  - low-light and small-room framing.
- Replace any desktop-only layout assumptions in workout/admin screens.
- Decide whether the first app release includes admin screens or only player-facing flows.

### Phase 2: Capacitor App Shell

- Add Capacitor packages.
- Configure app id:
  - iOS: `ai.fitperks.app`
  - Android: `ai.fitperks.app`
- Set app name: `FitPerks`.
- Configure web assets to use the existing Vite build output in `dist`.
- Add native projects:
  - `ios/`
  - `android/`
- Configure camera permissions:
  - iOS `NSCameraUsageDescription`.
  - Android camera permission.

### Phase 3: App-Specific Auth And Links

- Add Supabase redirect URLs for custom scheme/universal links.
- Decide link strategy:
  - Universal links/app links for production invite and challenge URLs.
  - Web fallback for users without the app installed.
- Validate that `/setup`, `/launch`, `/trial`, and `/solo/workout/...` routes open correctly from links.

### Phase 4: Native QA

- Test real devices, not only simulators:
  - iPhone Safari and installed iOS app.
  - Android Chrome and installed Android app.
  - low-end Android device if possible.
- Verify camera frame rate and pose detection stability.
- Verify safe-area layout, status bar, keyboard behavior, and orientation behavior.
- Run store-compliance privacy checks for camera usage and data collection.

### Phase 5: Beta Release

- iOS TestFlight internal build.
- Android internal testing track.
- Test with a small pilot group.
- Capture crash reports, camera startup failures, and workout completion rates.
- Tune anti-cheat thresholds using real pilot data before public launch.

### Phase 6: Store Launch

- Prepare App Store and Play Store listings:
  - app icon.
  - screenshots.
  - short description.
  - privacy policy URL.
  - support URL.
  - demo account if required for review.
- Submit iOS first if review risk is higher, then Android.
- Keep the web app as the canonical fallback at `https://fitperks.ai`.

## Suggested Timeline

- Domain migration: 0.5-1 day once domain/DNS access is ready.
- Mobile readiness fixes: 2-4 days.
- Capacitor shell and native permissions: 1-2 days.
- Deep links, auth redirects, and QA: 3-5 days.
- Beta release: 1 week.
- Store review and launch: 1-2 weeks depending on review feedback.

## Open Decisions

- Should `fitperks.ai` or `www.fitperks.ai` be canonical?
- Should the first mobile app include admin, or only participant/player workflows?
- Do we want push notifications in v1?
- Do we need offline attempt capture, or should all attempts require network?
- Who owns DNS and production deployment access?

## References

- Vercel custom domain setup: https://vercel.com/docs/domains/set-up-custom-domain
- Vercel custom domain troubleshooting: https://vercel.com/docs/domains/troubleshooting
