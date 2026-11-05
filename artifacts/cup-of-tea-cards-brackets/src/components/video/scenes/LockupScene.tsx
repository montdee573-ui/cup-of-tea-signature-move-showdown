import { motion } from 'framer-motion';
import { SceneShell, usePhase, IMG, Heart, C, M } from '../shared';

export function LockupScene() {
  const p = usePhase([900, 1700]);
  return (
    <SceneShell>
      {Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return (
        <motion.div key={i} className="absolute left-1/2 top-[30%]" initial={{ x: Math.cos(a) * 40 + 'vh', y: Math.sin(a) * 40 + 'vh', opacity: 1 }} animate={{ x: 0, y: 0, opacity: 0, scale: 0.3 }} transition={{ duration: 0.9, ease: 'easeIn' }}>
          <Heart size={4} color={i % 2 ? M : C} />
        </motion.div>); })}
      <motion.img src={IMG('campaign-key-art.png')} className="absolute left-1/2 top-[10%] rounded-[4vh]" style={{ width: '42vh', marginLeft: '-21vh' }}
        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [0.6, 1.08, 1], opacity: 1 }} transition={{ duration: 1, delay: 0.7 }} />
      <motion.div className="absolute inset-x-0 top-[55%] flex flex-col items-center" initial={{ opacity: 0, y: 30 }} animate={p >= 1 ? { opacity: 1, y: 0 } : {}}>
        <img src={IMG('cup-of-tea-logo.png')} style={{ width: '9vh', borderRadius: '2vh' }} />
        <div className="disp mt-[1.5vh] text-white" style={{ fontSize: '7vh', textShadow: `0.4vh 0.4vh 0 ${M}` }}>CUP OF TEA</div>
      </motion.div>
      <motion.div className="absolute inset-x-0 top-[74%] text-center" initial={{ opacity: 0 }} animate={p >= 2 ? { opacity: 1 } : {}}>
        <div className="disp neon-c" style={{ fontSize: '3.4vh' }}>CARDS. BRACKETS. BRAGGING RIGHTS.</div>
        <div className="body font-bold mt-[1.5vh]" style={{ fontSize: '2.6vh', color: '#ffc94a', letterSpacing: '.2em' }}>FREE TO ENTER · FREE TO VOTE</div>
      </motion.div>
    </SceneShell>
  );
}
