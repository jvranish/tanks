import { parse } from "../lib/hyperlit.js";
import { h, text, patch } from "../lib/hyperapp-mini.js";
import { mini } from "../lib/mini.js";
import { Server, Client, EventChunker } from "./webrtc-client-server.js";
import { GameState, TankGameHandlers } from "./tank.js";

const html = parse({ h, text });

/** @typedef {import("./tank.js").TankAction} TankAction */

/**
 * @typedef {| { state: "connecting"; token: string }
 *   | { state: "main" }
 *   | { state: "join-enter-token"; token: string }
 *   | { state: "host-wait"}
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
 *   | { state: "error"; errorMessage: string }} UiState
 */

class State {
  constructor() {
    /** @type {UiState} */
    this.uiState = { state: "main" };
  }

  backToMenu() {
    this.uiState = { state: "main" };
  }

  // TODO rename this to JoinWait
  /** @param {string} [token] */
  joinEnterToken(token) {
    this.uiState = { state: "join-enter-token", token: token ?? "" };
  }

  /** @param {string} token */
  updateJoinToken(token) {
    if (this.uiState.state === "join-enter-token") {
      this.uiState.token = token;
    }
  }

  /** @param {string} errorMessage */
  errorMenu(errorMessage) {
    this.uiState = { state: "error", errorMessage };
  }

  hostWait() {
    this.uiState = { state: "host-wait" };
  }
  /**
   * @param {string} token
   * @param {() => Promise<{
   *   token: string;
   *   server: Server<GameState, TankAction>;
   * }>} start
   */
  hostGame(token, start) {
    this.uiState = { state: "host", token, start };
  }

  startingHost() {
    this.uiState = { state: "starting-host" };
  }

  joiningGame() {
    this.uiState = { state: "joining-game" };
  }

  /** @param {EventChunker<TankAction>} network */
  connected(network) {
    this.uiState = { state: "connected", network };
  }
}


const {dispatch, eventHandler} = mini(
  new State(),
  main,
  document.getElementById("root"),
  patch
);

const url = new URL(document.URL);
const hash = decodeURIComponent(url.hash.slice(1));
if (hash !== "") {
  dispatch((state) => {
    state.joinEnterToken(hash);
  });
}


/**
 * @param {(event: Event, state: State) => Promise<(state: State) => void>} f
 */
function asyncEventHandler(f) {
  return (/** @type {Event} */ event) => {
    let oldState = dispatch((state) => {
      f(event, state).then((f) => {
        if (state.uiState !== oldState) {
          console.warn(
            "state changed since event handler ran, but before the async task finished, aborting"
          );
        } else {
          dispatch(f);
        }
      });
    }).uiState;
  };
}

/**
 * @param {State} state
 * @returns {ReturnType<typeof html>}
 */
export function main(state) {
  if (state.uiState.state === "connected") {
    return InGame({ network: state.uiState.network });
  } else {
    return Menu(state);
  }
}

let gameState = new GameState();
function getGameState() {
  return gameState;
}

/** @param {Event} event */
const StartHostGame = asyncEventHandler(async (event, state) => {
  state.hostWait();
  try {
    const { token, start } = await Server.init({ getState: getGameState });
    return (state) => state.hostGame(token, start);
  } catch (e) {
    console.error(e);
    return (state) => state.errorMenu("Failed to initialize server");
  }
});


const StartGame = asyncEventHandler(async (event, state) => {
  if (state.uiState.state === "host") {
    let { token, start } = state.uiState;
    state.startingHost();
    try {
      const {server} = await start();
      return (state) => state.connected(server);
    } catch (e) {
      console.error(e);
      return (state) => state.errorMenu("Failed to start server");
    }
  } else {
    throw new Error("Invalid state");
  }
});

const StartJoinGame = eventHandler((event, state) => {
  state.joinEnterToken();
});

const JoinGame = asyncEventHandler(async (event, state) => {
  if (state.uiState.state === "join-enter-token") {
    let token = state.uiState.token;
    state.joiningGame();
    try {
      const{ client, clientId, state: s } = await Client.connect(token, 15000);
      gameState = GameState.fromJSON(s);
      return (state) => state.connected(client);
    } catch (e) {
      console.error(e);
      return (state) => state.errorMenu("Failed to connect to server");
    } 
  } else {
    throw new Error("Invalid state");
  }
});

const BackToMainMenu = eventHandler((event, state) => {
  state.backToMenu();
});

const UpdateJoinToken = eventHandler((event, state) => {
  if (state.uiState.state === "join-enter-token") {
    if (event.target instanceof HTMLInputElement) {
      state.uiState.token = event.target.value;
    }
  }
});

/** @param {{ network: EventChunker<TankAction> }} props */
function InGame({ network }) {
  return html`
    <canvas-wrapper ${TankGameHandlers(gameState, network)}></canvas-wrapper>
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
  if (state.uiState.state === "main") {
    return MainMenu({
      startHostGame: StartHostGame,
      startJoinGame: StartJoinGame,
    });
  } else if (
    state.uiState.state === "host-wait" ||
    state.uiState.state === "starting-host"
  ) {
    return MenuWait({
      back: BackToMainMenu,
      msg:
        state.uiState.state === "host-wait"
          ? "Waiting for game to start"
          : "Starting game...",
    });
  } else if (state.uiState.state === "joining-game") {
    return MenuWait({
      back: BackToMainMenu,
      msg: "Connecting to game...",
    });
  } else if (state.uiState.state === "host") {
    return MenuHostGame({
      back: BackToMainMenu,
      gameCode: state.uiState.token,
      startGame: StartGame,
    });
  } else if (state.uiState.state === "join-enter-token") {
    return MenuJoinEnterToken({
      back: BackToMainMenu,
      joinGame: JoinGame,
      token: state.uiState.token,
    });
  } else if (state.uiState.state === "error") {
    return MenuError({
      errorMessage: state.uiState.errorMessage,
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

/** @param {{ back: () => void; msg: string }} props */
function MenuWait({ back, msg }) {
  return html`<div>
    <a onclick=${back}>${"<Back"}</a>
    <h3>${msg}</h3>
    <div style=${{ display: "flex", flexFlow: "row", gap: "1em" }}>
      <div class="spinner"></div>
    </div>
  </div>`;
}

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
          onclick=${() => navigator.clipboard.writeText(gameCode)}
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
function MenuJoinEnterToken({ back, token, joinGame }) {
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
