# Chirp access setup

The Chirp endpoint is disabled until `CHIRP_OPERATOR_ACCESS_CODE` is set on the server. Generate a random code, for example `openssl rand -hex 32`, and set it as a sensitive Vercel environment variable. Do not put it in client build variables, source code, or chat. Rotate it in Vercel and redeploy if exposed.

## How operators enter the code

Only Cebuano/Bisaya uses Chirp (see `src/constants/chirpLanguages.ts`); no other language ever asks for the code.

- **In-app card, never a blocking prompt.** When online Bisaya needs the code, a small card appears above the controls. Captions and the microphone keep running while it is open. A rejected code (HTTP 401) is cleared and the card asks again.
- **Settings → Chirp access code** shows whether a code is *Not set*, *Set for this session* or *Saved on this device*, with **Change code** and **Forget code**.
- **Default: page memory only.** The code is gone after a reload, closing the tab or reopening the app.
- **Optional: "Remember on this device".** The code is saved in the browser's `localStorage` on that device only, so the operator is not asked again. Anyone with access to that device and browser profile can then make billable Chirp requests, and the code can be read from the browser's site data. Use it only on devices you control, and press **Forget code** before handing a device to someone else. Changing the code in Vercel invalidates every saved copy; devices are asked again on their next request.
- **No password-manager copy.** The field is a masked text input, so the browser does not offer to save or auto-fill it.
- **Never needed offline.** In Offline Mode, Bisaya audio goes only to the on-device models; nothing is sent to Chirp and the code is never requested. If a Chirp request fails because the network is unreachable, the app switches to Offline Mode immediately.

Never build the code into the app (source, `VITE_*` variables or the bundle): the web app is public, so anyone could read it and make billable requests.

## Server setup

Use a separate Google service-account credential in `GOOGLE_CHIRP_SERVICE_ACCOUNT_KEY`, limited to Speech recognition. The operator code is not the Google credential. Deploy the protected code before enabling the Google credential, and test with a short recording. Use HTTPS.

This shared access code is an interim safeguard, not user accounts or an abuse-proof quota. Anyone with the code can make billable requests; it cannot provide per-user revocation. Configure Vercel Firewall rate limits for `/api/chirp-transcribe`, restrictive Google Cloud quotas and billing alerts before enabling production billing. Billing alerts are not spending caps. Other API endpoints require separate security review. Verify the protection against the deployed URL before use.