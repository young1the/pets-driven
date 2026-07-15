import { useTranslation } from "@pets-driven/i18n";
import type { PetSnapshot } from "@pets-driven/pet-engine/core/world-snapshot";
import { PET_SPEECH_KEY_PREFIX } from "@pets-driven/pet-engine/pets/personalities/voice-profiles";
import { PLAYGROUND_TEXT } from "./playground-text";

type PetStatusListProps = {
  pets: PetSnapshot[];
};

export function PetStatusList({ pets }: PetStatusListProps) {
  const { t } = useTranslation("desktop");
  // Personality dialogue arrives as a `petSpeech.*` i18n key; localize it here
  // the same way the pet window does. Agent-supplied summaries are free text.
  const localizeSpeech = (speech: string | null | undefined) => {
    if (!speech) return PLAYGROUND_TEXT.noSpeech;
    return speech.startsWith(`${PET_SPEECH_KEY_PREFIX}.`) ? t(speech) : speech;
  };

  return (
    <section className="pet-status-list">
      <h2>{PLAYGROUND_TEXT.petStatusTitle}</h2>
      <ul>
        {pets.map((pet) => (
          <li key={pet.id}>
            <strong>{pet.name}</strong>
            <span>{pet.sourceId}</span>
            <span>{pet.steering}</span>
            <span>{pet.locomotion}</span>
            {pet.agentTask?.label && <span>{pet.agentTask.label}</span>}
            {pet.action && pet.action !== "none" && <span>{pet.action}</span>}
            <span>{localizeSpeech(pet.speech)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
