/**
 * Emitted by the Rust backend after an authoritative state mutation (e.g. a
 * `/pets-driven/hatch` create) so the frontend reloads the persisted state.
 */
export const PETS_DRIVEN_STATE_CHANGED_EVENT = "pets-driven:state-changed";
