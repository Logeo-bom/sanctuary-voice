# Offline (Airplane-Mode) Field Test

A 15-minute check of what Sanctuary Voice actually does without internet. Run it on the phone you
would use in the field, once in English and once in Cebuano/Bisaya.

## Before you start (with internet)

1. Open the app and go to **Settings → Offline Ready**.
2. Under **Mission pack**, pick the destination (e.g. "Philippines – Cebuano / Bisaya") and who is
   speaking, then tap **Download pack** (or **Use & download**). Wait until both files show
   **Downloaded**. The translation file is large, so use Wi-Fi.
3. Optional: add the app to the home screen (Chrome menu → **Install app** / **Add to Home screen**).
4. Close Settings, then refresh the app once while still online so the latest version is saved.

## The test

1. Turn on airplane mode (Wi-Fi off too).
2. Wait up to 20 seconds. The status badge should change to **Offline Mode**.
3. Tap the microphone and speak for about 10 minutes: normal sentences, a few pauses, a Bible
   reference, and the church words you care about.
4. Tap Stop.
5. Still in airplane mode, close the tab (or swipe the app away) and open it again. It should open
   normally and show **Offline Mode**; captions should work again after tapping the microphone.
6. Turn airplane mode off and wait up to 20 seconds. The badge should return to **Cloud Mode**.

## What to write down

| Check | Result |
|---|---|
| Did the badge switch to Offline Mode by itself? | |
| Did captions appear at all? | |
| Roughly how long after speaking did each caption appear? | |
| Were the original-language captions mostly right? | |
| Were the translations understandable? | |
| Did spoken translation (Audio ON) work? | |
| Did the phone get hot, or the battery drop quickly? (note start and end %) | |
| Did the app freeze or crash? (check Settings → Diagnostics & Crash Log) | |
| Did the app reopen while still in airplane mode? | |
| Did it return to Cloud Mode when internet came back? | |

Screenshots of the captions next to what you actually said are the most useful evidence.

## Known limits to expect

- The app must have been opened online at least once after the latest update for it to reopen offline.
- Chrome may clear saved files if the phone runs very low on storage; then they must be downloaded again.
- Offline Cebuano/Bisaya translation uses the on-device translation model, but its quality is
  still untested and expected to be below the online (Chirp) quality.
- "Share to Phones" and "Send to Screen/Stream" need internet and will not update while offline.
