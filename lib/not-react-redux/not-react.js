/**
 * Escapes a string for safe insertion into HTML.
 *
 * @param {string} str - The string to escape.
 * @returns {string}
 */
export function escapeHTML(str) {
  /** @type {Record<string, string>} */
  const escapeMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return str.replace(/[&<>"']/g, (match) => escapeMap[match]);
}

/**
 * A tagged template function that allows creating HTML strings with
 * interpolated values. The interpolated values are escaped to prevent injection attacks.
 *
 * @param {TemplateStringsArray} strings - The literal strings in the template.
 * @param {...unknown} values - The interpolated values in the template.
 * @returns {{ html: string }} - The resulting HTML string.
 */
export function html([first, ...strings], ...values) {
  let result = first;
  values.forEach((value, i) => {
    result +=
      (value !== null && typeof value === "object" && "html" in value
        ? value.html
        : escapeHTML(String(value))) + strings[i];
  });
  return { html: result };
}

/**
 * @param {HTMLElement} container - The container to render the node in.
 * @param {{ html: string } | { html: string }[]} inner - The inner HTML to be
 *   rendered.
 */
export function render(container, inner) {
  container.innerHTML = Array.isArray(inner)
    ? inner.map((i) => i.html).join("")
    : inner.html;
  return container;
}

/**
 * Searches within a parent node for multiple elements specified by an
 * id-to-class mapping, and validates that each element exists and is an
 * instance of its corresponding class.
 *
 * @template {Record<string, typeof HTMLElement>} T A mapping of element IDs to
 *   HTMLElement subclasses.
 * @param {HTMLElement} parentNode - The parent node to search within.
 * @param {T} idToClassMap - An object mapping element IDs to their respective
 *   class constructors.
 * @returns {{ [K in keyof T]: InstanceType<T[K]> }} An object mapping element
 *   IDs to their respective HTMLElement instances.
 * @throws {Error} Throws an error if an element with the specified id is not
 *   found or does not meet the specified criteria.
 */
export function findElements(parentNode, idToClassMap) {
  const elements = /** @type {{ [K in keyof T]: InstanceType<T[K]> }} */ ({});

  for (const id in idToClassMap) {
    const element = parentNode.querySelector(`#${id}`);

    if (!element) {
      throw new Error(`No element with id '${id}' found`);
    }

    const elementConstructor = idToClassMap[id];
    if (!(element instanceof elementConstructor)) {
      throw new Error(
        `Expected element of type ${elementConstructor.name} for id '${id}', but got ${element.constructor.name}`
      );
    }

    elements[id] = /** @type {InstanceType<T[typeof id]>} */ (element);
  }

  return elements;
}
