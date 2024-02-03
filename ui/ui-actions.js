import { Identity } from "../lib/networking/identity.js";
import { NetworkedGame } from "../lib/networking/networked-game.js";
import { loadAudioAssets } from "../tank/assets.js";
import { GameState } from "../tank/game-state.js";
import { transitionError, transitionPlaying } from "./ui-state.js";
import { connect, listen } from "../lib/webrtc-sockets/webrtc-sockets.js";


export async function singlePlayerGame() {
  const gameState = await GameState.init();

  try {
    const { networkedGame } = await NetworkedGame.singlePlayerGame(gameState);

    return transitionPlaying("", () => {}, networkedGame, gameState);
  } catch (err) {
    console.error(err);
    return transitionError(`Error starting host: ${err}`);
  }
}

export async function hostGame() {
  const copy = copyToClipboard();

  const gameState = await GameState.init();

  try {
    const { token, start: startListen } = await listen();
    const { networkedGame, onConnect } = await NetworkedGame.hostGame(gameState);
    const { stop } = await startListen({ onConnect });

    return transitionPlaying(token, copy, networkedGame, gameState);
  } catch (err) {
    console.error(err);
    return transitionError(`Error starting host: ${err}`);
  }
}

/** @param {string} joinToken */
export async function joinGame(joinToken) {
  const copy = copyToClipboard();
  // We need to do this ahead of time so that the audio is allowed by the browser.
  // Safari is especially strict about not allowing audio to play unless it is
  // initiated by a user action. Pre-loading audio assets seems to be enough to
  // satisfy it.
  loadAudioAssets();

  try {

    // If we have an existing identity, use it. This allows us to leave and rejoin
    // the game as the same player (in this case keeping our score)
    let existingIdentity = undefined;
    const storedIdentity = localStorage.getItem("identity");
    if (storedIdentity) {
      try {
        existingIdentity = await Identity.import(JSON.parse(storedIdentity));
      } catch (err) {
        console.error("Error using existing identity:", err);
        localStorage.removeItem("identity");
      }
    }

    let channel = await connect(joinToken);
    // If identity was undefined we'll get a new one back
    const { networkedGame, identity, gameState } = await NetworkedGame.joinGame(
      channel,
      GameState.deserialize,
      existingIdentity
    );
    // Save the identity so we can use it next time
    localStorage.setItem("identity", JSON.stringify(await identity.export()));

    return transitionPlaying(joinToken, copy, networkedGame, gameState);
  } catch (err) {
    console.error(err);
    return transitionError(`Error joining game: ${err}`);
  }
}


/**
 * Copy text to the clipboard. This function returns a function that takes a
 * string and copies it to the clipboard. We have to do it this way because
 * safari won't let you copy to the clipboard without a user action.
 */
export function copyToClipboard() {
  if (typeof ClipboardItem && navigator.clipboard.write) {
    /** @type {(text: string) => void} */
    let r = () => {};
    /** @type {Promise<Blob>} */
    let p = new Promise((resolve, reject) => {
      r = (text) => resolve(new Blob([text], { type: "text/plain" }));
    });
    navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": p,
      }),
    ]);
    return r;
  } else {
    // for firefox
    // see: https://wolfgangrittner.dev/how-to-use-clipboard-api-in-firefox/
    return (/** @type {string} */ text) => {
      navigator.clipboard.writeText(text);
    };
  }
}