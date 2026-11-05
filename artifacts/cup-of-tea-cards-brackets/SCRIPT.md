# Cup of Tea — Cards & Brackets (Reel #2) — 45 s, 9:16

Treatment: Promise — "make a signature-move card, get matched, the crowd votes, free." Identity — neon cyan #22e6f2 / magenta #ff2fa8 / crown gold #ffc94a on ink #07051a; Bungee display, Chakra Petch body. Hero — the approved key art (cup) and signature move cards. Motion — card deals/flips, VS slam with split screen, bracket line draw, heart bursts. Payoff — lines converge onto the cup + logo lockup.

Data rule: no verified official bracket or approved contender roster was supplied. Every card, matchup and bracket slot is fictional and carries a DEMO tag. No winners, standings, or vote counts are shown (heart animations carry no numbers). Bracket final slot reads "?" / "Official results on Base44".

| # | Time | Scene | Content & choreography |
|---|---|---|---|
| 1 | 0–5 s | Hook | Key art scales in from 1.4x with cyan/magenta rings; "SPILL THE TEA." slams line by line (0.4/1.0 s); "Your move. Your card." at 2.4 s; logo chip bottom. |
| 2 | 5–12 s | Card deal | Four DEMO cards deal in from below as a fan (stagger 0.35 s); at 3.5 s fan collapses, hero card flips forward to 46vh; caption "Turn your signature move into a card." |
| 3 | 12–19 s | Signature moves | Three cards cycle full-frame every ~2.2 s, each with a move-name kinetic word punch and sport tag sliding from left. |
| 4 | 19–26 s | VS | Screen splits diagonally cyan/magenta; two DEMO cards slide in from top/bottom; "VS" slams at 1.2 s with shake; at 4 s second DEMO matchup swaps in. Label "DEMO MATCHUP". |
| 5 | 26–34 s | Bracket | 8 DEMO slots draw in; connector lines draw round by round (no advancement / no winners); final box holds "?" pulsing; caption "Official brackets live on Base44." |
| 6 | 34–40 s | Vote | Two cards side by side, hearts float up both sides (equal, no counts); "Tap a heart. Back your pick." then "Voting is FREE. Entry is FREE." |
| 7 | 40–45 s | Lockup | Hearts collapse into the cup key art; logo + "CUP OF TEA" + "Cards. Brackets. Bragging rights." + "Free to enter · Free to vote". Fade toward hook frame for loop. |

## Audio spec
- Runtime: 45 s (SCENE_DURATIONS total). Playback file: public/audio/composite_audio.mp3 (MP3 192k, 45.0 s, -14 LUFS integrated, -3.0 dBTP).
- Source: ORIGINAL, locally synthesized in code (public/audio/synth.mjs, `node public/audio/synth.mjs` then loudnorm to MP3). No samples, no licensed library, no paid generation.
- Music: hip-hop/arcade instrumental, 120 BPM (bar = 2 s): sine-drop kick, snare+clap on 2/4, 8th hats (16ths in the climax), square/sine bass A-A-C-G, square-wave arcade arp, detuned saw chord stab every bar. Lighter intro 0-4 s, 1.2 s fade-out at 44-45 s.
- SFX cue map (absolute s, from usePhase tables): hook impact 0.0, whoosh+hit 0.4, slam 1.0, sparkle 2.4; deal whoosh+flip 5.0/5.35/5.7/6.05, hero flip+thud 8.5, sparkle 9.3; moves whoosh 12.0/14.3/16.6 + word punch +0.35, riser 18.4; VS split whoosh 19.0, VS slam + crowd-like burst 20.2, matchup swap 23.0, riser 25.4; bracket slot blips 26.0+i*0.12, line risers 27.6/29.0/30.4, "?" pulse ticks every 1.2 s, riser 33.4; vote climax impact + 6 s crowd-like swell 34.0, heart pops every 0.4 s, FREE punch 36.6, riser 39.4; lockup whoosh 40.0, logo impact + crowd-like burst 40.9, sparkle 41.7.
- Crowd: synthesized crowd-like texture (filtered, amplitude-jittered noise), NOT a recorded crowd.

## Export (review only — approved Reel #1 export untouched)
- generated-artifacts/cup-of-tea-reel2_silent_backup.mp4 — original silent visuals, 1080x1920 H.264 30 fps, 45.0 s.
- generated-artifacts/cup-of-tea-reel2_audio_review.mp4 — same video stream (stream-copied) + AAC 192k, 45.0 s.
- Capture: headless Chromium CDP screencast, frames retimed per scene to SCENE_DURATIONS using logged scene-timer fire times.
