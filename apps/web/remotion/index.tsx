import { Composition, registerRoot } from "remotion";
import { ServiceDemoVideo } from "./service-demo/ServiceDemoVideo";
import {
  VIDEO_DURATION_FRAMES,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "./service-demo/timeline";

function RemotionRoot() {
  return (
    <Composition
      component={ServiceDemoVideo}
      durationInFrames={VIDEO_DURATION_FRAMES}
      fps={VIDEO_FPS}
      height={VIDEO_HEIGHT}
      id="ServiceDemo"
      width={VIDEO_WIDTH}
    />
  );
}

registerRoot(RemotionRoot);
