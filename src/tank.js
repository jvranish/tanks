// jsdoc types for tanks
/**
 * @typedef {Object} Tank
 * @property {string} id - The id of the tank.
 * @property {number} x - The x coordinate of the tank.
 * @property {number} y - The y coordinate of the tank.
 * @property {string} color - The color of the tank.
 * @property {number} rotation - The rotation of the tank.
 * @property {boolean} isFiring - Whether the tank is firing.
 * @property {number} fireCooldown - The cooldown of the tank.
 * @property {number} turning - The turning of the tank.
 * @property {number} moving - The moving of the tank.
 */

import { CanvasWrapper } from "./canvas.js";
import { EventChunker } from "./webrtc-sockets.js";

// jsdoc types for bullets
/**
 * @typedef {Object} Bullet
 * @property {string} firingTankId - The id of the tank that fired the bullet.
 * @property {number} x - The x coordinate of the bullet.
 * @property {number} y - The y coordinate of the bullet.
 * @property {number} dx - The x coordinate of the bullet.
 * @property {number} dy - The y coordinate of the bullet.
 */

// jsdoc types for actions (breaking out the different types of actions)
/**
 * @typedef {Object} MoveAction
 * @property {"move"} type - The type of action.
 * @property {number} payload - The payload of the action.
 */
/**
 * @typedef {Object} TurnAction
 * @property {"turn"} type - The type of action.
 * @property {number} payload - The payload of the action.
 */
/**
 * @typedef {Object} FireAction
 * @property {"fire"} type - The type of action.
 * @property {boolean} payload - The payload of the action.
 */

/** @typedef {MoveAction | TurnAction | FireAction} TankAction */

/**
 * @param {GameState} state
 * @param {EventChunker<TankAction>} network
 */
export function TankGameHandlers(state, network) {

  /** @param {CustomEvent} e */
  const onframe = (e) => {
    const { time } = e.detail;
    if (!(e.target instanceof CanvasWrapper)) {
      throw new Error("not a canvas wrapper");
    }
    const canvas = e.target?.canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("no context");
    }

    const chunks = network.getEvents(time);
    if (chunks) {
      for (const events of chunks) {
        const { peerEvents, dt } = events;
        for (const event of peerEvents) {
          switch (event.type) {
            case "peerJoined":
              state.addTank(event.clientId);
              break;
            case "peerLeft":
              state.removeTank(event.clientId);
              break;
            case "peerEvent":
              switch (event.peerEvent.type) {
                // TODO break out the moving and turning payloads into individual fields
                case "move":
                  state.tanks[event.clientId].moving += event.peerEvent.payload;
                  break;
                case "turn":
                  state.tanks[event.clientId].turning +=
                    event.peerEvent.payload;
                  break;
                case "fire":
                  state.tanks[event.clientId].isFiring =
                    event.peerEvent.payload;
                  break;
              }
              break;
          }
        }
        state.update(dt / 1000);
      }
      draw(state, ctx);
    }
  };
  // keydown handler
  /** @param {KeyboardEvent} e */
  const onkeydown = (e) => {
    // not a key repeat:
    if (e.repeat) {
      return;
    }
    // console.log(e);
    switch (e.key) {
      case "ArrowUp":
        network.sendEvent({ type: "move", payload: 1 });
        break;
      case "ArrowDown":
        network.sendEvent({ type: "move", payload: -1 });
        break;
      case "ArrowLeft":
        network.sendEvent({ type: "turn", payload: -1 });
        break;
      case "ArrowRight":
        network.sendEvent({ type: "turn", payload: 1 });
        break;
      case " ":
        network.sendEvent({ type: "fire", payload: true });
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // keyup handler
  /** @param {KeyboardEvent} e */
  const onkeyup = (e) => {
    // console.log(e);
    switch (e.key) {
      case "ArrowUp":
        network.sendEvent({ type: "move", payload: -1 });
        break;
      case "ArrowDown":
        network.sendEvent({ type: "move", payload: 1 });
        break;
      case "ArrowLeft":
        network.sendEvent({ type: "turn", payload: 1 });
        break;
      case "ArrowRight":
        network.sendEvent({ type: "turn", payload: -1 });
        break;
      case " ":
        network.sendEvent({ type: "fire", payload: false });
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  return { onframe, onkeydown, onkeyup };
}

export class GameState {
  constructor() {
    /** @type {{ [id: string]: Tank }} */
    this.tanks = {};
    /** @type {Bullet[]} */
    this.bullets = [];
    /** @type {{ [id: string]: number }} */
    this.scores = {};
  }

  /** @param {string} id */
  addTank(id) {
    // create a tank object
    /** @type {Tank} */
    const tank = {
      id,
      x: 200,
      y: 200,
      color: "red",
      rotation: 0,
      isFiring: false,
      fireCooldown: 0,
      turning: 0, // -1 for left, 1 for right
      moving: 0, // -1 for backward, 1 for forward
    };
    this.tanks[id] = tank;
    if (!this.scores[id]) {
      this.scores[id] = 0;
    }
  }

  /** @param {string} id */
  removeTank(id) {
    delete this.tanks[id];
  }

  // determine if a tank is colliding with a bullet

  /**
   * @param {Tank} tank
   * @param {Bullet} bullet
   */
  tankHit(tank, bullet) {
    // if the bullet is not fired by the tank
    if (bullet.firingTankId !== tank.id) {
      // if the bullet is within the tank
      if (
        bullet.x > tank.x - 20 &&
        bullet.x < tank.x + 20 &&
        bullet.y > tank.y - 20 &&
        bullet.y < tank.y + 20
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {Tank} tank
   * @param {Tank} killedBy
   */
  killTank(tank, killedBy) {
    // remove the tank
    this.removeTank(tank.id);
    // add a new tank
    this.addTank(tank.id);
    // increment the score of the killer
    this.scores[killedBy.id] += 1;
  }

  /** @param {Tank} tank */
  fireBullet(tank) {
    this.bullets.push({
      firingTankId: tank.id,
      x: tank.x,
      y: tank.y,
      dx: Math.cos(tank.rotation) * 10,
      dy: Math.sin(tank.rotation) * 10,
    });
  }

  /**
   * @param {Bullet} bullet
   */
  removeBullet(bullet) {
    this.bullets.splice(this.bullets.indexOf(bullet), 1);
  }

  /**
   * @param {Tank} tank
   * @param {number} dt - The time delta.
   */
  updateTank(tank, dt) {
    // update the tank
    tank.rotation += tank.turning * 5 * dt;
    tank.x += tank.moving * Math.cos(tank.rotation) * 100 * dt;
    tank.y += tank.moving * Math.sin(tank.rotation) * 100 * dt;

    // check if the tank is hit by a bullet
    for (const bullet of this.bullets) {
      if (this.tankHit(tank, bullet)) {
        // remove the bullet
        this.removeBullet(bullet);
        // kill the tank
        this.killTank(tank, this.tanks[bullet.firingTankId]);
      }
    }

    // fire a bullet
    if (tank.isFiring && tank.fireCooldown <= 0) {
      this.fireBullet(tank);
      tank.fireCooldown = 1;
    }

    // update the cooldown based on the time
    if (tank.fireCooldown > 0) {
      tank.fireCooldown -= 1 * dt;
    }
  }

  /**
   * @param {Bullet} bullet
   * @param {number} dt - The time delta.
   */
  updateBullet(bullet, dt) {
    // update the bullet
    bullet.x += bullet.dx * 100 * dt;
    bullet.y += bullet.dy * 100 * dt;
  }

  /** @param {number} dt */
  update(dt) {
    for (const tank of Object.values(this.tanks)) {
      this.updateTank(tank, dt);
    }
    for (const bullet of this.bullets) {
      this.updateBullet(bullet, dt);
    }
  }
}

/**
 * @param {Tank} tank
 * @param {CanvasRenderingContext2D} ctx
 */
function drawTank(tank, ctx) {
  //draw the tank
  ctx.save();
  ctx.translate(tank.x, tank.y);
  ctx.rotate(tank.rotation);
  ctx.fillStyle = tank.color;
  ctx.fillRect(-25, -25, 50, 50);
  ctx.restore();

  // draw the tank turret
  ctx.save();
  ctx.translate(tank.x, tank.y);
  ctx.rotate(tank.rotation + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -50);
  ctx.strokeStyle = "black";
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {Bullet} bullet
 * @param {CanvasRenderingContext2D} ctx
 */
function drawBullet(bullet, ctx) {
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "black";
  ctx.fill();
}

/**
 * @param {GameState} state
 * @param {CanvasRenderingContext2D} ctx
 */
function draw(state, ctx) {
  // clear the canvas
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // console.log("width, and height", ctx.canvas.width, ctx.canvas.height);
  // console.log("style width and height", ctx.canvas.style.width, ctx.canvas.style.height);
  //draw the tanks
  for (const tank of Object.values(state.tanks)) {
    drawTank(tank, ctx);
  }

  //draw the bullets
  for (const bullet of state.bullets) {
    drawBullet(bullet, ctx);
  }

  // draw the scores
  ctx.font = "30px Arial";
  ctx.fillStyle = "black";
  let i = 0;
  for (const [id, score] of Object.entries(state.scores)) {
    ctx.fillText(`${id}: ${score}`, 10, 30 + i * 30);
    i++;
  }
}
