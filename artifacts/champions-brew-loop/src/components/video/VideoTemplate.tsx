import {
  VideoCanvas,
  type VideoAspectRatio,
  useVideoPlayer,
  useVideoAudio,
} from '@/lib/video';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';

export const SCENE_DURATIONS = {
  twoMoves: 4444,
  community: 4445,
  freeVote: 5555,
  showUp: 5556,
};

const VIDEO_ASPECT_RATIO: VideoAspectRatio = '9:16';

const SCENE_START_SEC: Record<string, number> = (() => {
  const offsets: Record<string, number> = {};
  let elapsed = 0;
  for (const [key, duration] of Object.entries(SCENE_DURATIONS)) {
    offsets[key] = elapsed / 1000;
    elapsed += duration;
  }
  return offsets;
})();

export default function VideoTemplate() {
  const { currentScene, currentSceneKey } = useVideoPlayer({
    durations: SCENE_DURATIONS,
  });
  const { muted, paused } = useVideoAudio();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousSceneRef = useRef<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const player = audio as unknown as {
      volume: number;
      pause: () => void;
      currentTime: number;
      play: () => Promise<void>;
    };
    player.volume = 0.48;
    if (paused) {
      player.pause();
      return;
    }
    if (previousSceneRef.current !== currentSceneKey) {
      previousSceneRef.current = currentSceneKey;
      player.currentTime = SCENE_START_SEC[currentSceneKey] ?? 0;
    }
    player.play().catch(() => {});
  }, [currentSceneKey, muted, paused]);

  const scenes = [Scene1, Scene2, Scene3, Scene4];
  const Scene = scenes[currentScene];

  return (
    <VideoCanvas
      aspectRatio={VIDEO_ASPECT_RATIO}
      className="video-canvas"
      style={{ backgroundColor: 'var(--color-bg-dark)' }}
    >
      <AnimatePresence mode="sync">
        {Scene && <Scene key={currentSceneKey} />}
      </AnimatePresence>
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
        preload="auto"
        autoPlay
        muted={muted}
      />
    </VideoCanvas>
  );
}
