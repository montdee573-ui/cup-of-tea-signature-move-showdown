import VideoWithControls from '@/components/video/VideoWithControls';
import PromoPlayer from '@/components/video/PromoPlayer';

// Composition (animated film) only for the exporter (recording hooks present)
// or explicit ?composition=1. Everyone else, iframe included, gets the native
// MP4 player of the existing exported reel.
function isCompositionMode() {
  if (typeof window === 'undefined') return true;
  const w = window as unknown as { startRecording?: unknown; stopRecording?: unknown };
  if (typeof w.startRecording === 'function' || typeof w.stopRecording === 'function') return true;
  if (new URLSearchParams(window.location.search).get('composition') === '1') return true;
  return false;
}

export default function App() {
  return isCompositionMode() ? <VideoWithControls /> : <PromoPlayer />;
}
