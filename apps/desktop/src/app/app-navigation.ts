import { useState } from "react";

export type AppView = "home" | "playground" | "onboarding" | "adopt";

export function useAppNavigation(initial: AppView = "home") {
  const [view, setView] = useState<AppView>(initial);

  return { view, navigate: setView };
}
