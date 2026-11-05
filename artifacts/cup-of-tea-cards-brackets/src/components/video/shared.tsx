import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSceneTimer } from '@/lib/video';

export const IMG = (f: string) => `${import.meta.env.BASE_URL}images/${f}`;
export const C = '#22e6f2';
export const M = '#ff2fa8';
export const G = '#ffc94a';

/** Returns how many of the given times (ms) have elapsed. */
export function usePhase(times: number[]) {
  const [p, setP] = useState(0);
  const events = useMemo(() => times.map((t, i) => ({ time: t, callback: () => setP(i + 1) })), [times.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useSceneTimer(events);
  return p;
}

export const sceneExit = { opacity: 0, scale: 1.08, filter: 'blur(6px)' };

export function SceneShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={sceneExit}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Heart({ size = 4, color = M }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: `${size}vh`, height: `${size}vh`, filter: `drop-shadow(0 0 .8vh ${color})` }}>
      <path fill={color} d="M12 21s-7.5-4.6-10-9.2C.4 8.6 2.3 4.5 6.2 4.5c2.3 0 3.8 1.3 5.8 3.4 2-2.1 3.5-3.4 5.8-3.4 3.9 0 5.8 4.1 4.2 7.3C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

export interface DemoFighter { name: string; move: string; sport: string; color: string; power: string }

export const FIGHTERS: DemoFighter[] = [
  { name: 'Kettle Vex', move: 'Steam Uppercut', sport: 'Boxing', color: C, power: 'Rising combo' },
  { name: 'Rook Ember', move: 'Saucer Spin', sport: 'Skate', color: M, power: '540 kickflip' },
  { name: 'Mira Volt', move: 'Lightning Steep', sport: 'Hoops', color: G, power: 'Crossover burst' },
  { name: 'Dax Oolong', move: 'Leaf Cyclone', sport: 'Football', color: C, power: 'Rainbow flick' },
];

export function MoveCard({ f, w = 30, tilt = 0 }: { f: DemoFighter; w?: number; tilt?: number }) {
  return (
    <div
      className="relative rounded-[2vh] overflow-hidden"
      style={{ width: `${w}vh`, height: `${w * 1.45}vh`, transform: `rotate(${tilt}deg)`, border: `0.4vh solid ${f.color}`, boxShadow: `0 0 3vh ${f.color}66, inset 0 0 4vh ${f.color}33`, background: `linear-gradient(160deg, #1b1446 0%, #0b0822 60%, ${f.color}33 100%)` }}
    >
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 40%, ${f.color}55, transparent 60%)` }} />
      <img src={IMG('campaign-key-art.png')} className="absolute left-1/2 -translate-x-1/2 opacity-40 mix-blend-screen" style={{ top: '6%', width: '120%' }} />
      <div className="absolute top-[3%] left-[5%] demo-tag">DEMO</div>
      <div className="absolute top-[3.5%] right-[6%] body font-bold" style={{ color: f.color, fontSize: `${w * 0.05}vh`, letterSpacing: '.2em' }}>{f.sport.toUpperCase()}</div>
      <div className="absolute bottom-0 inset-x-0 p-[6%]" style={{ background: 'linear-gradient(transparent, #07051aee 40%)' }}>
        <div className="body font-bold" style={{ color: f.color, fontSize: `${w * 0.05}vh`, letterSpacing: '.25em' }}>SIGNATURE MOVE</div>
        <div className="disp text-white leading-none" style={{ fontSize: `${w * 0.1}vh` }}>{f.move}</div>
        <div className="body text-[#b9b0e6] mt-[2%]" style={{ fontSize: `${w * 0.055}vh` }}>{f.name} · {f.power}</div>
      </div>
    </div>
  );
}
