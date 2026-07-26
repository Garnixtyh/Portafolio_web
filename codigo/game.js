const WORLD_W = 960;
const WORLD_H = 540;
const TILE = 8;
const THICK = 14;
const DOOR_SPAN = 100;
const DOOR_THICK = 20;

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const app = document.getElementById('app');
const stage = document.getElementById('stage');
const viewport = document.getElementById('viewport');
const world = document.getElementById('world');
const dialogueBox = document.getElementById('dialogue-box');
const dialogueText = document.getElementById('dialogue-text');
const roomTransition = document.getElementById('room-transition');

const inventory = new Set();
const pressedKeys = new Set();
let dialogueQueue = [];
let dialogueActive = false;
let typing = false;
let typeInterval = null;
let modalOpen = false;
let gameStarted = false;
let transitioning = false;

let currentRoomId = 'presentacion';
let currentRoom = null;
let player = { x: 60, y: 270, w: 40, h: 40, speed: 4.5 };
let playerEl = null;

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

function sideWalls(lado, width, height, doorDef) {
  if (lado === 'arriba' || lado === 'abajo') {
    const y = lado === 'arriba' ? 0 : height - THICK;
    if (!doorDef) return [wall(0, y, width, THICK)];
    const center = doorDef.pos * TILE;
    const gapStart = Math.max(0, center - DOOR_SPAN / 2);
    const gapEnd = Math.min(width, center + DOOR_SPAN / 2);
    const segs = [];
    if (gapStart > 0) segs.push(wall(0, y, gapStart, THICK));
    if (gapEnd < width) segs.push(wall(gapEnd, y, width - gapEnd, THICK));
    return segs;
  } else {
    const x = lado === 'izquierda' ? 0 : width - THICK;
    if (!doorDef) return [wall(x, 0, THICK, height)];
    const center = doorDef.pos * TILE;
    const gapStart = Math.max(0, center - DOOR_SPAN / 2);
    const gapEnd = Math.min(height, center + DOOR_SPAN / 2);
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
  const center = p.pos * TILE;
  const cls = p.volver ? 'back-door' : doorColorClass(p.requiere);
  const label = p.volver ? '‹' : (p.requiere ? '' : '›');
  const requiere = p.requiere || '';
  const mensaje = p.mensaje || '';
  if (p.lado === 'izquierda') return door(cls, 0, center - DOOR_SPAN / 2, DOOR_THICK, DOOR_SPAN, p.destino, requiere, mensaje, label);
  if (p.lado === 'derecha') return door(cls, width - DOOR_THICK, center - DOOR_SPAN / 2, DOOR_THICK, DOOR_SPAN, p.destino, requiere, mensaje, label);
  if (p.lado === 'arriba') return door(cls, center - DOOR_SPAN / 2, 0, DOOR_SPAN, DOOR_THICK, p.destino, requiere, mensaje, label);
  return door(cls, center - DOOR_SPAN / 2, height - DOOR_THICK, DOOR_SPAN, DOOR_THICK, p.destino, requiere, mensaje, label);
}

function crearSala(cfg) {
  const [tilesX, tilesY] = cfg.tamaño;
  const width = tilesX * TILE;
  const height = tilesY * TILE;
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
    pieces.push(keyItem(k.color, k.x * TILE, k.y * TILE, `Conseguiste la llave ${k.color}.`));
  });

  if (cfg.terminal) {
    pieces.push(terminal(cfg.terminal.x * TILE, cfg.terminal.y * TILE, cfg.id));
  }

  return {
    name: cfg.nombre,
    background: cfg.fondo,
    width,
    height,
    maze: pieces.join(''),
    playerStart: { x: 60, y: height / 2 },
    playerStartBack: { x: width - 140, y: Math.min(height - 60, height / 2 + 80) }
  };
}

const ROOMS = {
  presentacion: crearSala({
    id: 'presentacion',
    nombre: 'Tutorial',
    fondo: 'assets/bg-presentacion.png',
    tamaño: [120, 90],
    terminal: { x: 18, y: 25 },
    llave: { x: 52, y: 40, color: 'roja' },
    puertas: [
      { lado: 'derecha', pos: 45, destino: 'cv', requiere: 'roja', mensaje: 'La puerta está cerrada. Necesitás la llave roja.' }
    ]
  }),
  cv: crearSala({
    id: 'cv',
    nombre: 'Currículum',
    fondo: 'assets/bg-cv.png',
    tamaño: [150, 68],
    terminal: { x: 30, y: 23 },
    llave: { x: 65, y: 41, color: 'azul' },
    puertas: [
      { lado: 'izquierda', pos: 34, destino: 'presentacion', volver: true },
      { lado: 'derecha', pos: 34, destino: 'proyectos', requiere: 'azul', mensaje: 'Necesitás la llave azul para entrar a Proyectos.' }
    ]
  }),
  proyectos: crearSala({
    id: 'proyectos',
    nombre: 'Proyectos',
    fondo: 'assets/bg-proyectos.png',
    tamaño: [100, 80],
    terminal: { x: 42, y: 26 },
    puertas: [
      { lado: 'izquierda', pos: 40, destino: 'cv', volver: true },
      { lado: 'derecha', pos: 40, destino: 'contacto' }
    ]
  }),
  contacto: crearSala({
    id: 'contacto',
    nombre: 'Contacto',
    fondo: 'assets/bg-contacto.png',
    tamaño: [80, 60],
    terminal: { x: 54, y: 27 },
    puertas: [
      { lado: 'izquierda', pos: 30, destino: 'proyectos', volver: true }
    ]
  })
};

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
  playerEl.style.width = player.w + 'px';
  playerEl.style.height = player.h + 'px';
  world.appendChild(playerEl);
}

function renderPlayer() {
  playerEl.style.left = player.x + 'px';
  playerEl.style.top = player.y + 'px';
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

function transitionToRoom(id, entry) {
  if (transitioning) return;
  transitioning = true;
  roomTransition.classList.add('active');
  setTimeout(() => {
    loadRoom(id, entry);
    requestAnimationFrame(() => {
      roomTransition.classList.remove('active');
      setTimeout(() => { transitioning = false; }, 200);
    });
  }, 200);
}

function loadRoom(id, entry = 'playerStart') {
  const room = ROOMS[id];
  currentRoomId = id;
  currentRoom = room;
  world.innerHTML = room.maze;
  world.style.width = room.width + 'px';
  world.style.height = room.height + 'px';
  world.style.backgroundImage = `url(${room.background})`;
  applyPositions();
  createPlayerEl();
  const spawn = room[entry] || room.playerStart;
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
      const entry = doorEl.classList.contains('back-door') ? 'playerStartBack' : 'playerStart';
      if (!requires || inventory.has(requires)) {
        transitionToRoom(target, entry);
      } else if (!dialogueActive) {
        startDialogue([doorEl.dataset.locked]);
      }
    }
  });
}

function gameLoop() {
  if (gameStarted && !dialogueActive && !modalOpen && !transitioning) {
    let dx = 0, dy = 0;
    if (pressedKeys.has('w')) dy -= player.speed;
    if (pressedKeys.has('s')) dy += player.speed;
    if (pressedKeys.has('a')) dx -= player.speed;
    if (pressedKeys.has('d')) dx += player.speed;
    if (dx !== 0 || dy !== 0) {
      tryMove(dx, dy);
      renderPlayer();
      updateCamera();
      checkInteractions();
    }
  }
  requestAnimationFrame(gameLoop);
}

function fitStage() {
  const scale = Math.min(window.innerWidth / WORLD_W, window.innerHeight / WORLD_H);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

window.addEventListener('resize', fitStage);

startBtn.addEventListener('click', () => {
  startScreen.style.display = 'none';
  app.classList.add('visible');
  gameStarted = true;
  fitStage();
  loadRoom(currentRoomId);
  updateInventoryHUD();
});

requestAnimationFrame(gameLoop);
