/** @param {string} node_id */
function getContext(node_id) {
  const canvas = document.getElementById(node_id);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("No canvas element");
  }
  const ctx = canvas.getContext("2d");
  if (!(ctx instanceof CanvasRenderingContext2D)) {
    throw new Error("No canvas context");
  }
  return ctx;
}

const ctx = getContext("canvas");
const canvas = ctx.canvas;

// resize the canvas to fill browser window dynamically
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas, false);

// initialize the canvas size
resizeCanvas();

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


// jsdoc types for bullets
/**
 * @typedef {Object} Bullet
 * @property {string} firingTankId - The id of the tank that fired the bullet.
 * @property {number} x - The x coordinate of the bullet.
 * @property {number} y - The y coordinate of the bullet.
 * @property {number} dx - The x coordinate of the bullet.
 * @property {number} dy - The y coordinate of the bullet.
 */
/** @type {Bullet[]} */
const bullets = [];

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

/** @param {MoveAction | TurnAction | FireAction} action */
function sendEvent(action) {
  switch (action.type) {
    case "move":
      tank.moving = action.payload;
      break;
    case "turn":
      tank.turning = action.payload;
      break;
    case "fire":
      tank.isFiring = action.payload;
      break;
  }
}

// keydown handler
/** @param {KeyboardEvent} e */
function keydownHandler(e) {
  // console.log(e);
  switch (e.key) {
    case "ArrowUp":
      sendEvent({ type: "move", payload: 1 });
      break;
    case "ArrowDown":
      sendEvent({ type: "move", payload: -1 });
      break;
    case "ArrowLeft":
      sendEvent({ type: "turn", payload: -1 });
      break;
    case "ArrowRight":
      sendEvent({ type: "turn", payload: 1 });
      break;
    case " ":
      sendEvent({ type: "fire", payload: true });
      break;
  }
}

// keyup handler
/** @param {KeyboardEvent} e */
function keyupHandler(e) {
  // console.log(e);
  switch (e.key) {
    case "ArrowUp":
      sendEvent({ type: "move", payload: 0 });
      break;
    case "ArrowDown":
      sendEvent({ type: "move", payload: 0 });
      break;
    case "ArrowLeft":
      sendEvent({ type: "turn", payload: 0 });
      break;
    case "ArrowRight":
      sendEvent({ type: "turn", payload: 0 });
      break;
    case " ":
      sendEvent({ type: "fire", payload: false });
      break;
  }
}

// add event listeners
window.addEventListener("keydown", keydownHandler);
window.addEventListener("keyup", keyupHandler);

class GameState {
  constructor() {
    /** @type {{ [id: string]: Tank }} */
    this.tanks = {};
    /** @type {Bullet[]} */
    this.bullets = [];
  }

  /**
   * @param {string} id
   */
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
  }

  /**
    * @param {Tank} tank
    */
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
    * @param {Tank} tank
    * @param {number} dt - The time delta.
    */
  updateTank(tank, dt) {
    // update the tank
    tank.rotation += tank.turning * 5 * dt;
    tank.x += tank.moving * Math.cos(tank.rotation) * 100 * dt;
    tank.y += tank.moving * Math.sin(tank.rotation) * 100 * dt;

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
     bullet.x += bullet.dx * dt;
     bullet.y += bullet.dy * dt;
  }

  /**
    * @param {number} dt
    */
  update(dt) {
    for (const tank of Object.values(this.tanks)) {
      this.updateTank(tank, dt);
    };
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  //draw the tanks
  for (const tank of Object.values(state.tanks)) {
    drawTank(tank, ctx);
  }

  //draw the bullets
  for (const bullet of state.bullets) {
    drawBullet(bullet, ctx);
  }
}

let lastTime = 0;

/** @param {number} time */
function draw(time) {
  if (lastTime == 0) {
    lastTime = time;
  }
  let dt = (time - lastTime) / 1000;
  lastTime = time;



  // call draw again on the next frame
  requestAnimationFrame(draw);
}

// start drawing
requestAnimationFrame(draw);
