import { useTranslation } from "@pets-driven/i18n";
import { useEffect, useRef, useState } from "react";
import { PET_AGENT_PROVIDERS, type PetAgentProvider } from "@/app-state/pets-driven-state";
import type { PetWindowInputKind } from "@/pet-window/pet-window-messages";
import { petWindowTransport } from "@/pet-window/pet-window-transport";

type PetContextMenuViewProps = {
  petId: string;
  petName: string;
  note: string;
  /** The agent this pet is pinned to, or null when it follows the app default. */
  agentProvider?: PetAgentProvider | null;
  /**
   * The round this pet is already on, or null.
   *
   * The menu is the only place a round can be stopped, so it has to be able to
   * say that one is running. It is also what decides whether the game row opens
   * the two kinds or simply stops what is on: an off switch is worth a row of
   * the top menu, and picking a kind is not.
   */
  gameSpawn?: "auto" | "tool-use" | null;
  voiceMuted?: boolean;
};

type MenuView = "menu" | "note" | "settings" | "game";

/**
 * The menu window is sized from the tallest fixed menu view rather than a
 * measured number, because the window is not resizable and nothing on screen
 * says when content stopped fitting. Pet settings currently needs seven
 * row-equivalents even though the top-level menu has fewer rows.
 */
const MENU_ROW_CAPACITY = 7;
/** One row: 8px padding, a 15px line box, 8px padding. */
const MENU_ITEM_HEIGHT = 31;
/** Margin, border, padding, the header (name, or the way back) and its divider. */
const MENU_CHROME_HEIGHT = 82;

/**
 * One size for every menu view, the sub-view included.
 *
 * Not "whatever the rows come to", which is what a two-row chooser wants and
 * what it first got: the popup's position is settled once, in Rust, and the
 * edge clamp there measures against this size. A view that resizes the window
 * afterwards grows it from a fixed top-left with nothing to re-clamp it, so a
 * size per view means a menu that jumps when you step into it — and, if the
 * step ever widened the window, one whose second half falls off the right of
 * the monitor. The sub-view fills this height instead (see the card's
 * min-height below).
 *
 * Kept in step with MENU_WINDOW_WIDTH / MENU_WINDOW_HEIGHT in pet_windows.rs,
 * which is what the window is born at and what that clamp measures.
 */
export const MENU_WINDOW_SIZE = {
  width: 192,
  height: MENU_CHROME_HEIGHT + MENU_ROW_CAPACITY * MENU_ITEM_HEIGHT,
};
/** The card's own margin and border, top and bottom (see pet-context-menu.css). */
const MENU_CARD_OUTSET = 14;

const NOTE_WINDOW_SIZE = { width: 228, height: 192 };

export function PetContextMenuView({
  petId,
  petName,
  note,
  agentProvider = null,
  gameSpawn = null,
  voiceMuted = false,
}: PetContextMenuViewProps) {
  const { t } = useTranslation("desktop");
  const [view, setView] = useState<MenuView>("menu");
  const [noteText, setNoteText] = useState(note);
  const [nameText, setNameText] = useState(petName);
  const [selectedAgentProvider, setSelectedAgentProvider] = useState<PetAgentProvider | null>(
    agentProvider,
  );
  const sequenceRef = useRef(0);

  useEffect(() => {
    document.documentElement.classList.add("pet-context-menu-document");
    if (!petWindowTransport.isDesktopRuntime()) {
      document.documentElement.classList.add("pet-context-menu-fixture-preview");
    }

    return () => {
      document.documentElement.classList.remove("pet-context-menu-document");
      document.documentElement.classList.remove("pet-context-menu-fixture-preview");
    };
  }, []);

  useEffect(() => {
    if (!petWindowTransport.isDesktopRuntime()) {
      return;
    }

    // Show the window (created hidden) only after React has rendered content,
    // which prevents the white flash that occurs when the window is shown before
    // the webview has painted its first frame.
    void petWindowTransport.showWindow().then(() => petWindowTransport.focusWindow());

    // Prevent WebView2's built-in context menu from appearing inside the popup.
    const preventContextMenu = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", preventContextMenu);

    let unlistenFocus: (() => void) | undefined;
    let unlisten: (() => void) | undefined;

    // Arm the blur listener only after the window has genuinely received focus.
    // setFocus() can fire a spurious blur before focus settles; registering early
    // would catch that transient event and immediately hide the menu.
    void petWindowTransport
      .subscribeWindowFocus(() => {
        unlistenFocus?.();
        void petWindowTransport
          .subscribeWindowBlur(() => {
            void petWindowTransport.hideWindow();
          })
          .then((fn) => {
            unlisten = fn;
          });
      })
      .then((fn) => {
        unlistenFocus = fn;
      });

    return () => {
      window.removeEventListener("contextmenu", preventContextMenu);
      unlistenFocus?.();
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    // The note is a different shape on purpose — a textarea and two buttons,
    // not a list of rows. Every *menu* view is one size.
    const { width, height } = view === "note" ? NOTE_WINDOW_SIZE : MENU_WINDOW_SIZE;

    void petWindowTransport.setWindowSize(width, height);
  }, [view]);

  function emitSignal(
    kind: PetWindowInputKind,
    fields: {
      note?: string;
      name?: string;
      agentProvider?: PetAgentProvider | null;
    } = {},
  ) {
    sequenceRef.current += 1;

    petWindowTransport.sendInput({
      sequence: sequenceRef.current,
      petId,
      windowLabel: petWindowTransport.windowLabel(),
      pointerId: 0,
      kind,
      localPoint: { x: 0, y: 0 },
      screenPoint: { x: 0, y: 0 },
      ...fields,
      at: Date.now(),
    });
  }

  function closeWindow() {
    void petWindowTransport.hideWindow();
  }

  if (view === "note") {
    return (
      <main className="pet-context-menu-surface">
        <section
          aria-label={t("contextMenu.noteAria", { name: petName })}
          className="pet-context-menu-note"
        >
          <div className="pet-context-menu-note__header">
            {t("contextMenu.noteHeader", { name: petName })}
          </div>
          <textarea
            className="pet-context-menu-note__input"
            placeholder={t("contextMenu.notePlaceholder")}
            rows={3}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="pet-context-menu-note__actions">
            <button className="pet-context-menu-note__cancel" type="button" onClick={closeWindow}>
              {t("contextMenu.cancel")}
            </button>
            <button
              className="pet-context-menu-note__save"
              type="button"
              onClick={() => {
                emitSignal("menu.note-save", { note: noteText });
                closeWindow();
              }}
            >
              {t("contextMenu.save")}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (view === "settings") {
    const trimmedName = nameText.trim();

    return (
      <main className="pet-context-menu-surface">
        <section
          aria-label={t("contextMenu.settingsAria", { name: petName })}
          className="pet-context-menu-card pet-context-menu-card--settings"
          data-testid="pet-context-menu-settings"
          style={{ minHeight: MENU_WINDOW_SIZE.height - MENU_CARD_OUTSET }}
        >
          <button
            className="pet-context-menu-card__back"
            type="button"
            onClick={() => setView("menu")}
          >
            <BackIcon />
            <span className="pet-context-menu-card__name">{t("contextMenu.petSettings")}</span>
          </button>
          <div className="pet-context-menu-card__divider" />
          <div className="pet-context-menu-settings__body">
            <label className="pet-context-menu-settings__field">
              <span className="pet-context-menu-settings__label">{t("edit.name")}</span>
              <input
                className="pet-context-menu-settings__name"
                onChange={(event) => setNameText(event.target.value)}
                value={nameText}
              />
            </label>
            <fieldset className="pet-context-menu-settings__agents">
              <legend className="pet-context-menu-settings__label">{t("edit.agent")}</legend>
              <div className="pet-context-menu-settings__agent-options" role="radiogroup">
                {[null, ...PET_AGENT_PROVIDERS].map((provider) => {
                  const active = selectedAgentProvider === provider;
                  const label = provider ? t(`edit.agents.${provider}`) : t("edit.agentDefault");

                  return (
                    // biome-ignore lint/a11y/useSemanticElements: compact radio rows use the same ARIA segmented-control pattern as the main pet editor.
                    <button
                      aria-checked={active}
                      className={`pet-context-menu-settings__agent${active ? " pet-context-menu-settings__agent--active" : ""}`}
                      key={provider ?? "default"}
                      onClick={() => setSelectedAgentProvider(provider)}
                      role="radio"
                      type="button"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="pet-context-menu-settings__folder-field">
              <span className="pet-context-menu-settings__label">{t("edit.workingFolder")}</span>
              <button
                className="pet-context-menu-card__item pet-context-menu-card__item--folder pet-context-menu-settings__folder"
                type="button"
                onClick={() => {
                  emitSignal("menu.pick-folder");
                  closeWindow();
                }}
              >
                <FolderIcon />
                {t("contextMenu.chooseFolder")}
              </button>
            </div>
          </div>
          <div className="pet-context-menu-settings__actions">
            <button
              className="pet-context-menu-note__cancel"
              type="button"
              onClick={() => setView("menu")}
            >
              {t("contextMenu.cancel")}
            </button>
            <button
              className="pet-context-menu-note__save"
              disabled={!trimmedName}
              type="button"
              onClick={() => {
                emitSignal("menu.settings-save", {
                  name: trimmedName,
                  agentProvider: selectedAgentProvider,
                });
                closeWindow();
              }}
            >
              {t("contextMenu.save")}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (view === "game") {
    return (
      <main className="pet-context-menu-surface">
        <div
          aria-label={t("contextMenu.cardAria")}
          className="pet-context-menu-card pet-context-menu-card--game"
          data-testid="pet-context-menu-game"
          role="menu"
          // Fills the window the top menu sized, so stepping in changes what
          // the card says and not how big it is. The two choices then split
          // what is left, which is what makes them read as a chooser rather
          // than as a two-row stub with the menu's footprint around it.
          style={{ minHeight: MENU_WINDOW_SIZE.height - MENU_CARD_OUTSET }}
        >
          {/* The header is the way back, in the slot the pet's name occupies on
              the top menu — so the step down costs a row rather than adding one,
              and the window is the same width either way. */}
          <button
            className="pet-context-menu-card__back"
            type="button"
            onClick={() => setView("menu")}
          >
            <BackIcon />
            <span className="pet-context-menu-card__name">{t("contextMenu.gameMode")}</span>
          </button>
          <div className="pet-context-menu-card__divider" />
          {/* Each choice says what it is underneath its name. The two are not
              self-explanatory — one is a reading of the agent and the other is
              a game — and this is the screen with the room to say so. */}
          <button
            className="pet-context-menu-card__item pet-context-menu-card__item--game pet-context-menu-card__item--choice"
            role="menuitem"
            type="button"
            onClick={() => {
              emitSignal("menu.game-toggle");
              closeWindow();
            }}
          >
            <GamepadIcon />
            <span className="pet-context-menu-card__choice">
              <span className="pet-context-menu-card__choice-title">
                {t("contextMenu.gameWatch")}
              </span>
              <span className="pet-context-menu-card__choice-note">
                {t("contextMenu.gameWatchNote")}
              </span>
            </span>
          </button>
          <button
            className="pet-context-menu-card__item pet-context-menu-card__item--game pet-context-menu-card__item--choice"
            role="menuitem"
            type="button"
            onClick={() => {
              emitSignal("menu.game-practice");
              closeWindow();
            }}
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="15"
            >
              <path d="M4 19h4l2-5 3 8 2-6h5" />
            </svg>
            <span className="pet-context-menu-card__choice">
              <span className="pet-context-menu-card__choice-title">
                {t("contextMenu.gamePractice")}
              </span>
              <span className="pet-context-menu-card__choice-note">
                {t("contextMenu.gamePracticeNote")}
              </span>
            </span>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="pet-context-menu-surface">
      <div
        aria-label={t("contextMenu.cardAria")}
        className="pet-context-menu-card"
        data-testid="pet-context-menu"
        role="menu"
      >
        <div className="pet-context-menu-card__header">
          <span className="pet-context-menu-card__name" title={petName}>
            {petName}
          </span>
          <div className="pet-context-menu-card__header-actions">
            <button
              aria-label={voiceMuted ? t("contextMenu.unmuteVoice") : t("contextMenu.muteVoice")}
              className={`pet-context-menu-card__header-action pet-context-menu-card__header-action--voice${voiceMuted ? " pet-context-menu-card__header-action--muted" : ""}`}
              onClick={() => {
                emitSignal("menu.voice-toggle");
                closeWindow();
              }}
              title={voiceMuted ? t("contextMenu.unmuteVoice") : t("contextMenu.muteVoice")}
              type="button"
            >
              <VoiceIcon muted={voiceMuted} />
            </button>
            <button
              aria-haspopup="dialog"
              aria-label={t("contextMenu.petSettings")}
              className="pet-context-menu-card__header-action pet-context-menu-card__header-action--settings"
              onClick={() => setView("settings")}
              title={t("contextMenu.petSettings")}
              type="button"
            >
              <SettingsIcon />
            </button>
          </div>
        </div>
        <div className="pet-context-menu-card__divider" />
        <button
          className="pet-context-menu-card__item pet-context-menu-card__item--note"
          role="menuitem"
          type="button"
          onClick={() => setView("note")}
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="15"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="15"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          {t("contextMenu.writeNote")}
        </button>
        <button
          className="pet-context-menu-card__item pet-context-menu-card__item--terminal"
          role="menuitem"
          type="button"
          onClick={() => {
            emitSignal("menu.find-terminal");
            closeWindow();
          }}
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="15"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="15"
          >
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" x2="20" y1="19" y2="19" />
          </svg>
          {t("contextMenu.findTerminal")}
        </button>
        {/* One row for the whole feature. While a round is on it stops it
            outright rather than opening the two kinds again: the menu is the
            only off switch there is, and an off switch a step down is one the
            user has to go looking for. */}
        <button
          aria-haspopup={gameSpawn ? undefined : "menu"}
          className="pet-context-menu-card__item pet-context-menu-card__item--game"
          role="menuitem"
          type="button"
          onClick={() => {
            if (gameSpawn) {
              emitSignal("menu.game-stop");
              closeWindow();
              return;
            }
            setView("game");
          }}
        >
          <GamepadIcon />
          {gameSpawn ? t("contextMenu.gameStop") : t("contextMenu.gameMode")}
          {gameSpawn ? null : (
            <span aria-hidden="true" className="pet-context-menu-card__chevron">
              ›
            </span>
          )}
        </button>
        <div className="pet-context-menu-card__divider pet-context-menu-card__divider--actions" />
        <button
          className="pet-context-menu-card__item pet-context-menu-card__item--send-home"
          role="menuitem"
          type="button"
          onClick={() => {
            emitSignal("menu.send-home");
            closeWindow();
          }}
        >
          <HomeIcon />
          {t("contextMenu.sendHome")}
        </button>
        <button
          className="pet-context-menu-card__item pet-context-menu-card__item--close"
          role="menuitem"
          type="button"
          onClick={closeWindow}
        >
          <CloseIcon />
          {t("contextMenu.closeMenu")}
        </button>
      </div>
    </main>
  );
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="15"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function VoiceIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="15"
    >
      <path d="M11 5 6 9H2v6h4l5 4Z" />
      {muted ? <path d="m22 9-6 6m0-6 6 6" /> : <path d="M15 9a5 5 0 0 1 0 6" />}
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="15"
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="15"
    >
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="15"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/**
 * The gamepad, shared by the row that opens the two kinds of round and the one
 * inside it that picks the agent's own course. The same mark on both is what
 * says the second screen is the first row opened up.
 */
function GamepadIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="15"
    >
      <line x1="6" x2="10" y1="12" y2="12" />
      <line x1="8" x2="8" y1="10" y2="14" />
      <line x1="15" x2="15.01" y1="13" y2="13" />
      <line x1="18" x2="18.01" y1="11" y2="11" />
      <rect height="12" rx="2" width="20" x="2" y="6" />
    </svg>
  );
}
