export function createSteering() {
  const held = new Set();
  return {
    x: 1.15,
    lean: 0,
    press(code) { held.add(code); },
    release(code) { held.delete(code); },
    clear() { held.clear(); },
    update(dt) {
      const direction = Number(held.has('ArrowRight')) - Number(held.has('ArrowLeft'));
      const next = Math.max(-5.1, Math.min(5.1, this.x + direction * 3.2 * dt));
      const moving = next !== this.x ? direction : 0;
      this.x = next;
      this.lean += (moving - this.lean) * (1 - Math.exp(-10 * dt));
    },
  };
}
