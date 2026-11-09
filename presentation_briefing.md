# "Help a Million Churches": Technical Briefing & Architecture Summary
**Speaker Guide & Presentation Deck for Bard's Team Meeting (15–20 Minutes)**

---

## ⏱️ Meeting Timing Breakdown (15–20 Min)

```
00:00 - 02:30 (2.5 min) │ 1. Framing: Dave Farley's Spec-Driven AI & Why Generic Apps Fail
02:30 - 07:30 (5.0 min) │ 2. The 4 Sanctuary Engineering Specs (Acoustics, Diarization, Muting, Dialects)
07:30 - 11:30 (4.0 min) │ 3. Variants Tested & AI Engine Benchmarks (Whisper vs Gemini vs Deepgram)
11:30 - 14:30 (3.0 min) │ 4. Sustainable AI Credit Economics (Deepgram Free Tier & Pre-Paid Passes)
14:30 - 18:00 (3.5 min) │ 5. Live Interactive Prototype Walkthrough (sanctuary-voice.vercel.app)
18:00 - 20:00 (2.0 min) │ 6. Hand-off & Next Steps: How the Team Can Build Test-First Modules
```

---

## 1. Framing: Spec-Driven AI vs. Vibe Coding (2.5 Minutes)

### Opening Tie-in (Bard's Video & Dave Farley):
> *"As Dave Farley highlighted in the video Bard shared on Modern Software Engineering, 'programming in English' doesn't mean typing vague prompts and hoping for working code. English has no compiler. To generate AI software that actually works in production, we must write rigorous, unambiguous domain specifications and test-first guardrails."*

### Why Generic Apps (Google Translate) Fail Without Domain Specs:
1. **Wrong Acoustic Model:** Generic tools assume 1-on-1 near-field audio (mic 2 inches from mouth). Churches have distant, reverberant loudspeakers 50 feet away in the 20th row.
2. **OS Noise Gate Destruction:** Android's default telephony noise cancellation treats sanctuary echo and distant speakers as "background noise" and mutes them.
3. **Dual-Speaker Collision:** In bilingual services (Pastor in English, Stage Interpreter in Spanish), generic tools mix voices together and create garbled translation loops.
4. **Organ & Synth Pad Lockup:** Ongoing keyboard pads fool voice activity detection (VAD) into thinking the speaker never stops.

---

## 2. The 4 Sanctuary Engineering Specs & Solutions (5 Minutes)

### Spec A: Hardware Pre-Amp & OS Noise Gate Bypass
* **Problem:** Back-pew worshippers receive low-amplitude, reverberant sound.
* **Engineered Solution:**
  1. Bypass Android OS call gates (`echoCancellation: false`, `noiseSuppression: false`).
  2. 3-Tier Distance Pre-Amp: `+2dB` (Front Row), `+12dB Pew Boost` (Middle Row), `+22dB Back Row Max` combined with a **6:1 dynamic range compressor** so whispers and shouts stay level.

### Spec B: Multi-Speaker Diarization & 1-Tap Voice Locking
* **Problem:** Stage interpreter speaking over the pastor, or congregation members shouting/praying in tongues (e.g. Bard's Brazilian church visit).
* **Engineered Solution:**
  * Diarization tags `Speaker 1` vs `Translator 2` vs `Congregation`.
  * **1-Tap Mute:** Listener selects `Speaker 1`; stage interpreter and shouting are muted in earphones while the pastor is translated into Norwegian/English.
  * **2 Windows Mode:** Displays simultaneous dual-feed transcription for bilingual auditoriums.

### Spec C: Worship Synth Pad Ducking Filters
* **Problem:** Continuous organ/pad chords drown out vocal consonants.
* **Engineered Solution:**
  * `90Hz High-Pass Filter`: Strips stage foot-thumps and air-conditioning rumble.
  * `280Hz Notch Filter`: Ducking notch targeting the exact resonance of church synth pads.
  * `2.4kHz Presence Peak`: Vocal clarity booster before sending audio to AI.

### Spec D: Theological & Regional Dialect Awareness
* **Problem:** Theological terms ("justification", "sanctification", Scripture citations) and regional dialects (Swiss French *huitante*, Brazilian Portuguese idioms).
* **Engineered Solution:**
  * Contextual system prompts inject church domain vocabulary directly into LLM inference.

---

## 3. Variants Tested & AI Engine Benchmarks (4 Minutes)

| AI Engine | Speech-to-Text | Diarization & Logic | Earphone Speech (TTS) | Cost / Hour | Verdict & Church Fit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Traditional Chain** *(Whisper + DeepL + ElevenLabs)* | Whisper API | Manual segmentation | ElevenLabs | ~$2.50 – $3.80/hr | ❌ Too slow (5–7s lag). Prohibitively expensive. |
| **Deepgram Nova-2 + Edge Neural** | Deepgram Nova-2 | Instant Diarization (<300ms) | Edge Neural Voice | **~$0.26/hr** *(Uses $200 Free Credit)* |  **Super Fast Diarization.** Separates Brazilian congregation shouting from the pastor in real-time. |
| **Gemini 2.5 Flash Multimodal** | Native Audio | Multimodal Reasoning | Gemini Studio Voice (`Charon`) | **~$0.20 – $0.35/hr** |  **Best Theological Accuracy.** Direct audio ingestion; handles regional dialects and theological nuances natively. |
| **Browser Speech + Free Web LLM** | Web Speech API | None | Desktop SAPI5 | **$0.00** | ⚠️ Desktop voice sounds robotic; zero diarization or church filtering. Useful only as offline fallback. |

---

## 4. AI Credit & Token Economics (3 Minutes)

*Bard's question: "How to handle AI credits? Can we take advantage of Deepgram credits and make it sustainable?"*

1. **Free Developer Credits for Zero-Cost Rollout:**
   * Deepgram's free $200 developer credit provides **~770 free hours** of live streaming diarization (~500 complete Sunday church services at zero cost).
2. **Pre-Paid User Wallet Model (In-App Passes):**
   * **Single Service Pass (90 Mins):** **$1.99** (~85% margin).
   * **Monthly Believer Pass (360 Mins / 4 Services):** **$5.99**.
   * **Missionary / Conference Pass (1,500 Mins):** **$19.99**.
3. **Church Sponsorship License:**
   * Churches pay $29/mo to sponsor all visitors connected to their church Wi-Fi or geofence.

---

## 5. Live Interactive Prototype Walkthrough (3.5 Minutes)

*Screen-share **https://sanctuary-voice.vercel.app/**:*

1. **The Mobile Shell:** Show the high-contrast auditorium UI designed for elderly congregants and dark sanctuaries.
2. **Demonstrate Pew Boost:** Toggle `+2dB` $\rightarrow$ `+12dB Pew Boost` $\rightarrow$ `+22dB Back Row` to show how distant PA volume is amplified.
3. **Play Preset 0 ("Bard's Sunday Visit - Brazilian Church"):**
   * Portuguese pastor preaches while congregation members shout/pray in the background.
   * Show that only the Pastor translates into Norwegian earphones; background shouting is tagged and muted.
4. **Play Preset 1 ("Dual-Language Stage"):**
   * Show Southern US Preacher + Swiss French Interpreter over synth pad.
   * Demonstrate **"2 Windows"** simultaneous split-screen mode.

---

## 6. Hand-off & Next Steps for the Team (2 Minutes)

*How this transitions into the team's workflow and test-first engineering:*

1. **Team Ownership & Test-First Modules:**
   * With the core architecture and specifications proven, individual modules can now be assigned to team members (Acoustic WebAudio DSP, Diarization WebSocket pipeline, In-App Token Wallet, Capacitor Android build).
   * Following Dave Farley's methodology: define clear acceptance tests for each module before implementation.
2. **Roadmap to Production:**
   * Deploy native Android APK test builds via Capacitor.
   * Test in real local church sanctuaries on upcoming Sundays.
   * Expand from the initial 12 supported languages.

