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
 *   ctx: CanvasRenderingContext2D;
 * }} DrawParams
 */

/**
 * @param {HTMLImageElement} image
 * @param {CanvasRenderingContext2D} ctx
 */
function drawCentered(image, ctx) {
  ctx.drawImage(image, -image.width / 2, -image.height / 2);
}

/**
 * @param {{ frameTime: number; frames: HTMLImageElement[] }} animation
 * @param {number} t
 * @param {CanvasRenderingContext2D} ctx
 */
function drawAnimationFrame(animation, t, ctx) {
  const frameIndex = Math.floor(t / animation.frameTime);
  if (frameIndex < 0 || frameIndex >= animation.frames.length) {
    return;
  }
  const frame = animation.frames[frameIndex];
  drawCentered(frame, ctx);
}

/**
 * @param {{ frameTime: number; frames: HTMLImageElement[] }} animation
 * @param {number} t
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} startFrame
 */
function drawLoopedAnimation(animation, t, ctx, startFrame = 0) {
  const frameIndex = Math.floor(t / animation.frameTime) + startFrame;
  const frame = animation.frames[frameIndex % animation.frames.length];
  drawCentered(frame, ctx);
}

/**
 * @param {DrawParams} params
 * @param {Vector2D} origin
 * @param {string} playerName
 * @param {Tank} tank
 */
function drawTank(
  { state, timeSinceLastUpdate, ctx },
  origin,
  playerName,
  tank
) {
  const time = state.time + timeSinceLastUpdate;

  // setup the transform for the tank
  ctx.save();
  const delta = state.deltaPosition(tank.position, origin);
  ctx.translate(delta.x, delta.y);
  ctx.scale(0.5, 0.5);
  const rotation = tank.rotation + state.assets.tankAttributes.baseRotation;
  ctx.rotate(rotation);

  // draw the explosion if the tank is dead
  if (tank.dead) {
    const explosionTime = time - tank.deadAt;
    drawAnimationFrame(state.assets.explosionAnimation, explosionTime, ctx);
    ctx.restore();
    return;
  }

  // draw the tank tracks
  const trackTime =
    tank.input.moving != 0 || tank.input.turning != 0 ? time : 0;
  ctx.save();
  ctx.translate(-state.assets.tankAttributes.trackOffset, 0);
  drawLoopedAnimation(state.assets.trackAnimation, trackTime, ctx);
  ctx.restore();

  ctx.save();
  ctx.translate(state.assets.tankAttributes.trackOffset, 0);
  drawLoopedAnimation(state.assets.trackAnimation, trackTime, ctx);
  ctx.restore();

  // draw the hull
  drawCentered(state.assets.hullImage, ctx);

  // draw the turret
  const pivot = state.assets.tankAttributes.turretPivotOffset;
  ctx.translate(0, pivot);
  ctx.rotate(tank.turretRotation);
  ctx.translate(0, -pivot);

  drawCentered(state.assets.turretImage, ctx);

  //draw the flash
  if (tank.fireCooldown > 0) {
    ctx.translate(0, -state.assets.tankAttributes.barrelLength);
    const flashTime =
      state.coolDownTime - tank.fireCooldown + timeSinceLastUpdate;

    drawAnimationFrame(state.assets.flashAnimation, flashTime, ctx);
  }

  ctx.restore();

  // draw player name above tank
  if (playerName) {
    ctx.save();
    ctx.font = "20px sans-serif";
    // lighter weight
    ctx.font = "lighter " + ctx.font;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    // partially transparent
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "white";
    ctx.fillText(playerName, delta.x, delta.y - 50);
    ctx.restore();
  }
}

/**
 * @param {DrawParams} params
 * @param {Vector2D} origin
 * @param {Bullet} bullet
 */
function drawBullet({ state, timeSinceLastUpdate, ctx }, origin, bullet) {
  const delta = state.deltaPosition(bullet.position, origin);
  // Since the frame rate may be higher than the update rate, we want to update
  // the position of the bullet based on the time since the last update to keep the
  // bullet motion smooth
  delta.x += bullet.velocity.x * timeSinceLastUpdate;
  delta.y += bullet.velocity.y * timeSinceLastUpdate;
  ctx.beginPath();
  ctx.arc(delta.x, delta.y, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "black";
  ctx.fill();
}

/**
 * @param {DrawParams} params
 * @param {Vector2D} origin
 */
function drawGround({ state, ctx }, origin) {
  const tileWidth = state.assets.groundTiles[0].width - 1;
  const tileHeight = state.assets.groundTiles[0].height - 1;

  const numXTiles = Math.ceil(ctx.canvas.width / tileWidth);
  const numYTiles = Math.ceil(ctx.canvas.height / tileHeight);

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

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.drawImage(tile, 0, 0);
      ctx.restore();
    }
  }
}

/** @param {DrawParams} params */
export function draw(params) {
  const { clientId, state, ctx } = params;

  // clear the canvas
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.save();

  // tank my not exist immediately after joining as the join message arrives
  // after we get the game state
  const ourTank = state.tankById(clientId);

  // center the camera on our tank
  const origin = ourTank ? ourTank.position : { x: 0, y: 0 };

  ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);

  drawGround(params, origin);

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

  ctx.restore();
}
