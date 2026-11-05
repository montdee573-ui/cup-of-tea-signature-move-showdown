// Original, locally synthesized soundtrack for Cup of Tea — Cards & Brackets (Reel #2).
// No samples, no paid services. Run: node public/audio/synth.mjs  -> public/audio/soundtrack.wav
// Cue times are taken from the scene usePhase tables + SCENE_DURATIONS (see SCRIPT.md).
import fs from 'node:fs';
import path from 'node:path';
const SR = 44100, DUR = 45, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const add = (t, buf, gain = 1, pan = 0) => {
  const s0 = Math.round(t * SR), gl = gain * Math.min(1, 1 - pan), gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < buf.length; i++) { const j = s0 + i; if (j < 0 || j >= N) continue; L[j] += buf[i] * gl; R[j] += buf[i] * gr; }
};
const gen = (sec, f) => { const n = Math.floor(sec * SR), b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = f(i / SR, i); return b; };
const lp = (b, a) => { let y = 0; for (let i = 0; i < b.length; i++) { y += a * (b[i] - y); b[i] = y; } return b; };
const hp = (b, a) => { let y = 0; for (let i = 0; i < b.length; i++) { y += a * (b[i] - y); b[i] -= y; } return b; };
const sq = (ph) => (ph % 1 < 0.5 ? 1 : -1);
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// ---------- instruments ----------
const kick = () => { let ph = 0; return gen(0.35, (t) => { ph += (45 + 110 * Math.exp(-t * 30)) / SR; return Math.sin(2 * Math.PI * ph) * Math.exp(-t * 9) * 0.95; }); };
const snare = () => hp(gen(0.22, (t) => (rnd() * 0.7 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * Math.exp(-t * 18)), 0.08);
const clap = () => hp(gen(0.18, (t) => rnd() * (Math.exp(-t * 25) + 0.6 * Math.exp(-((t - 0.012) ** 2) * 9e4)) * 0.6), 0.15);
const hat = (o) => hp(gen(o ? 0.12 : 0.04, (t) => rnd() * Math.exp(-t * (o ? 30 : 110)) * 0.35), 0.6);
const bass = (m, len) => { let ph = 0; return lp(gen(len, (t) => { ph += hz(m) / SR; return (sq(ph) * 0.5 + Math.sin(2 * Math.PI * ph) * 0.6) * Math.min(1, t * 200) * Math.exp(-t * 2.5); }), 0.12); };
const blip = (m, len, g = 0.22) => { let ph = 0; return gen(len, (t) => { ph += hz(m) / SR; return sq(ph) * g * Math.min(1, t * 400) * Math.exp(-t * 9); }); };
const stab = (ms, len) => { const out = new Float32Array(Math.floor(len * SR)); ms.forEach((m) => { let p1 = 0, p2 = 0; const b = gen(len, (t) => { p1 += hz(m) / SR; p2 += hz(m) * 1.006 / SR; return ((p1 % 1) - 0.5 + (p2 % 1) - 0.5) * 0.16 * Math.exp(-t * 7); }); b.forEach((v, i) => (out[i] += v)); }); return lp(out, 0.25); };

// ---------- SFX ----------
const whoosh = (len = 0.45, g = 0.5) => hp(gen(len, (t) => rnd() * Math.sin(Math.PI * t / len) ** 2 * g), 0.25);
const flip = () => { const b = new Float32Array(Math.floor(0.12 * SR)); add; [0, 0.05].forEach((o) => { const c = hp(gen(0.04, (t) => rnd() * Math.exp(-t * 150) * 0.7), 0.5); c.forEach((v, i) => (b[i + Math.floor(o * SR)] += v)); }); return b; };
const impact = (g = 1) => { let ph = 0; const b = gen(1.1, (t) => { ph += (38 + 90 * Math.exp(-t * 14)) / SR; return Math.sin(2 * Math.PI * ph) * Math.exp(-t * 3.5) * 0.9 * g; }); const n = lp(gen(0.5, (t) => rnd() * Math.exp(-t * 8) * 0.6 * g), 0.3); n.forEach((v, i) => (b[i] += v)); return b; };
const riser = (len, g = 0.3) => { let ph = 0; return gen(len, (t) => { const f = 300 + 1800 * (t / len) ** 2; ph += f / SR; return (sq(ph) * 0.3 + rnd() * 0.5) * (t / len) * g; }); };
const sparkle = (g = 0.2) => { const b = new Float32Array(Math.floor(0.6 * SR)); [84, 88, 91, 96].forEach((m, k) => blip(m, 0.25, g).forEach((v, i) => (b[i + Math.floor(k * 0.06 * SR)] += v))); return b; };
// Synthesized crowd-like texture (NOT a recording): band-limited noise with jittered "voice" amplitude modulation.
const crowd = (len, g) => { let a = 0, m = 0; const b = gen(len, (t) => { if (Math.floor(t * 9) !== m) { m = Math.floor(t * 9); a = 0.6 + Math.abs(rnd()) * 0.6; } const env = Math.min(1, t / 1.2) * Math.min(1, (len - t) / 1.0); return rnd() * a * env * g; }); return hp(lp(b, 0.18), 0.03); };

// ---------- music: 120 BPM, bar = 2 s ----------
const BEAT = 0.5;
const roots = [45, 45, 48, 43]; // A, A, C, G
const arp = [69, 72, 76, 79, 76, 72, 74, 76];
for (let bar = 0; bar < 22; bar++) {
  const t0 = bar * 2, root = roots[bar % 4];
  const intro = t0 < 4, climax = t0 >= 34 && t0 < 40, outro = t0 >= 40;
  for (let b = 0; b < 4; b++) {
    const t = t0 + b * BEAT;
    if (t >= 44.5) break;
    add(t, kick(), 0.9);
    if (!intro && b % 2 === 1) add(t + 0.25, kick(), 0.55);
    if (b % 2 === 1) { add(t, snare(), intro ? 0.35 : 0.6); add(t, clap(), 0.5, 0.1); }
    for (let s = 0; s < (climax ? 4 : 2); s++) add(t + s * BEAT / (climax ? 4 : 2), hat(s === 1 && !climax), 0.5, s % 2 ? 0.35 : -0.35);
    add(t, bass(root + (b === 3 ? 7 : 0), 0.45), intro ? 0.6 : 0.85);
    add(t + 0.25, bass(root + 12, 0.2), 0.4);
  }
  if (!intro) for (let s = 0; s < 8; s++) add(t0 + s * 0.25 + (bar % 2) * 1, blip(arp[(s + bar) % 8] - (roots[bar % 4] === 43 ? 2 : 0), 0.2, climax ? 0.12 : 0.09), 1, s % 2 ? 0.5 : -0.5);
  add(t0, stab([root + 24, root + 27 + (root === 48 ? 1 : 0), root + 31], 0.6), outro ? 0.9 : 0.7);
}

// ---------- cue map (absolute seconds, from scene usePhase tables) ----------
// Hook 0-5
add(0, impact(0.8)); add(0.4, whoosh(0.3, 0.45), 1, -0.4); add(0.42, impact(0.5)); add(1.0, impact(0.9)); add(2.4, sparkle(0.16), 1, 0.3);
add(4.55, whoosh(0.5, 0.5));
// Deal 5-12: four cards stagger 0.35 s, collapse+flip 8.5, caption 9.3
[5.0, 5.35, 5.7, 6.05].forEach((t, i) => { add(t, whoosh(0.25, 0.35), 1, -0.6 + i * 0.4); add(t + 0.2, flip(), 0.8, -0.6 + i * 0.4); });
add(8.5, whoosh(0.35, 0.4)); add(8.65, flip(), 1); add(8.75, impact(0.45)); add(9.3, sparkle(0.12), 1, -0.3);
// Moves 12-19: cards at 12.0/14.3/16.6, word punch +0.35
[12.0, 14.3, 16.6].forEach((t, i) => { add(t, whoosh(0.35, 0.45), 1, 0.5); add(t + 0.35, impact(0.6)); add(t + 0.35, flip(), 0.6, -0.2 * i); });
add(18.4, riser(0.6, 0.25));
// Versus 19-26: split 19.0, VS slam 20.2, matchup swap 23.0
add(19.0, whoosh(0.5, 0.55), 1, -0.5); add(19.05, whoosh(0.5, 0.55), 1, 0.5); add(19.2, impact(0.5));
add(20.2, impact(1.15)); add(20.2, crowd(1.6, 0.12));
add(23.0, whoosh(0.4, 0.5), 1, 0.5); add(23.0, whoosh(0.4, 0.5), 1, -0.5); add(23.3, impact(0.7));
add(25.4, riser(0.6, 0.25));
// Bracket 26-34: 8 slots (i*0.12), connector rounds 27.6/29.0/30.4, "?" pulses every 1.2 s from 30.4
for (let i = 0; i < 8; i++) add(26 + i * 0.12, blip(72 + (i % 4) * 3, 0.1, 0.2), 1, -0.5 + (i % 2));
[27.6, 29.0, 30.4].forEach((t, i) => { add(t, riser(0.5, 0.18), 1, 0.2); add(t + 0.5, blip(79 + i * 5, 0.18, 0.22)); });
for (let t = 30.4; t < 33.6; t += 1.2) add(t, blip(91, 0.12, 0.12));
add(33.4, riser(0.6, 0.3));
// Vote 34-40 (climax): heart pops + crowd-like swell, "FREE" punch 36.6
add(34.0, impact(0.8)); add(34.0, crowd(6.0, 0.22));
for (let t = 34.3; t < 39.8; t += 0.4) add(t, blip(84 + Math.floor(Math.abs(rnd()) * 8), 0.08, 0.1), 1, (Math.floor(t * 10) % 2) ? 0.6 : -0.6);
add(36.6, impact(1.0)); add(36.6, sparkle(0.16));
add(39.4, riser(0.6, 0.3));
// Lockup 40-45: hearts collapse 40.0, logo 40.9, tagline 41.7
add(40.0, whoosh(0.5, 0.5)); add(40.9, impact(1.1)); add(40.9, crowd(2.2, 0.12)); add(41.7, sparkle(0.2));

// ---------- master: tame, limit, fade ----------
let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.89 / pk;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const t = i / SR, f = Math.min(1, t / 0.03) * Math.min(1, (DUR - t) / 1.2);
  const sat = (x) => Math.tanh(x * g * 1.2) / Math.tanh(1.2);
  buf.writeInt16LE(Math.round(sat(L[i]) * f * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(sat(R[i]) * f * 32767), 46 + i * 4);
}
const out = path.join(path.dirname(new URL(import.meta.url).pathname), 'soundtrack.wav');
fs.writeFileSync(out, buf); console.log('wrote', out);
