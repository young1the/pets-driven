import type { ReactElement } from "react";

/**
 * The six starter pets, inlined as SVG so the avatar is fully portable
 * (no external asset paths). Ported from the Pets-Driven design bundle.
 */

export type PetName = "cato" | "otto" | "mochi" | "fenn" | "bloop" | "pip";

const Cato = (
  <svg className="pd-pet__art" viewBox="0 0 100 100">
    <path d="M26 38 L22 16 L42 30 Z" fill="#8B7FE8" />
    <path d="M74 38 L78 16 L58 30 Z" fill="#8B7FE8" />
    <path d="M28 34 L26 22 L37 30 Z" fill="#FF9FC7" />
    <path d="M72 34 L74 22 L63 30 Z" fill="#FF9FC7" />
    <ellipse cx="50" cy="58" rx="33" ry="31" fill="#8B7FE8" />
    <ellipse cx="50" cy="66" rx="20" ry="18" fill="#A189EE" />
    <circle cx="30" cy="62" r="7" fill="#FF7FB4" opacity="0.55" />
    <circle cx="70" cy="62" r="7" fill="#FF7FB4" opacity="0.55" />
    <circle cx="39" cy="54" r="6" fill="#221F2E" />
    <circle cx="61" cy="54" r="6" fill="#221F2E" />
    <circle cx="41" cy="52" r="2" fill="#fff" />
    <circle cx="63" cy="52" r="2" fill="#fff" />
    <path d="M47 62 Q50 65 53 62" fill="none" stroke="#221F2E" strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="50" cy="61" r="1.6" fill="#221F2E" />
  </svg>
);

const Otto = (
  <svg className="pd-pet__art" viewBox="0 0 100 100">
    <ellipse cx="22" cy="50" rx="11" ry="20" fill="#C9870D" transform="rotate(-12 22 50)" />
    <ellipse cx="78" cy="50" rx="11" ry="20" fill="#C9870D" transform="rotate(12 78 50)" />
    <ellipse cx="50" cy="58" rx="31" ry="30" fill="#FBC24A" />
    <ellipse cx="50" cy="68" rx="18" ry="14" fill="#FFEFC2" />
    <ellipse cx="36" cy="44" rx="11" ry="10" fill="#F0A91F" opacity="0.55" />
    <circle cx="30" cy="60" r="6" fill="#FF9FC7" opacity="0.4" />
    <circle cx="70" cy="60" r="6" fill="#FF9FC7" opacity="0.4" />
    <circle cx="40" cy="52" r="5.6" fill="#221F2E" />
    <circle cx="60" cy="52" r="5.6" fill="#221F2E" />
    <circle cx="42" cy="50" r="1.9" fill="#fff" />
    <circle cx="62" cy="50" r="1.9" fill="#fff" />
    <ellipse cx="50" cy="62" rx="3.2" ry="2.6" fill="#221F2E" />
    <path d="M50 65 L50 70 M50 70 Q44 73 41 69 M50 70 Q56 73 59 69" fill="none" stroke="#221F2E" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M47 71 Q50 80 53 71 Z" fill="#FF7FB4" />
  </svg>
);

const Mochi = (
  <svg className="pd-pet__art" viewBox="0 0 100 100">
    <ellipse cx="39" cy="22" rx="7.5" ry="20" fill="#F95E9E" />
    <ellipse cx="61" cy="22" rx="7.5" ry="20" fill="#F95E9E" />
    <ellipse cx="39" cy="24" rx="3.5" ry="13" fill="#FFC4DD" />
    <ellipse cx="61" cy="24" rx="3.5" ry="13" fill="#FFC4DD" />
    <ellipse cx="50" cy="60" rx="32" ry="29" fill="#F95E9E" />
    <ellipse cx="50" cy="68" rx="19" ry="16" fill="#FF7FB4" />
    <circle cx="40" cy="56" r="6" fill="#221F2E" />
    <circle cx="60" cy="56" r="6" fill="#221F2E" />
    <circle cx="42" cy="54" r="2" fill="#fff" />
    <circle cx="62" cy="54" r="2" fill="#fff" />
    <circle cx="50" cy="63" r="2" fill="#221F2E" />
    <path d="M50 65 Q46 69 42 67 M50 65 Q54 69 58 67" fill="none" stroke="#221F2E" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const Fenn = (
  <svg className="pd-pet__art" viewBox="0 0 100 100">
    <path d="M24 40 L18 12 L44 30 Z" fill="#F65440" />
    <path d="M76 40 L82 12 L56 30 Z" fill="#F65440" />
    <path d="M26 34 L23 18 L38 30 Z" fill="#2C2840" />
    <path d="M74 34 L77 18 L62 30 Z" fill="#2C2840" />
    <ellipse cx="50" cy="58" rx="33" ry="31" fill="#FF7967" />
    <path d="M50 40 Q34 46 34 64 Q34 82 50 84 Q66 82 66 64 Q66 46 50 40 Z" fill="#FFE0D9" />
    <circle cx="40" cy="54" r="5.6" fill="#221F2E" />
    <circle cx="60" cy="54" r="5.6" fill="#221F2E" />
    <circle cx="42" cy="52" r="1.9" fill="#fff" />
    <circle cx="62" cy="52" r="1.9" fill="#fff" />
    <path d="M44 64 L56 64 L50 70 Z" fill="#221F2E" />
  </svg>
);

const Bloop = (
  <svg className="pd-pet__art" viewBox="0 0 100 100">
    <ellipse cx="50" cy="60" rx="34" ry="30" fill="#2FB67E" />
    <ellipse cx="50" cy="68" rx="22" ry="17" fill="#7BD9B0" />
    <circle cx="34" cy="34" r="13" fill="#2FB67E" />
    <circle cx="66" cy="34" r="13" fill="#2FB67E" />
    <circle cx="34" cy="33" r="9" fill="#fff" />
    <circle cx="66" cy="33" r="9" fill="#fff" />
    <circle cx="34" cy="34" r="5" fill="#221F2E" />
    <circle cx="66" cy="34" r="5" fill="#221F2E" />
    <circle cx="36" cy="32" r="1.8" fill="#fff" />
    <circle cx="68" cy="32" r="1.8" fill="#fff" />
    <path d="M32 58 Q50 76 68 58" fill="none" stroke="#221F2E" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);

const Pip = (
  <svg className="pd-pet__art" viewBox="0 0 100 100">
    <path d="M50 14 Q44 4 48 18 M50 14 Q56 4 52 18 M50 12 Q50 2 50 18" fill="none" stroke="#3E97DC" strokeWidth="4" strokeLinecap="round" />
    <ellipse cx="50" cy="58" rx="31" ry="31" fill="#5FB2EA" />
    <ellipse cx="50" cy="68" rx="20" ry="17" fill="#D4EDFC" />
    <path d="M22 56 Q14 64 24 72 Q30 68 30 58 Z" fill="#3E97DC" />
    <path d="M78 56 Q86 64 76 72 Q70 68 70 58 Z" fill="#3E97DC" />
    <circle cx="41" cy="52" r="5.6" fill="#221F2E" />
    <circle cx="59" cy="52" r="5.6" fill="#221F2E" />
    <circle cx="43" cy="50" r="1.9" fill="#fff" />
    <circle cx="61" cy="50" r="1.9" fill="#fff" />
    <path d="M44 60 L56 60 L50 68 Z" fill="#F0A91F" />
  </svg>
);

export const PETS: Record<PetName, ReactElement> = {
  cato: Cato,
  otto: Otto,
  mochi: Mochi,
  fenn: Fenn,
  bloop: Bloop,
  pip: Pip,
};

/** Soft background tint behind each pet, by pet. */
export const PET_TINTS: Record<PetName, string> = {
  cato: "var(--lavender-100)",
  otto: "var(--butter-100)",
  mochi: "var(--blossom-100)",
  fenn: "var(--coral-100)",
  bloop: "var(--mint-100)",
  pip: "var(--sky-100)",
};

/** Status-ring color for each pet. */
export const PET_RINGS: Record<PetName, string> = {
  cato: "var(--lavender-300)",
  otto: "var(--butter-300)",
  mochi: "var(--blossom-300)",
  fenn: "var(--coral-300)",
  bloop: "var(--mint-300)",
  pip: "var(--sky-300)",
};
