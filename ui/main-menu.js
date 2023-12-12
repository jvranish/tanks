import { render, html } from "../not-react.js";
import { dispatch } from "../app.js";
import { transition_host_game, transition_playing, transition_starting } from "./ui-state.js";
import { validateInstanceOf } from "../utils.js";
import { GameState } from "../tank/game-state.js";

/** @param {import("./ui-state.js").MainState} state */
export function MainMenu(state) {
  const node = render(html`
    <div class="main-menu flex-column">
      <h1>Tank Game!</h1>
      <button class="btn">Single Player</button>
      <button class="btn" id="multiplayerButton">Multiplayer</button>
    </div>
    <dialog id="errorDialog">
      <form class="flex-column" method="dialog">
        <h1>Error</h1>
        <p>${state.errorMsg}</p>
        <button autofocus>Close</button>
      </form>
    </dialog>
  `);
  const errorDialog = validateInstanceOf(
    node.querySelector("#errorDialog"),
    HTMLDialogElement
  );
  if (state.errorMsg) {
   errorDialog.showModal();
  }
  node.querySelector("#multiplayerButton")?.addEventListener("click", () => {
    dispatch(transition_host_game);
  });

  node.querySelector("#close")?.addEventListener("click", () => {
    errorDialog.close();
  });
}
