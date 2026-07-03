import { AbsoluteFill, useCurrentFrame } from "remotion";
import "./service-demo.css";

export function ServiceDemoVideo() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill className="pd-video">
      <div className="pd-video__background" />
      <main className="pd-video__stage" data-frame={frame}>
        <h1 className="pd-video__boot-title">Pets-Driven</h1>
        <p className="pd-video__boot-subtitle">
          Your agents, visible on your desktop.
        </p>
      </main>
    </AbsoluteFill>
  );
}
