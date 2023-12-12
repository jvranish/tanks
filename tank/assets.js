/**
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => {
      resolve(img);
    });
    img.addEventListener("error", (e) => {
      reject(e);
    });
    img.src = src;
  });
}

/**
 * @param {string} src
 * @returns {Promise<HTMLAudioElement>}
 */
async function loadAudio(src) {
  const audio = new Audio(src);
  return new Promise((resolve, reject) => {
    audio.addEventListener("canplaythrough", () => {
      resolve(audio);
    });
    audio.addEventListener("error", (e) => {
      reject(e);
    });
  });
}

export async function loadAssets() {
  // Initiate all image and audio loading without awaiting immediately
  const flashFrames = [
    loadImage("./assets/Flash_A_01.png"),
    loadImage("./assets/Flash_A_02.png"),
    loadImage("./assets/Flash_A_03.png"),
    loadImage("./assets/Flash_A_04.png"),
    loadImage("./assets/Flash_A_05.png"),
  ];

  const trackFrames = [
    loadImage("./assets/Track_2_A.png"),
    loadImage("./assets/Track_2_B.png"),
  ];

  const explosionFrames = [
    loadImage("./assets/Explosion_A.png"),
    loadImage("./assets/Explosion_B.png"),
    loadImage("./assets/Explosion_C.png"),
    loadImage("./assets/Explosion_D.png"),
    loadImage("./assets/Explosion_E.png"),
    loadImage("./assets/Explosion_F.png"),
    loadImage("./assets/Explosion_G.png"),
    loadImage("./assets/Explosion_H.png"),
  ];

  const groundTiles = [
    loadImage("./assets/Ground_Tile_01_A.png"),
    loadImage("./assets/Ground_Tile_02_A.png"),
  ];

  const hullImagePromise = loadImage("./assets/Hull_02.png");
  const turretImagePromise = loadImage("./assets/Gun_01.png");
  const explodeSoundPromise = loadAudio("./assets/explode.wav");
  const shootSoundPromise = loadAudio("./assets/shoot.wav");

  // Await all promises
  const [hullImage, turretImage, explodeSound, shootSound] = await Promise.all([
    hullImagePromise,
    turretImagePromise,
    explodeSoundPromise,
    shootSoundPromise,
  ]);

  return {
    hullImage,
    turretImage,
    tankAttributes: {
      baseRotation: Math.PI / 2,
      trackOffset: 65,
      turretPivotOffset: 40,
      turretSize: { width: 94, height: 212 },
      barrelLength: 130,
    },
    flashAnimation: { frames: await Promise.all(flashFrames), frameTime: 0.08 },
    trackAnimation: { frames: await Promise.all(trackFrames), frameTime: 0.1 },
    explosionAnimation: {
      frames: await Promise.all(explosionFrames),
      frameTime: 0.08,
    },
    groundTiles: await Promise.all(groundTiles),
    explodeSound,
    shootSound,
  };
}

