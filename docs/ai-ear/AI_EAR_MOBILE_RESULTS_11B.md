# AI-örat — mobile / layout results (Sprint 11B)

Method: headless Chromium against the local rig (real Smart kamera stage with the real AI-örat mode), touch emulation on for 390 and 430 px, dark theme as shipped by the app CSS. Not a physical device.

| Check | 390 px | 430 px | Desktop 1280 px |
| --- | --- | --- | --- |
| Horizontal overflow after every state (idle, ready, loading, 9 results, silence, invalid, oversized, errors) | 0 px | 0 px | 0 px |
| Record / choose-file / analyse / cancel / retry controls reachable and working | yes | yes | yes |
| Loading state visible and not frozen (spinner + text, `aria-busy`) | yes | yes | yes |
| Result, error and retry states render | yes | yes | yes |
| Touch target height of AI-örat buttons | ≥ 44 px | ≥ 44 px | ≥ 40 px |
| Console errors / page errors during the whole run | 0 | 0 | 0 |

Screenshots (390 px): `perch-validation/sprint11b/shot_390_A_clear_bird.png`, `…_C_speech.png`, `…_G_unresolved_non_bird_vehicle_.png` (reviewed by eye; results readable, buttons full width enough, no clipping).

Observation, not caused by 11B: in the isolated harness the stage's own title bar ("Smart kamera" + Hubb + Stäng) looks tight at 390 px; the harness has no app shell, so this was not investigated.

Microphone recording was exercised with Chromium's fake capture device (real `getUserMedia` + `MediaRecorder` + `decodeAudioData` → WAV → hop → Cloud Run → result "rödhake").

## Real device
**Not done.** No preview deployment could be created (no Vercel access), so no iPhone/Android test. Needed on a phone: microphone permission prompt and recording on iOS Safari (MP4/AAC path through `decodeAudioData`) and Android Chrome (WebM/Opus), background-tab behaviour while waiting for the ~8 s cold start.
