type Vector2D = { x: number; y: number; };

interface Tank {
  id: string;
  position: Vector2D;
  rotation: number;
  turretRotation: number;
  fireCooldown: number;
  dead: boolean;
  deadAt: number;
  input: TankInput;
  distanceTraveledSinceLastGroundTrack: number;
}

interface Bullet {
  firingTankId: string;
  startPosition: Vector2D;
  position: Vector2D;
  velocity: Vector2D;
}

type TankInput = {
  moving: number;
  turning: number;
  turningTurret: number;
  isFiring: boolean;
};

type TankEvent = {
  type: "tank";
  input: TankInput;
};

type SetPlayerNameEvent = {
  type: "setPlayerName";
  playerName: string;
};

type GameInputEvent = TankEvent | SetPlayerNameEvent;

type GameOutputEvent = { type: "shoot"; } | { type: "died"; };

