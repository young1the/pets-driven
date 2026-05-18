export type SteeringPet = {
  id: string;
  position: { x: number; y: number };
  movement: {
    idleSpeed: number;
    activeSpeed: number;
    seekUserSpeed: number;
  };
  runtime: {
    intent: string;
    motion: {
      targetEntityId: string | null;
      targetPosition: { x: number; y: number } | null;
    };
  };
};

export function computeIntentSteeringForces(pets: SteeringPet[]) {
  return pets.map((pet) => {
    const target = pet.runtime.motion.targetPosition;
    if (!target) {
      return { id: pet.id, x: 0, y: 0 };
    }

    const dx = target.x - pet.position.x;
    const dy = target.y - pet.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) {
      return { id: pet.id, x: 0, y: 0 };
    }

    const speed =
      pet.runtime.intent === "seek-user"
        ? pet.movement.seekUserSpeed
        : pet.runtime.intent === "active"
          ? pet.movement.activeSpeed
          : pet.movement.idleSpeed;

    return {
      id: pet.id,
      x: (dx / distance) * speed,
      y: (dy / distance) * speed,
    };
  });
}
