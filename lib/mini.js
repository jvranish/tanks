/**
 * @template S, V
 * @param {S} state
 * @param {(state: S) => V} view
 * @param {HTMLElement | null} node
 * @param {(node: HTMLElement, vdom: V, time: number) => void} render
 */
export function mini(state, view, node, render) {
  if (!node) {
    throw new Error("No root element");
  }
  let busy = false;
  /** @param {(state: S) => void} f */
  const dispatch = (f) => {
    f(state);
    if (!busy) {
      busy = true;
      requestAnimationFrame((time) => {
        render(node, view(state), time);
        busy = false;
      });
    }
    return state;
  };
  /** @param {(event: Event, state: S) => void} f */
  const eventHandler = (f) => {
    return (/** @type {Event} */ event) => {
      dispatch((state) => {
        f(event, state);
      });
    };
  };

  dispatch((state) => {});
  return { dispatch, eventHandler };
}
