import { useEffect } from 'react';
import { VideoCanvas, type VideoAspectRatio, useVideoPlayer, VideoPausedContext } from '@/lib/video';
import { AnimatePresence, motion } from 'framer-motion';
import { HookScene } from './scenes/HookScene';
import { DealScene } from './scenes/DealScene';
import { MovesScene } from './scenes/MovesScene';
import { VersusScene } from './scenes/VersusScene';
import { BracketScene } from './scenes/BracketScene';
import { VoteScene } from './scenes/VoteScene';
import { LockupScene } from './scenes/LockupScene';

export const SCENE_DURATIONS = {
  hook: 5000,
  deal: 7000,
  moves: 7000,
  versus: 7000,
  bracket: 8000,
  vote: 6000,
  lockup: 5000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook: HookScene, deal: DealScene, moves: MovesScene, versus: VersusScene,
  bracket: BracketScene, vote: VoteScene, lockup: LockupScene,
};

const VIDEO_ASPECT_RATIO: VideoAspectRatio = '9:16';
const GLOW = ['#22e6f2', '#ff2fa8', '#22e6f2', '#ff2fa8', '#22e6f2', '#ff2fa8', '#ffc94a'];

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  paused = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  paused?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  useEffect(() => { onSceneChange?.(currentSceneKey); }, [currentSceneKey, onSceneChange]);
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const sceneIndex = Math.max(0, Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey));
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];
  return (
    <VideoPausedContext.Provider value={paused}>
      <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} style={{ backgroundColor: '#07051a' }}>
        <motion.div className="absolute rounded-full" style={{ width: '80vh', height: '80vh', left: '50%', top: '40%', marginLeft: '-40vh', marginTop: '-40vh', filter: 'blur(10vh)', opacity: 0.35 }}
          animate={{ backgroundColor: GLOW[sceneIndex], y: sceneIndex % 2 ? '18vh' : '-10vh' }} transition={{ duration: 1.2 }} />
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(#22e6f2 1px, transparent 1px), linear-gradient(90deg, #ff2fa8 1px, transparent 1px)', backgroundSize: '6vh 6vh' }} />
        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
      </VideoCanvas>
    </VideoPausedContext.Provider>
  );
}
