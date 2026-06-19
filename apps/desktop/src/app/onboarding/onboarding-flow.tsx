import { useEffect, useState } from "react";
import { Badge, Button, Card, Input } from "@pets-driven/design-system";
import {
  desktopGateway,
  type CodexPetPackage,
  type DesktopGateway,
} from "@/app/desktop-gateway";
import {
  PERSONALITY_OPTIONS,
  type PersonalityOption,
} from "@/app/onboarding/personality-options";
import { PetPackageGrid } from "@/app/onboarding/pet-package-grid";
import { adoptPet } from "@/app-state/pet-adoption";
import type { PetsDrivenState } from "@/app-state/pets-driven-state";
import type { PetPersonalityId } from "@/pets/profiles/pet-profile";

const PET_NAME_MAX_LENGTH = 24;

type OnboardingStep = "welcome" | "choose" | "name" | "personality" | "done";

type OnboardingFlowProps = {
  state: PetsDrivenState;
  onStateChange: (state: PetsDrivenState) => void;
  onDone: () => void;
  gateway?: DesktopGateway;
};

function isValidPetName(name: string) {
  const trimmed = name.trim();

  return trimmed.length > 0 && trimmed.length <= PET_NAME_MAX_LENGTH;
}

export function OnboardingFlow({
  state,
  onStateChange,
  onDone,
  gateway = desktopGateway,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [packages, setPackages] = useState<CodexPetPackage[]>([]);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [personalityId, setPersonalityId] =
    useState<PetPersonalityId>("playful");
  const [adoptionError, setAdoptionError] = useState<string | null>(null);
  const [adoptedPetName, setAdoptedPetName] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void gateway
      .listPetPackages()
      .then((nextPackages) => {
        if (isMounted) {
          setPackages(nextPackages);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPackages([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [gateway]);

  async function completeAdoption() {
    if (!assetId || !isValidPetName(name)) {
      return;
    }

    const option =
      PERSONALITY_OPTIONS.find((candidate) => candidate.id === personalityId) ??
      PERSONALITY_OPTIONS[0];
    const petId = crypto.randomUUID();
    const trimmedName = name.trim();
    const nextState = adoptPet(state, {
      id: petId,
      profileId: crypto.randomUUID(),
      name: trimmedName,
      assetId,
      personalityId: option.id,
      personality: option.factory(),
      now: Date.now(),
    });

    setAdoptionError(null);

    try {
      await gateway.writePetsDrivenState(nextState);
      onStateChange(nextState);
      setAdoptedPetName(trimmedName);
      setStep("done");
      await gateway.openPetWindow(petId, assetId);
    } catch (error) {
      setAdoptionError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return (
    <main aria-label="Pet onboarding" className="onboarding-shell">
      {step === "welcome" && (
        <Card className="onboarding-card" padding="lg">
          <span className="pd-eyebrow">Welcome to Pets-Driven</span>
          <h1>Every great agent deserves a companion</h1>
          <p>
            Adopt a pet and it will live on your screen — fetching files,
            digging through code, and napping when the work is done.
          </p>
          <div className="onboarding-actions">
            <Button onClick={() => setStep("choose")} size="lg">
              Adopt a pet
            </Button>
          </div>
        </Card>
      )}

      {step === "choose" && (
        <Card className="onboarding-card" padding="lg">
          <h1>Choose your pet</h1>
          <p>Each one is ready to work. Pick whoever you like best.</p>
          <PetPackageGrid
            onSelect={setAssetId}
            packages={packages}
            selectedAssetId={assetId}
          />
          <div className="onboarding-actions">
            <Button onClick={() => setStep("welcome")} variant="ghost">
              Back
            </Button>
            <Button disabled={!assetId} onClick={() => setStep("name")}>
              Next
            </Button>
          </div>
        </Card>
      )}

      {step === "name" && (
        <Card className="onboarding-card" padding="lg">
          <h1>Give it a name</h1>
          <p>Something you will enjoy reading in commit messages.</p>
          <Input
            hint={`Up to ${PET_NAME_MAX_LENGTH} characters`}
            label="Pet name"
            maxLength={PET_NAME_MAX_LENGTH}
            onChange={(event) => setName(event.target.value)}
            placeholder="Otto"
            value={name}
          />
          <div className="onboarding-actions">
            <Button onClick={() => setStep("choose")} variant="ghost">
              Back
            </Button>
            <Button
              disabled={!isValidPetName(name)}
              onClick={() => setStep("personality")}
            >
              Next
            </Button>
          </div>
        </Card>
      )}

      {step === "personality" && (
        <Card className="onboarding-card" padding="lg">
          <h1>Pick a personality</h1>
          <p>How should {name.trim() || "your pet"} carry itself?</p>
          <div className="onboarding-personalities" role="radiogroup">
            {PERSONALITY_OPTIONS.map((option: PersonalityOption) => (
              <Card
                aria-checked={personalityId === option.id}
                className="onboarding-personality-card"
                interactive
                key={option.id}
                onClick={() => setPersonalityId(option.id)}
                padding="sm"
                role="radio"
                tabIndex={0}
                tone={personalityId === option.id ? "teal" : "default"}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setPersonalityId(option.id);
                  }
                }}
              >
                <div className="onboarding-pet-card__meta">
                  <strong>{option.title}</strong>
                  {personalityId === option.id && <Badge dot tone="accent">Picked</Badge>}
                </div>
                <p>{option.blurb}</p>
              </Card>
            ))}
          </div>
          {adoptionError && (
            <p className="app-error" role="status">
              {adoptionError}
            </p>
          )}
          <div className="onboarding-actions">
            <Button onClick={() => setStep("name")} variant="ghost">
              Back
            </Button>
            <Button onClick={() => void completeAdoption()} variant="mint">
              Finish adoption
            </Button>
          </div>
        </Card>
      )}

      {step === "done" && (
        <Card className="onboarding-card" padding="lg">
          <span className="pd-eyebrow">Adoption complete</span>
          <h1>{adoptedPetName} is settling in…</h1>
          <p>
            Look for {adoptedPetName} on your screen — a little stretching, a
            little exploring.
          </p>
          <p>
            Next up — connect an agent so {adoptedPetName} has work to react
            to.
          </p>
          <div className="onboarding-actions">
            <Button onClick={onDone} variant="neutral">
              Done for now
            </Button>
          </div>
        </Card>
      )}
    </main>
  );
}
