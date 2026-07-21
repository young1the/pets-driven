import { useTranslation } from "@pets-driven/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PetConnectNotice } from "@/pet-window/pet-connect-notice";
import { petWindowTransport } from "@/pet-window/pet-window-transport";

type UsePetWindowConnectNoticeParams = {
  petId: string;
  isPreview: boolean;
  previewConnectNotice?: { text: string; transient: boolean };
};

/**
 * Connect-mode feedback for a pet window: the prompt shown while the host waits
 * for the user to pick a window, then a short-lived result notice. Non-connect
 * binding updates stay silent. Owns the binding subscription and the notice
 * value; dismissal is delegated to PetConnectNoticeView.
 */
export function usePetWindowConnectNotice({
  petId,
  isPreview,
  previewConnectNotice,
}: UsePetWindowConnectNoticeParams) {
  const { t } = useTranslation("desktop");
  const [connectNotice, setConnectNotice] = useState<PetConnectNotice | null>(() =>
    isPreview && previewConnectNotice ? { id: 0, ...previewConnectNotice } : null,
  );
  const connectNoticeIdRef = useRef(0);
  const dismissConnectNotice = useCallback(() => setConnectNotice(null), []);
  // Title held when connect mode started; a cancelled pick reports the same
  // binding back, so an unchanged title means nothing new was connected.
  const connectStartTitleRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let unlistenBinding: (() => void) | undefined;

    void petWindowTransport
      .subscribeBinding((binding) => {
        if (binding.petId !== petId) {
          return;
        }

        if (binding.isConnecting) {
          connectStartTitleRef.current = binding.title;
          connectNoticeIdRef.current += 1;
          setConnectNotice({
            id: connectNoticeIdRef.current,
            text: t("petWindow.connectPrompt"),
            transient: false,
          });
          return;
        }

        // A non-connecting binding update that isn't the result of a connect the
        // user just started (e.g. a loading/bind update from starting a session)
        // is silent — it leaves any live notice, and its timer, untouched.
        if (connectStartTitleRef.current === undefined) {
          return;
        }

        const isNewBinding =
          binding.title !== null && binding.title !== connectStartTitleRef.current;
        connectStartTitleRef.current = undefined;
        connectNoticeIdRef.current += 1;
        setConnectNotice({
          id: connectNoticeIdRef.current,
          text: isNewBinding
            ? t("petWindow.connectedTo", { title: binding.title })
            : t("petWindow.connectCancelled"),
          transient: true,
        });
      })
      .then((unlisten) => {
        unlistenBinding = unlisten;
      });

    return () => {
      unlistenBinding?.();
    };
  }, [petId, t]);

  return { connectNotice, dismissConnectNotice };
}
