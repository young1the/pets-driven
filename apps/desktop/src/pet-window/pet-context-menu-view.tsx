import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@pets-driven/i18n";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  PET_WINDOW_HOST_LABEL,
  PET_WINDOW_INPUT_EVENT,
  type PetWindowInputKind,
} from "@/pet-window/pet-window-messages";

type PetContextMenuViewProps = {
  petId: string;
  petName: string;
  note: string;
};

type MenuView = "menu" | "note";

const MENU_WINDOW_SIZE = { width: 192, height: 172 };
const NOTE_WINDOW_SIZE = { width: 228, height: 192 };

export function PetContextMenuView({
  petId,
  petName,
  note,
}: PetContextMenuViewProps) {
  const { t } = useTranslation("desktop");
  const [view, setView] = useState<MenuView>("menu");
  const [noteText, setNoteText] = useState(note);
  const sequenceRef = useRef(0);

  useEffect(() => {
    document.documentElement.classList.add("pet-context-menu-document");

    return () => {
      document.documentElement.classList.remove("pet-context-menu-document");
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    // Show the window (created hidden) only after React has rendered content,
    // which prevents the white flash that occurs when the window is shown before
    // the webview has painted its first frame.
    const win = getCurrentWindow();
    void win.show().then(() => win.setFocus());

    // Prevent WebView2's built-in context menu from appearing inside the popup.
    const preventContextMenu = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", preventContextMenu);

    let unlistenFocus: (() => void) | undefined;
    let unlisten: (() => void) | undefined;

    // Arm the blur listener only after the window has genuinely received focus.
    // setFocus() can fire a spurious blur before focus settles; registering early
    // would catch that transient event and immediately hide the menu.
    void listen("tauri://focus", () => {
      unlistenFocus?.();
      void listen("tauri://blur", () => {
        void getCurrentWindow().hide();
      }).then((fn) => {
        unlisten = fn;
      });
    }).then((fn) => {
      unlistenFocus = fn;
    });

    return () => {
      window.removeEventListener("contextmenu", preventContextMenu);
      unlistenFocus?.();
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const { width, height } =
      view === "note" ? NOTE_WINDOW_SIZE : MENU_WINDOW_SIZE;

    void getCurrentWindow().setSize(new LogicalSize(width, height));
  }, [view]);

  function emitSignal(kind: PetWindowInputKind, memo?: string) {
    if (!isTauri()) {
      return;
    }

    sequenceRef.current += 1;

    void emitTo(PET_WINDOW_HOST_LABEL, PET_WINDOW_INPUT_EVENT, {
      sequence: sequenceRef.current,
      petId,
      windowLabel: getCurrentWindow().label,
      pointerId: 0,
      kind,
      localPoint: { x: 0, y: 0 },
      screenPoint: { x: 0, y: 0 },
      memo,
      at: Date.now(),
    });
  }

  function closeWindow() {
    if (isTauri()) {
      void getCurrentWindow().hide();
    }
  }

  if (view === "note") {
    return (
      <main className="pet-context-menu-surface">
        <div
          aria-label={t("contextMenu.noteAria", { name: petName })}
          className="pet-context-menu-note"
        >
          <div className="pet-context-menu-note__header">
            {t("contextMenu.noteHeader", { name: petName })}
          </div>
          <textarea
            autoFocus
            className="pet-context-menu-note__input"
            placeholder={t("contextMenu.notePlaceholder")}
            rows={3}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="pet-context-menu-note__actions">
            <button
              className="pet-context-menu-note__cancel"
              type="button"
              onClick={closeWindow}
            >
              {t("contextMenu.cancel")}
            </button>
            <button
              className="pet-context-menu-note__save"
              type="button"
              onClick={() => {
                emitSignal("menu.note-save", noteText);
                closeWindow();
              }}
            >
              {t("contextMenu.save")}
            </button>
          </div>
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
          <span className="pet-context-menu-card__name">{petName}</span>
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
          className="pet-context-menu-card__item pet-context-menu-card__item--folder"
          role="menuitem"
          type="button"
          onClick={() => {
            emitSignal("menu.pick-folder");
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
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
          </svg>
          {t("contextMenu.chooseFolder")}
        </button>
        <button
          className="pet-context-menu-card__item pet-context-menu-card__item--close"
          role="menuitem"
          type="button"
          onClick={() => {
            emitSignal("menu.close");
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
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
          {t("contextMenu.close")}
        </button>
      </div>
    </main>
  );
}
