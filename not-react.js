/**
 * A tagged template function that allows creating HTML strings with
 * interpolated values.
 *
 * @param {TemplateStringsArray} strings - The literal strings in the template.
 * @param {...any} values - The interpolated values in the template.
 * @returns {string} - The resulting HTML string.
 */
export function html([first, ...strings], ...values) {
  return values.reduce((acc, v, i) => acc + String(v) + strings[i], first);
}

/**
 * @param {string} node - The node to be rendered.
 * @param {HTMLElement} [container] - The container to render the node in.
 */
export function render(node, container = document.body) {
  container.innerHTML = node;
  return container;
}
