import { dispatch } from "../app.js";
import { Identity } from "../lib/networking/identity.js";
import { NetworkedGame } from "../lib/networking/networked-game.js";
import { GameState } from "../tank/game-state.js";

/** @typedef {import("../tank/game-state.js").GameInputEvent} GameInputEvent */
/** @typedef {import("../tank/game-state.js").GameOutputEvent} GameOutputEvent */

/** @typedef {{ ui_state: "main"; errorMsg?: string }} MainState */
/**
 * @typedef {{
 *   ui_state: "playing";
 *   joinLink: string;
 *   isHost: boolean;
 *   networkedGame: NetworkedGame<GameInputEvent, GameOutputEvent, GameState>;
 *   gameState: GameState;
 * }} PlayingState
 */
/** @typedef {{ ui_state: "starting"; msg: string }} StartingState */
/** @typedef {MainState | PlayingState | StartingState} State */

/** @type {State} */
export const mainState = { ui_state: "main" };

/**
 * @param {string} joinToken
 * @param {NetworkedGame<GameInputEvent, GameOutputEvent, GameState>} networkedGame
 * @param {GameState} gameState
 * @returns {(state: State) => PlayingState}
 */
export const transition_playing = (joinToken, networkedGame, gameState) => {
  const isHost = networkedGame.isHost;
  const joinLink = joinToken ? window.location.href + "#" + joinToken : "";
  if (joinLink) {
    if (isHost) {
      // Otherwise we get yelled at for not being triggered by a user action
      navigator.clipboard.writeText(joinLink);
    }
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
    gameState,
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
export const transition_single_player_game = (state) => {
  if (state.ui_state !== "main") {
    return state;
  }

  const f = async () => {
    const gameState = await GameState.init();

    try {
      const { networkedGame } = await NetworkedGame.singlePlayerGame(gameState);

      return transition_playing("", networkedGame, gameState);
    } catch (err) {
      console.error(err);
      return transition_error(`Error starting host: ${err}`);
    }
  };
  f().then(dispatch);

  return transition_starting("Starting Host")(state);
};

/** @param {State} state */
export const transition_host_game = (state) => {
  if (state.ui_state !== "main") {
    return state;
  }

  const f = async () => {
    const gameState = await GameState.init();

    try {
      const { networkedGame, token } = await NetworkedGame.hostGame(gameState);

      return transition_playing(token, networkedGame, gameState);
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
  if (state.ui_state === "playing") {
    state.networkedGame.disconnect(); // can I make this automatic?
  } else if (state.ui_state !== "main") {
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

      const { networkedGame, identity, gameState } =
        await NetworkedGame.joinGame(
          joinToken,
          GameState.deserialize,
          existingIdentity
        );
      localStorage.setItem("identity", JSON.stringify(await identity.export()));

      return transition_playing(joinToken, networkedGame, gameState);
    } catch (err) {
      console.error(err);
      return transition_error(`Error joining game: ${err}`);
    }
  };
  f().then(dispatch);

  return transition_starting("Joining Game")(state);
};
