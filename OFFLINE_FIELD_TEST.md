# Offline (Airplane-Mode) Field Test

A 15-minute check of what Sanctuary Voice actually does without internet. Run it on the phone you
would use in the field, once in English and once in Cebuano/Bisaya.

## Before you start (with internet)

1. Open the app and pick the spoken language and the translation language you want to test.
2. Open **Settings → Offline Ready**.
3. Tap **Download** on "Speech recognition" and "Translation" and wait until both show **Downloaded**.
   The translation model is large, so use Wi-Fi.
4. Close Settings. **Do not close or reload the app from here on.**

## The test

1. Turn on airplane mode (Wi-Fi off too).
2. Wait up to 20 seconds. The status badge should change to **Offline Mode**.
3. Tap the microphone and speak for about 10 minutes: normal sentences, a few pauses, a Bible
   reference, and the church words you care about.
4. Tap Stop.
5. Turn airplane mode off and wait up to 20 seconds. The badge should return to **Cloud Mode**.

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
| Did it return to Cloud Mode when internet came back? | |

Screenshots of the captions next to what you actually said are the most useful evidence.

## Known limits to expect

- Reloading or reopening the app while offline may not work yet; the app itself is not stored on the
  device, only the models are.
- Cebuano/Bisaya is not covered by the offline translation model, so offline translation for it uses
  a small built-in word list and will be rough.
- "Share to Phones" and "Send to Screen/Stream" need internet and will not update while offline.
