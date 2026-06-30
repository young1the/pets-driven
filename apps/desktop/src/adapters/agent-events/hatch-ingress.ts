/**
 * Emitted by the Rust backend after an authoritative state mutation (e.g. a
 * `/pets-driven/hatch` create) so the frontend reloads the persisted state.
 */
export const PETS_DRIVEN_STATE_CHANGED_EVENT = "pets-driven:state-changed";

/**
 * Emitted by the Rust backend to show or hide a specific pet window.
 * Sent after `/pets-driven/show`, `/pets-driven/hide`, and `/pets-driven/hatch`.
 */
export const PETS_DRIVEN_PET_COMMAND_EVENT = "pets-driven:pet-command";

export type PetCommandEvent = {
  action: "show" | "hide";
  petId: string;
};
