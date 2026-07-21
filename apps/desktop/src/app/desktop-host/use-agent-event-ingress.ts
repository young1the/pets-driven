import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { ClaudeHookIngressStatus } from "@/adapters/agent-events/claude-hook-ingress";
import type { PetCommandEvent } from "@/adapters/agent-events/hatch-ingress";
import { desktopGateway } from "@/app/desktop-gateway";
import { formatCommandError } from "@/app/desktop-host/format-command-error";

const CLAUDE_HOOK_STATUS_REFRESH_MS = 2000;

function defaultClaudeHookIngressStatus(): ClaudeHookIngressStatus {
  return {
    url: "",
    state: isTauri() ? "pending" : "error",
    error: isTauri() ? null : "Claude hook ingress is only available in Tauri.",
  };
}

type UseAgentEventIngressParams = {
  /** A routed Claude hook payload arrived; fan it into the live sim worlds. */
  onAgentHookEvent: (payload: unknown) => void;
  /** The backend persisted a state change (e.g. a hatch); reload from disk. */
  onBackendStateChanged: () => void;
  /** The backend asked to show/hide a pet after reloading state. */
  onPetCommand: (event: PetCommandEvent) => void;
  setPetWindowError: (message: string | null) => void;
};

/**
 * Subscribes to the agent-event ingress streams (Claude hook events, backend
 * state-change and pet-command signals) and polls the hook ingress status.
 * The hook owns the subscription lifecycle and the status; what to do with each
 * event is injected, so the sim fan-in and state reloads stay with their owners.
 */
export function useAgentEventIngress({
  onAgentHookEvent,
  onBackendStateChanged,
  onPetCommand,
  setPetWindowError,
}: UseAgentEventIngressParams) {
  const [claudeHookIngressStatus, setClaudeHookIngressStatus] = useState<ClaudeHookIngressStatus>(
    defaultClaudeHookIngressStatus,
  );

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let isMounted = true;

    const loadClaudeHookIngressStatus = () => {
      void desktopGateway
        .getClaudeHookIngressStatus()
        .then((nextStatus) => {
          if (isMounted) {
            setClaudeHookIngressStatus(nextStatus);
          }
        })
        .catch((error) => {
          if (isMounted) {
            setClaudeHookIngressStatus({
              url: "",
              state: "error",
              error: formatCommandError(error),
            });
          }
        });
    };

    loadClaudeHookIngressStatus();
    const intervalId = window.setInterval(loadClaudeHookIngressStatus, CLAUDE_HOOK_STATUS_REFRESH_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once subscription; the injected handler reads live state via refs, so listing it would only re-subscribe without changing behavior.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void desktopGateway
      .subscribeClaudeHookIngress((payload) => onAgentHookEvent(payload))
      .then((stop) => {
        unlisten = stop;
      });

    return () => unlisten?.();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once subscription; the injected handler reads live state via refs, so listing it would only re-subscribe without changing behavior.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void desktopGateway
      .subscribePetsDrivenStateChanged(() => onBackendStateChanged())
      .then((stop) => {
        unlisten = stop;
      });

    return () => unlisten?.();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once subscription; the injected handler reads live state via refs, so listing it would only re-subscribe without changing behavior.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void desktopGateway
      .subscribePetCommand((event) => onPetCommand(event))
      .then((stop) => {
        unlisten = stop;
      });

    return () => unlisten?.();
  }, []);

  async function emitClaudeHookTestEvent() {
    setPetWindowError(null);

    try {
      await desktopGateway.emitTestClaudeHookIngressEvent();
    } catch (error) {
      setPetWindowError(formatCommandError(error));
    }
  }

  return { claudeHookIngressStatus, emitClaudeHookTestEvent };
}
