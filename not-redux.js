/**
 * @template S
 * @param {S} state
 * @param {(state: S) => void} onStateChange
 */
export function createStore(state, onStateChange) {
  let busy = false;
  /** @param {(state: S) => S | void} f */
  const dispatch = (f) => {
    state = f(state) || state;
    console.log("dispatch", state);
    if (!busy) {
      busy = true;
      requestAnimationFrame((time) => {
        onStateChange(state);
        busy = false;
      });
    }
    return state;
  };

  dispatch((state) => {});
  return { dispatch, getState: () => state };
}
