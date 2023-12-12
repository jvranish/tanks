import { dispatch } from "../app.js";
import { Identity } from "../lib/networking/identity.js";
import { NetworkedGame } from "../lib/networking/networked-game.js";
import { GameState } from "../tank/game-state.js";

/** @typedef {import("../tank/game-state.js").GameEvent} GameEvent */
/** @typedef {import("../tank/game-state.js").StateEvent} StateEvent */

/** @typedef {{ ui_state: "main"; errorMsg?: string }} MainState */
/**
 * @typedef {{
 *   ui_state: "playing";
 *   joinLink: string;
 *   isHost: boolean;
 *   networkedGame: NetworkedGame<GameEvent, StateEvent, GameState>;
 * }} PlayingState
 */
/** @typedef {{ ui_state: "starting"; msg: string }} StartingState */
/** @typedef {MainState | PlayingState | StartingState} State */

/** @type {State} */
export const mainState = { ui_state: "main" };

/**
 * @param {string} joinToken
 * @param {NetworkedGame<GameEvent, StateEvent, GameState>} networkedGame
 * @returns {(state: State) => PlayingState}
 */
export const transition_playing = (joinToken, networkedGame) => {
  const joinLink = window.location.href + "#" + joinToken;
  const isHost = networkedGame.isHost;
  if (isHost) {
    // Otherwise we get yelled at for not being triggered by a user action
    navigator.clipboard.writeText(joinLink);
  }
  const playerName = localStorage.getItem("playerName");
  if (playerName) {
    networkedGame.sendEvent({
      type: "setPlayerName",
      playerName,
    });
  }
  return (_state) => ({
    ui_state: "playing",
    joinLink,
    isHost,
    networkedGame,
  });
};

/**
 * @param {string} msg
 * @returns {(state: State) => StartingState}
 */
export const transition_starting = (msg) => (_state) => ({
  ui_state: "starting",
  msg,
});

/**
 * @param {string} errorMsg
 * @returns {(state: State) => MainState}
 */
export const transition_error = (errorMsg) => (_state) => ({
  ui_state: "main",
  errorMsg,
});

/** @param {State} state */
export const transition_host_game = (state) => {
  if (state.ui_state !== "main") {
    return state;
  }

  const f = async () => {
    const gameState = await GameState.init();

    try {
      const { networkedGame, token } = await NetworkedGame.hostGame(gameState);

      return transition_playing(token, networkedGame);
    } catch (err) {
      console.error(err);
      return transition_error(`Error starting host: ${err}`);
    }
  };
  f().then(dispatch);

  return transition_starting("Starting Host")(state);
};

/**
 * @param {string} joinToken
 * @returns {(state: State) => State}
 */
export const transition_join_game = (joinToken) => (state) => {
  if (state.ui_state !== "main") {
    return state;
  }
  const f = async () => {
    try {
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

      const onDisconnect = () => {
        dispatch(transition_error("Disconnected from game"));
      };

      const { networkedGame, identity } = await NetworkedGame.joinGame(
        joinToken,
        GameState.deserialize,
        onDisconnect,
        existingIdentity
      );
      localStorage.setItem("identity", JSON.stringify(await identity.export()));

      return transition_playing(joinToken, networkedGame);
    } catch (err) {
      console.error(err);
      return transition_error(`Error joining game: ${err}`);
    }
  };
  f().then(dispatch);

  return transition_starting("Joining Game")(state);
};
