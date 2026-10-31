import { motion } from 'framer-motion';

const art = `${import.meta.env.BASE_URL}images/campaign-key-art.png`;
const ease = [0.2, 0.9, 0.25, 1] as const;

export function Scene2() {
  return (
    <motion.section
      className="brew-scene scene-match"
      initial={{ opacity: 0.92, scale: 1.08, clipPath: 'circle(9% at 50% 50%)' }}
      animate={{ opacity: 1, scale: 1, clipPath: 'circle(100% at 50% 50%)' }}
      exit={{ opacity: 0, scale: 1.15, filter: 'blur(10px)' }}
      transition={{ duration: 0.78, ease }}
    >
      <motion.img
        src={art}
        alt=""
        className="match-art"
        initial={{ scale: 1.18, rotate: -2 }}
        animate={{ scale: [1.18, 1, 1.05], rotate: [-2, 0, 1] }}
        transition={{ duration: 4.2, times: [0, 0.35, 1], ease }}
      />
      <div className="art-shade" />
      <motion.div
        className="match-ring"
        initial={{ scale: 0.65, rotate: -40, opacity: 0 }}
        animate={{ scale: [0.65, 1.08, 1], rotate: [0, 64, 118], opacity: 1 }}
        transition={{ duration: 4.4, ease }}
      />
      <motion.div
        className="match-headline"
        initial={{ opacity: 0, y: -30, clipPath: 'inset(0 0 100% 0)' }}
        animate={{ opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' }}
        transition={{ delay: 0.55, duration: 0.65, ease }}
      >
        <span>THE COMMUNITY</span>
        <strong>DECIDES.</strong>
      </motion.div>
      <motion.div
        className="exhibition-tag"
        initial={{ opacity: 0, scale: 0.7, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 2.55, duration: 0.32, ease }}
      >
        COMMUNITY EXHIBITION
      </motion.div>
      <motion.div
        className="match-card-fragment fragment-left"
        animate={{ rotate: [-8, -2, -8], x: [0, 8, 0] }}
        transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity }}
      />
      <motion.div
        className="match-card-fragment fragment-right"
        animate={{ rotate: [8, 2, 8], x: [0, -8, 0] }}
        transition={{ duration: 2.6, delay: 0.35, ease: 'easeInOut', repeat: Infinity }}
      />
      <motion.div
        className="scene-kicker"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45 }}
      >
        02 <i /> COMMUNITY EXHIBITION
      </motion.div>
    </motion.section>
  );
}
