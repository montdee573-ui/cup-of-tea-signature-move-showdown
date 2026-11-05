import { motion } from 'framer-motion';
import { SceneShell, usePhase, IMG, C, M } from '../shared';

export function HookScene() {
  const p = usePhase([400, 1000, 2400]);
  return (
    <SceneShell>
      {[0, 1, 2].map((i) => (
        <motion.div key={i} className="absolute left-1/2 top-[38%] rounded-full" style={{ width: '60vh', height: '60vh', marginLeft: '-30vh', marginTop: '-30vh', border: `0.4vh solid ${i % 2 ? M : C}` }}
          initial={{ scale: 0.3, opacity: 0.9 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 2.4, delay: i * 0.6, repeat: Infinity, ease: 'easeOut' }} />
      ))}
      <motion.img src={IMG('campaign-key-art.png')} className="absolute left-1/2 top-[8%] rounded-[4vh]" style={{ width: '50vh', marginLeft: '-25vh' }}
        initial={{ scale: 1.4, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: 1.1, ease: [0.2, 0.9, 0.2, 1] }} />
      <div className="absolute inset-x-0 top-[58%] text-center disp leading-[0.95]" style={{ fontSize: '8.5vh' }}>
        <motion.div className="neon-c" initial={{ y: '6vh', opacity: 0 }} animate={p >= 1 ? { y: 0, opacity: 1 } : {}} transition={{ type: 'spring', stiffness: 500, damping: 22 }}>SPILL</motion.div>
        <motion.div className="neon-m" initial={{ scale: 2.2, opacity: 0 }} animate={p >= 2 ? { scale: 1, opacity: 1 } : {}} transition={{ type: 'spring', stiffness: 420, damping: 18 }}>THE TEA.</motion.div>
      </div>
      <motion.div className="absolute inset-x-0 top-[78%] text-center body font-bold text-white" style={{ fontSize: '3.4vh', letterSpacing: '.12em' }}
        initial={{ opacity: 0, y: 20 }} animate={p >= 3 ? { opacity: 1, y: 0 } : {}}>YOUR MOVE. YOUR CARD.</motion.div>
    </SceneShell>
  );
}
