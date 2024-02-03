import { draw } from "./draw.js";
import { GameState } from "./game-state.js";

/** @param {HTMLAudioElement} sound */
const playSound = (sound) => {
  const clone = /** @type {HTMLAudioElement} */ (sound.cloneNode());
  clone.play();
};

/**
 * @param {number} timeSinceLastUpdate
 * @param {CanvasRenderingContext2D} context
 * @param {string} clientId
 * @param {GameState} state
 * @param {GameOutputEvent[]} outputEvents
 */
export function onFrame(
  timeSinceLastUpdate,
  context,
  clientId,
  state,
  outputEvents
) {
  for (let event of outputEvents) {
    switch (event.type) {
      case "shoot":
        playSound(state.assets.shootSound);
        break;
      case "died":
        playSound(state.assets.explodeSound);
        break;
    }
  }
  draw({
    clientId,
    state,
    timeSinceLastUpdate,
    context,
  });
}
