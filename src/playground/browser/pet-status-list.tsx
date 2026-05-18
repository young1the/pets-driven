import type { PetSnapshot } from "@/core/snapshots/world-snapshot";
import { PLAYGROUND_TEXT } from "./playground-text";

type PetStatusListProps = {
  pets: PetSnapshot[];
};

export function PetStatusList({ pets }: PetStatusListProps) {
  return (
    <section className="pet-status-list">
      <h2>{PLAYGROUND_TEXT.petStatusTitle}</h2>
      <ul>
        {pets.map((pet) => (
          <li key={pet.id}>
            <strong>{pet.name}</strong>
            <span>{pet.sourceId}</span>
            <span>{pet.intent}</span>
            <span>{pet.speech ?? PLAYGROUND_TEXT.noSpeech}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
