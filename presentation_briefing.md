# "Help a Million Churches": Technical Briefing & Architecture Summary
**Speaker Guide & Presentation Deck for Bard's Team Meeting (15–20 Minutes)**

---

## ⏱️ Meeting Timing Breakdown (15–20 Min)

```
00:00 - 03:00 (3 min)  │ 1. The Core Mission & Why Generic Apps (Google Translate) Fail in Church
03:00 - 08:00 (5 min)  │ 2. The 4 Hard Technical Problems & How We Engineered Solutions
08:00 - 12:00 (4 min)  │ 3. Variants Tested & AI Engine Comparison (Whisper vs Deepgram vs Gemini vs OpenRouter)
12:00 - 15:00 (3 min)  │ 4. AI Credit & Token Economics (How to Make it Sustainable)
15:00 - 18:00 (3 min)  │ 5. Live Prototype Walkthrough (sanctuary-voice.vercel.app)
18:00 - 20:00 (2 min)  │ 6. Open Discussion & Team Alignment
```

---

## 1. The Core Mission & Why Generic Apps Fail (3 Minutes)

### The Vision
> *"You go to any church in the world. You bring your mobile. You put your earphones on, start the app, and you read and hear the translation of what people on the stage are saying."*

### Why Google Translate Fails in Church:
1. **It assumes 1-on-1 near-field conversations:** Phones held 2 inches from mouth. A church sanctuary has distant, echoing loudspeakers.
2. **OS Noise Suppression Kills the Audio:** Android's telecom call algorithms treat room reverberation and distant loudspeakers as "background noise" and aggressively mute them.
3. **Dual-Stage Language Collision:** When a pastor preaches in English and an on-stage interpreter repeats in Spanish, Google Translate chokes, mixes sentences, or translates the translated speech.
4. **Worship Pad Lockup:** Ongoing keyboard synth pads trick voice detectors into thinking a sentence never ends.

---

## 2. The 4 Hard Technical Problems & Engineered Solutions (5 Minutes)

### Challenge A: Low Input & OS Noise Cancellation
* **The Problem:** The visitor sits in the 20th row. PA speakers are quiet, far away, and reverberant.
* **Our Solution:**
  1. **OS Noise Gate Bypass:** Explicitly request raw audio streams without Android's default `noiseSuppression`, `echoCancellation`, or `autoGainControl`.
  2. **3-Stage Digital Pre-Amp:**
     * `+2dB` (Front Row)
     * `+12dB Pew Boost` (4x linear signal gain for middle benches)
     * `+22dB Back Row Max` (12.5x gain with a 6:1 dynamic range compressor so soft prayers and loud shouts stay balanced).

### Challenge B: Multiple Voices & Languages on Stage
* **The Problem:** Preacher speaks Language A; Interpreter on stage speaks Language B.
* **Our Solution:**
  * **Speaker Diarization:** AI tags speakers separately (`Speaker 1` vs `Translator 2`).
  * **Voice Locking (Mute Interpreter):** With 1 tap, the listener locks onto `Speaker 1`. The on-stage interpreter is filtered out so the user only hears the direct sermon translation in their earphones.
  * **2 Windows Mode:** Splits screen into simultaneous top/bottom cards.

### Challenge C: Background Synth Pads & Room Acoustics
* **The Problem:** Worship keys playing under sermon speech fool standard Voice Activity Detection (VAD).
* **Our Solution:**
  * `90Hz High-Pass Filter`: Cuts room HVAC rumble and stage thumps.
  * `280Hz Notch Filter`: Specifically ducks the harmonic mud of worship synth pads.
  * `2.4kHz Presence Peak`: Sharpens vocal consonants before hitting speech-to-text.

### Challenge D: Regional Dialects & Church Terminology
* **The Problem:** Swiss French (*huitante*) vs Canadian French; Southern US accents; theological idioms ("grace", "sanctification", "Romans 8").
* **Our Solution:**
  * Direct context injection into the multimodal prompt ensures religious and regional vocabulary are translated naturally instead of literally.

---

## 3. Variants Tested & AI Engine Comparison (4 Minutes)

| AI Engine | Speech-to-Text | Translation | Voice Output (TTS) | Cost per Hour | Pros & Cons for Church App |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Traditional 3-Step Chain** *(Whisper + DeepL + ElevenLabs)* | OpenAI Whisper | DeepL API | ElevenLabs | ~$1.80 – $3.50/hr | ❌ Too slow (4–7s latency). High token cost. Overkill. |
| **Google Gemini 2.5 Flash (Direct Multimodal Audio)** | Native Gemini Audio | Native Gemini | Gemini Preview TTS / Edge Neural | **~$0.18 – $0.40/hr** |  **Best Architecture.** Understands raw audio chunks directly. Distinguishes multiple speakers. Context-aware dialect handling. Low cost. |
| **Deepgram Nova-3 + Fast LLM** | Deepgram Nova-3 | Groq / Llama-3 | Edge Neural TTS | ~$0.35 – $0.60/hr |  Great streaming diarization. Requires maintaining two separate vendor API keys. |
| **OpenRouter (Free LLMs) + Web Speech** | Web Speech API | Llama-3-Free via OpenRouter | Browser Speech | **$0.00** |  Good for zero-cost demo. ⚠️ Cannot do acoustic speaker diarization from raw loudspeaker audio without multimodal API. |

### Conclusion on AI Engine:
* **Production Recommendation:** **Gemini 2.5 Flash Multimodal** for STT + Translation (cost-effective, handles raw church audio & diarization in 1 call) paired with **Neural Edge TTS** for zero-cost, natural female earphone speech.

---

## 4. AI Credit & Token Economics (3 Minutes)

Bard's question: *"How to handle AI credits? Preferably pre-paid."*

### The Unit Economics:
* 1 hour of continuous sermon speech $\approx$ 15,000–20,000 speech tokens.
* With Gemini 2.5 Flash, 1 hour of translation costs **~$0.20 in raw API tokens**.
* Edge Neural speech-to-speech costs **$0.00**.

### Pre-Paid Wallet Model (Designed in the MVP):
1. **Single Service Pass:** 90 Minutes $\rightarrow$ **$1.99** *(~90% gross margin)*
2. **Monthly Believer Pack:** 360 Minutes (4 Services) $\rightarrow$ **$5.99**
3. **Visiting Congregation / Mission Pack:** 1,500 Minutes $\rightarrow$ **$19.99**

> **Church Sponsor Variant:** Churches can buy a "Sanctuary License" ($29/month) that unlocks unlimited free translation for any visitor connected to their church Wi-Fi or geolocation.

---

## 5. Live Prototype Walkthrough (3 Minutes)

Show **https://sanctuary-voice.vercel.app/** on screen:

1. **Android Phone Mockup:** Show clean 3-button layout (`Audio ON/OFF`, `Tap to Listen`, `+12dB Pew Boost`).
2. **Tap "Stage Demo":**
   * Preacher speaks Southern US English over synth pad $\rightarrow$ translated instantly into Norwegian / Tagalog in a clean female voice.
   * Point out that Translator 2 (Swiss French) appears on screen but is **automatically muted in the earphones**.
   * Tap **"2 Windows"** to demonstrate simultaneous dual-voice feed.
3. **Demonstrate the "Pew Boost":** Show the `+2dB` $\rightarrow$ `+12dB` $\rightarrow$ `+22dB` distance toggle.

---

## 6. Takeaway for Bard's Team
> *"The goal today is not to lock in design decisions, but to understand the real-world acoustic, linguistic, and economic constraints of churches so our AI stack solves the actual problem rather than building another toy translator."*

