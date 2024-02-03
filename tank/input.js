
const defaultKeysPressed = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  a: false,
  d: false,
  " ": false,
};

/** @typedef {keyof typeof defaultKeysPressed} InputKey */

/**
 * @param {string} key
 * @returns {key is InputKey}
 */
export function isInputKey(key) {
  return Object.hasOwn(defaultKeysPressed, key);
}

/**
 * @param {typeof defaultKeysPressed} keysPressed
 * @returns {TankInput}
 */
export function tankInputFromKeysPressed(keysPressed) {
  const { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, a, d, " ": space } = keysPressed;
  return {
    moving: (ArrowUp ? 1 : 0) + (ArrowDown ? -1 : 0),
    turning: (ArrowLeft ? -1 : 0) + (ArrowRight ? 1 : 0),
    turningTurret: (a ? -1 : 0) + (d ? 1 : 0),
    isFiring: space,
  };
}

/**
 * @param {(event: TankEvent) => void} sendEvent
 */
export function keyHandlers(sendEvent) {
  const keysPressed = defaultKeysPressed;

  /**
   * @param {boolean} pressed
   * @returns {(e: KeyboardEvent) => void}
   */
  const handler = (pressed) => (event) => {
    const key = event.key;
    if (!isInputKey(key)) {
      return;
    }
    event.preventDefault();
    // Don't track key repeats:
    if (event.repeat) {
      return;
    }

    keysPressed[key] = pressed;
    const input = tankInputFromKeysPressed(keysPressed);
    sendEvent({ type: "tank", input });
  };

  return {
    onkeydown: handler(true),
    onkeyup: handler(false),
  };
}
