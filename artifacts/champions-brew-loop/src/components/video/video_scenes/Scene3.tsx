import { motion } from 'framer-motion';

const ease = [0.2, 0.9, 0.25, 1] as const;

export function Scene3() {
  return (
    <motion.section
      className="brew-scene scene-vote"
      initial={{ opacity: 1, clipPath: 'inset(0 0 0 100%)' }}
      animate={{ opacity: 1, clipPath: 'inset(0 0 0 0%)' }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.34, ease }}
    >
      <div className="vote-split vote-split-cyan" />
      <div className="vote-split vote-split-pink" />
      <div className="corner-card corner-a">01</div>
      <div className="corner-card corner-b">02</div>
      <motion.div
        className="vote-ripple"
        initial={{ scale: 0.05, opacity: 0.9 }}
        animate={{ scale: 2.8, opacity: 0 }}
        transition={{ duration: 1.15, ease }}
      />
      <div className="vote-stack">
        <motion.div
          className="vote-line"
          initial={{ opacity: 0, x: -60, clipPath: 'inset(0 100% 0 0)' }}
          animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0 0 0)' }}
          transition={{ delay: 0.35, duration: 0.45, ease }}
        >
          <span className="vote-small">ENTRY IS</span>
          <strong>FREE<span className="period">.</span></strong>
          <i className="stamp stamp-cyan">✓</i>
        </motion.div>
        <motion.div
          className="vote-line second-vote"
          initial={{ opacity: 0, x: 60, clipPath: 'inset(0 0 0 100%)' }}
          animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0 0 0%)' }}
          transition={{ delay: 2.12, duration: 0.48, ease }}
        >
          <span className="vote-small">VOTING IS</span>
          <strong>FREE<span className="period">.</span></strong>
          <i className="stamp stamp-pink">✓</i>
        </motion.div>
      </div>
      <motion.p
        className="reel-separation"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 3.85, duration: 0.3 }}
      >
        OPTIONAL CREATOR REEL IS SEPARATE.
      </motion.p>
      <motion.div
        className="gold-spark"
        initial={{ opacity: 0, scale: 0, rotate: 0 }}
        animate={{ opacity: 1, scale: [0, 1.3, 0.9], rotate: 90 }}
        transition={{ delay: 4.65, duration: 0.38, ease }}
      />
      <motion.div
        className="scene-kicker"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
      >
        03 <i /> THE PROMISE
      </motion.div>
    </motion.section>
  );
}
