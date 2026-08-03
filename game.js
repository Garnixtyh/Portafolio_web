const WORLD_W = 960;
const WORLD_H = 540;
const THICK = 14;
const DOOR_SPAN = 100;
const DOOR_THICK = 20;
const TRANSITION_MS = 650;

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const app = document.getElementById('app');
const stage = document.getElementById('stage');
const viewport = document.getElementById('viewport');
const world = document.getElementById('world');
const dialogueBox = document.getElementById('dialogue-box');
const dialogueText = document.getElementById('dialogue-text');
const roomTransition = document.getElementById('room-transition');

const MUSICA_MENU = 'assets/audio/dialtone.ogg';

const audioPlayer = new Audio();
audioPlayer.loop = true;
audioPlayer.volume = 0.6;
let currentTrack = null;

function playTrack(src) {
  if (!src || src === currentTrack) return;
  currentTrack = src;
  audioPlayer.src = src;
  audioPlayer.currentTime = 0;
  audioPlayer.play().catch(() => {});
}

function unlockAudioOnce() {
  if (audioPlayer.paused && audioPlayer.src) {
    audioPlayer.play().catch(() => {});
  }
  window.removeEventListener('pointerdown', unlockAudioOnce);
  window.removeEventListener('keydown', unlockAudioOnce);
}
window.addEventListener('pointerdown', unlockAudioOnce);
window.addEventListener('keydown', unlockAudioOnce);

playTrack(MUSICA_MENU);

const inventory = new Set();
const pressedKeys = new Set();
let dialogueQueue = [];
let dialogueActive = false;
let typing = false;
let typeInterval = null;
let modalOpen = false;
let gameStarted = false;
let transitioning = false;

let currentRoomId = 'tutorial';
let currentRoom = null;


let player = { x: 60, y: 270, w: 40, h: 40, speed: 5, dir: 'abajo', frame: 0, animTime: 0 };
let playerEl = null;

const PLAYER_SPRITE = {
  src: 'assets/sprites/player/player_sprite-sheet.png',
  frameWidth: 391,   
  frameHeight: 555,
  frameCount: 4,     
  frameDuration: 120, 
  columnas: { abajo: 0, derecha: 1, izquierda: 2, arriba: 3 },
  escala: 0.35,      
  offsetX: 0,       
  offsetY: 0         
};

const PLAYER_SPRITE_VARIANTS = {
  normal: 'assets/sprites/player/player_sprite-sheet.png',
  escalada: 'assets/sprites/player/player_escalada.png'
};

let currentSpriteVariant = 'normal';

function setPlayerSpriteVariant(key) {
  if (currentSpriteVariant === key) return;
  currentSpriteVariant = key;
  PLAYER_SPRITE.src = PLAYER_SPRITE_VARIANTS[key];
  if (playerEl) playerEl.style.backgroundImage = `url(${PLAYER_SPRITE.src})`;
}

function wall(x, y, w, h) {
  return `<div class="wall" data-x="${x}" data-y="${y}" data-w="${w}" data-h="${h}"></div>`;
}
function door(cls, x, y, w, h, target, requires, locked, label) {
  return `<div class="door ${cls}" data-x="${x}" data-y="${y}" data-w="${w}" data-h="${h}" data-target="${target}" data-requires="${requires}" data-locked="${locked}">${label}</div>`;
}
function keyItem(color, x, y, msg) {
  return `<div class="key-item key-${color}" data-x="${x}" data-y="${y}" data-w="26" data-h="26" data-key="${color}" data-msg="${msg}"></div>`;
}
function terminal(x, y, modalId) {
  return `<div class="terminal" data-x="${x}" data-y="${y}" data-w="44" data-h="44" data-modal="${modalId}">i</div>`;
}
function climbWall(x, y, w, h) {
  return `<div class="climb-wall" data-x="${x}" data-y="${y}" data-w="${w}" data-h="${h}"></div>`;
}

function doorSpan(doorDef) {
  return (doorDef.tamaño && doorDef.tamaño[0]) || DOOR_SPAN;
}
function doorThick(doorDef) {
  return (doorDef.tamaño && doorDef.tamaño[1]) || DOOR_THICK;
}

function sideWalls(lado, width, height, doorDef) {
  if (lado === 'arriba' || lado === 'abajo') {
    const y = lado === 'arriba' ? 0 : height - THICK;
    if (!doorDef) return [wall(0, y, width, THICK)];
    const span = doorSpan(doorDef);
    const center = doorDef.pos;
    const gapStart = Math.max(0, center - span / 2);
    const gapEnd = Math.min(width, center + span / 2);
    const segs = [];
    if (gapStart > 0) segs.push(wall(0, y, gapStart, THICK));
    if (gapEnd < width) segs.push(wall(gapEnd, y, width - gapEnd, THICK));
    return segs;
  } else {
    const x = lado === 'izquierda' ? 0 : width - THICK;
    if (!doorDef) return [wall(x, 0, THICK, height)];
    const span = doorSpan(doorDef);
    const center = doorDef.pos;
    const gapStart = Math.max(0, center - span / 2);
    const gapEnd = Math.min(height, center + span / 2);
    const segs = [];
    if (gapStart > 0) segs.push(wall(x, 0, THICK, gapStart));
    if (gapEnd < height) segs.push(wall(x, gapEnd, THICK, height - gapEnd));
    return segs;
  }
}

function doorColorClass(requiere) {
  if (!requiere) return 'simple-door';
  return 'locked-' + requiere;
}

function buildDoorElement(p, width, height) {
  const span = doorSpan(p);
  const thick = doorThick(p);
  const center = p.pos;
  const cls = p.volver ? 'back-door' : doorColorClass(p.requiere);
  const label = p.volver ? '‹' : (p.requiere ? '' : '›');
  const requiere = p.requiere || '';
  const mensaje = p.mensaje || '';
  if (p.lado === 'izquierda') return door(cls, 0, center - span / 2, thick, span, p.destino, requiere, mensaje, label);
  if (p.lado === 'derecha') return door(cls, width - thick, center - span / 2, thick, span, p.destino, requiere, mensaje, label);
  if (p.lado === 'arriba') return door(cls, center - span / 2, 0, span, thick, p.destino, requiere, mensaje, label);
  return door(cls, center - span / 2, height - thick, span, thick, p.destino, requiere, mensaje, label);
}

const ENTRY_MARGIN = 30;

function spawnNearDoor(p, width, height) {
  const center = p.pos;
  if (p.lado === 'izquierda') return { x: THICK + ENTRY_MARGIN, y: center - player.h / 2 };
  if (p.lado === 'derecha') return { x: width - THICK - ENTRY_MARGIN - player.w, y: center - player.h / 2 };
  if (p.lado === 'arriba') return { x: center - player.w / 2, y: THICK + ENTRY_MARGIN };
  return { x: center - player.w / 2, y: height - THICK - ENTRY_MARGIN - player.h };
}

function crearSala(cfg) {
  const [width, height] = cfg.tamaño;
  const puertas = cfg.puertas || [];
  const doorsBySide = {};
  puertas.forEach(p => { doorsBySide[p.lado] = p; });

  const pieces = [];
  pieces.push(...sideWalls('arriba', width, height, doorsBySide.arriba));
  pieces.push(...sideWalls('abajo', width, height, doorsBySide.abajo));
  pieces.push(...sideWalls('izquierda', width, height, doorsBySide.izquierda));
  pieces.push(...sideWalls('derecha', width, height, doorsBySide.derecha));

  puertas.forEach(p => pieces.push(buildDoorElement(p, width, height)));

  const llaves = cfg.llaves || (cfg.llave ? [cfg.llave] : []);
  llaves.forEach(k => {
    pieces.push(keyItem(k.color, k.x, k.y, `Conseguiste la llave ${k.color}.`));
  });

  if (cfg.terminal) {
    pieces.push(terminal(cfg.terminal.x, cfg.terminal.y, cfg.id));
  }

  const paredesEscalada = cfg.paredesEscalada || [];
  paredesEscalada.forEach(w => {
    pieces.push(climbWall(w.x, w.y, w.w, w.h));
  });

  const entradas = {};
  puertas.forEach(p => {
    entradas[p.destino] = spawnNearDoor(p, width, height);
  });

  return {
    name: cfg.nombre,
    background: cfg.fondo,
    musica: cfg.musica,
    width,
    height,
    maze: pieces.join(''),
    entradas,
    playerStartDefault: { x: 60, y: height / 2 }
  };
}

const ROOMS = {
  tutorial: crearSala({
    id: 'tutorial',
    nombre: 'Tutorial',
    fondo: 'assets/fondos/Tutorial.png',
    musica: 'assets/audio/Shop.ogg',
    tamaño: [960, 540],
    puertas: [
      { lado: 'derecha', pos: 380,tamaño: [290, 20], destino: 'presentacion'}
    ]
  }),
  presentacion: crearSala({
    id: 'presentacion',
    nombre: 'presentación',
    fondo: 'assets/fondos/Presentacion.png',
    tamaño: [960, 540],
    terminal: { x: 144, y: 200 },
    puertas: [
      { lado: 'izquierda',pos: 380,tamaño: [290, 20], destino: 'tutorial', volver: true },
      { lado: 'derecha',pos: 380,tamaño: [290, 20], destino: 'home' }
    ]
  }),

  home: crearSala({
    id: 'home',
    nombre: 'Home',
    musica: 'assets/audio/Fireplace.ogg',
    fondo: 'assets/fondos/home.png',
    tamaño: [1000, 600],
    terminal: { x: 336, y: 208 },
    puertas: [
      { lado: 'izquierda', pos: 380,tamaño: [290, 20], destino: 'presentacion', volver: true },
      { lado: 'arriba', pos: 490,tamaño: [180, 290], destino: 'redroom' },
      { lado: 'derecha', pos: 320,tamaño: [190, 30], destino: 'proyectos', requiere: 'amarilla', mensaje: 'La puerta está cerrada. Necesitás la llave amarilla.' },
      { lado: 'abajo', pos: 500, tamaño: [250, 30], destino: 'habilidades', requiere: 'azul', mensaje: 'La puerta está cerrada. Necesitás la llave azul.' }
    ]
  }),

  redroom: crearSala({
    id: 'redroom',
    nombre: 'Red Room',
    fondo: 'assets/fondos/red_room.png',
    tamaño: [960, 2160],
    terminal: { x: 432, y: 216 },
    puertas: [
      { lado: 'abajo', pos: 340, destino: 'home', volver: true },
      
    ],
    paredesEscalada: [
      { x: 460, y: 900, w: 40, h: 600 }
    ]
  })
};

// funcion que seguro voy a reciclar

function preloadRoomBackgrounds() {
  Object.values(ROOMS).forEach(room => {
    const img = new Image();
    img.src = room.background;
  });
}
preloadRoomBackgrounds();


function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function elRect(el) {
  return {
    x: parseFloat(el.dataset.x),
    y: parseFloat(el.dataset.y),
    w: parseFloat(el.dataset.w),
    h: parseFloat(el.dataset.h)
  };
}

function applyPositions() {
  world.querySelectorAll('[data-x]').forEach(el => {
    el.style.left = el.dataset.x + 'px';
    el.style.top = el.dataset.y + 'px';
    el.style.width = el.dataset.w + 'px';
    el.style.height = el.dataset.h + 'px';
  });
}

function createPlayerEl() {
  playerEl = document.createElement('div');
  playerEl.className = 'player';
  playerEl.style.backgroundImage = `url(${PLAYER_SPRITE.src})`;

  const cols = Object.keys(PLAYER_SPRITE.columnas).length;
  const spriteW = PLAYER_SPRITE.frameWidth * PLAYER_SPRITE.escala;
  const spriteH = PLAYER_SPRITE.frameHeight * PLAYER_SPRITE.escala;
  const sheetW = PLAYER_SPRITE.frameWidth * cols * PLAYER_SPRITE.escala;
  const sheetH = PLAYER_SPRITE.frameHeight * PLAYER_SPRITE.frameCount * PLAYER_SPRITE.escala;

  playerEl.style.width = spriteW + 'px';
  playerEl.style.height = spriteH + 'px';
  playerEl.style.backgroundSize = `${sheetW}px ${sheetH}px`;

  world.appendChild(playerEl);
}

function renderPlayer() {
  const spriteW = PLAYER_SPRITE.frameWidth * PLAYER_SPRITE.escala;
  const spriteH = PLAYER_SPRITE.frameHeight * PLAYER_SPRITE.escala;
  const left = player.x + (player.w - spriteW) / 2 + PLAYER_SPRITE.offsetX;
  const top = player.y + (player.h - spriteH) + PLAYER_SPRITE.offsetY;
  playerEl.style.left = left + 'px';
  playerEl.style.top = top + 'px';
}

function directionFromInput(dx, dy) {
  if (dy < 0) return 'arriba';
  if (dy > 0) return 'abajo';
  if (dx < 0) return 'izquierda';
  if (dx > 0) return 'derecha';
  return player.dir;
}

function updatePlayerAnimation(dt, moving) {
  if (moving) {
    player.animTime += dt;
    if (player.animTime >= PLAYER_SPRITE.frameDuration) {
      player.animTime -= PLAYER_SPRITE.frameDuration;
      player.frame = (player.frame + 1) % PLAYER_SPRITE.frameCount;
    }
  } else {
    player.frame = 0;
    player.animTime = 0;
  }
  const col = PLAYER_SPRITE.columnas[player.dir];
  const offsetX = -col * PLAYER_SPRITE.frameWidth * PLAYER_SPRITE.escala;
  const offsetY = -player.frame * PLAYER_SPRITE.frameHeight * PLAYER_SPRITE.escala;
  playerEl.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateCamera() {
  const roomW = currentRoom.width;
  const roomH = currentRoom.height;

  const camX = roomW <= WORLD_W
    ? (roomW - WORLD_W) / 2
    : clamp(player.x + player.w / 2 - WORLD_W / 2, 0, roomW - WORLD_W);

  const camY = roomH <= WORLD_H
    ? (roomH - WORLD_H) / 2
    : clamp(player.y + player.h / 2 - WORLD_H / 2, 0, roomH - WORLD_H);

  world.style.transform = `translate(${-camX}px, ${-camY}px)`;
}

function transitionToRoom(id, fromRoomId) {
  if (transitioning) return;
  transitioning = true;
  roomTransition.classList.add('active');
  setTimeout(() => {
    loadRoom(id, fromRoomId);
    requestAnimationFrame(() => {
      roomTransition.classList.remove('active');
      setTimeout(() => { transitioning = false; }, TRANSITION_MS);
    });
  }, TRANSITION_MS);
}

function loadRoom(id, fromRoomId) {
  const room = ROOMS[id];
  currentRoomId = id;
  currentRoom = room;
  world.innerHTML = room.maze;
  world.style.width = room.width + 'px';
  world.style.height = room.height + 'px';
  world.style.backgroundImage = `url(${room.background})`;
  playTrack(room.musica);
  applyPositions();
  createPlayerEl();
  const spawn = (fromRoomId && room.entradas[fromRoomId]) || room.playerStartDefault;
  player.x = spawn.x;
  player.y = spawn.y;
  renderPlayer();
  updateCamera();
  attachRoomEvents();
}

function attachRoomEvents() {
  world.querySelectorAll('.terminal').forEach(term => {
    term.addEventListener('click', () => openModal(term.dataset.modal));
  });
}

function openModal(id) {
  document.getElementById('modal-' + id).classList.add('open');
  modalOpen = true;
}

function closeModals() {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  modalOpen = false;
}

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', closeModals);
});
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModals();
  });
});
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModals();
});

function updateInventoryHUD() {}

function startDialogue(lines) {
  dialogueQueue = [...lines];
  dialogueActive = true;
  dialogueBox.style.display = 'flex';
  advanceDialogue();
}

function advanceDialogue() {
  if (dialogueQueue.length === 0) {
    dialogueBox.style.display = 'none';
    dialogueActive = false;
    return;
  }
  const line = dialogueQueue.shift();
  typeLine(line);
}

function typeLine(line) {
  clearInterval(typeInterval);
  dialogueText.textContent = '';
  typing = true;
  let i = 0;
  typeInterval = setInterval(() => {
    dialogueText.textContent += line[i];
    i++;
    if (i >= line.length) {
      clearInterval(typeInterval);
      typing = false;
    }
  }, 22);
}

dialogueBox.addEventListener('click', () => {
  if (typing) {
    clearInterval(typeInterval);
    typing = false;
  } else {
    advanceDialogue();
  }
});

window.addEventListener('keydown', e => {
  pressedKeys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', e => {
  pressedKeys.delete(e.key.toLowerCase());
});

function tryMove(dx, dy) {
  const nextX = player.x + dx;
  const nextY = player.y + dy;
  const walls = world.querySelectorAll('.wall');

  const testX = { x: nextX, y: player.y, w: player.w, h: player.h };
  let blockedX = nextX < 0 || nextX + player.w > currentRoom.width;
  walls.forEach(w => { if (rectsOverlap(testX, elRect(w))) blockedX = true; });
  if (!blockedX) player.x = nextX;

  const testY = { x: player.x, y: nextY, w: player.w, h: player.h };
  let blockedY = nextY < 0 || nextY + player.h > currentRoom.height;
  walls.forEach(w => { if (rectsOverlap(testY, elRect(w))) blockedY = true; });
  if (!blockedY) player.y = nextY;
}

function checkInteractions() {
  const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h };

  world.querySelectorAll('.key-item').forEach(keyEl => {
    if (rectsOverlap(playerRect, elRect(keyEl))) {
      const keyName = keyEl.dataset.key;
      inventory.add(keyName);
      updateInventoryHUD();
      startDialogue([keyEl.dataset.msg]);
      keyEl.remove();
    }
  });

  world.querySelectorAll('.door').forEach(doorEl => {
    if (rectsOverlap(playerRect, elRect(doorEl))) {
      const requires = doorEl.dataset.requires;
      const target = doorEl.dataset.target;
      if (!requires || inventory.has(requires)) {
        transitionToRoom(target, currentRoomId);
      } else if (!dialogueActive) {
        startDialogue([doorEl.dataset.locked]);
      }
    }
  });

  let touchingClimbWall = false;
  world.querySelectorAll('.climb-wall').forEach(w => {
    if (rectsOverlap(playerRect, elRect(w))) touchingClimbWall = true;
  });
  setPlayerSpriteVariant(touchingClimbWall ? 'escalada' : 'normal');
}

let lastFrameTime = null;

function gameLoop(now) {
  const dt = lastFrameTime === null ? 16 : now - lastFrameTime;
  lastFrameTime = now;

  let moving = false;
  if (gameStarted && !dialogueActive && !modalOpen && !transitioning) {
    let dx = 0, dy = 0;
    if (pressedKeys.has('w')) dy -= player.speed;
    if (pressedKeys.has('s')) dy += player.speed;
    if (pressedKeys.has('a')) dx -= player.speed;
    if (pressedKeys.has('d')) dx += player.speed;
    moving = dx !== 0 || dy !== 0;
    if (moving) {
      player.dir = directionFromInput(dx, dy);
      tryMove(dx, dy);
      renderPlayer();
      updateCamera();
      checkInteractions();
    }
  }
  if (playerEl) updatePlayerAnimation(dt, moving);
  requestAnimationFrame(gameLoop);
}

function fitStage() {
  const scale = Math.min(window.innerWidth / WORLD_W, window.innerHeight / WORLD_H);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

window.addEventListener('resize', fitStage);

startBtn.addEventListener('click', () => {
  roomTransition.classList.add('active');
  setTimeout(() => {
    startScreen.style.display = 'none';
    app.classList.add('visible');
    gameStarted = true;
    fitStage();
    loadRoom(currentRoomId);
    updateInventoryHUD();
    requestAnimationFrame(() => {
      roomTransition.classList.remove('active');
    });
  }, TRANSITION_MS);
});

requestAnimationFrame(gameLoop);