import { createStore } from "./not-redux.js";
import { MainMenu } from "./ui/main-menu.js";
import { Playing } from "./ui/playing.js";
import { mainState, transition_join_game } from "./ui/ui-state.js";
import { Starting } from "./ui/starting.js";

function getJoinToken() {
  const hash = window.location.hash;
  if (hash) {
    // remove hash from url
    window.history.replaceState(null, "", window.location.pathname);
    return hash.slice(1);
  }
  return null;
}

export const { dispatch, getState } = createStore(mainState, (state) => {
  if (state.ui_state === "main") {
    MainMenu(state);
  } else if (state.ui_state === "playing") {
    Playing(state);
  } else if (state.ui_state === "starting") {
    Starting(state);
  } else {
    throw new Error(`Unknown state ${JSON.stringify(state)}`);
  }
});

function joinGameIfHash() {
  const joinToken = getJoinToken();
  if (joinToken) {
    dispatch(transition_join_game(joinToken));
  }
}

joinGameIfHash();
// on hash change, join game
window.addEventListener("hashchange", joinGameIfHash);

