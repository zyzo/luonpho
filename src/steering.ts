export function createSteering() {
  const held = new Set<string>();
  return {
    x: 1.15,
    lean: 0,
    speedKmh: 30,
    get speed() {
      return this.speedKmh / 30;
    },
    distance: 0,
    press(code: string) {
      held.add(code);
    },
    release(code: string) {
      held.delete(code);
    },
    clear() {
      held.clear();
      this.speedKmh = 30;
    },
    update(dt: number, canControl = true) {
      const accelerating = canControl && held.has('Space');
      this.speedKmh = Math.max(
        30,
        Math.min(80, this.speedKmh + (accelerating ? 10 : -15) * dt),
      );
      this.distance += (this.speed - 1) * dt;
      if (!canControl) return;
      const direction =
        Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft'));
      const next = Math.max(-5.1, Math.min(5.1, this.x + direction * 3.2 * dt));
      const moving = next !== this.x ? direction : 0;
      this.x = next;
      this.lean += (moving - this.lean) * (1 - Math.exp(-10 * dt));
    },
  };
}
