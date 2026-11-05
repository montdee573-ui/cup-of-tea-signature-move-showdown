import { motion } from 'framer-motion';
import { SceneShell, usePhase, C, M, G } from '../shared';

const SLOTS = ['Kettle Vex', 'Rook Ember', 'Mira Volt', 'Dax Oolong', 'Juno Chai', 'Pico Matcha', 'Sable Earl', 'Tavi Rooibos'];

export function BracketScene() {
  const p = usePhase([1600, 3000, 4400]);
  const y = (i: number) => 18 + i * 8.2;
  return (
    <SceneShell>
      <div className="absolute top-[5%] inset-x-0 text-center">
        <div className="disp neon-c" style={{ fontSize: '6vh' }}>THE BRACKET</div>
        <span className="demo-tag" style={{ fontSize: '1.8vh' }}>DEMO BRACKET · NOT OFFICIAL</span>
      </div>
      {SLOTS.map((n, i) => (
        <motion.div key={n} className="absolute left-[5%] body font-bold text-white rounded-[1vh] flex items-center px-[1.5vh]"
          style={{ top: y(i) + '%', width: '40%', height: '5.4%', fontSize: '2.2vh', border: `0.3vh solid ${i % 2 ? M : C}`, background: '#120d32' }}
          initial={{ x: '-60vh' }} animate={{ x: 0 }} transition={{ delay: i * 0.12, type: 'spring', stiffness: 260, damping: 26 }}>{n}</motion.div>
      ))}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {[0, 1, 2, 3].map((k) => { const a = y(2 * k) + 2.7, b = y(2 * k + 1) + 2.7, m = (a + b) / 2; return (
          <motion.path key={'r1' + k} d={`M45 ${a} H52 V${b} H45 M52 ${m} H58`} stroke={C} strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3 }}
            initial={{ pathLength: 0 }} animate={p >= 1 ? { pathLength: 1 } : {}} transition={{ duration: 0.8, delay: k * 0.1 }} />); })}
        {[0, 1].map((k) => { const a = (y(4 * k) + y(4 * k + 1)) / 2 + 2.7, b = (y(4 * k + 2) + y(4 * k + 3)) / 2 + 2.7, m = (a + b) / 2; return (
          <motion.path key={'r2' + k} d={`M58 ${a} H66 V${b} H58 M66 ${m} H74`} stroke={M} fill="none" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3 }}
            initial={{ pathLength: 0 }} animate={p >= 2 ? { pathLength: 1 } : {}} transition={{ duration: 0.8 }} />); })}
        {(() => { const a = (y(0) + y(3)) / 2 + 2.7, b = (y(4) + y(7)) / 2 + 2.7; return (
          <motion.path d={`M74 ${a} H80 V${b} H74`} stroke={G} fill="none" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 3 }}
            initial={{ pathLength: 0 }} animate={p >= 3 ? { pathLength: 1 } : {}} transition={{ duration: 0.8 }} />); })()}
      </svg>
      <motion.div className="absolute disp flex items-center justify-center rounded-[1.5vh]" style={{ left: '80%', top: '43.5%', width: '15%', height: '7%', border: `0.4vh solid ${G}`, color: G, fontSize: '5vh', background: '#120d32' }}
        initial={{ scale: 0 }} animate={p >= 3 ? { scale: [1, 1.12, 1] } : {}} transition={{ duration: 1.2, repeat: Infinity }}>?</motion.div>
      <motion.div className="absolute inset-x-[6%] top-[86%] text-center body font-bold text-white" style={{ fontSize: '2.8vh' }}
        initial={{ opacity: 0 }} animate={p >= 3 ? { opacity: 1 } : {}}>Official brackets &amp; results live on <span className="neon-m">Base44</span>.</motion.div>
    </SceneShell>
  );
}
