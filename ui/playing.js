import { render, html } from "../not-react.js";
import { dispatch } from "../app.js";
import { ResponsiveCanvasElement } from "../lib/responsive-canvas/responsive-canvas.js";
import { validateInstanceOf } from "../utils.js";
import { keyHandlers } from "../tank/input.js";
import { renderScoreboard } from "./scoreboard.js";
import { transition_error } from "./ui-state.js";
import { onFrame } from "../tank/onFrame.js";

/** @param {import("./ui-state.js").PlayingState} state */
export function Playing(state) {
  const joinLink = state.joinLink;
  const node = render(html`
    <responsive-canvas id="canvas"></responsive-canvas>
    <button class="settings-btn" id="settingsButton" title="Settings">
      ⚙️
    </button>

    <div id="scoreboard" class="scoreboard"></div>

    <dialog id="settingsDialog">
      <label
        >Controls:
        <ul>
          <li>Arrow keys to move</li>
          <li>Space to shoot</li>
          <li>'A' and 'D' to rotate turret</li>
        </ul>
      </label>

      <form id="settingsForm" method="dialog">
        <label
          >Player Name:
          <input
            autofocus
            type="text"
            id="playerName"
            placeholder="Enter your player name"
        /></label>
        ${joinLink !== ""
          ? html`<label
              >Join Link:
              <div class="flex-row">
                <input type="text" id="joinLink" value="${joinLink}" readonly />
                <button type="button" id="copyButton" title="Copy to Clipboard">
                  📋
                </button>
              </div>
            </label>`
          : html``}
        <button id="backButton">Back</button>
      </form>
    </dialog>
  `);

  const settingsDialog = validateInstanceOf(
    node.querySelector("#settingsDialog"),
    HTMLDialogElement
  );

  const toggleDialog = () => {
    if (settingsDialog.open) {
      settingsDialog.close();
    } else {
      settingsDialog.showModal();
    }
  };

  // escape key toggles the settings dialog
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      toggleDialog();
      e.preventDefault();
    }
  });

  node.querySelector("#settingsButton")?.addEventListener("click", () => {
    toggleDialog();
  });

  node.querySelector("#copyButton")?.addEventListener("click", () => {
    navigator.clipboard.writeText(joinLink);
  });

  node.querySelector("#playerName")?.addEventListener("blur", (e) => {
    const input = validateInstanceOf(e.target, HTMLInputElement);

    // set player name in Local Storage
    localStorage.setItem("playerName", input.value);

    state.networkedGame.sendEvent({
      type: "setPlayerName",
      playerName: input.value,
    });
  });

  const responsiveCanvas = validateInstanceOf(
    node.querySelector("#canvas"),
    ResponsiveCanvasElement
  );

  const scoreboard = validateInstanceOf(
    node.querySelector("#scoreboard"),
    HTMLDivElement
  );

  state.networkedGame.addWatcher(
    () => JSON.stringify(state.gameState.scores),
    (_prev, _next) => {
      renderScoreboard(state.gameState, scoreboard);
    }
  );
  renderScoreboard(state.gameState, scoreboard);

  state.networkedGame.addWatcher(
    () => state.gameState.scores[state.networkedGame.clientId]?.playerName,
    (_prev, next) => {
      node.querySelector("#playerName")?.setAttribute("value", next);
    }
  );

  responsiveCanvas.onFrame((e) => {
    const { context, time } = e.detail;

    const { disconnected, timeSinceLastUpdate, outputEvents } =
      state.networkedGame.update(time);

    if (disconnected) {
      dispatch(transition_error("Disconnected from game"));
    } else {
      onFrame(
        timeSinceLastUpdate,
        context,
        state.networkedGame.clientId,
        state.gameState,
        outputEvents
      );
    }
  });

  const { onkeydown, onkeyup } = keyHandlers((event) => {
    state.networkedGame.sendEvent(event);
  });

  responsiveCanvas.addEventListener("keydown", onkeydown);

  responsiveCanvas.addEventListener("keyup", onkeyup);
}
