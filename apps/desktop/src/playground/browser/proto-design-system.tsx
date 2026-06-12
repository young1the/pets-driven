// PROTOTYPE — Design system for single-pet overlays.
// Compares three variants (Ghost / Cozy / Pixel) of the same UI primitives:
// speech bubble, attention indicator, visual cue, agent state badge, context menu.
// Fold the winning variant into production and delete the others.

import { useCallback, useEffect, useRef, useState } from "react";
import { getAtlasFrame, PET_CELL_SIZE } from "@/pets/assets/pet-atlas";
import { loadAtlasImage } from "@/pets/assets/atlas-loader";
import type { PetAnimationState } from "@/pets/assets/pet-atlas";

// ─── Constants ────────────────────────────────────────────────────────────────

type Variant        = "ghost" | "cozy" | "pixel";
type AgentStateKind = "waiting" | "completed" | "failed";
type CueKind        = "affection" | "surprised" | "flee" | "wander";

const CANVAS_W   = 480;
const CANVAS_H   = 360;
const PET_X      = 240;
const PET_Y      = 272;
const SCALE      = 0.5;
const DRAW_W     = Math.round(PET_CELL_SIZE.width  * SCALE);
const DRAW_H     = Math.round(PET_CELL_SIZE.height * SCALE);
const PET_TOP    = PET_Y - DRAW_H / 2;
const PET_BOTTOM = PET_Y + DRAW_H / 2;

const SPEECHES = [
  "지금 집중하고 있어!",
  "뭔가 하고 싶어...",
  "배고파요 T.T",
  "잘 되고 있어?",
  "같이 놀자!",
] as const;

const CUES: Array<{ kind: CueKind; icon: string } | null> = [
  null,
  { kind: "affection", icon: "💕" },
  { kind: "surprised", icon: "❗" },
  { kind: "flee",      icon: "💨" },
  { kind: "wander",   icon: "🌀" },
];

const CONTEXT_ITEMS = [
  { icon: "🤗", label: "쓰다듬기" },
  { icon: "🍪", label: "간식 주기" },
  { icon: "🎮", label: "같이 놀기" },
  { icon: "😶", label: "무시하기" },
] as const;

const AGENT_COLORS: Record<AgentStateKind, string> = {
  waiting: "#f59e0b", completed: "#16a34a", failed: "#dc2626",
};
const AGENT_LABELS: Record<AgentStateKind, string> = {
  waiting: "WAIT", completed: "DONE", failed: "FAIL",
};

// ─── Overlay: Speech Bubble ───────────────────────────────────────────────────

function SpeechBubble({ variant, speech }: { variant: Variant; speech: string }) {
  const wrap: React.CSSProperties = { position: "absolute", top: PET_TOP - 8, left: PET_X, transform: "translateX(-50%) translateY(-100%)", pointerEvents: "none" };
  if (variant === "ghost") return (
    <div style={wrap}><div style={{ color: "#1e293b", fontSize: "13px", fontWeight: 500, whiteSpace: "nowrap", textShadow: "0 0 8px rgba(255,255,255,0.9)" }}>{speech}</div></div>
  );
  if (variant === "cozy") return (
    <div style={wrap}>
      <div style={{ position: "relative", background: "#fff", borderRadius: "12px", padding: "7px 13px", fontSize: "13px", fontWeight: 500, color: "#1e293b", whiteSpace: "nowrap", boxShadow: "0 2px 12px rgba(0,0,0,0.13)" }}>
        {speech}
        <div style={{ position: "absolute", bottom: -7, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: "7px solid rgba(0,0,0,0.07)" }} />
        <div style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #fff" }} />
      </div>
    </div>
  );
  return (
    <div style={wrap}>
      <div style={{ position: "relative", background: "#f0f4ff", border: "2px solid #334155", padding: "6px 11px", fontSize: "12px", fontWeight: 700, color: "#1e293b", whiteSpace: "nowrap", fontFamily: "monospace", letterSpacing: "0.04em", boxShadow: "3px 3px 0 #334155" }}>
        {speech}
        <div style={{ position: "absolute", bottom: -9, left: "calc(50% - 5px)", width: 10, height: 9, background: "#334155", clipPath: "polygon(0 0,100% 0,50% 100%)" }} />
        <div style={{ position: "absolute", bottom: -6, left: "calc(50% - 4px)", width: 8, height: 6, background: "#f0f4ff", clipPath: "polygon(0 0,100% 0,50% 100%)" }} />
      </div>
    </div>
  );
}

// ─── Overlay: Attention Indicator ────────────────────────────────────────────

function AttentionIndicator({ variant }: { variant: Variant }) {
  if (variant === "ghost") return <div style={{ position: "absolute", top: PET_TOP - 10, left: PET_X - DRAW_W / 2 - 10, width: DRAW_W + 20, height: DRAW_H + 20, border: "2px solid rgba(251,191,36,0.75)", borderRadius: "50%", animation: "proto-pulse 1.6s ease-in-out infinite", pointerEvents: "none" }} />;
  if (variant === "cozy") return <div style={{ position: "absolute", top: PET_TOP - 10, left: PET_X + DRAW_W / 2 - 8, width: 22, height: 22, background: "#f59e0b", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "13px", boxShadow: "0 0 10px rgba(245,158,11,0.55)", animation: "proto-bounce 0.75s ease-in-out infinite alternate", pointerEvents: "none" }}>!</div>;
  return <div style={{ position: "absolute", top: PET_TOP - 14, left: PET_X + DRAW_W / 2 - 10, background: "#dc2626", border: "2px solid #7f1d1d", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: "12px", fontFamily: "monospace", animation: "proto-blink 0.55s step-end infinite", pointerEvents: "none", boxShadow: "2px 2px 0 #7f1d1d" }}>!</div>;
}

// ─── Overlay: Visual Cue Icon ─────────────────────────────────────────────────

function VisualCueIcon({ variant, cue }: { variant: Variant; cue: { icon: string } }) {
  if (variant === "ghost") return <div style={{ position: "absolute", top: PET_TOP - 4, left: PET_X + DRAW_W / 2 - 4, fontSize: "17px", animation: "proto-float 1.3s ease-in-out infinite alternate", pointerEvents: "none", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.18))" }}>{cue.icon}</div>;
  if (variant === "cozy") return <div style={{ position: "absolute", top: PET_TOP - 16, left: PET_X + DRAW_W / 2 - 8, fontSize: "20px", animation: "proto-float 1s ease-in-out infinite alternate", pointerEvents: "none" }}>{cue.icon}</div>;
  return <div style={{ position: "absolute", top: PET_TOP - 10, left: PET_X + DRAW_W / 2 - 6, fontSize: "16px", animation: "proto-blink 0.9s step-end infinite", pointerEvents: "none" }}>{cue.icon}</div>;
}

// ─── Overlay: Agent State Badge ───────────────────────────────────────────────

function AgentStateBadge({ variant, kind }: { variant: Variant; kind: AgentStateKind }) {
  const color = AGENT_COLORS[kind], label = AGENT_LABELS[kind];
  if (variant === "ghost") return <div style={{ position: "absolute", top: PET_BOTTOM + 6, left: PET_X, transform: "translateX(-50%)", color, fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", filter: `drop-shadow(0 0 5px ${color})`, pointerEvents: "none" }}>{label}</div>;
  if (variant === "cozy") return <div style={{ position: "absolute", top: PET_TOP - 2, left: PET_X - DRAW_W / 2 - 4, background: color, color: "#fff", fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "5px", letterSpacing: "0.09em", boxShadow: `0 2px 8px ${color}55`, pointerEvents: "none" }}>{label}</div>;
  return <div style={{ position: "absolute", top: PET_TOP + 2, left: PET_X - DRAW_W / 2 - 2, background: "#fff", border: `2px solid ${color}`, color, fontSize: "10px", fontWeight: 900, fontFamily: "monospace", padding: "2px 5px", boxShadow: `2px 2px 0 ${color}`, pointerEvents: "none" }}>{label}</div>;
}

// ─── Overlay: Context Menu ────────────────────────────────────────────────────

function ContextMenuOverlay({ variant, onClose }: { variant: Variant; onClose: () => void }) {
  useEffect(() => { const c = () => onClose(); window.addEventListener("click", c); return () => window.removeEventListener("click", c); }, [onClose]);
  const menuLeft = PET_X + DRAW_W / 2 + 8, menuTop = PET_Y - 20;
  if (variant === "ghost") return (
    <div style={{ position: "absolute", top: menuTop, left: menuLeft, background: "rgba(15,23,42,0.70)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderRadius: "10px", padding: "5px 0", minWidth: "140px", boxShadow: "0 4px 20px rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.08)" }} onClick={(e) => e.stopPropagation()}>
      {CONTEXT_ITEMS.map((item) => <div key={item.label} style={{ padding: "8px 14px", color: "rgba(255,255,255,0.88)", fontSize: "13px", cursor: "pointer", display: "flex", gap: "9px", alignItems: "center" }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.10)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}><span>{item.icon}</span><span>{item.label}</span></div>)}
    </div>
  );
  if (variant === "cozy") return (
    <div style={{ position: "absolute", top: menuTop, left: menuLeft, background: "#fff", borderRadius: "12px", padding: "5px 0", minWidth: "148px", boxShadow: "0 8px 24px rgba(0,0,0,0.11)", border: "1px solid rgba(0,0,0,0.06)" }} onClick={(e) => e.stopPropagation()}>
      {CONTEXT_ITEMS.map((item) => <div key={item.label} style={{ padding: "8px 14px", color: "#1e293b", fontSize: "13px", cursor: "pointer", display: "flex", gap: "9px", alignItems: "center", borderRadius: "7px", margin: "0 4px" }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f1f5f9"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}><span style={{ fontSize: "16px" }}>{item.icon}</span><span>{item.label}</span></div>)}
    </div>
  );
  return (
    <div style={{ position: "absolute", top: menuTop, left: menuLeft, background: "#f8faff", border: "2px solid #334155", padding: "3px 0", minWidth: "136px", boxShadow: "4px 4px 0 #334155", fontFamily: "monospace" }} onClick={(e) => e.stopPropagation()}>
      {CONTEXT_ITEMS.map((item, i) => (
        <div key={item.label}>
          <div style={{ padding: "7px 12px", color: "#1e293b", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", gap: "8px", alignItems: "center" }} onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = "#334155"; el.style.color = "#fff"; }} onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = ""; el.style.color = "#1e293b"; }}><span>{item.icon}</span><span>{item.label}</span></div>
          {i < CONTEXT_ITEMS.length - 1 && <div style={{ height: 1, background: "#cbd5e1", margin: "0 6px" }} />}
        </div>
      ))}
    </div>
  );
}

// ─── Variant Bar ──────────────────────────────────────────────────────────────

function VariantBar({ variant, onVariant }: { variant: Variant; onVariant: (v: Variant) => void }) {
  return (
    <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "4px", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", borderRadius: "32px", padding: "5px", boxShadow: "0 4px 20px rgba(0,0,0,0.13)", border: "1px solid rgba(0,0,0,0.06)", zIndex: 100 }}>
      {(["ghost", "cozy", "pixel"] as Variant[]).map((v) => (
        <button key={v} onClick={() => onVariant(v)} style={{ padding: "8px 22px", borderRadius: "24px", border: "none", background: variant === v ? "#1e293b" : "transparent", color: variant === v ? "#fff" : "#64748b", fontWeight: variant === v ? 600 : 400, cursor: "pointer", fontSize: "13px", transition: "background 0.15s, color 0.15s" }}>
          {v === "ghost" ? "A Ghost" : v === "cozy" ? "B Cozy" : "C Pixel"}
        </button>
      ))}
    </div>
  );
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function CtrlBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ padding: "4px 11px", borderRadius: "6px", border: `1.5px solid ${active ? "#2563eb" : "#d4dde9"}`, background: active ? "#eff6ff" : "#f8fafc", color: active ? "#1d4ed8" : "#475569", fontSize: "12px", cursor: "pointer", fontWeight: active ? 600 : 400, whiteSpace: "nowrap" }}>{children}</button>;
}
function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "8px", alignItems: "center" }}>
      <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>{children}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ProtoDesignSystem() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const spriteRef  = useRef<HTMLImageElement | null>(null);
  const elapsedRef = useRef(0);
  const rafRef     = useRef<number>(0);

  const [variant,         setVariant]         = useState<Variant>("cozy");
  const [speechIdx,       setSpeechIdx]       = useState<number | null>(null);
  const [showAttention,   setShowAttention]   = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [cueIdx,          setCueIdx]          = useState(0);
  const [agentState,      setAgentState]      = useState<AgentStateKind | null>(null);

  const speech = speechIdx !== null ? SPEECHES[speechIdx] : null;
  const cue    = CUES[cueIdx];

  const animState: PetAnimationState =
    agentState === "failed"  ? "failed"  :
    agentState === "waiting" || showAttention ? "waiting" :
    speechIdx !== null ? "waving" : "idle";

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    const grd = ctx.createRadialGradient(PET_X, PET_BOTTOM + 2, 2, PET_X, PET_BOTTOM + 2, 52);
    grd.addColorStop(0, "rgba(0,0,0,0.10)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(PET_X - 52, PET_BOTTOM - 4, 104, 14);
    const sprite = spriteRef.current;
    if (sprite) {
      const frame = getAtlasFrame(animState, elapsedRef.current, "left");
      ctx.drawImage(sprite, frame.sourceX, frame.sourceY, PET_CELL_SIZE.width, PET_CELL_SIZE.height, PET_X - DRAW_W / 2, PET_Y - DRAW_H / 2, DRAW_W, DRAW_H);
    } else {
      ctx.fillStyle = "#dde5f0";
      ctx.fillRect(PET_X - DRAW_W / 2, PET_Y - DRAW_H / 2, DRAW_W, DRAW_H);
    }
  }, [animState]);

  useEffect(() => {
    let last = performance.now();
    function loop(now: number) { elapsedRef.current += now - last; last = now; drawFrame(); rafRef.current = requestAnimationFrame(loop); }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  useEffect(() => {
    loadAtlasImage("/fallback-pets/patamon/spritesheet.webp")
      .then((img) => { spriteRef.current = img; })
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "20px 24px 100px", minHeight: "100vh", background: "#dce4f0", boxSizing: "border-box" }}>
      <ProtoNav active="design" />

      <div style={{ display: "flex", flexDirection: "column", gap: "14px", alignItems: "center" }}>
        <div style={{ position: "relative", width: CANVAS_W, height: CANVAS_H, cursor: "default" }} onContextMenu={(e) => { e.preventDefault(); setShowContextMenu(true); }}>
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} style={{ display: "block", borderRadius: "14px" }} />
          {speech         && <SpeechBubble variant={variant} speech={speech} />}
          {cue            && <VisualCueIcon variant={variant} cue={cue} />}
          {showAttention  && <AttentionIndicator variant={variant} />}
          {agentState     && <AgentStateBadge variant={variant} kind={agentState} />}
          {showContextMenu && <ContextMenuOverlay variant={variant} onClose={() => setShowContextMenu(false)} />}
        </div>

        <div style={{ display: "grid", gap: "11px", width: CANVAS_W, background: "#fff", borderRadius: "12px", padding: "14px 16px", border: "1px solid #d4dde9", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <ControlRow label="말풍선">
            <CtrlBtn active={speechIdx === null} onClick={() => setSpeechIdx(null)}>없음</CtrlBtn>
            {SPEECHES.map((s, i) => <CtrlBtn key={i} active={speechIdx === i} onClick={() => setSpeechIdx((p) => p === i ? null : i)}>{s}</CtrlBtn>)}
          </ControlRow>
          <div style={{ height: 1, background: "#f1f5f9" }} />
          <ControlRow label="시각 큐">
            {CUES.map((c, i) => <CtrlBtn key={i} active={cueIdx === i} onClick={() => setCueIdx(i)}>{c ? c.icon : "없음"}</CtrlBtn>)}
          </ControlRow>
          <div style={{ height: 1, background: "#f1f5f9" }} />
          <ControlRow label="주의">
            <CtrlBtn active={showAttention} onClick={() => setShowAttention((a) => !a)}>주의 필요</CtrlBtn>
            <CtrlBtn active={showContextMenu} onClick={() => setShowContextMenu((c) => !c)}>컨텍스트 메뉴</CtrlBtn>
          </ControlRow>
          <div style={{ height: 1, background: "#f1f5f9" }} />
          <ControlRow label="에이전트">
            <CtrlBtn active={agentState === null} onClick={() => setAgentState(null)}>없음</CtrlBtn>
            <CtrlBtn active={agentState === "waiting"} onClick={() => setAgentState("waiting")}>WAIT</CtrlBtn>
            <CtrlBtn active={agentState === "completed"} onClick={() => setAgentState("completed")}>DONE</CtrlBtn>
            <CtrlBtn active={agentState === "failed"} onClick={() => setAgentState("failed")}>FAIL</CtrlBtn>
          </ControlRow>
        </div>
      </div>

      <VariantBar variant={variant} onVariant={setVariant} />
    </div>
  );
}

// ─── Cross-page navigation ────────────────────────────────────────────────────

export function ProtoNav({ active }: { active: "design" | "behavior" }) {
  return (
    <div style={{ display: "flex", gap: "6px", padding: "4px", background: "rgba(255,255,255,0.6)", borderRadius: "10px", border: "1px solid rgba(0,0,0,0.05)" }}>
      <a href="/pet-design.html" style={{
        padding: "6px 14px", borderRadius: "7px", textDecoration: "none",
        background: active === "design" ? "#1e293b" : "transparent",
        color: active === "design" ? "#fff" : "#64748b",
        fontSize: "12px", fontWeight: active === "design" ? 600 : 500,
      }}>Design System</a>
      <a href="/pet-behavior.html" style={{
        padding: "6px 14px", borderRadius: "7px", textDecoration: "none",
        background: active === "behavior" ? "#1e293b" : "transparent",
        color: active === "behavior" ? "#fff" : "#64748b",
        fontSize: "12px", fontWeight: active === "behavior" ? 600 : 500,
      }}>Behavior Lab</a>
    </div>
  );
}
