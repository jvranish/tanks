import { render, html } from "../not-react.js";
import { dispatch } from "../app.js";
import { draw } from "../tank/draw.js";
import { ResponsiveCanvasElement } from "../lib/responsive-canvas/responsive-canvas.js";
import { validateInstanceOf } from "../utils.js";
import { keyHandlers } from "../tank/input.js";
import { renderScoreboard } from "./scoreboard.js";
import { transition_error } from "./ui-state.js";

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
      <form id="settingsForm" method="dialog">
        <label
          >Player Name:
          <input
            autofocus
            type="text"
            id="playerName"
            placeholder="Enter your player name"
        /></label>
        <label
          >Join Link:
          <div class="flex-row">
            <input type="text" id="joinLink" value="${joinLink}" readonly />
            <button type="button" id="copyButton" title="Copy to Clipboard">
              📋
            </button>
          </div>
        </label>
        <button id="backButton">Back</button>
        <button id="disconnectButton">Disconnect</button>
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
    () => JSON.stringify(state.networkedGame.state.scores),
    (_prev, _next) => {
      renderScoreboard(state.networkedGame.state, scoreboard);
    }
  );
  renderScoreboard(state.networkedGame.state, scoreboard);

  state.networkedGame.addWatcher(
    () =>
      state.networkedGame.state.scores[state.networkedGame.clientId]
        ?.playerName,
    (prev, next) => {
      node.querySelector("#playerName")?.setAttribute("value", next);
    }
  );

  /** @param {HTMLAudioElement} sound */
  const playSound = (sound) => {
    const clone = /** @type {HTMLAudioElement} */ (sound.cloneNode());
    clone.play();
  };

  responsiveCanvas.onFrame((e) => {
    const { context, time } = e.detail;

    if (
      state.networkedGame.update(time, (stateEvent) => {
        if (stateEvent.type === "shoot") {
          playSound(state.networkedGame.state.assets.shootSound);
        } else if (stateEvent.type === "died") {
          playSound(state.networkedGame.state.assets.explodeSound);
        }
      })
    ) {
      dispatch(transition_error("Disconnected from game"));
    }
    const timeSinceLastUpdate = state.networkedGame.timeSinceLastUpdate();
    draw({
      clientId: state.networkedGame.clientId,
      state: state.networkedGame.state,
      timeSinceLastUpdate,
      ctx: context,
    });
  });

  const { onkeydown, onkeyup } = keyHandlers((event) => {
    state.networkedGame.sendEvent(event);
  });

  responsiveCanvas.addEventListener("keydown", onkeydown);

  responsiveCanvas.addEventListener("keyup", onkeyup);
}
