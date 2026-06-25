import { useState } from "react";

export type AppView = "home" | "playground" | "onboarding";

export function useAppNavigation(initial: AppView = "home") {
  const [view, setView] = useState<AppView>(initial);

  return { view, navigate: setView };
}
