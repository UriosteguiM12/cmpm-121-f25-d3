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
   TYPES & HELPERS
------------------------------------------------------ */
type GridCell = { i: number; j: number };
type Cache = { i: number; j: number; circle: leaflet.Circle };

// Returns a string key for Map
const keyOf = (i: number, j: number) => `${i},${j}`;

// Converts grid coordinates to LatLng
function cellToLatLng(cell: GridCell): leaflet.LatLng {
  return leaflet.latLng(
    cell.i * TILE_DEGREES + TILE_DEGREES / 2,
    cell.j * TILE_DEGREES + TILE_DEGREES / 2,
  );
}

// Converts LatLng to grid coordinates
function latLngToCell(latlng: leaflet.LatLng): GridCell {
  return {
    i: Math.floor(latlng.lat / TILE_DEGREES),
    j: Math.floor(latlng.lng / TILE_DEGREES),
  };
}

// Returns a coin value for a cache based on luck
function pickCacheValue(i: number, j: number): number {
  const raw = luck([i, j, "initialValue"].toString());
  const index = Math.floor(raw * 1_000_000) % COIN_VALUES.length;
  return COIN_VALUES[index];
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
statusPanelDiv.textContent = `You have: Coin of value ${playerHeldCoin}`;

const playerCell: GridCell = latLngToCell(CLASSROOM_LATLNG);
const playerMarker = leaflet.marker(CLASSROOM_LATLNG).bindTooltip("That's you!")
  .addTo(map);

function movePlayerByStep(dI: number, dJ: number) {
  playerCell.i += dI;
  playerCell.j += dJ;
  const newLatLng = cellToLatLng(playerCell);
  playerMarker.setLatLng(newLatLng);
  map.panTo(newLatLng);
  updateVisibleCaches();
}

// Wire movement buttons
document.getElementById("btn-up")!.addEventListener(
  "click",
  () => movePlayerByStep(1, 0),
);
document.getElementById("btn-down")!.addEventListener(
  "click",
  () => movePlayerByStep(-1, 0),
);
document.getElementById("btn-left")!.addEventListener(
  "click",
  () => movePlayerByStep(0, -1),
);
document.getElementById("btn-right")!.addEventListener(
  "click",
  () => movePlayerByStep(0, 1),
);

/* ------------------------------------------------------
   DATA STORES (Flyweight + Memento)
------------------------------------------------------ */
// Map of all cell values (Flyweight - generate on demand)
const cellValues: Map<string, number> = new Map();

// Map of modified cells (Memento - stores picked-up state)
const modifiedCacheState: Map<string, { pickedUp: boolean }> = new Map();

function getCellValue(i: number, j: number) {
  const key = keyOf(i, j);
  if (!cellValues.has(key)) {
    cellValues.set(key, pickCacheValue(i, j));
  }
  return cellValues.get(key)!;
}

/* ------------------------------------------------------
   CACHE POPUP LOGIC
------------------------------------------------------ */
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
    messageDiv.textContent = "You picked up the coin!";
  } else if (playerHeldCoin === currentValue) {
    playerHeldCoin *= 2;
    valueSpan.textContent = "0";
    modifiedCacheState.set(key, { pickedUp: true });
    cache.circle.setStyle({ fillColor: "#aaa", color: "gray" });
    messageDiv.textContent = playerHeldCoin === 256
      ? "You win!"
      : "You upgraded!";
  } else {
    messageDiv.textContent = "You can’t pick this up (value mismatch).";
  }

  statusPanelDiv.textContent = `You have: Coin of value ${playerHeldCoin}`;
  updateCircleTooltip(cache);
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

/* ------------------------------------------------------
   CACHE CREATION & TOOLTIP
------------------------------------------------------ */
function updateCircleTooltip(cache: Cache) {
  const key = keyOf(cache.i, cache.j);
  const pickedUp = modifiedCacheState.get(key)?.pickedUp ?? false;
  const value = pickedUp ? 0 : getCellValue(cache.i, cache.j);
  cache.circle.setTooltipContent(`${value}`);
}

function createCache(i: number, j: number): Cache {
  const center = cellToLatLng({ i, j });
  const circle = leaflet.circle(center, {
    radius: 5,
    color: "blue",
    fillColor: "#30f",
    fillOpacity: 0.5,
  }).addTo(map);
  const cache: Cache = { i, j, circle };
  bindCachePopup(cache);
  return cache;
}

/* ------------------------------------------------------
   UPDATE VISIBLE CACHES
------------------------------------------------------ */
let visibleCaches: Cache[] = [];

function updateVisibleCaches() {
  // Remove old visible caches
  for (const cache of visibleCaches) map.removeLayer(cache.circle);
  visibleCaches = [];

  const pi = playerCell.i;
  const pj = playerCell.j;
  const playerPos = playerMarker.getLatLng();

  for (let di = -NEIGHBORHOOD_SIZE; di <= NEIGHBORHOOD_SIZE; di++) {
    for (let dj = -NEIGHBORHOOD_SIZE; dj <= NEIGHBORHOOD_SIZE; dj++) {
      const i = pi + di;
      const j = pj + dj;

      // Flyweight: only spawn cell if luck allows
      if (luck([i, j, "initialValue"].toString()) >= CACHE_SPAWN_PROBABILITY) {
        continue;
      }

      const cache = createCache(i, j);
      const key = keyOf(i, j);
      const pickedUp = modifiedCacheState.get(key)?.pickedUp ?? false;

      if (pickedUp) {
        cache.circle.setStyle({ fillColor: "#aaa", color: "gray" });
      }

      const distance = playerPos.distanceTo(cellToLatLng({ i, j }));
      const inRange = distance <= PLAYER_RANGE_METERS;

      cache.circle.setStyle({
        interactive: inRange,
        fillOpacity: inRange ? 0.5 : 0.2,
        color: inRange ? "blue" : "gray",
        fillColor: inRange ? "#30f" : "#ccc",
      });

      updateCircleTooltip(cache);
      visibleCaches.push(cache);
    }
  }
}

/* ------------------------------------------------------
   MAP MOVEMENT EVENT
------------------------------------------------------ */
map.on("moveend", () => {
  const centerCell = latLngToCell(map.getCenter());
  const prevI = playerCell.i;
  const prevJ = playerCell.j;

  playerCell.i = centerCell.i;
  playerCell.j = centerCell.j;

  updateVisibleCaches();

  playerCell.i = prevI;
  playerCell.j = prevJ;
});

/* ------------------------------------------------------
   INITIAL SPAWN
------------------------------------------------------ */
updateVisibleCaches();
