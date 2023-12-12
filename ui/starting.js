import { render, html } from "../not-react.js";

/** @param {import("./ui-state.js").StartingState} state */
export function Starting(state) {
  render(html`
      <div class="main-menu flex-column">
        <h1>${state.msg}</h1>
        <div class="spinner"></div>
      </div>
  `);
}
