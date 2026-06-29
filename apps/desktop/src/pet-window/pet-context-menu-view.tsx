import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import {
  PET_CONTEXT_MENU_INIT_EVENT,
  PET_CONTEXT_MENU_READY_EVENT,
  PET_WINDOW_HOST_LABEL,
  PET_WINDOW_INPUT_EVENT,
  type PetContextMenuInit,
  type PetWindowInputKind,
} from "@/pet-window/pet-window-messages";

type PetContextMenuViewProps = {
  petId: string;
};

type MenuView = "menu" | "note";

const MENU_WINDOW_SIZE = { width: 192, height: 132 };
const NOTE_WINDOW_SIZE = { width: 228, height: 192 };

export function PetContextMenuView({ petId }: PetContextMenuViewProps) {
  const [view, setView] = useState<MenuView>("menu");
  const [petName, setPetName] = useState(petId);
  const [noteText, setNoteText] = useState("");
  const [ready, setReady] = useState(!isTauri());
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

    let unlisten: (() => void) | undefined;

    void listen<PetContextMenuInit>(PET_CONTEXT_MENU_INIT_EVENT, (e) => {
      if (e.payload.petId === petId) {
        setPetName(e.payload.petName);
        setNoteText(e.payload.note);
        setReady(true);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    void emitTo(PET_WINDOW_HOST_LABEL, PET_CONTEXT_MENU_READY_EVENT, {
      petId,
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const handleBlur = () => {
      void getCurrentWindow().close();
    };

    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("blur", handleBlur);
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
      void getCurrentWindow().close();
    }
  }

  if (!ready) {
    return null;
  }

  if (view === "note") {
    return (
      <main className="pet-context-menu-surface">
        <div
          aria-label={`${petId}에게 노트`}
          className="pet-context-menu-note"
        >
          <div className="pet-context-menu-note__header">{petName}에게 메모</div>
          <textarea
            autoFocus
            className="pet-context-menu-note__input"
            placeholder="메모를 입력하세요"
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
              취소
            </button>
            <button
              className="pet-context-menu-note__save"
              type="button"
              onClick={() => {
                emitSignal("menu.note-save", noteText);
                closeWindow();
              }}
            >
              저장
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pet-context-menu-surface">
      <div
        aria-label="Pet Context Menu"
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
          노트 작성하기
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
          닫기
        </button>
      </div>
    </main>
  );
}
