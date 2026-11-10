import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def create_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    COLOR_BG = RGBColor(11, 15, 25)         # Slate 950
    COLOR_CARD = RGBColor(23, 32, 51)       # Slate 900
    COLOR_ACCENT = RGBColor(56, 189, 248)   # Sky 400
    COLOR_MUTED = RGBColor(148, 163, 184)   # Slate 400
    COLOR_WHITE = RGBColor(255, 255, 255)
    COLOR_EMERALD = RGBColor(52, 211, 153)
    COLOR_AMBER = RGBColor(251, 191, 36)

    def set_slide_background(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = COLOR_BG
        bg.line.fill.background()
        return bg

    blank_layout = prs.slide_layouts[6]

    # --- SLIDE 1: Title ---
    s1 = prs.slides.add_slide(blank_layout)
    set_slide_background(s1)

    title_box = s1.shapes.add_textbox(Inches(1.2), Inches(1.5), Inches(10.9), Inches(3.5))
    tf1 = title_box.text_frame
    tf1.word_wrap = True

    p_badge = tf1.paragraphs[0]
    p_badge.text = "🕊️ HELP A MILLION CHURCHES INITIATIVE"
    p_badge.font.size = Pt(13)
    p_badge.font.bold = True
    p_badge.font.color.rgb = COLOR_ACCENT

    p_title = tf1.add_paragraph()
    p_title.text = "Real-Time Sanctuary Voice Translator"
    p_title.font.size = Pt(44)
    p_title.font.bold = True
    p_title.font.color.rgb = COLOR_WHITE
    p_title.space_before = Pt(14)

    p_sub = tf1.add_paragraph()
    p_sub.text = "Technical Architecture, Dave Farley Spec-Driven Engineering & Production AI Strategy"
    p_sub.font.size = Pt(20)
    p_sub.font.color.rgb = COLOR_MUTED
    p_sub.space_before = Pt(12)

    # Info cards at bottom
    meta_box = s1.shapes.add_textbox(Inches(1.2), Inches(5.4), Inches(10.9), Inches(1.2))
    tf_meta = meta_box.text_frame
    p_meta = tf_meta.paragraphs[0]
    p_meta.text = "Presenter: Jason Velasquez   |   Target: Bard & Engineering Team   |   Duration: 15–20 Mins   |   Live Demo: sanctuary-voice.vercel.app"
    p_meta.font.size = Pt(14)
    p_meta.font.color.rgb = COLOR_ACCENT

    # Helper for slide headers
    def add_slide_header(slide, subtitle, title):
        set_slide_background(slide)
        hb = slide.shapes.add_textbox(Inches(1.0), Inches(0.6), Inches(11.3), Inches(1.2))
        tf = hb.text_frame
        p_sub = tf.paragraphs[0]
        p_sub.text = subtitle.upper()
        p_sub.font.size = Pt(11)
        p_sub.font.bold = True
        p_sub.font.color.rgb = COLOR_ACCENT

        p_t = tf.add_paragraph()
        p_t.text = title
        p_t.font.size = Pt(28)
        p_t.font.bold = True
        p_t.font.color.rgb = COLOR_WHITE
        p_t.space_before = Pt(4)

    # --- SLIDE 2: Dave Farley Framing ---
    s2 = prs.slides.add_slide(blank_layout)
    add_slide_header(s2, "Engineering Methodology", "Specification-Driven AI vs. Haphazard Vibe Coding")

    # Left card: Vibe coding
    c1 = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(2.0), Inches(5.4), Inches(4.7))
    c1.fill.solid()
    c1.fill.fore_color.rgb = COLOR_CARD
    c1.line.color.rgb = RGBColor(239, 68, 68)
    tf_c1 = c1.text_frame
    tf_c1.word_wrap = True
    p1 = tf_c1.paragraphs[0]
    p1.text = "❌ Vague Prompting ('Vibe Coding')"
    p1.font.size = Pt(18)
    p1.font.bold = True
    p1.font.color.rgb = RGBColor(248, 113, 113)

    bullet_c1 = [
        "Prompt: 'Write a church translator app in React.'",
        "Assumes 1-on-1 near-field conversations (mic 2 inches away).",
        "OS noise cancellation aggressively destroys distant loudspeaker audio.",
        "Bilingual pastor/interpreter speech collides into scrambled captions.",
        "Continuous worship synth pads cause infinite speech lockups."
    ]
    for b in bullet_c1:
        p = tf_c1.add_paragraph()
        p.text = "• " + b
        p.font.size = Pt(13)
        p.font.color.rgb = COLOR_MUTED
        p.space_before = Pt(8)

    # Right card: Spec-driven
    c2 = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.8), Inches(2.0), Inches(5.5), Inches(4.7))
    c2.fill.solid()
    c2.fill.fore_color.rgb = COLOR_CARD
    c2.line.color.rgb = COLOR_EMERALD
    tf_c2 = c2.text_frame
    tf_c2.word_wrap = True
    p2 = tf_c2.paragraphs[0]
    p2.text = "✅ Dave Farley Spec-Driven Architecture"
    p2.font.size = Pt(18)
    p2.font.bold = True
    p2.font.color.rgb = COLOR_EMERALD

    bullet_c2 = [
        "Spec 1: Acoustic Pre-Amp (+22dB Back Row) with 6:1 Dynamic Compression.",
        "Spec 2: 90Hz Low-Cut + 280Hz Worship Synth Notch Ducking Filter.",
        "Spec 3: Stage Speaker Diarization with 1-Tap Ambient Voice Muting.",
        "Spec 4: Continuous WebSocket Streaming (eliminates CORS & header loss).",
        "Result: Testable, robust production software solving real physical constraints."
    ]
    for b in bullet_c2:
        p = tf_c2.add_paragraph()
        p.text = "• " + b
        p.font.size = Pt(13)
        p.font.color.rgb = COLOR_WHITE
        p.space_before = Pt(8)

    # --- SLIDE 3: The 4 Sanctuary Physics Specs ---
    s3 = prs.slides.add_slide(blank_layout)
    add_slide_header(s3, "Acoustic Engineering", "The 4 Physical Challenges Solved in SanctuaryVoice")

    specs = [
        ("1. Weak PA Loudspeaker & Back Pews", "Bypass OS noise gates (echoCancellation: false). Add 3-tier pre-amp (+2dB, +12dB Pew Boost, +22dB Back Row) with 6:1 compressor so whispers and shouts stay level.", COLOR_ACCENT),
        ("2. Organ & Synth Pad Ducking", "Continuous worship keyboard pads fool voice detection. Engineered 90Hz high-pass (cuts rumble), 280Hz notch (ducks pad mud), and 2.4kHz presence boost.", RGBColor(129, 140, 248)),
        ("3. Stage Interpreters & Shouting", "Solves Bard's Brazilian church visit: Pastor preaches on PA while a lady shouts in the spirit. Deepgram tags speakers; user mutes floor speech in 1 tap.", COLOR_AMBER),
        ("4. Dialect & Theological Context", "Theological terms ('justification', 'sanctification') and local accents (Swiss French, Brazilian Portuguese) preserved via contextual domain prompt injection.", COLOR_EMERALD)
    ]

    for idx, (title, desc, color) in enumerate(specs):
        col = idx % 2
        row = idx // 2
        x = Inches(1.0 + col * 5.8)
        y = Inches(2.0 + row * 2.4)
        c = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(5.5), Inches(2.1))
        c.fill.solid()
        c.fill.fore_color.rgb = COLOR_CARD
        c.line.color.rgb = color
        tf = c.text_frame
        tf.word_wrap = True
        pt = tf.paragraphs[0]
        pt.text = title
        pt.font.size = Pt(16)
        pt.font.bold = True
        pt.font.color.rgb = color
        pd = tf.add_paragraph()
        pd.text = desc
        pd.font.size = Pt(12)
        pd.font.color.rgb = COLOR_MUTED
        pd.space_before = Pt(6)

    # --- SLIDE 4: AI Engine Comparison ---
    s4 = prs.slides.add_slide(blank_layout)
    add_slide_header(s4, "AI Engines & Benchmarks", "Evaluating Speed, Accuracy & Cost for Church Audio")

    # Table
    t_shape = s4.shapes.add_table(5, 5, Inches(1.0), Inches(2.0), Inches(11.33), Inches(4.5))
    table = t_shape.table
    table.columns[0].width = Inches(3.2)
    table.columns[1].width = Inches(1.6)
    table.columns[2].width = Inches(2.2)
    table.columns[3].width = Inches(1.6)
    table.columns[4].width = Inches(2.73)

    headers = ["Engine Stack", "Latency", "Diarization", "Cost / Hour", "Church Production Fit"]
    for i, h in enumerate(headers):
        cell = table.cell(0, i)
        cell.fill.solid()
        cell.fill.fore_color.rgb = RGBColor(30, 41, 59)
        p = cell.text_frame.paragraphs[0]
        p.text = h
        p.font.bold = True
        p.font.size = Pt(13)
        p.font.color.rgb = COLOR_WHITE

    rows_data = [
        ("Traditional Chain (Whisper + DeepL + ElevenLabs)", "4.5–7.0s", "None (Manual)", "$2.50–$3.80", "❌ Too slow & expensive."),
        ("Deepgram Nova-2 + Neural Voice", "< 300ms", "Instant Streaming", "~$0.26 / hr", "🌟 Fastest live speed. $200 free credit."),
        ("Gemini 2.5 Flash Multimodal", "1.2–1.8s", "Multimodal Context", "~$0.20–$0.35", "🌟 Best theological context reasoning."),
        ("Browser Speech API + Free LLM", "1.5–3.0s", "None", "$0.00", "⚠️ Robotic voice. Offline fallback only.")
    ]

    for r_idx, row in enumerate(rows_data):
        for c_idx, val in enumerate(row):
            cell = table.cell(r_idx + 1, c_idx)
            cell.fill.solid()
            cell.fill.fore_color.rgb = COLOR_CARD
            p = cell.text_frame.paragraphs[0]
            p.text = val
            p.font.size = Pt(12)
            if c_idx == 0:
                p.font.bold = True
                p.font.color.rgb = COLOR_WHITE
            elif "🌟" in val:
                p.font.color.rgb = COLOR_EMERALD
            elif "❌" in val:
                p.font.color.rgb = RGBColor(248, 113, 113)
            else:
                p.font.color.rgb = COLOR_MUTED

    # --- SLIDE 5: Token Economics ---
    s5 = prs.slides.add_slide(blank_layout)
    add_slide_header(s5, "Business & Sustainability", "How to Handle AI Credits: Pre-Paid Token Economics")

    cards_econ = [
        ("1. Free Developer Credits", "$200 Credit (~770 Hours)", "Deepgram's free credit gives ~770 hours of live streaming diarization. This covers over 500 complete Sunday services at ZERO cloud cost during user testing.", COLOR_ACCENT),
        ("2. Pre-Paid User Passes", "$1.99 / $5.99 Packs", "Attendees buy passes: 90 Mins ($1.99), 360 Mins ($5.99). Since 1 hour costs only ~$0.20 in raw tokens, this achieves ~85% gross margin to finance servers and maintenance.", COLOR_EMERALD),
        ("3. Church Sponsorship", "$29 / Month License", "Churches purchase a monthly license so anyone on the church Wi-Fi or within the sanctuary geofence gets free unlimited translation sponsored by the church budget.", COLOR_AMBER)
    ]

    for i, (title, price, body, color) in enumerate(cards_econ):
        c = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0 + i * 3.9), Inches(2.0), Inches(3.6), Inches(4.8))
        c.fill.solid()
        c.fill.fore_color.rgb = COLOR_CARD
        c.line.color.rgb = color
        tf = c.text_frame
        tf.word_wrap = True
        pt = tf.paragraphs[0]
        pt.text = title.upper()
        pt.font.size = Pt(13)
        pt.font.bold = True
        pt.font.color.rgb = color
        pp = tf.add_paragraph()
        pp.text = price
        pp.font.size = Pt(22)
        pp.font.bold = True
        pp.font.color.rgb = COLOR_WHITE
        pp.space_before = Pt(8)
        pb = tf.add_paragraph()
        pb.text = body
        pb.font.size = Pt(13)
        pb.font.color.rgb = COLOR_MUTED
        pb.space_before = Pt(12)

    # --- SLIDE 6: The Prompts & Specifications Applied ---
    s6 = prs.slides.add_slide(blank_layout)
    add_slide_header(s6, "Prompt Engineering & Guardrails", "The 2 Specifications Applied (AI Prompt vs App Build Prompt)")

    pbox1 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(2.0), Inches(11.33), Inches(2.3))
    pbox1.fill.solid()
    pbox1.fill.fore_color.rgb = COLOR_CARD
    pbox1.line.color.rgb = RGBColor(192, 132, 252) # Purple
    tf1 = pbox1.text_frame
    tf1.word_wrap = True
    pt1 = tf1.paragraphs[0]
    pt1.text = "A. Coding Agent Meta-Prompt (How We Instructed the AI to Build the App)"
    pt1.font.size = Pt(14)
    pt1.font.bold = True
    pt1.font.color.rgb = RGBColor(192, 132, 252)

    build_bullets = [
        "Directive: 'Build a production-grade Church Voice Translator App called SanctuaryVoice using React 19, TypeScript, Vite 8, and Tailwind CSS v4.'",
        "Spec 1 (Acoustic DSP): Bypass OS noise cancellation, add 90Hz low-cut, 280Hz synth notch, 2.4kHz voice boost, and +22dB Pew Boost with 6:1 compressor.",
        "Spec 2 (Streaming STT): Connect native WebSocket to Deepgram Nova-2 with live diarization to separate the pastor from ambient shouting.",
        "Spec 3 (Earphone Speech): Implement uninterrupted clause-queued Neural TTS so translated sentences never cut off.",
        "Spec 4 (UI Shell): High-contrast dark auditorium theme with 1-tap voice locking, 2-window split screen, and pre-paid wallet passes."
    ]
    for b in build_bullets:
        p = tf1.add_paragraph()
        p.text = "• " + b
        p.font.size = Pt(10.5)
        p.font.color.rgb = COLOR_WHITE
        p.space_before = Pt(2.5)

    pbox2 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(4.5), Inches(11.33), Inches(2.3))
    pbox2.fill.solid()
    pbox2.fill.fore_color.rgb = COLOR_CARD
    pbox2.line.color.rgb = COLOR_ACCENT
    tf2 = pbox2.text_frame
    tf2.word_wrap = True
    pt2 = tf2.paragraphs[0]
    pt2.text = "B. Runtime AI System Prompt (Inside the App Code for Gemini / Deepgram Inference)"
    pt2.font.size = Pt(14)
    pt2.font.bold = True
    pt2.font.color.rgb = COLOR_ACCENT

    runtime_bullets = [
        "Role: Expert theological and multilingual church stage interpreter.",
        "Input: Raw streaming microphone audio captured inside a reverberant church auditorium.",
        "Rule 1 (Diarization): Diarize and distinguish between Speaker 1 (Pulpit Pastor), Translator 2 (Stage Interpreter), and ambient congregation.",
        "Rule 2 (Ducking): Duck or ignore persistent worship background instruments (keyboard organ pads, synth chords).",
        "Rule 3 (Tongues/Shouting): If ambient shouting or praying in tongues occurs, tag as [Congregation Vocalization] and preserve pulpit translation.",
        "Rule 4 (Delivery): Translate into dignified, reverent language suitable for an attendee wearing earphones."
    ]
    for b in runtime_bullets:
        p = tf2.add_paragraph()
        p.text = "• " + b
        p.font.size = Pt(10.5)
        p.font.color.rgb = COLOR_WHITE
        p.space_before = Pt(2.5)

    # --- SLIDE 7: Live Prototype Walkthrough ---
    s7 = prs.slides.add_slide(blank_layout)
    add_slide_header(s7, "Interactive Demonstration", "Walkthrough: sanctuary-voice.vercel.app")

    c_demo1 = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(1.0), Inches(2.0), Inches(5.5), Inches(3.6))
    c_demo1.fill.solid()
    c_demo1.fill.fore_color.rgb = COLOR_CARD
    c_demo1.line.color.rgb = COLOR_AMBER
    tf_d1 = c_demo1.text_frame
    tf_d1.word_wrap = True
    pd1 = tf_d1.paragraphs[0]
    pd1.text = "Preset 0: 'Bard's Sunday Visit'"
    pd1.font.size = Pt(18)
    pd1.font.bold = True
    pd1.font.color.rgb = COLOR_AMBER
    pb1 = tf_d1.add_paragraph()
    pb1.text = (
        "• Recreates Bard's experience in a Brazilian church.\n"
        "• Pastor preaches in Portuguese; a congregation member shouts in the spirit.\n"
        "• The app diarizes both speakers instantly.\n"
        "• Shouting is automatically muted in the listener's earphones while the pastor is translated cleanly."
    )
    pb1.font.size = Pt(13)
    pb1.font.color.rgb = COLOR_MUTED
    pb1.space_before = Pt(8)

    c_demo2 = s7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.8), Inches(2.0), Inches(5.5), Inches(3.6))
    c_demo2.fill.solid()
    c_demo2.fill.fore_color.rgb = COLOR_CARD
    c_demo2.line.color.rgb = COLOR_ACCENT
    tf_d2 = c_demo2.text_frame
    tf_d2.word_wrap = True
    pd2 = tf_d2.paragraphs[0]
    pd2.text = "Preset 1: 'Dual-Language Stage'"
    pd2.font.size = Pt(18)
    pd2.font.bold = True
    pd2.font.color.rgb = COLOR_ACCENT
    pb2 = tf_d2.add_paragraph()
    pb2.text = (
        "• Demonstrates international bilingual auditoriums.\n"
        "• Southern US Pastor + Swiss French Stage Interpreter over synth pad.\n"
        "• Demonstrates '2 Windows' split screen mode for reading both speakers simultaneously.\n"
        "• Demonstrates +22dB Pew Boost pre-amp for distant seating."
    )
    pb2.font.size = Pt(13)
    pb2.font.color.rgb = COLOR_MUTED
    pb2.space_before = Pt(8)

    link_box = s7.shapes.add_textbox(Inches(1.0), Inches(5.9), Inches(11.3), Inches(0.8))
    tfl = link_box.text_frame
    pl = tfl.paragraphs[0]
    pl.text = "🔗 Live Web & Android Mockup Deployed at: https://sanctuary-voice.vercel.app/"
    pl.font.size = Pt(14)
    pl.font.bold = True
    pl.font.color.rgb = COLOR_ACCENT

    # --- SLIDE 8: Full Production Tech Stack Architecture ---
    s8 = prs.slides.add_slide(blank_layout)
    add_slide_header(s8, "Engineering Architecture", "Complete Production Tech Stack (Outcome of Research)")

    tech_stack = [
        ("Frontend & State", "React 19 + Vite 8 + Tailwind v4", "Sub-millisecond reactive rendering, dark sanctuary theme, and mobile viewport virtualization.", COLOR_ACCENT),
        ("Acoustic DSP Engine", "Web Audio API + Biquad Filters", "90Hz low-cut, 280Hz synth pad notch, 2.4kHz presence peak, +22dB Pew Boost & 6:1 compressor.", RGBColor(129, 140, 248)),
        ("Live Streaming STT", "Deepgram Nova-2 (WebSocket)", "<300ms real-time diarization separating pastor from congregation shouting. $200 free credit.", COLOR_EMERALD),
        ("Context & Theological AI", "Google Gemini 2.5 Flash", "Multimodal audio reasoning, theological idiom preservation, and regional dialect translation.", COLOR_AMBER),
        ("Earphone Speech (TTS)", "Cloud Neural Voice (Free)", "Zero-cost natural human female voice with clause streaming queue to eliminate robotic voices.", RGBColor(192, 132, 252)),
        ("Mobile & Cloud Harness", "Capacitor 7 + Vercel Serverless", "Android native permissions (RECORD_AUDIO, WAKE_LOCK) + Edge Serverless Proxy bypassing CORS.", RGBColor(244, 114, 182))
    ]

    for idx, (layer, tech, detail, color) in enumerate(tech_stack):
        col = idx % 3
        row = idx // 3
        x = Inches(1.0 + col * 3.9)
        y = Inches(2.0 + row * 2.5)
        c = s8.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, Inches(3.6), Inches(2.2))
        c.fill.solid()
        c.fill.fore_color.rgb = COLOR_CARD
        c.line.color.rgb = color
        tf = c.text_frame
        tf.word_wrap = True
        p_l = tf.paragraphs[0]
        p_l.text = layer.upper()
        p_l.font.size = Pt(11)
        p_l.font.bold = True
        p_l.font.color.rgb = color
        p_t = tf.add_paragraph()
        p_t.text = tech
        p_t.font.size = Pt(15)
        p_t.font.bold = True
        p_t.font.color.rgb = COLOR_WHITE
        p_t.space_before = Pt(4)
        p_d = tf.add_paragraph()
        p_d.text = detail
        p_d.font.size = Pt(11)
        p_d.font.color.rgb = COLOR_MUTED
        p_d.space_before = Pt(6)

    # --- SLIDE 9: Team Roadmap ---
    s9 = prs.slides.add_slide(blank_layout)
    add_slide_header(s9, "Roadmap & Team Hand-off", "Modular Hand-off: How the Team Takes Over")

    modules = [
        ("Module 1", "Audio DSP Pipeline", "WebAudio frequency filters, distance calibration, mobile microphone permissions.", COLOR_ACCENT),
        ("Module 2", "Diarization & Streaming", "Deepgram / Gemini WebSocket streaming, low-latency speaker tagging.", RGBColor(129, 140, 248)),
        ("Module 3", "Token & Credit Wallet", "In-app purchases, pre-paid passes, Wi-Fi church sponsorship licensing.", COLOR_AMBER),
        ("Module 4", "Capacitor Mobile APK", "Android native packaging, background audio lock, earphone audio routing.", COLOR_EMERALD)
    ]

    for idx, (m_id, m_name, m_desc, m_color) in enumerate(modules):
        x = Inches(1.0 + idx * 2.9)
        c = s9.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, Inches(2.0), Inches(2.7), Inches(4.6))
        c.fill.solid()
        c.fill.fore_color.rgb = COLOR_CARD
        c.line.color.rgb = m_color
        tf = c.text_frame
        tf.word_wrap = True
        p_id = tf.paragraphs[0]
        p_id.text = m_id.upper()
        p_id.font.size = Pt(12)
        p_id.font.bold = True
        p_id.font.color.rgb = m_color
        p_name = tf.add_paragraph()
        p_name.text = m_name
        p_name.font.size = Pt(18)
        p_name.font.bold = True
        p_name.font.color.rgb = COLOR_WHITE
        p_name.space_before = Pt(6)
        p_desc = tf.add_paragraph()
        p_desc.text = m_desc
        p_desc.font.size = Pt(12)
        p_desc.font.color.rgb = COLOR_MUTED
        p_desc.space_before = Pt(12)

    output_filename = "presentation_briefing_v2.pptx"
    prs.save(output_filename)
    print(f"Presentation saved successfully: {output_filename}")

if __name__ == "__main__":
    create_deck()

