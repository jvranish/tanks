import { render, html } from "../not-react.js";
import { GameState } from "../tank/game-state.js";

/**
 * @param {GameState} gameState
 * @param {HTMLElement} element
 */
export function renderScoreboard(gameState, element) {
  render(
    Object.values(gameState.scores)
      .map(
        ({ playerName, score }) => html`
          <div class="score-entry">
            <span class="player-name">${playerName}</span>
            <span class="player-score">${score}</span>
          </div>
        `
      )
      .join(""),
    element
  );
}
