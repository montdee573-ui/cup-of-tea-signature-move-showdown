import { motion } from 'framer-motion';
import { SceneShell, usePhase, FIGHTERS, MoveCard, Heart, C, M } from '../shared';

const HEARTS = Array.from({ length: 14 }, (_, i) => ({ side: i % 2, x: (i * 37) % 22, d: (i * 0.29) % 2.6, s: 3 + (i % 3) }));

export function VoteScene() {
  const p = usePhase([2600]);
  return (
    <SceneShell>
      <div className="absolute top-[6%] inset-x-0 flex justify-center"><span className="demo-tag" style={{ fontSize: '1.8vh' }}>DEMO · NO REAL VOTES SHOWN</span></div>
      <div className="absolute top-[14%] inset-x-0 flex justify-center gap-[3vh]">
        <motion.div initial={{ x: '-40vh' }} animate={{ x: 0 }}><MoveCard f={{ ...FIGHTERS[0], color: C }} w={21} /></motion.div>
        <motion.div initial={{ x: '40vh' }} animate={{ x: 0 }}><MoveCard f={{ ...FIGHTERS[1], color: M }} w={21} /></motion.div>
      </div>
      {HEARTS.map((h, i) => (
        <motion.div key={i} className="absolute" style={{ left: (h.side ? 52 : 8) + h.x * 1.6 + '%', top: '55%' }}
          initial={{ y: 0, opacity: 0 }} animate={{ y: '-40vh', opacity: [0, 1, 0] }} transition={{ duration: 2.4, delay: h.d, repeat: Infinity }}>
          <Heart size={h.s} color={h.side ? M : C} />
        </motion.div>
      ))}
      <motion.div className="absolute inset-x-[6%] top-[64%] text-center disp text-white leading-tight" style={{ fontSize: '5vh' }}
        initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}>TAP A HEART.<br /><span className="neon-m">BACK YOUR PICK.</span></motion.div>
      <motion.div className="absolute inset-x-[6%] top-[80%] text-center body font-bold" style={{ fontSize: '3.2vh', letterSpacing: '.1em', color: '#ffc94a' }}
        initial={{ scale: 1.6, opacity: 0 }} animate={p >= 1 ? { scale: 1, opacity: 1 } : {}} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>VOTING IS FREE. ENTRY IS FREE.</motion.div>
    </SceneShell>
  );
}
