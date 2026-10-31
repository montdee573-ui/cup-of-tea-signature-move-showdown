import { motion } from 'framer-motion';

const ease = [0.2, 0.9, 0.25, 1] as const;

export function Scene1() {
  return (
    <motion.section
      className="brew-scene scene-open"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.12, filter: 'blur(8px)' }}
      transition={{ duration: 0.24 }}
    >
      <div className="open-field" />
      <motion.div
        className="card-edge card-cyan"
        initial={{ x: '-64%', rotate: -19, scale: 0.8 }}
        animate={{ x: '-7%', rotate: -11, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.08 }}
      />
      <motion.div
        className="card-edge card-pink"
        initial={{ x: '64%', rotate: 19, scale: 0.8 }}
        animate={{ x: '7%', rotate: 11, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 20, delay: 0.52 }}
      />
      <motion.div
        className="impact-seam"
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: [0, 1.2, 0.9], opacity: [0, 1, 1] }}
        transition={{ duration: 0.38, delay: 1.05, ease }}
      />
      <div className="scene-open-copy">
        <motion.p
          className="micro-label"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.35 }}
        >
          CUP OF TEA · SIGNATURE MOVE
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, scale: 1.32, y: 25 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.98, duration: 0.42, ease }}
        >
          TWO
          <br />
          <span>MOVES.</span>
        </motion.h1>
        <motion.p
          className="open-support"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.05, duration: 0.3 }}
        >
          A COMMUNITY SHOWDOWN
        </motion.p>
      </div>
      <motion.div
        className="seam-orbit"
        initial={{ scale: 0.2, rotate: -50, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ delay: 3.45, duration: 0.65, ease }}
      />
      <motion.div
        className="scene-kicker"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 3.2 }}
      >
        01 <i /> THE MATCHUP
      </motion.div>
    </motion.section>
  );
}
