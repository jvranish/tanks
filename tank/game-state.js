import { PCG32 } from "../lib/pcg/pcg.js";
import { loadAssets } from "./assets.js";

/** @typedef {{ x: number; y: number }} Vector2D */

/**
 * @typedef {Object} Tank
 * @property {string} id - The id of the tank.
 * @property {Vector2D} position - The position of the tank.
 * @property {number} rotation - The rotation of the tank.
 * @property {number} turretRotation - The rotation of the tank's turret.
 * @property {number} fireCooldown - How long until the tank can fire again.
 * @property {boolean} dead - Whether the tank is dead.
 * @property {number} deadAt - The time the tank died.
 * @property {TankInput} input - The input state of the tank.
 * @property {number} distanceTraveledSinceLastGroundTrack - The distance
 *   traveled since the last ground track.
 */

/**
 * @typedef {Object} Bullet
 * @property {string} firingTankId - The id of the tank that fired the bullet.
 * @property {Vector2D} startPosition - The start position of the bullet (used
 *   to limit travel distance)
 * @property {Vector2D} position - The position of the bullet.
 * @property {Vector2D} velocity - The velocity of the bullet.
 */

/**
 * @typedef {{
 *   moving: number;
 *   turning: number;
 *   turningTurret: number;
 *   isFiring: boolean;
 * }} TankInput
 */

/**
 * @typedef {{
 *   type: "tank";
 *   input: TankInput;
 * }} TankEvent
 */

/**
 * @typedef {{
 *   type: "setPlayerName";
 *   playerName: string;
 * }} SetPlayerNameEvent
 */

/** @typedef {TankEvent | SetPlayerNameEvent} GameInputEvent */
/** @typedef {{ type: "shoot" } | { type: "died" }} GameOutputEvent */

export class GameState {
  /** @param {Awaited<ReturnType<typeof loadAssets>>} assets */
  constructor(assets) {
    /** @type {GameOutputEvent[]} */
    this.outputEvents = [];
    /** @type {{ [id: string]: Tank }} */
    this.tanks = {};
    /** @type {Bullet[]} */
    this.bullets = [];
    // Scores are stored separately from tanks because we add and remove tanks on death.
    /** @type {{ [id: string]: { playerName: string; score: number } }} */
    this.scores = {};
    this.rng = new PCG32();
    this.time = 0;
    this.arenaSize = { x: 2000, y: 2000 };
    this.maxBulletDistance = 800;
    this.tankRespawnTime = 5;
    this.bulletVelocity = 1000;
    this.coolDownTime = 1;
    // If this seems backwards, it's because we draw the tank rotated 90 degrees
    this.tankWidth = 128;
    this.tankHeight = 75;
    this.tankSpeed = 100;
    this.tankRotationSpeed = 3;
    this.tankTurretRotationSpeed = 3;
    /** @type {{ pos: Vector2D; rotation: number; time: number }[]} */
    this.groundTracks = [];
    this.assets = assets;
  }

  static async init() {
    const assets = await loadAssets();
    return new GameState(assets);
  }

  // toroidal space
  /**
   * @param {Vector2D} a
   * @param {Vector2D} b
   * @returns {Vector2D}
   */
  deltaPosition(a, b) {
    a = this.normalizePosition(a);
    b = this.normalizePosition(b);
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    const w = this.arenaSize.x;
    const h = this.arenaSize.y;
    // Check if wrapping around is shorter for X
    if (Math.abs(dx) > w / 2) {
      dx = dx > 0 ? dx - w : dx + w;
    }

    // Check if wrapping around is shorter for Y
    if (Math.abs(dy) > h / 2) {
      dy = dy > 0 ? dy - h : dy + h;
    }
    // const dx2 = dx > 0 ? dx - w : dx + w;
    // const dy2 = dy > 0 ? dy - h : dy + h;
    return { x: dx, y: dy };
  }

  /**
   * @param {Vector2D} position
   * @returns {Vector2D}
   */
  normalizePosition(position) {
    const { x, y } = position;
    const w = this.arenaSize.x;
    const h = this.arenaSize.y;
    return {
      x: ((x % w) + w) % w,
      y: ((y % h) + h) % h,
    };
  }

  /**
   * @param {Vector2D} a
   * @param {Vector2D} b
   * @returns {number}
   */
  distance(a, b) {
    // in terms of deltaPosition
    const { x, y } = this.deltaPosition(a, b);
    return Math.sqrt(x * x + y * y);
  }

  randomPosition() {
    return {
      x: this.rng.randomInt(0, this.arenaSize.x),
      y: this.rng.randomInt(0, this.arenaSize.y),
    };
  }

  getTanks() {
    return Object.values(this.tanks);
  }

  /** @param {Vector2D} position */
  nearestTank(position) {
    let nearestTank = null;
    let nearestDistance = Infinity;
    for (const tank of this.getTanks()) {
      const d = this.distance(position, tank.position);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearestTank = tank;
      }
    }
    if (!nearestTank) {
      return null;
    }
    return { nearestTank, nearestDistance };
  }

  /** @param {string} id */
  addTank(id) {
    // Pick 5 random positions and choose the one that is farthest from all other tanks.
    const positions = [];
    for (let i = 0; i < 5; i++) {
      positions.push(this.randomPosition());
    }
    positions.sort((a, b) => {
      // sort by reverse distance to nearest tank
      const nearestA = this.nearestTank(a);
      const nearestB = this.nearestTank(b);
      if (!nearestA || !nearestB) {
        return 0;
      }
      return nearestB.nearestDistance - nearestA.nearestDistance;
    });

    const position = positions[0];

    // create a tank object

    /** @type {Tank} */
    const tank = {
      id,
      position,
      rotation: 0,
      turretRotation: 0,
      fireCooldown: 0,
      dead: false,
      deadAt: 0,
      input: {
        isFiring: false,
        turning: 0, // -1 for left, 1 for right
        turningTurret: 0, // -1 for left, 1 for right
        moving: 0, // -1 for backward, 1 for forward
      },
      distanceTraveledSinceLastGroundTrack:
        this.assets.tankAttributes.groundTrackStep,
    };
    this.tanks[id] = tank;
    if (!this.scores[id]) {
      const playerName = `Player-${id.slice(0, 4)}`;
      this.scores[id] = { playerName, score: 0 };
    }
  }

  /** @param {string} id */
  removeTank(id) {
    delete this.tanks[id];
  }

  /**
   * @param {Tank} tank
   * @param {Bullet} bullet
   */
  tankHit(tank, bullet) {
    // if the bullet is not fired by the tank
    if (bullet.firingTankId === tank.id) {
      return false;
    }
    // delta position between the bullet and the tank
    const delta = this.deltaPosition(bullet.position, tank.position);
    // rotate the delta position by the tank's rotation
    const rotatedDelta = {
      x:
        delta.x * Math.cos(-tank.rotation) - delta.y * Math.sin(-tank.rotation),
      y:
        delta.x * Math.sin(-tank.rotation) + delta.y * Math.cos(-tank.rotation),
    };
    // if the bullet is within the tank (a rotated bounding box)
    return (
      Math.abs(rotatedDelta.x) < this.tankWidth / 2 &&
      Math.abs(rotatedDelta.y) < this.tankHeight / 2
    );
  }

  /** @param {Tank} tank */
  respawnTank(tank) {
    // remove the tank
    this.removeTank(tank.id);
    // add a new tank
    this.addTank(tank.id);
  }

  /**
   * @param {Tank} tank
   * @param {string} killedBy
   */
  killTank(tank, killedBy) {
    // increment the score of the killer
    this.scores[killedBy].score += 1;
    // mark the tank dead
    tank.dead = true;
    tank.deadAt = this.time;
    // fire an event
    this.GameOutputEvent({ type: "died" });
  }

  /** @param {Tank} tank */
  fireBullet(tank) {
    const startPosition = {
      x:
        tank.position.x +
        Math.cos(tank.rotation) *
          -(this.assets.tankAttributes.turretPivotOffset / 2),
      y:
        tank.position.y +
        Math.sin(tank.rotation) *
          -(this.assets.tankAttributes.turretPivotOffset / 2),
    };

    this.bullets.push({
      firingTankId: tank.id,
      position: { x: startPosition.x, y: startPosition.y },
      startPosition: {
        x: startPosition.x,
        y: startPosition.y,
      },
      velocity: {
        x: Math.cos(tank.rotation + tank.turretRotation) * this.bulletVelocity,
        y: Math.sin(tank.rotation + tank.turretRotation) * this.bulletVelocity,
      },
    });
    this.GameOutputEvent({ type: "shoot" });
  }

  /** @param {Bullet} bullet */
  removeBullet(bullet) {
    this.bullets.splice(this.bullets.indexOf(bullet), 1);
  }

  /**
   * @param {Tank} tank
   * @param {number} dt - The time delta.
   */
  updateTank(tank, dt) {
    // if the tank is dead
    if (tank.dead) {
      // if the tank has been dead for more than the respawn time
      if (this.time - tank.deadAt > this.tankRespawnTime) {
        // respawn the tank
        this.respawnTank(tank);
      }
      // don't update the tank
      return;
    }

    // update the tank
    tank.rotation += tank.input.turning * this.tankRotationSpeed * dt;
    tank.turretRotation +=
      tank.input.turningTurret * this.tankTurretRotationSpeed * dt;
    tank.position.x +=
      tank.input.moving * Math.cos(tank.rotation) * this.tankSpeed * dt;
    tank.position.y +=
      tank.input.moving * Math.sin(tank.rotation) * this.tankSpeed * dt;

    if (tank.input.moving != 0) {
      if (
        tank.distanceTraveledSinceLastGroundTrack >
        this.assets.tankAttributes.groundTrackStep
      ) {
        // reset the distance traveled, and add a ground track
        tank.distanceTraveledSinceLastGroundTrack = 0;
        this.groundTracks.push({
          pos: {
            x:
              tank.position.x +
              Math.cos(tank.rotation) *
                -this.assets.tankAttributes.groundTrackOffset,
            y:
              tank.position.y +
              Math.sin(tank.rotation) *
                -this.assets.tankAttributes.groundTrackOffset,
          },
          rotation: tank.rotation,
          time: this.time,
        });
        // if groundTracks is too long, remove the oldest one
        if (this.groundTracks.length > 200) {
          this.groundTracks.shift();
        }
      }

      // update the distance traveled
      tank.distanceTraveledSinceLastGroundTrack += this.tankSpeed * dt;
    }

    // check if the tank is hit by a bullet
    for (const bullet of this.bullets) {
      if (this.tankHit(tank, bullet)) {
        // remove the bullet
        this.removeBullet(bullet);
        // kill the tank
        this.killTank(tank, bullet.firingTankId);
      }
    }

    this.updateFireBullet(tank, dt);
  }

  /**
   * @param {Tank} tank
   * @param {number} dt - The time delta.
   */
  updateFireBullet(tank, dt) {
    if (tank.dead){
      // because we can get here from `onEvent` we need to check if the tank is
      // dead again
      return;
    }
    // update the cooldown based on the time
    if (tank.fireCooldown > 0) {
      tank.fireCooldown -= dt;
    }

    // fire a bullet
    if (tank.input.isFiring && tank.fireCooldown <= 0) {
      this.fireBullet(tank);
      tank.fireCooldown = this.coolDownTime;
    }
  }

  /**
   * @param {string} id
   * @returns {Tank | undefined}
   */
  tankById(id) {
    return this.tanks[id];
  }

  /**
   * @param {Bullet} bullet
   * @param {number} dt - The time delta.
   */
  updateBullet(bullet, dt) {
    // update the bullet position
    bullet.position.x += bullet.velocity.x * dt;
    bullet.position.y += bullet.velocity.y * dt;
    // if bullet is 800 pixels away from the firing tank, remove it
    const tank = this.tankById(bullet.firingTankId);
    if (
      !tank ||
      this.distance(bullet.startPosition, bullet.position) >
        this.maxBulletDistance
    ) {
      this.removeBullet(bullet);
    }
  }

  /** @param {number} dt */
  update(dt) {
    this.time += dt;
    for (const tank of Object.values(this.tanks)) {
      this.updateTank(tank, dt);
    }
    for (const bullet of this.bullets) {
      this.updateBullet(bullet, dt);
    }
    // empty the output events array, and return the contents
    return this.outputEvents.splice(0);
  }

  /** @param {GameOutputEvent} GameOutputEvent */
  GameOutputEvent(GameOutputEvent) {
    this.outputEvents.push(GameOutputEvent);
  }

  /** @param {string} clientId */
  onPlayerJoined(clientId) {
    this.addTank(clientId);
  }

  /** @param {string} clientId */
  onPlayerLeft(clientId) {
    this.removeTank(clientId);
  }

  /**
   * @param {string} clientId
   * @param {GameInputEvent} peerEvent
   */
  onEvent(clientId, peerEvent) {
    if (peerEvent.type === "setPlayerName") {
      this.scores[clientId].playerName = peerEvent.playerName;
    } else if (peerEvent.type === "tank") {
      // this is here so that even if the space key is pressed only for a short
      // time, we still fire the bullet
      this.tanks[clientId].input = peerEvent.input;
      for (const tank of Object.values(this.tanks)) {
        this.updateFireBullet(tank, 0);
      }
    }
  }

  /**
   * @param {string} s
   * @returns {Promise<GameState>}
   */
  static async deserialize(s) {
    const json = JSON.parse(s);
    json.rng = PCG32.fromJSON(json.rng);
    // load assets
    json.assets = await loadAssets();
    return Object.setPrototypeOf(json, GameState.prototype);
  }

  serialize() {
    return JSON.stringify(this, (key, value) => {
      if (value instanceof PCG32) {
        return value.stringify();
      }
      // Don't serialize assets because they are too big and they are static,
      // and the other side has them already anyway.
      if (key === "assets") {
        return undefined;
      }
      return value;
    });
  }
}
