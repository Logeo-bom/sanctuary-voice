# SanctuaryVoice 🕊️

> **Simultaneous Church Stage Voice Translator for Visitors & Congregations**  
> *Built for the "Help a Million Churches" time-boxed sprint.*

---

## 🌟 The Mission
When visiting any church worldwide, a visitor brings their mobile phone, puts earphones on, and immediately reads (**Priority 1: Speech-to-Text**) and hears (**Priority 2: Speech-to-Speech**) what people on stage are saying in real time.

---

## 🎯 How Bard's 4 Core Challenges Are Solved

### 1. Multiple Voices & Languages on Stage
* **The Problem:** In international/bilingual services, Speaker 1 preaches in Language A (e.g., English) and an on-stage Interpreter translates into Language B (e.g., French). Standard translation apps merge them or translate the already-translated speech.
* **Our Solution:**
  * **Speaker Diarization & Separation:** Distinguishes Speaker 1 from on-stage Translator 2.
  * **One-Tap Voice Locking:** Tap **Speaker 1** to mute the stage interpreter in your earphones so you only hear the original message.
  * **2 Windows Mode:** Splits the screen into two independent simultaneous feeds (Top: Preacher, Bottom: Interpreter).

### 2. Low Input, Weak Loudspeakers & OS Noise Cancellation
* **The Problem:** Sitting in the back pew with distant, reverberant loudspeakers causes phone operating systems to mistake stage speech for "background noise" and mute it.
* **Our Solution:**
  * **OS Noise Gate Bypass:** Disables native `noiseSuppression`, `echoCancellation`, and `autoGainControl` so distant acoustics are preserved.
  * **One-Tap Distance Pre-Amp Boost:** Hardware gain control with 3 levels:
    * `+2dB Front Row`
    * `+12dB Pew Boost` (4x gain)
    * `+22dB Back Row Max` (12.5x gain)
  * **6:1 Dynamic Range Compressor:** Automatically balances soft prayers and loud preaching.

### 3. Regional Dialects & Theological Context
* **The Problem:** Swiss French is distinct from Canadian French; regional accents and biblical terms ("grace", "anointing", "Romans 8") trip up generic translation.
* **Our Solution:**
  * Context-aware translation handles nuanced regional dialects and theological terminology smoothly across 12 languages.

### 4. Background Worship Synth Pads & Organ Noise
* **The Problem:** Continuous ambient worship keys trick Voice Activity Detection (VAD) into thinking a sentence never ends.
* **Our Solution:**
  * **90Hz High-Pass Filter:** Removes stage rumble and HVAC hum.
  * **280Hz Synth Pad Ducking EQ:** Attenuates keyboard wash while boosting 2.4kHz vocal consonant clarity.
  * **Vocal Formant Gate:** Evaluates the 300Hz–3.4kHz human frequency band so musical pads alone never trigger false translations.

---

## 📱 User Interface & Feature Guide

The app is built inside an Android phone interface:

| Control | Description |
| :--- | :--- |
| **Stage Demo (Yellow Button)** | Runs an instant dual-stage simulation (Southern US Preacher + Swiss French Interpreter over synth pad) in any target language. |
| **Translate To (My Earphones)** | Pick from 12 languages (Tagalog, Norwegian, English, French, Spanish, German, Portuguese, Ukrainian, Korean, Swahili, Arabic, Mandarin). |
| **All Voices / Speaker 1 / Translator 2** | Filter which voice you want to follow; muting the other automatically. |
| **2 Windows** | View both speakers translated simultaneously in split windows. |
| **Audio ON / Text Only** | Toggles speech-to-speech in your earphones. |
| **Tap to Listen (Center Button)** | Starts/stops live phone microphone capture. |
| **Distance Boost (+dB Button)** | Toggles between Front Row (`+2dB`), Pew Boost (`+12dB`), and Back Row Max (`+22dB`). |
| **Settings (Gear Icon)** | Configure Gemini API keys, choose between Cloud Neural or Gemini Studio voices (`Aoede`, `Charon`, `Kore`, `Fenrir`), and view Pre-Paid minutes balance. |

---

## 🛠️ Tech Stack

* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
* **Audio DSP:** Web Audio API (`AudioContext`, Biquad Filters, Compressor, Analyser)
* **Translation & STT:** Google Gemini 2.5 Flash / Web Speech Recognition fallback
* **Speech-to-Speech (TTS):** Cloud Neural Audio Proxy (with pitch preservation & catch-up speed) + Gemini 2.5 Flash Preview TTS
* **Mobile Runtime:** Capacitor 7 (`android/` native project with `RECORD_AUDIO` and `FLAG_KEEP_SCREEN_ON`)

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

To open on your Android phone, connect to the same Wi-Fi and open the network address shown in the terminal.

---

## 📦 Building Native Android APK

```powershell
# Build web assets and sync to native Android project
npm.cmd run build
npx.cmd cap sync android

# Open in Android Studio to build APK or run on USB-connected device
npx.cmd cap open android
```
