import { motion } from 'framer-motion';
import { SceneShell, usePhase, FIGHTERS, MoveCard } from '../shared';

export function DealScene() {
  const p = usePhase([3500, 4300]);
  const fan = [-24, -8, 8, 24];
  return (
    <SceneShell>
      <div className="absolute inset-0 flex items-center justify-center" style={{ top: '-8vh' }}>
        {FIGHTERS.map((f, i) => {
          const hero = i === 2;
          const collapsed = p >= 1;
          return (
            <motion.div key={f.name} className="absolute" style={{ zIndex: hero ? 10 : i }}
              initial={{ y: '90vh', rotate: 0 }}
              animate={collapsed ? (hero ? { y: 0, x: 0, rotate: 0, scale: 1.5 } : { y: '6vh', x: 0, rotate: fan[i] / 3, scale: 0.9, opacity: 0.35 }) : { y: Math.abs(fan[i]) * 0.15 + 'vh', x: fan[i] * 0.9 + 'vh', rotate: fan[i] }}
              transition={{ type: 'spring', stiffness: 160, damping: 20, delay: collapsed ? 0 : i * 0.35 }}>
              <motion.div animate={hero && collapsed ? { rotateY: [90, 0] } : {}} transition={{ duration: 0.5 }}>
                <MoveCard f={f} w={28} />
              </motion.div>
            </motion.div>
          );
        })}
      </div>
      <motion.div className="absolute inset-x-[6%] top-[80%] text-center disp text-white leading-tight" style={{ fontSize: '4.2vh' }}
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 }}>
        TURN YOUR <span className="neon-c">SIGNATURE MOVE</span> INTO A <span className="neon-m">CARD.</span>
      </motion.div>
    </SceneShell>
  );
}
