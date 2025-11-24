import leaflet from "leaflet";

// Styles
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./_leafletWorkaround.ts"; // fix missing marker images

// Luck function
import luck from "./_luck.ts";

/* ------------------------------------------------------
   CONSTANTS
------------------------------------------------------ */
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 22;
const CACHE_SPAWN_PROBABILITY = 0.1;
const PLAYER_RANGE_METERS = 30;
const COIN_VALUES = [1, 2, 4, 8, 16, 32, 64, 128];

/* ------------------------------------------------------
   TYPES
------------------------------------------------------ */
type GridCell = { i: number; j: number };
type Cache = {
  i: number;
  j: number;
  circle: leaflet.Circle;
  valueMarker?: leaflet.Marker;
};

/* ------------------------------------------------------
   HELPERS
------------------------------------------------------ */
const keyOf = (i: number, j: number) => `${i},${j}`;
const cellToLatLng = ({ i, j }: GridCell) =>
  leaflet.latLng(
    i * TILE_DEGREES + TILE_DEGREES / 2,
    j * TILE_DEGREES + TILE_DEGREES / 2,
  );
const latLngToCell = (latlng: leaflet.LatLng) => ({
  i: Math.floor(latlng.lat / TILE_DEGREES),
  j: Math.floor(latlng.lng / TILE_DEGREES),
});
const shouldSpawnCache = (i: number, j: number) =>
  luck([i, j, "initialValue"].toString()) < CACHE_SPAWN_PROBABILITY;
function pickCacheValue(i: number, j: number): number {
  const raw = luck([i, j, "initialValue"].toString());
  return COIN_VALUES[Math.floor(raw * 1_000_000) % COIN_VALUES.length];
}

/* ------------------------------------------------------
   DATA STORES
------------------------------------------------------ */
const cellValues: Map<string, number> = new Map();
const modifiedCacheState: Map<string, { pickedUp: boolean }> = new Map();
function getCellValue(i: number, j: number) {
  const key = keyOf(i, j);
  if (!cellValues.has(key)) cellValues.set(key, pickCacheValue(i, j));
  return cellValues.get(key)!;
}

/* ------------------------------------------------------
   LOCAL STORAGE FUNCTIONS
------------------------------------------------------ */
function saveGameState() {
  const state = {
    playerCell,
    playerHeldCoin,
    modifiedCacheState: Array.from(modifiedCacheState.entries()),
  };
  localStorage.setItem("gameState", JSON.stringify(state));
}

function loadGameState() {
  const saved = localStorage.getItem("gameState");
  if (!saved) return;
  try {
    const state = JSON.parse(saved);
    playerCell.i = state.playerCell.i;
    playerCell.j = state.playerCell.j;
    playerHeldCoin = state.playerHeldCoin;
    modifiedCacheState.clear();
    state.modifiedCacheState.forEach(
      ([key, value]: [string, { pickedUp: boolean }]) =>
        modifiedCacheState.set(key, value)
    );
  } catch (err) {
    console.error("Failed to load game state:", err);
  }
}

/* ------------------------------------------------------
   UI SETUP
------------------------------------------------------ */
function createPanel(id: string, parent: HTMLElement = document.body) {
  const div = document.createElement("div");
  div.id = id;
  parent.append(div);
  return div;
}

const mapDiv = createPanel("map");
const statusPanelDiv = createPanel("statusPanel");

const controlsDiv = document.createElement("div");
controlsDiv.id = "movementControls";
document.body.appendChild(controlsDiv);

controlsDiv.innerHTML = `
  <button class="arrow-btn" id="btn-up">▲</button>
  <div class="middle-row">
    <button class="arrow-btn" id="btn-left">◀</button>
    <button class="arrow-btn" id="btn-right">▶</button>
  </div>
  <button class="arrow-btn" id="btn-down">▼</button>
`;

const geoBtn = document.createElement("button");
geoBtn.id = "geo-btn";
geoBtn.textContent = "Enable Geolocation Movement";
document.body.appendChild(geoBtn);

/* ------------------------------------------------------
   MAP INITIALIZATION
------------------------------------------------------ */
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer(
    "https://tile.thunderforest.com/pioneer/{z}/{x}/{y}.png?apikey=3571fe386fc0421aad3eb2983e8ff8b3",
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="http://www.thunderforest.com/">Thunderforest</a>, ' +
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  )
  .addTo(map);

/* ------------------------------------------------------
   PLAYER SETUP
------------------------------------------------------ */
let playerHeldCoin: number | null = 1;
const playerCell: GridCell = latLngToCell(CLASSROOM_LATLNG);
const playerMarker = leaflet.marker(CLASSROOM_LATLNG).bindTooltip("That's you!").addTo(map);

function updateStatus() {
  statusPanelDiv.textContent = `You have: Coin of value ${playerHeldCoin}`;
}

/* ------------------------------------------------------
   MOVEMENT INTERFACE & FACADE
------------------------------------------------------ */
interface PlayerMovement {
  moveBy(dI: number, dJ: number): void;
  moveToLatLng(pos: leaflet.LatLng): void;
}

class GridPlayerMovement implements PlayerMovement {
  constructor(
    private playerCell: GridCell,
    private playerMarker: leaflet.Marker,
    private map: leaflet.Map,
  ) {}
  moveBy(dI: number, dJ: number) {
    this.playerCell.i += dI;
    this.playerCell.j += dJ;
    const newLatLng = cellToLatLng(this.playerCell);
    this.playerMarker.setLatLng(newLatLng);
    this.map.panTo(newLatLng);
    updateVisibleCaches();
    saveGameState();
  }
  moveToLatLng(pos: leaflet.LatLng) {
    const { i, j } = latLngToCell(pos);
    this.playerCell.i = i;
    this.playerCell.j = j;
    this.playerMarker.setLatLng(pos);
    this.map.panTo(pos);
    updateVisibleCaches();
    saveGameState();
  }
}

// Facade
class MovementFacade implements PlayerMovement {
  private currentMovement: PlayerMovement;
  constructor(initial: PlayerMovement) {
    this.currentMovement = initial;
  }
  moveBy(dI: number, dJ: number) {
    this.currentMovement.moveBy(dI, dJ);
  }
  moveToLatLng(pos: leaflet.LatLng) {
    this.currentMovement.moveToLatLng(pos);
  }
  setMovementStrategy(newMovement: PlayerMovement) {
    this.currentMovement = newMovement;
  }
}

const gridMovement = new GridPlayerMovement(playerCell, playerMarker, map);
const movementFacade = new MovementFacade(gridMovement);

/* ------------------------------------------------------
   WIRE CONTROLS
------------------------------------------------------ */
["up", "down", "left", "right"].forEach((dir) => {
  const btn = document.getElementById(`btn-${dir}`)!;
  const moves: Record<string, [number, number]> = {
    up: [1, 0],
    down: [-1, 0],
    left: [0, -1],
    right: [0, 1],
  };
  btn.addEventListener("click", () => movementFacade.moveBy(...moves[dir]));
});

geoBtn.addEventListener("click", () => {
  enableGeolocationMovement();
  alert("Geolocation movement enabled!");
});

/* ------------------------------------------------------
   GEOLOCATION MOVEMENT
------------------------------------------------------ */
function enableGeolocationMovement() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported by this browser.");
    return;
  }

  const geoMovement: PlayerMovement = {
    moveBy: (_dI, _dJ) => console.warn("Cannot use moveBy in geolocation mode"),
    moveToLatLng: (pos) => movementFacade.moveToLatLng(pos),
  };

  movementFacade.setMovementStrategy(geoMovement);

  navigator.geolocation.watchPosition(
    (pos) => movementFacade.moveToLatLng(
      leaflet.latLng(pos.coords.latitude, pos.coords.longitude)
    ),
    (err) => console.error("Geolocation error:", err),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 },
  );
}

/* ------------------------------------------------------
   CACHE LOGIC
------------------------------------------------------ */
function setCircleStyle(cache: Cache, inRange: boolean, pickedUp: boolean) {
  cache.circle.setStyle({
    fillOpacity: inRange ? 0.5 : 0.2,
    color: pickedUp ? "gray" : inRange ? "blue" : "gray",
    fillColor: pickedUp ? "#aaa" : inRange ? "#30f" : "#ccc",
  });
}

function updateCircleTooltip(cache: Cache) {
  const key = keyOf(cache.i, cache.j);
  const pickedUp = modifiedCacheState.get(key)?.pickedUp ?? false;
  const value = pickedUp ? 0 : getCellValue(cache.i, cache.j);
  cache.circle.setTooltipContent(`${value}`);
  if (cache.valueMarker) {
    cache.valueMarker.setIcon(
      leaflet.divIcon({ className: "cell-value-icon", html: `<div>${value}</div>`, iconSize: [20, 20] }),
    );
  }
}

function renderCachePopup(cache: Cache, pickedUp: boolean) {
  const popupDiv = document.createElement("div");
  const value = pickedUp ? 0 : getCellValue(cache.i, cache.j);
  popupDiv.innerHTML = `
    <div>Cache at "${cache.i},${cache.j}" — value: <span id="value">${value}</span></div>
    <button id="pickup">Pick up</button>
    <div id="message"></div>
  `;
  return popupDiv;
}

function handleCachePickup(cache: Cache, popupDiv: HTMLElement) {
  const key = keyOf(cache.i, cache.j);
  const pickedUp = modifiedCacheState.get(key)?.pickedUp ?? false;
  const currentValue = pickedUp ? 0 : getCellValue(cache.i, cache.j);
  const messageDiv = popupDiv.querySelector<HTMLDivElement>("#message")!;
  const valueSpan = popupDiv.querySelector<HTMLSpanElement>("#value")!;

  if (playerHeldCoin === null) {
    playerHeldCoin = currentValue;
    valueSpan.textContent = "0";
    modifiedCacheState.set(key, { pickedUp: true });
    cache.circle.setStyle({ fillColor: "#aaa", color: "gray" });
    messageDiv.textContent = "";
  } else if (playerHeldCoin === currentValue) {
    playerHeldCoin *= 2;
    valueSpan.textContent = "0";
    modifiedCacheState.set(key, { pickedUp: true });
    cache.circle.setStyle({ fillColor: "#aaa", color: "gray" });
    messageDiv.textContent = "";
    if (playerHeldCoin === 256) alert("🎉 You win! 🎉");
  } else {
    messageDiv.textContent = "Coin doesn't match value";
  }

  updateStatus();
  updateCircleTooltip(cache);
  saveGameState();
}

function bindCachePopup(cache: Cache) {
  cache.circle.bindPopup(() => {
    const key = keyOf(cache.i, cache.j);
    const pickedUp = modifiedCacheState.get(key)?.pickedUp ?? false;
    const popupDiv = renderCachePopup(cache, pickedUp);
    popupDiv.querySelector("#pickup")!.addEventListener(
      "click",
      () => handleCachePickup(cache, popupDiv),
    );
    return popupDiv;
  });
}

function createCache(i: number, j: number): Cache {
  const center = cellToLatLng({ i, j });
  const circle = leaflet.circle(center, {
    radius: 5,
    color: "blue",
    fillColor: "#30f",
    fillOpacity: 0.5,
  }).addTo(map);
  const valueMarker = leaflet.marker(center, {
    icon: leaflet.divIcon({
      className: "cell-value-icon",
      html: `<div>${getCellValue(i, j)}</div>`,
      iconSize: [20, 20],
    }),
    interactive: false,
  }).addTo(map);
  const cache: Cache = { i, j, circle, valueMarker };
  bindCachePopup(cache);
  return cache;
}

/* ------------------------------------------------------
   VISIBLE CACHES
------------------------------------------------------ */
let visibleCaches: Cache[] = [];
function updateVisibleCaches() {
  visibleCaches.forEach((c) => {
    map.removeLayer(c.circle);
    if (c.valueMarker) map.removeLayer(c.valueMarker);
  });
  visibleCaches = [];

  const pi = playerCell.i, pj = playerCell.j;
  const playerPos = playerMarker.getLatLng();

  for (let di = -NEIGHBORHOOD_SIZE; di <= NEIGHBORHOOD_SIZE; di++) {
    for (let dj = -NEIGHBORHOOD_SIZE; dj <= NEIGHBORHOOD_SIZE; dj++) {
      const i = pi + di, j = pj + dj;
      if (!shouldSpawnCache(i, j)) continue;

      const cache = createCache(i, j);
      const key = keyOf(i, j);
      const pickedUp = modifiedCacheState.get(key)?.pickedUp ?? false;

      const distance = playerPos.distanceTo(cellToLatLng({ i, j }));
      const inRange = distance <= PLAYER_RANGE_METERS;

      setCircleStyle(cache, inRange, pickedUp);

      if (inRange) bindCachePopup(cache);
      else cache.circle.unbindPopup();

      if (cache.valueMarker) updateCircleTooltip(cache);

      visibleCaches.push(cache);
    }
  }
}

/* ------------------------------------------------------
   MAP MOVE EVENT
------------------------------------------------------ */
map.on("moveend", () => {
  const centerCell = latLngToCell(map.getCenter());
  const prevI = playerCell.i, prevJ = playerCell.j;

  playerCell.i = centerCell.i;
  playerCell.j = centerCell.j;
  updateVisibleCaches();

  playerCell.i = prevI;
  playerCell.j = prevJ;
});

/* ------------------------------------------------------
   INITIAL SPAWN
------------------------------------------------------ */
loadGameState();      // <- restore game state
updateStatus();
updateVisibleCaches();
