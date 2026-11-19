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
* **The Problem:** In international or bilingual services, Speaker 1 preaches in Language A (e.g., English or Korean) and an on-stage Interpreter translates into Language B (e.g., French), while floor or pew noise can interfere. Standard translation tools merge them or translate the already-translated speech.
* **Our Solution:**
  * **Real-Time Speaker Diarization (Majority-Vote):** Separates distinct stage voices (`Speaker 1`, `Speaker 2`, `Speaker N`) using word-level majority-vote speaker detection across every live phrase.
  * **One-Tap Voice Locking & Speaker Mute:** Tap any speaker pill to isolate only that voice in your earphones, use **Auto-Follow** to track the active stage speaker, or tap the **Mute (`VolumeX`)** icon on any speaker pill to silence floor/background voices permanently.
  * **2 Windows Mode:** Splits the screen into two independent simultaneous feeds (Top: Preacher, Bottom: Interpreter).

### 2. Low Input, Weak Loudspeakers, Bluetooth Earphones & OS Noise Cancellation
* **The Problem:** Sitting in distant church pews with weak PA loudspeakers causes mobile OS noise cancellation to mute stage speech. Worse, plugging in wired earphones or connecting Bluetooth earbuds normally switches the microphone input to the earbud mic (which cancels out the pastor's PA speakers).
* **Our Solution:**
  * **Bluetooth & Earphone Split Audio Routing:** Automatically prefers the **phone's built-in microphone** for capturing the pulpit PA while routing translated speech to **Bluetooth/wired earphones** in full A2DP quality (`AudioManager.MODE_NORMAL` on Android + live `devicechange` re-locking in the browser).
  * **Raw 16kHz Mono PCM Streaming:** Streams headerless `linear16` PCM (~85ms frames) directly over WebSocket—eliminating WebM container dropouts on reconnects and enabling seamless mid-sermon language switching.
  * **OS Noise Gate Bypass:** Disables native `noiseSuppression`, `echoCancellation`, and `autoGainControl` so distant stage acoustics are preserved.
  * **3-Stage Distance Pre-Amp Boost:**
    * `+2dB Front Row` (Near the stage / high sound pressure)
    * `+12dB Pew Boost` (4x amplification for standard church bench seating)
    * `+22dB Back Row Max` (12.5x amplification with dynamic compression for distant pews / weak PA systems)
  * **6:1 Dynamic Range Compressor:** Automatically balances soft prayers and loud preaching.

### 3. Regional Dialects, Theological Context & Custom Church Glossary
* **The Problem:** Regional accents, pastor names, church names, and biblical terms ("grace", "anointing", "Maranatha", "Romans 8") trip up generic speech and translation models.
* **Our Solution:**
  * **DeepL Neural Translation (~150ms) + Gemini / Google Fallback:** High-fidelity biblical and literary translation via DeepL API with automatic failover to Google Neural and Gemini 2.5 Flash.
  * **Live Church Glossary & Custom Keyterm Boosting:** Manage custom pastor names, ministry names, and biblical vocabulary inside Settings—automatically injected into Deepgram Nova-3 (`keyterm`) and Nova-2 (`keywords`) in real time.

### 4. Background Worship Synth Pads, Room Noise & Offline Sanctuaries
* **The Problem:** Continuous ambient worship keys and room chatter trigger false transcriptions, while rural or missionary sanctuaries often lose internet mid-service.
* **Our Solution:**
  * **90Hz High-Pass Filter & 280Hz Synth Pad Ducking EQ:** Cuts stage rumble and keyboard mud while boosting 2.4kHz vocal consonant clarity.
  * **Dynamic Vocal Formant Gate (`300Hz–3400Hz`):** Dynamically computes FFT bins from the device's actual hardware sample rate (`44.1kHz`/`48kHz`) so musical pads alone never trigger false voice detection.
  * **Confidence & Hallucination Filter:** Drops low-confidence room noise and music artifacts before translation.
  * **Offline Sanctuary Edge Fallback:** Automatically detects network loss and switches to an on-device speech & offline theological vocabulary engine so rural/missionary sanctuaries keep running without internet.

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
| **Web Audio API (16kHz PCM)** | Acoustic DSP & Raw PCM Streaming | Native mobile audio APIs choke on distant loudspeakers, and WebM MediaRecorder breaks on WebSocket reconnects. | Hardware OS noise-gate bypass; custom `+2dB` to `+22dB` pre-amp gain; `90Hz` rumble filter; `280Hz` synth ducking; built-in phone mic auto-selection; raw 16kHz `linear16` PCM streaming. |
| **Deepgram Nova-3 / Nova-2** | Real-Time Speech Recognition | Sub-second live streaming (~300ms) with multi-speaker stage diarization and live custom keyterm boosting. | Majority-vote speaker separation; confidence/hallucination gating; seamless mid-sermon language switching. |
| **DeepL Neural Translation** | Primary Low-Latency NMT (~150ms) | Benchmark gold standard for nuanced, high-fidelity biblical and linguistic translation. | Preserves complex grammatical clause structures across European, Asian, and Latin American languages at ~150ms turnaround. |
| **Google Gemini 2.5 Flash** | Multimodal Fallback Translation | Direct multimodal audio processing for sermon contextual synthesis when WebSocket/REST fallback is engaged. | Native speaker diarization; dialect and theological terminology awareness; automatic failover safety net. |
| **Offline Edge Engine** | Zero-Internet Sanctuary Fallback | Rural and missionary churches frequently face unstable or absent Wi-Fi/cellular connections. | Automatic `online`/`offline` detection with on-device speech recognition and built-in multilingual theological dictionary. |
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

### 3. Backend-Managed API Security
* **Zero Client-Side Keys Required:** End-users and church attendees do not need to obtain, manage, or input any API keys in the app.
* **Secure Cloud Proxy:** All speech recognition, neural translation, and TTS requests route through secure backend serverless endpoints (`/api/deepgram-token`, `/api/translate`, `/api/gemini-translate`, `/api/deepgram-transcribe`) configured via environment variables (`DEEPGRAM_API_KEY`, `DEEPL_API_KEY`, `GEMINI_API_KEY`).
* **Zero Configuration for Visitors:** Visitors simply open the web app or Android APK and start listening immediately without configuration barriers.

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
