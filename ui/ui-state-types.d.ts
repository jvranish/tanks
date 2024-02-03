
type MainState = { ui_state: "main"; errorMsg?: string; };

type PlayingState = {
  ui_state: "playing";
  joinLink: string;
  isHost: boolean;
  networkedGame: import("../lib/networking/networked-game").NetworkedGame;
  gameState: import("../tank/game-state").GameState;
};

type JoinMenuState = { ui_state: "join_menu"; token: string; };

type StartingState = { ui_state: "starting"; msg: string; };

type State = MainState | JoinMenuState | StartingState | PlayingState;
