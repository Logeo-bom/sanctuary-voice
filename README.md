# SanctuaryVoice 🕊️

> **Simultaneous Church Stage Voice Translator for Visitors & Congregations**  
> *Built for the "Help a Million Churches" 1-Day Time-Boxed Engineering Sprint.*

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-success?style=for-the-badge&logo=vercel)](https://sanctuary-voice.vercel.app/)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Repository-blue?style=for-the-badge&logo=github)](https://github.com/jasonvelasquez1410/sanctuary-voice)
[![Platform](https://img.shields.io/badge/Platform-Android%20%2F%20PWA-green?style=for-the-badge&logo=android)](https://github.com/jasonvelasquez1410/sanctuary-voice)

---

## 🌟 The Mission
When visiting any church worldwide, a visitor brings their mobile phone, puts earphones on, and immediately reads (**Priority 1: Speech-to-Text**) and hears (**Priority 2: Speech-to-Speech**) what people on the stage are saying in real time—without requiring expensive church equipment or tiring voluntary interpreters.

---

## 🎯 How Bard's 4 Core Challenges Are Solved

### 1. Multiple Voices & Languages on Stage
* **The Problem:** In international or bilingual services, Speaker 1 preaches in Language A (e.g., English) and an on-stage Interpreter translates into Language B (e.g., French). Standard translation tools merge them or translate the already-translated speech.
* **Our Solution:**
  * **Speaker Diarization:** Distinguishes Speaker 1 from on-stage Translator 2.
  * **One-Tap Voice Locking:** Tap **Speaker 1** to mute the stage interpreter in your earphones so you only hear the original message translated directly.
  * **2 Windows Mode:** Splits the screen into two independent simultaneous feeds (Top: Preacher, Bottom: Interpreter).

### 2. Low Input, Weak Loudspeakers & OS Noise Cancellation
* **The Problem:** Sitting in distant church benches (pews) with weak or reverberant loudspeakers causes mobile operating systems to treat stage speech as "background noise" and mute it.
* **Our Solution:**
  * **OS Noise Gate Bypass:** Disables native `noiseSuppression`, `echoCancellation`, and `autoGainControl` so distant stage acoustics are preserved.
  * **3-Stage Distance Pre-Amp Boost:**
    * `+2dB Front Row` (Near the stage / high sound pressure)
    * `+12dB Pew Boost` (4x amplification for standard church bench seating)
    * `+22dB Back Row Max` (12.5x amplification with dynamic compression for distant pews / weak PA systems)
  * **6:1 Dynamic Range Compressor:** Automatically balances soft prayers and loud preaching.

### 3. Regional Dialects & Theological Context
* **The Problem:** Swiss French is distinct from Canadian French; regional accents and biblical terms ("grace", "anointing", "Romans 8") trip up generic translation models.
* **Our Solution:**
  * Context-aware translation models (Google Gemini & DeepL Neural Machine Translation) handle nuanced regional dialects, compound syntactic clauses, and theological terminology smoothly across 12+ supported languages.

### 4. Background Worship Synth Pads & Organ Noise
* **The Problem:** Continuous ambient worship keys trick Voice Activity Detection (VAD) into thinking a sentence never ends.
* **Our Solution:**
  * **90Hz High-Pass Filter:** Removes stage rumble, foot traffic, and HVAC hum.
  * **280Hz Synth Pad Ducking EQ:** Attenuates keyboard mud while boosting 2.4kHz vocal consonant clarity.
  * **Vocal Formant Gate:** Evaluates the 300Hz–3.4kHz human voice band so musical pads alone never trigger false translations.

---

## 📱 User Interface & Feature Guide

The app is built inside a clean, thumb-friendly Android phone interface:

| Control | Description |
| :--- | :--- |
| **Stage Demo (Yellow Button)** | Runs an instant dual-stage simulation (Southern US Preacher + Swiss French Interpreter over synth pad) in any target language without requiring microphone permissions. |
| **Translate To (My Earphones)** | Pick from 12 languages (Tagalog, Norwegian, English, French, Spanish, German, Portuguese, Ukrainian, Korean, Swahili, Arabic, Mandarin). |
| **All Voices / Speaker 1 / Translator 2** | Filter which stage voice you want to follow; muting the other voice automatically in your earphones. |
| **2 Windows** | View both speakers translated simultaneously in split windows. |
| **Audio ON / Text Only** | Toggles speech-to-speech in your earphones. |
| **Tap to Listen (Center Button)** | Starts/stops live phone microphone capture. |
| **Distance Boost (+dB Button)** | Cycles between Front Row (`+2dB`), Pew Boost (`+12dB`), and Back Row Max (`+22dB`). |
| **Settings (Gear Icon)** | Configure AI Translation Engines (Deepgram, Google Gemini, DeepL Neural Translation), choose between Cloud Neural or Gemini Studio voices (`Aoede`, `Charon`, `Kore`, `Fenrir`), and view Pre-Paid minutes balance. |

---

## 🛠️ Tech Stack & Engineering Rationale

| Technology | Role | Why We Chose It | Key Advantages |
| :--- | :--- | :--- | :--- |
| **Capacitor 7** | Mobile Native Runtime | Required for the "Android-first" mandate while enabling instant web testing for reviewers. | Unified codebase for Web + Android APK; native hardware bridge for `RECORD_AUDIO` and `FLAG_KEEP_SCREEN_ON`. |
| **React 19 + TypeScript** | Frontend UI Framework | Real-time state management for continuous audio streams, speaker tabs, and decibel meters. | Strict type safety for translation segments and DSP states; predictable component transitions; high modularity. |
| **Vite 8** | Bundler & Dev Server | Fast iteration and sub-second builds essential for a 1-day engineering timebox. | Sub-second Hot Module Replacement (HMR); `--host` network flag for instant physical Android Wi-Fi testing. |
| **Web Audio API** | Acoustic DSP & Audio Graph | Native mobile audio APIs choke on distant loudspeakers due to cell-phone noise cancellation algorithms. | Hardware OS noise-gate bypass; custom `+2dB` to `+22dB` pre-amp gain; `90Hz` rumble filter; `280Hz` synth ducking filter. |
| **Google Gemini 2.5 Flash** | Multimodal Audio Translation | Direct multimodal audio processing for sermon contextual synthesis. | Native speaker diarization (separates Speaker 1 and Translator 2); dialect and theological terminology awareness; continuous sentence resolution. |
| **DeepL Neural Translation** | Precision Literary & Theological NMT | Benchmark gold standard for nuanced, high-fidelity biblical and linguistic translation. | Preserves complex grammatical clause structures across European, Asian, and Latin American languages without losing nuance. |
| **Deepgram Nova-2** | Real-Time Speech Recognition | Low-latency live speech streaming (~300ms) with dual-speaker stage diarization. | Sub-second simultaneous transcription for real-time live earphone streaming in sanctuary seating. |
| **Edge Neural TTS Proxy** | Speech-to-Speech Output | Standard browser/OS voices sound robotic when speaking non-English translations. | Authentic native accents across all 12 languages; pitch preservation (`preservesPitch = true`); zero user configuration. |
| **Tailwind CSS v4** | UI Styling | Rapid, clean implementation of an Android mockup with zero runtime CSS overhead. | Thumb-first ergonomics; minimal battery consumption on mobile devices; crisp dark-mode sanctuary styling. |

---

## 💰 Business Model: Pre-Paid Token Financing & AI Credit Handling

To cover multimodal AI token and cloud streaming costs without complex recurring subscriptions or ad monetization:

### 1. Pre-Paid Sanctuary Pass Wallet
* **Real-Time Minute Metering:** Translates actual sermon audio time into underlying AI token consumption (Deepgram WebSocket audio frames, Gemini Multimodal audio input tokens, DeepL character counts, and Edge TTS speech frames).
* **Live In-App Balance:** The Settings modal (`⚙️`) displays remaining active translation minutes with real-time deduction as you listen during a service.

### 2. Pricing Tiers & Credit Packs
* **Single Service Pass (90 Minutes · $1.99):** Covers one full Sunday worship service and sermon.
* **Monthly Believer Pack (360 Minutes · $5.99):** Covers four Sunday services plus weekly prayer/fellowship meetings.
* **Visiting Congregation Pack (1,500 Minutes · $19.99):** Built for multi-day church conferences, guest preachers, revival meetings, and overseas mission trips.

### 3. Self-Hosted & BYOK (Bring Your Own Key) Support
* **Zero Credit Consumption:** Churches, AV media teams, or individual users who provide their own Google Gemini API key or deploy on their own Vercel/Cloud backend bypass pre-paid wallet deductions and utilize their direct cloud quotas.
* **No Middleman Lock-in:** Fully self-hostable without per-attendee licensing fees.

---

## 🚀 Running Locally

```powershell
# 1. Install dependencies
npm install

# 2. Start dev server (broadcasts to your Wi-Fi for mobile testing)
npm.cmd run dev -- --host

# 3. Open in your browser
http://localhost:5173/
```

To test on a physical Android phone, connect to the same Wi-Fi network and open the IP address displayed in the terminal.

---

## 📦 Building Native Android APK

```powershell
# Build web assets and sync to native Android project
npm.cmd run build
npx.cmd cap sync android

# Open in Android Studio to build APK or run on USB-connected device
npx.cmd cap open android
```

---

## 🌐 Live Deployment
* **Live Web App:** [https://sanctuary-voice.vercel.app/](https://sanctuary-voice.vercel.app/)
* **GitHub Repository:** [https://github.com/jasonvelasquez1410/sanctuary-voice](https://github.com/jasonvelasquez1410/sanctuary-voice)
