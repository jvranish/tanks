import { parse } from "../lib/hyperlit.js";
import { h, text, patch } from "../lib/hyperapp-mini.js";
import { mini } from "../lib/mini.js";
import { Server, Client, EventChunker } from "./webrtc-sockets.js";
import { GameState, TankGameHandlers } from "./tank.js";
import { CanvasWrapper } from "./canvas.js";
import { PCG32 } from "./pcg.js";

const html = parse({ h, text });

/** @typedef {import("./tank.js").TankAction} TankAction */

/**
 * @typedef {| { state: "connecting"; token: string }
 *   | { state: "main" }
 *   | { state: "join"; token: string }
 *   | { state: "host-wait" }
 *   | {
 *       state: "host";
 *       token: string;
 *       start: () => Promise<{
 *         token: string;
 *         server: Server<GameState, TankAction>;
 *       }>;
 *     }
 *   | { state: "starting-host" }
 *   | { state: "joining-game" }
 *   | { state: "connected"; network: EventChunker<TankAction> }
 *   | { state: "error"; errorMessage: string }} ConnectionState
 */

class State {
  constructor() {
    /** @type {ConnectionState} */
    this.appState = { state: "main" };
  }

  backToMenu() {
    this.appState = { state: "main" };
  }

  /** @param {string} [token] */
  joinGame(token) {
    this.appState = { state: "join", token: token ?? "" };
  }

  /** @param {string} token */
  updateJoinToken(token) {
    if (this.appState.state === "join") {
      this.appState.token = token;
    }
  }

  /** @param {string} errorMessage */
  errorMenu(errorMessage) {
    this.appState = { state: "error", errorMessage };
  }

  hostWait() {
    this.appState = { state: "host-wait" };
  }
  /**
   * @param {string} token
   * @param {() => Promise<{
   *   token: string;
   *   server: Server<GameState, TankAction>;
   * }>} start
   */
  hostGame(token, start) {
    this.appState = { state: "host", token, start };
  }

  startingHost() {
    this.appState = { state: "starting-host" };
  }

  joiningGame() {
    this.appState = { state: "joining-game" };
  }

  /** @param {EventChunker<TankAction>} network */
  connected(network) {
    this.appState = { state: "connected", network };
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
  if (state.appState.state === "connected") {
    return InGame({ network: state.appState.network });
  } else {
    return Menu(state);
  }
  // if (state.connectionState.state === "disconnected") {
  //   return Menu(state);
  // } else if (state.connectionState.state === "connecting") {
  //   return Connecting();
  // } else if (state.connectionState.state === "connected") {
  //   return InGame();
  // }
}

let gameState = new GameState();
function getGameState() {
  return gameState;
}

// TODO make an async event handler should set a state, then wait for the async
//  event to finish then update the state again, (either with success, or an
//  error), but only if the state hasn't changed (use a unique object as a marker), (we have to use
//  requestAnimationFrame, because otherwise we'll be in the middle of a render
//  when we update the state) (do I actually need requestAnimationFrame? or is
//  dispatch enough?)
// onSuccess, onError

const StartHostGame = eventHandler((event, state) => {
  state.hostWait();
  Server.init({ getState: getGameState })
    .then(({ token, start }) => {
      requestAnimationFrame(() => {
        dispatch((state) => {
          state.hostGame(token, start);
        });
      });
    })
    .catch((e) => {
      console.error(e);
      requestAnimationFrame(() => {
        dispatch((state) => {
          state.errorMenu("Failed to initialize server");
        });
      });
    });
});

const StartGame = eventHandler((event, state) => {
  if (state.appState.state === "host") {
    let start = state.appState.start;
    state.startingHost();
    start()
      .then(({ server }) => {
        requestAnimationFrame(() => {
          dispatch((state) => {
            state.connected(server);
          });
        });
      })
      .catch((e) => {
        console.error(e);
        requestAnimationFrame(() => {
          dispatch((state) => {
            state.errorMenu("Failed to start server");
          });
        });
      });
  }
});

const StartJoinGame = eventHandler((event, state) => {
  state.joinGame();
});

// TODO add pre-condition checks to state machines state updates
// rename joinGame to joinGameMenu (or something like that)
const ConnectToGame = eventHandler((event, state) => {
  if (state.appState.state === "join") {
    let token = state.appState.token;
    state.joiningGame();
    Client.connect(token, { onDisconnect: () => {} })
      .then(({ client, clientId, state: s }) => {
        console.log(s);
        requestAnimationFrame(() => {
          gameState = Object.setPrototypeOf(s, GameState.prototype);
          Object.setPrototypeOf(gameState.rng, PCG32.prototype);
          dispatch((state) => {
            state.connected(client);
          });
        });
      })
      .catch((e) => {
        console.error(e);
        requestAnimationFrame(() => {
          dispatch((state) => {
            state.errorMenu("Failed to connect to server");
          });
        });
      });
  }
});

const BackToMainMenu = eventHandler((event, state) => {
  state.backToMenu();
});

const UpdateJoinToken = eventHandler((event, state) => {
  if (state.appState.state === "join") {
    if (event.target instanceof HTMLInputElement) {
      state.appState.token = event.target.value;
    }
  }
});


/** @param {{ network: EventChunker<TankAction> }} props */
function InGame({ network }) {
  return html`
    <canvas-wrapper
      ${TankGameHandlers(gameState, network)}
    ></canvas-wrapper>
  `;
}

/** @param {State} state */
function Menu(state) {
  return html`
    <main
      style=${{
        maxWidth: "var(--content-max-width)",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div>
        <h2>Tanks!</h2>
      </div>
      <div>${WhichMenu(state)}</div>
    </main>
  `;
}

/** @param {State} state */
function WhichMenu(state) {
  if (state.appState.state === "main") {
    return MainMenu({
      startHostGame: StartHostGame,
      startJoinGame: StartJoinGame,
    });
  } else if (
    state.appState.state === "host-wait" ||
    state.appState.state === "starting-host"
  ) {
    return MenuWait({
      back: BackToMainMenu,
      msg: state.appState.state === "host-wait" ? "Waiting for game to start" : "Starting game...",
    });
  } else if (state.appState.state === "joining-game") {
    return MenuWait({
      back: BackToMainMenu,
      msg: "Connecting to game...",
    });
  } else if (state.appState.state === "host") {
    return MenuHostGame({
      back: BackToMainMenu,
      gameCode: state.appState.token,
      startGame: StartGame,
    });
  } else if (state.appState.state === "join") {
    return MenuJoinGame({
      back: BackToMainMenu,
      joinGame: ConnectToGame,
      token: state.appState.token,
    });
  } else if (state.appState.state === "error") {
    return MenuError({
      errorMessage: state.appState.errorMessage,
      back: BackToMainMenu,
    });
  } else {
    throw new Error("Unhandled menu state");
  }
}

/** @param {{ startHostGame: () => void; startJoinGame: () => void }} props */
function MainMenu({ startHostGame, startJoinGame }) {
  return html`<div>
    <p>
      <button onclick=${startHostGame}>Host Game</button>
    </p>
    <p>
      <button onclick=${startJoinGame}>Join Game</button>
    </p>
  </div>`;
}

/** @param {{ back: () => void; errorMessage: string }} props */
function MenuError({ back, errorMessage }) {
  return html`<div>
    <a onclick=${back}>${"<Back"}</a>
    <h3>Error</h3>
    <div style=${{ display: "flex", flexFlow: "row", gap: "1em" }}>
      <p>${errorMessage}</p>
    </div>
  </div>`;
}

/** @param {{ back: () => void, msg: string }} props */
function MenuWait({ back, msg }) {
  return html`<div>
    <a onclick=${back}>${"<Back"}</a>
    <h3>${msg}</h3>
    <div style=${{ display: "flex", flexFlow: "row", gap: "1em" }}>
      <div class="spinner"></div>
    </div>
  </div>`;
}

/** @param {string} gameCode */
const copyGameCodeToClipboard = (gameCode) => {
  navigator.clipboard.writeText(gameCode);
};

/** @param {{ back: () => void; gameCode: string; startGame: () => void }} props */
function MenuHostGame({ back, startGame, gameCode }) {
  return html`<div>
    <a onclick=${back}>${"<Back"}</a>
    <h3>HostGame</h3>
    <div style=${{ display: "flex", flexFlow: "row", gap: "1em" }}>
      <input type="text" disabled value=${gameCode} />
      <abbr title="Copy to clipboard">
        <button
          style=${{ fontSize: "1.5em" }}
          onclick=${() => copyGameCodeToClipboard(gameCode)}
        >
          ${"📋"}
        </button>
      </abbr>
    </div>
    <p>
      <button onclick=${startGame}>Start Game</button>
    </p>
  </div>`;
}

// TODO add a better validate function for tokens (on state)
// TODO pass in a function to update the token rather than use a global?
/** @param {{ back: () => void; token: string; joinGame: () => void }} props */
function MenuJoinGame({ back, token, joinGame }) {
  return html`<div>
    <a onclick=${back}>${"<Back"}</a>
    <h3>HostGame</h3>
    <div
      style=${{
        display: "flex",
        flexFlow: "column",
        alignItems: "flex-start",
      }}
    >
      <label for="game-code">Game Code</label>
      <input
        id="game-code"
        name="Game Code"
        oninput=${UpdateJoinToken}
        type="text"
        placeholder="Enter game code"
        value="${token}"
      />
    </div>
    <p>
      <button disabled=${!(token.length > 0)} onclick=${joinGame}>
        Join Game
      </button>
    </p>
  </div>`;
}

export { html, dispatch, eventHandler, State };
