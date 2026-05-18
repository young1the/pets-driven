export type SteeringBody = {
  id: string;
  x: number;
  y: number;
};

export function computeSeparationForces(bodies: SteeringBody[], desiredDistance: number) {
  return bodies.map((body) => {
    let fx = 0;
    let fy = 0;

    for (const other of bodies) {
      if (body.id === other.id) {
        continue;
      }

      const dx = body.x - other.x;
      const dy = body.y - other.y;
      const distance = Math.hypot(dx, dy);
      if (distance === 0 || distance >= desiredDistance) {
        continue;
      }

      const strength = (desiredDistance - distance) / desiredDistance;
      fx += (dx / distance) * strength;
      fy += (dy / distance) * strength;
    }

    return { id: body.id, x: fx, y: fy };
  });
}
