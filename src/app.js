import { parse } from "../lib/hyperlit.js";
import { h, text, patch } from "../lib/hyperapp-mini.js";
import { mini } from "../lib/mini.js";
import { Server, Client } from "./webrtc-sockets.js";

const html = parse({ h, text });

/**
 * @typedef {| { state: "connecting"; token: string }
 *   | { state: "disconnected" }
 *   | { state: "connected" }
 *   | { state: "error"; errorMessage: string }} ConnectionState
 */

class State {
  constructor() {
    /** @type {ConnectionState} */
    this.connectionState = { state: "disconnected" };
  }

  async host() {
    const getState = () => {
      return null;
    };
    const { token, start } = await Server.init({ getState });

    this.connectionState = { state: "connecting", token };
  }
}

const dispatch = mini(
  new State(),
  main,
  document.getElementById("root"),
  patch
);

const url = new URL(document.URL);
const hash = decodeURIComponent(url.hash.slice(1));

// if (hash !== "") {
//   Client.connect(hash)
//     .then(({ client, clientId, state }) => {})
//     .finally(() => {
//       dispatch((state) => {
//         state.connectionState = { state: "disconnected" };
//       });
//     });
// } else {
//   Server.start().then(({ token, server }) => {
//     url.hash = token;
//     history.replaceState(null, "", url.toString());
//   });
// }

/** @param {Event} event */
const HostGame = (event) => {
  dispatch((state) => {
    state.host();
  });
};

/** @param {(event: Event, state: State) => void} f */
function eventHandler(f) {
  return (/** @type {Event} */ event) =>
    dispatch((state) => {
      f(event, state);
    });
}

/**
 * @param {State} state
 * @returns {ReturnType<typeof html>}
 */
export function main(state) {
  if (state.connectionState.state === "disconnected") {
    return disconnected();
  } else if (state.connectionState.state === "connecting") {
    return connecting();
  } else if (state.connectionState.state === "connected") {
    return null;
  }
}

function connecting() {
  return html`
    <main>
      <center>
        <h2>Tanks!</h2>
        <section>
          <div>Connecting to game...</div>
          <div class="spinner"></div>
          <button onclick=${HostGame}>Cancel</button>
        </section>
      </center>
    </main>
  `;
}

function disconnected() {
  return html`
    <main class="main-content">
      <!-- <center> -->
      <article>
        <header>
          <h2>Tanks!</h2>
        </header>
        <section class="box">
          <aside>
            <p>
              <button onclick=${HostGame}>Host Game</button>
            </p>
            <div>
              <label for="game-code">Join Game</label>
              <input type="text" placeholder="Enter game code" />
            </div>
            <div>
              <label for="game-code">Join Game</label>
              <input type="text" placeholder="Enter game code" />
            </div>
          </aside>
        </section>
      </article>
      <!-- </center> -->
    </main>
  `;
}

export { html, dispatch, eventHandler, State };
