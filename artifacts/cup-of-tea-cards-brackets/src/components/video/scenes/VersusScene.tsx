import { motion } from 'framer-motion';
import { SceneShell, usePhase, FIGHTERS, MoveCard, C, M } from '../shared';

export function VersusScene() {
  const p = usePhase([1200, 4000]);
  const pair = p >= 2 ? [FIGHTERS[2], FIGHTERS[3]] : [FIGHTERS[0], FIGHTERS[1]];
  return (
    <SceneShell>
      <motion.div className="absolute inset-0" style={{ background: C + '22', clipPath: 'polygon(0 0,100% 0,100% 42%,0 58%)' }} initial={{ x: '-100%' }} animate={{ x: 0 }} transition={{ duration: 0.5 }} />
      <motion.div className="absolute inset-0" style={{ background: M + '22', clipPath: 'polygon(0 58%,100% 42%,100% 100%,0 100%)' }} initial={{ x: '100%' }} animate={{ x: 0 }} transition={{ duration: 0.5 }} />
      <div className="absolute top-[5%] inset-x-0 flex justify-center"><span className="demo-tag" style={{ fontSize: '2vh' }}>DEMO MATCHUP</span></div>
      <motion.div key={'a' + pair[0].name} className="absolute right-[10%] top-[10%]" initial={{ y: '-60vh' }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 22 }}>
        <MoveCard f={{ ...pair[0], color: C }} w={24} tilt={5} />
      </motion.div>
      <motion.div key={'b' + pair[1].name} className="absolute left-[10%] top-[56%]" initial={{ y: '60vh' }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 22 }}>
        <MoveCard f={{ ...pair[1], color: M }} w={24} tilt={-5} />
      </motion.div>
      <motion.div key={'vs' + p} className="absolute left-1/2 top-1/2 disp text-white" style={{ fontSize: '16vh', transform: 'translate(-50%,-50%)', textShadow: `0.6vh 0.6vh 0 ${M}, -0.6vh -0.6vh 0 ${C}` }}
        initial={{ scale: 3, opacity: 0, x: '-50%', y: '-50%' }} animate={p >= 1 ? { scale: 1, opacity: 1, x: '-50%', y: '-50%', rotate: [0, -4, 3, 0] } : {}} transition={{ type: 'spring', stiffness: 500, damping: 16 }}>VS</motion.div>
    </SceneShell>
  );
}
