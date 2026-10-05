# Firefox 1.0.0 validation

Automated checks: `npm test`, `npm run check`, and `npm run build:firefox`.

For a live smoke test in Firefox 140 or newer:

1. Open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and select the extracted `manifest.json`.
2. Open setup and confirm Sign in and Create account are available. Use a test account to register, verify email, and check account status.
3. Confirm guest setup works and declining telemetry keeps automatic uploads off.
4. Enable telemetry through setup or Settings and confirm the Firefox permission prompt. Revoke the permission and verify uploads stop.
5. Visit a public page and check tracking observations and Shield events.
6. With a verified eligible account, submit a Verity comparison after the 15-second wait and check progress and the last five reviews.
7. Check Account, plans, domain intelligence, sign-out, and sign-in persistence after restarting Firefox with a signed installation.

Live Firefox and production account requests were not exercised during automated validation. Temporary add-ons are removed when Firefox restarts; permanent installation requires Mozilla signing.
