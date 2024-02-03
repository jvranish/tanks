import { NetworkedGame } from "./lib/networking/networked-game.js";
import { GameState } from "./tank/game-state.js";


// This provides an easy way to verify that the game's behavior is deterministic and consistent across clients.

/**
  * @param {string} initialState
  * @param {Record<string, import("./lib/networking/message.js").Diagnostic[]>} diagnostics
  */
async function verifyDiagnostics(initialState, diagnostics) {
  for (const clientId of Object.keys(diagnostics)) {
    const state = await GameState.deserialize(initialState);
    let i = 0;
    for (const diag of NetworkedGame.playbackDiagnostics(
      state,
      diagnostics[clientId]
    )) {
      if (diag.type === "stateHash" && diag.stateHash !== diag.expectedHash) {
        console.error(
          "State hash mismatch, client ",
          clientId,
          " expected ",
          diag.expectedHash,
          " got ",
          diag.stateHash,
          " at index ",
          i
        );
        return false;
      }
      i++;
    }
  }
  return true;
}

document
  .getElementById("file-input")
  ?.addEventListener("change", function (event) {
    if (!(event.target instanceof HTMLInputElement) || !event.target.files) {
      return;
    }
    const file = event.target.files[0];

    const reader = new FileReader();
    reader.onload = async () => {
      const data = reader.result;
      if (typeof data !== "string") {
        return;
      }
      /** @type {{initialState: string, diagnostics: Record<string, import("./lib/networking/message.js").Diagnostic[]}} */
      const { initialState, diagnostics } = JSON.parse(data);

      // we could also verify that the diagnostics match across all clients
      const result = await verifyDiagnostics(initialState, diagnostics);
      if (result) {
        document.body.style.backgroundColor = "green";
        console.log("Diagnostics verified");
      } else {
        document.body.style.backgroundColor = "red";
        console.error("Diagnostics failed verification");
      }

    };
    reader.readAsText(file);
  });
