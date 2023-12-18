/** @typedef {import("./game-state.js").Tank} Tank */
/** @typedef {import("./game-state.js").Bullet} Bullet */
/** @typedef {import("./game-state.js").Vector2D} Vector2D */

import { GameState } from "./game-state.js";
import { PCG32 } from "../lib/pcg/pcg.js";

/**
 * @typedef {{
 *   clientId: string;
 *   state: GameState;
 *   timeSinceLastUpdate: number;
 *   context: CanvasRenderingContext2D;
 * }} DrawParams
 */

/**
 * @param {HTMLImageElement} image
 * @param {CanvasRenderingContext2D} context
 */
function drawCentered(image, context) {
  context.drawImage(image, -image.width / 2, -image.height / 2);
}

/**
 * @param {{ frameTime: number; frames: HTMLImageElement[] }} animation
 * @param {number} t
 * @param {CanvasRenderingContext2D} context
 */
function drawAnimationFrame(animation, t, context) {
  const frameIndex = Math.floor(t / animation.frameTime);
  if (frameIndex < 0 || frameIndex >= animation.frames.length) {
    return;
  }
  const frame = animation.frames[frameIndex];
  drawCentered(frame, context);
}

/**
 * @param {{ frameTime: number; frames: HTMLImageElement[] }} animation
 * @param {number} t
 * @param {CanvasRenderingContext2D} context
 * @param {number} startFrame
 */
function drawLoopedAnimation(animation, t, context, startFrame = 0) {
  const frameIndex = Math.floor(t / animation.frameTime) + startFrame;
  const frame = animation.frames[frameIndex % animation.frames.length];
  drawCentered(frame, context);
}

/**
 * @param {DrawParams} params
 * @param {Vector2D} origin
 * @param {string} playerName
 * @param {Tank} tank
 */
function drawTank(
  { state, timeSinceLastUpdate, context },
  origin,
  playerName,
  tank
) {
  const time = state.time + timeSinceLastUpdate;

  // setup the transform for the tank
  context.save();
  const delta = state.deltaPosition(tank.position, origin);
  context.translate(delta.x, delta.y);
  context.scale(0.5, 0.5);
  const rotation = tank.rotation + state.assets.tankAttributes.baseRotation;
  context.rotate(rotation);

  // draw the explosion if the tank is dead
  if (tank.dead) {
    const explosionTime = time - tank.deadAt;
    drawAnimationFrame(state.assets.explosionAnimation, explosionTime, context);
    context.restore();
    return;
  }

  // draw the tank tracks
  const trackTime =
    tank.input.moving != 0 || tank.input.turning != 0 ? time : 0;
  context.save();
  context.translate(-state.assets.tankAttributes.trackOffset, 0);
  drawLoopedAnimation(state.assets.trackAnimation, trackTime, context);
  context.restore();

  context.save();
  context.translate(state.assets.tankAttributes.trackOffset, 0);
  drawLoopedAnimation(state.assets.trackAnimation, trackTime, context);
  context.restore();

  // draw the hull
  drawCentered(state.assets.hullImage, context);

  // draw the turret
  const pivot = state.assets.tankAttributes.turretPivotOffset;
  context.translate(0, pivot);
  context.rotate(tank.turretRotation);
  context.translate(0, -pivot);

  drawCentered(state.assets.turretImage, context);

  //draw the flash
  if (tank.fireCooldown > 0) {
    context.translate(0, -state.assets.tankAttributes.barrelLength);
    const flashTime =
      state.coolDownTime - tank.fireCooldown + timeSinceLastUpdate;

    drawAnimationFrame(state.assets.flashAnimation, flashTime, context);
  }

  context.restore();

  // draw player name above tank
  if (playerName) {
    context.save();
    context.font = "20px sans-serif";
    // lighter weight
    context.font = "lighter " + context.font;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    // partially transparent
    context.globalAlpha = 0.75;
    context.fillStyle = "white";
    context.fillText(playerName, delta.x, delta.y - 50);
    context.restore();
  }
}

/**
 * @param {DrawParams} params
 * @param {Vector2D} origin
 * @param {Bullet} bullet
 */
function drawBullet({ state, timeSinceLastUpdate, context }, origin, bullet) {
  const delta = state.deltaPosition(bullet.position, origin);
  // Since the frame rate may be higher than the update rate, we want to update
  // the position of the bullet based on the time since the last update to keep the
  // bullet motion smooth
  delta.x += bullet.velocity.x * timeSinceLastUpdate;
  delta.y += bullet.velocity.y * timeSinceLastUpdate;
  context.beginPath();
  context.arc(delta.x, delta.y, 5, 0, 2 * Math.PI);
  context.fillStyle = "black";
  context.fill();
}

/**
 * @param {DrawParams} params
 * @param {Vector2D} origin
 */
function drawGround({ state, context }, origin) {
  const tileWidth = state.assets.groundTiles[0].width - 1;
  const tileHeight = state.assets.groundTiles[0].height - 1;

  const numXTiles = Math.ceil(context.canvas.width / tileWidth) + 1;
  const numYTiles = Math.ceil(context.canvas.height / tileHeight) + 1;

  for (let x = 0; x <= numXTiles; x++) {
    for (let y = 0; y <= numYTiles; y++) {
      const tx =
        Math.floor(origin.x / tileWidth) + x - Math.floor(numXTiles / 2);
      const ty =
        Math.floor(origin.y / tileHeight) + y - Math.floor(numYTiles / 2);
      const offsetX = tx * tileWidth - origin.x;
      const offsetY = ty * tileHeight - origin.y;

      let pcg = new PCG32(
        BigInt(123),
        BigInt(
          (tx % numXTiles) +
            numXTiles +
            ((ty % numYTiles) + numYTiles) * numXTiles
        )
      );
      // "random" tile, but deterministic based on the tile position
      const tile = pcg.choose(state.assets.groundTiles);

      context.save();
      context.translate(offsetX, offsetY);
      context.drawImage(tile, 0, 0);
      context.restore();
    }
  }
}

/** @param {DrawParams} params */
export function draw(params) {
  const { clientId, state, context } = params;

  // clear the canvas
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);

  context.save();

  // tank my not exist immediately after joining as the join message arrives
  // after we get the game state
  const ourTank = state.tankById(clientId);

  // center the camera on our tank
  const origin = ourTank ? ourTank.position : { x: 0, y: 0 };

  context.translate(context.canvas.width / 2, context.canvas.height / 2);

  drawGround(params, origin);

  // draw the ground tracks
  for (const track of state.groundTracks) {
    const time = state.time + params.timeSinceLastUpdate;

    // for each ground track position  draw two tread marks
    context.save();
    // opacify the tread marks as they get older
    context.globalAlpha = Math.max(0, 0.5 - (time - track.time) / 10);

    const delta = state.deltaPosition(track.pos, origin);
    context.translate(delta.x, delta.y);
    context.scale(0.5, 0.5);
    context.rotate(track.rotation + Math.PI / 2);
    context.save();
    context.translate(-state.assets.tankAttributes.trackOffset, 0);
    drawCentered(state.assets.groundTrackImage, context);
    context.restore();

    context.translate(state.assets.tankAttributes.trackOffset, 0);
    drawCentered(state.assets.groundTrackImage, context);
    context.restore();
  }

  //draw the bullets
  for (const bullet of state.bullets) {
    drawBullet(params, origin, bullet);
  }

  //draw the tanks after the bullets so they are on top (and it always like the
  //bullets come out of the tank rather than spawning on top of it)
  for (const tank of state.getTanks()) {
    // don't draw the player name for our tank
    const playerName =
      clientId !== tank.id ? state.scores[tank.id].playerName : "";
    drawTank(params, origin, playerName, tank);
  }

  context.restore();
}
