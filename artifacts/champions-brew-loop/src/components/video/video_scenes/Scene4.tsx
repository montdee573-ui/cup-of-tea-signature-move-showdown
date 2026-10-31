import { motion } from 'framer-motion';

const art = `${import.meta.env.BASE_URL}images/campaign-key-art.png`;
const logo = `${import.meta.env.BASE_URL}images/cup-of-tea-logo.png`;
const ease = [0.2, 0.9, 0.25, 1] as const;

export function Scene4() {
  return (
    <motion.section
      className="brew-scene scene-end"
      initial={{ opacity: 1, clipPath: 'circle(0% at 50% 34%)' }}
      animate={{ opacity: 1, clipPath: 'circle(125% at 50% 34%)' }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.72, ease }}
    >
      <div className="end-glow" />
      <motion.img
        className="end-art"
        src={art}
        alt=""
        initial={{ scale: 1.28, rotate: 7, y: 34 }}
        animate={{ scale: 1, rotate: 0, y: 0 }}
        transition={{ duration: 0.88, ease }}
      />
      <div className="end-art-frame" />
      <motion.h2
        className="end-punch"
        initial={{ opacity: 0, scale: 1.28 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.48, duration: 0.34, ease }}
      >
        SHOW UP.
      </motion.h2>
      <motion.h2
        className="end-vote"
        initial={{ opacity: 0, scale: 0.82, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1.28, duration: 0.34, ease }}
      >
        VOTE.
      </motion.h2>
      <motion.img
        src={logo}
        alt=""
        className="end-logo"
        initial={{ opacity: 0, scale: 0.65, rotate: -10 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ delay: 1.72, duration: 0.46, ease }}
      />
      <motion.p
        className="end-promise"
        initial={{ opacity: 0, y: 13 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.05, duration: 0.35 }}
      >
        Entry is free. Voting is free.
      </motion.p>
      <motion.p
        className="end-source"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 3.45 }}
      >
        OFFICIAL RESULTS: BASE44
      </motion.p>
      <motion.p
        className="end-handle"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 4.2 }}
      >
        @DeeMont-f1b
      </motion.p>
      <motion.div
        className="loop-ring"
        initial={{ scale: 0.2, opacity: 0, rotate: -25 }}
        animate={{ scale: [0.2, 0.9, 1.55], opacity: [0, 0.9, 1], rotate: 12 }}
        transition={{ delay: 4.8, duration: 0.72, ease }}
      />
      <motion.div
        className="scene-kicker"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.32 }}
      >
        CUP OF TEA <i /> SIGNATURE MOVE SHOWDOWN
      </motion.div>
    </motion.section>
  );
}
