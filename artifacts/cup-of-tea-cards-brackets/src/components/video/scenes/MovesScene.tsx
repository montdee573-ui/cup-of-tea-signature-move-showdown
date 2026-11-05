import { AnimatePresence, motion } from 'framer-motion';
import { SceneShell, usePhase, FIGHTERS, MoveCard } from '../shared';

export function MovesScene() {
  const p = usePhase([2300, 4600]);
  const f = [FIGHTERS[0], FIGHTERS[1], FIGHTERS[3]][p];
  return (
    <SceneShell>
      <AnimatePresence mode="popLayout">
        <motion.div key={f.name} className="absolute inset-0">
          <motion.div className="absolute left-0 top-[9%] disp whitespace-nowrap" style={{ fontSize: '14vh', color: 'transparent', WebkitTextStroke: `0.3vh ${f.color}`, opacity: 0.5 }}
            initial={{ x: '40vh' }} animate={{ x: '-60vh' }} exit={{ opacity: 0 }} transition={{ duration: 3, ease: 'linear' }}>{f.move.toUpperCase()} {f.move.toUpperCase()}</motion.div>
          <motion.div className="absolute left-1/2 top-[22%]" style={{ marginLeft: '-19vh' }}
            initial={{ x: '60vh', rotate: 14, opacity: 0 }} animate={{ x: 0, rotate: -3, opacity: 1 }} exit={{ x: '-60vh', rotate: -14, opacity: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 24 }}>
            <MoveCard f={f} w={38} />
          </motion.div>
          <motion.div className="absolute left-[8%] top-[80%] body font-bold" style={{ color: f.color, fontSize: '2.6vh', letterSpacing: '.3em' }}
            initial={{ x: '-30vh' }} animate={{ x: 0 }} exit={{ opacity: 0 }} transition={{ delay: 0.25 }}>{f.sport.toUpperCase()} · DEMO CARD</motion.div>
          <motion.div className="absolute left-[8%] top-[84%] disp text-white" style={{ fontSize: '5.6vh' }}
            initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.35, type: 'spring', stiffness: 400, damping: 20 }}>{f.move.toUpperCase()}</motion.div>
        </motion.div>
      </AnimatePresence>
    </SceneShell>
  );
}
