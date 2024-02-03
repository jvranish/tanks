import {
  render,
  html,
  findElements,
} from "../lib/not-react-redux/not-react.js";
import { dispatch } from "../app.js";
import { ResponsiveCanvasElement } from "../lib/responsive-canvas/responsive-canvas.js";
import { keyHandlers } from "../tank/input.js";
import { renderScoreboard } from "./scoreboard.js";
import { transitionError } from "./ui-state.js";
import { onFrame } from "../tank/onFrame.js";
import { NetworkedGame } from "../lib/networking/networked-game.js";
import { Server } from "../lib/networking/server.js";
import { GameState } from "../tank/game-state.js";

/**
 * @param {HTMLElement} element
 * @param {PlayingState} state
 */
export function renderPlaying(element, state) {
  const joinLink = state.joinLink;
  const node = render(
    element,
    html`
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

        <form method="dialog">
          <label
            >Player Name:
            <input
              autofocus
              type="text"
              id="playerName"
              placeholder="Enter your player name"
          /></label>
          <label style="display: ${joinLink !== "" ? "block" : "none"};">
            Join Link:
            <div class="flex-row">
              <input type="text" value="${joinLink}" readonly />
              <button type="button" id="copyButton" title="Copy to Clipboard">
                📋
              </button>
            </div>
          </label>
          <button>Back</button>
          ${NetworkedGame.debug && state.networkedGame.isHost
            ? html`
                <button
                  type="button"
                  id="collectDiagnostics"
                  title="Download Diagnostics"
                >
                  Download Diagnostics 🛠️
                </button>
              `
            : html``}
        </form>
      </dialog>
    `
  );

  const elements = findElements(node, {
    playerName: HTMLInputElement,
    copyButton: HTMLButtonElement,
    settingsButton: HTMLButtonElement,
    settingsDialog: HTMLDialogElement,
    canvas: ResponsiveCanvasElement,
    scoreboard: HTMLDivElement,
  });

  const { settingsDialog, scoreboard, canvas } = elements;

  if (NetworkedGame.debug && state.networkedGame.isHost) {
    const { collectDiagnostics } = findElements(node, {
      collectDiagnostics: HTMLButtonElement,
    });
    collectDiagnostics.addEventListener("click", async () => {
      if (state.networkedGame.isHost) {
        const diagnostics = await state.networkedGame.collectDiagnostics();
        downloadAsFile("diagnostics.json", JSON.stringify(diagnostics, null, 2));
      }
    });
  }

  const toggleDialog = () => {
    if (settingsDialog.open) {
      settingsDialog.close();
    } else {
      settingsDialog.showModal();
    }
  };

  // escape key toggles the settings dialog
  node.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      toggleDialog();
      e.preventDefault();
    }
  });

  elements.settingsButton.addEventListener("click", toggleDialog);

  elements.copyButton.addEventListener("click", () => {
    navigator.clipboard.writeText(joinLink);
  });

  /** @param {GameInputEvent} event */
  const sendEvent = (event) => {
    state.networkedGame.sendEvent(GameState.serializeEvent(event));
  };

  const playerName = localStorage.getItem("playerName");
  if (playerName) {
    sendEvent({
      type: "setPlayerName",
      playerName,
    });
  }

  elements.playerName.addEventListener("blur", function (e) {
    // set player name in Local Storage
    localStorage.setItem("playerName", this.value);

    sendEvent({
      type: "setPlayerName",
      playerName: this.value,
    });
  });

  state.networkedGame.addWatcher(
    () => JSON.stringify(state.gameState.scores),
    (_prev, _next) => {
      renderScoreboard(scoreboard, state.gameState);
    }
  );
  renderScoreboard(scoreboard, state.gameState);

  state.networkedGame.addWatcher(
    () => state.gameState.scores[state.networkedGame.clientId]?.playerName,
    (_prev, next) => {
      elements.playerName.setAttribute("value", next);
    }
  );

  canvas.onFrame((e) => {
    const { context, time } = e.detail;

    const { disconnected, timeSinceLastUpdate, outputEvents } =
      state.networkedGame.update(state.gameState, time);

    if (disconnected) {
      dispatch(transitionError("Disconnected from game"));
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
    sendEvent(event);
  });

  canvas.addEventListener("keydown", onkeydown);

  canvas.addEventListener("keyup", onkeyup);
}


/**
 * Triggers a browser download of a string as a file.
 * @param {string} filename - The name of the file to be downloaded.
 * @param {string} content - The string content to be downloaded as a file.
 */
function downloadAsFile(filename, content) {
    // Create a Blob with the string content and specify the file's MIME type
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });

    // Create a URL for the blob
    const url = URL.createObjectURL(blob);

    // Create a temporary anchor element and set its href to the blob URL
    const a = document.createElement('a');
    a.href = url;
    a.download = filename; // Set the filename for the download

    // Append the anchor to the body, click it to trigger the download, and then remove it
    document.body.appendChild(a);
    a.click();

    // Cleanup: revoke the blob URL and remove the anchor element
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}