import leaflet from "leaflet";

// ------------------------
// Styles
// ------------------------
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./_leafletWorkaround.ts"; // Fix missing Leaflet marker images

// ------------------------
// Luck function
// ------------------------
import luck from "./_luck.ts";

/* ------------------------------------------------------
   CONSTANTS
------------------------------------------------------ */
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
); // Reference location (classroom)
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const CACHE_SPAWN_PROBABILITY = 0.1;
const PLAYER_RANGE_METERS = 30;
const COIN_VALUES = [1, 2, 4, 8, 16, 32, 64, 128];

/* ------------------------------------------------------
   TYPES
------------------------------------------------------ */
type GridCell = { i: number; j: number }; // Represents a cell in the grid
type Cache = {
  i: number;
  j: number;
  circle: leaflet.Circle; // Circle marker for cache
  valueMarker?: leaflet.Marker; // Optional coin value display
};

/* ------------------------------------------------------
   HELPERS
------------------------------------------------------ */
// Generate a unique key for a cell
const keyOf = (i: number, j: number) => `${i},${j}`;

// Convert grid coordinates to lat/lng
const cellToLatLng = ({ i, j }: GridCell) =>
  leaflet.latLng(
    i * TILE_DEGREES + TILE_DEGREES / 2,
    j * TILE_DEGREES + TILE_DEGREES / 2,
  );

// Convert lat/lng to grid coordinates
const latLngToCell = (latlng: leaflet.LatLng) => ({
  i: Math.floor(latlng.lat / TILE_DEGREES),
  j: Math.floor(latlng.lng / TILE_DEGREES),
});

// Decide if a cache should spawn in a cell
const shouldSpawnCache = (i: number, j: number) =>
  luck([i, j, "initialValue"].toString()) < CACHE_SPAWN_PROBABILITY;

// Pick a consistent cache value using luck function
function pickCacheValue(i: number, j: number): number {
  const raw = luck([i, j, "initialValue"].toString());
  return COIN_VALUES[Math.floor(raw * 1_000_000) % COIN_VALUES.length];
}

/* ------------------------------------------------------
   DATA STORES
------------------------------------------------------ */
const cellValues: Map<string, number> = new Map(); // Stores initial coin values
const modifiedCacheState: Map<string, { pickedUp: boolean }> = new Map(); // Tracks picked-up caches

// Get or initialize a cell's coin value
function getCellValue(i: number, j: number) {
  const key = keyOf(i, j);
  if (!cellValues.has(key)) cellValues.set(key, pickCacheValue(i, j));
  return cellValues.get(key)!;
}

/* ------------------------------------------------------
   LOCAL STORAGE
------------------------------------------------------ */
// Save game state to localStorage
function saveGameState() {
  const state = {
    playerCell,
    playerHeldCoin,
    modifiedCacheState: Array.from(modifiedCacheState.entries()),
  };
  localStorage.setItem("gameState", JSON.stringify(state));
}

// Load game state from localStorage
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
        modifiedCacheState.set(key, value),
    );
  } catch (err) {
    console.error("Failed to load game state:", err);
  }
}

/* ------------------------------------------------------
   UI SETUP
------------------------------------------------------ */
// Utility function to create div panels
function createPanel(id: string, parent: HTMLElement = document.body) {
  const div = document.createElement("div");
  div.id = id;
  parent.append(div);
  return div;
}

// Create map and status panel
const mapDiv = createPanel("map");
const statusPanelDiv = createPanel("statusPanel");

// Create arrow button container
const controlsDiv = document.createElement("div");
controlsDiv.id = "movementControls";
document.body.appendChild(controlsDiv);

// Add arrow buttons
controlsDiv.innerHTML = `
<button class="arrow-btn" id="btn-up">▲</button>
<button class="arrow-btn" id="btn-left">◀</button>
<button class="arrow-btn" id="btn-right">▶</button>
<button class="arrow-btn" id="btn-down">▼</button>
`;

// Create geolocation toggle button
const geoBtn = document.createElement("button");
geoBtn.id = "geo-btn";
geoBtn.textContent = "Enable Geolocation Movement";
document.body.appendChild(geoBtn);

// Create new game button
const newGameBtn = document.createElement("button");
newGameBtn.id = "new-game-btn";
newGameBtn.textContent = "Start New Game";
geoBtn.insertAdjacentElement("afterend", newGameBtn);

/* ------------------------------------------------------
   MAP INITIALIZATION
------------------------------------------------------ */
// Initialize map
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Load tile layer
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
let playerHeldCoin: number | null = 1; // Player starts with a coin
const playerCell: GridCell = latLngToCell(CLASSROOM_LATLNG); // Start at classroom
const playerMarker = leaflet
  .marker(CLASSROOM_LATLNG)
  .bindTooltip("That's you!")
  .addTo(map);

// Update status panel with coin value
function updateStatus() {
  statusPanelDiv.textContent = `You have: Coin of value ${playerHeldCoin}`;
}

/* ------------------------------------------------------
   PLAYER MOVEMENT
------------------------------------------------------ */
// Interface for movement strategy
interface PlayerMovement {
  moveBy(dI: number, dJ: number): void;
  moveToLatLng(pos: leaflet.LatLng): void;
}

// Grid-based movement (arrow buttons)
class GridPlayerMovement implements PlayerMovement {
  constructor(
    private playerCell: GridCell,
    private playerMarker: leaflet.Marker,
    private map: leaflet.Map,
  ) {}

  // Move by relative grid coordinates
  moveBy(dI: number, dJ: number) {
    this.playerCell.i += dI;
    this.playerCell.j += dJ;

    const newLatLng = cellToLatLng(this.playerCell);
    this.playerMarker.setLatLng(newLatLng);

    // Center map on player
    this.map.panTo(newLatLng);

    updateVisibleCaches();
    saveGameState();
  }

  // Move to specific lat/lng
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

// Facade for switching between movement strategies
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

// Initialize movement
const gridMovement = new GridPlayerMovement(playerCell, playerMarker, map);
const movementFacade = new MovementFacade(gridMovement);

/* ------------------------------------------------------
   CONTROL WIRING
------------------------------------------------------ */
// Wire arrow buttons to movement
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

/* ------------------------------------------------------
   GEOLOCATION
------------------------------------------------------ */
let geoWatchId: number | null = null; // ID for watchPosition
let geoEnabled = false; // Track geolocation toggle

// Toggle geolocation movement on button click
geoBtn.addEventListener("click", () => {
  if (!geoEnabled) {
    enableGeolocationMovement();
    geoBtn.textContent = "Disable Geolocation Movement";
    controlsDiv.style.display = "none"; // hide arrow buttons
  } else {
    disableGeolocationMovement();
    geoBtn.textContent = "Enable Geolocation Movement";
    controlsDiv.style.display = "grid"; // show arrow buttons
  }
  geoEnabled = !geoEnabled;
});

// Enable geolocation movement
function enableGeolocationMovement() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported by this browser.");
    return;
  }

  // Strategy for geolocation movement
  const geoMovement: PlayerMovement = {
    moveBy: (_dI, _dJ) => console.warn("Cannot use moveBy in geolocation mode"),
    moveToLatLng: (pos) => gridMovement.moveToLatLng(pos),
  };

  movementFacade.setMovementStrategy(geoMovement);

  geoWatchId = navigator.geolocation.watchPosition(
    (pos) =>
      geoMovement.moveToLatLng(
        leaflet.latLng(pos.coords.latitude, pos.coords.longitude),
      ),
    (err) => console.error("Geolocation error:", err),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 },
  );
}

// Disable geolocation movement
function disableGeolocationMovement() {
  if (geoWatchId !== null) {
    navigator.geolocation.clearWatch(geoWatchId);
    geoWatchId = null;
  }
  movementFacade.setMovementStrategy(gridMovement);
}

/* ------------------------------------------------------
   NEW GAME
------------------------------------------------------ */
// Start new game on button click
newGameBtn.addEventListener("click", () => {
  startNewGame();
  alert("New game started!");
});

// Reset player and caches for new game
function startNewGame() {
  playerCell.i = latLngToCell(CLASSROOM_LATLNG).i;
  playerCell.j = latLngToCell(CLASSROOM_LATLNG).j;
  playerMarker.setLatLng(CLASSROOM_LATLNG);

  map.panTo(CLASSROOM_LATLNG);

  playerHeldCoin = 1;
  modifiedCacheState.clear();
  localStorage.removeItem("gameState");

  updateStatus();
  updateVisibleCaches();
}

/* ------------------------------------------------------
   CACHE LOGIC
------------------------------------------------------ */
// Style a cache circle depending on player range and pickup state
function setCircleStyle(cache: Cache, inRange: boolean, pickedUp: boolean) {
  cache.circle.setStyle({
    fillOpacity: inRange ? 0.5 : 0.2,
    color: pickedUp ? "gray" : inRange ? "blue" : "gray",
    fillColor: pickedUp ? "#aaa" : inRange ? "#30f" : "#ccc",
  });
}

// Update tooltip value for a cache
function updateCircleTooltip(cache: Cache) {
  const key = keyOf(cache.i, cache.j);
  const pickedUp = modifiedCacheState.get(key)?.pickedUp ?? false;
  const value = pickedUp ? 0 : getCellValue(cache.i, cache.j);
  cache.circle.setTooltipContent(`${value}`);
  if (cache.valueMarker) {
    cache.valueMarker.setIcon(
      leaflet.divIcon({
        className: "cell-value-icon",
        html: `<div>${value}</div>`,
        iconSize: [20, 20],
      }),
    );
  }
}

// Render popup UI for cache
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

// Handle picking up a cache
function handleCachePickup(cache: Cache, popupDiv: HTMLElement) {
  const key = keyOf(cache.i, cache.j);
  const pickedUp = modifiedCacheState.get(key)?.pickedUp ?? false;
  const currentValue = pickedUp ? 0 : getCellValue(cache.i, cache.j);
  const messageDiv = popupDiv.querySelector<HTMLDivElement>("#message")!;
  const valueSpan = popupDiv.querySelector<HTMLSpanElement>("#value")!;

  if (playerHeldCoin === null) {
    // Pick up first coin
    playerHeldCoin = currentValue;
    valueSpan.textContent = "0";
    modifiedCacheState.set(key, { pickedUp: true });
    cache.circle.setStyle({ fillColor: "#aaa", color: "gray" });
    messageDiv.textContent = "";
  } else if (playerHeldCoin === currentValue) {
    // Combine coin if equal
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

// Bind popup to a cache
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

function bindCacheTap(cache: Cache) {
  cache.circle.on("click", () => {
    const playerPos = playerMarker.getLatLng();
    const cachePos = cellToLatLng({ i: cache.i, j: cache.j });
    const distance = playerPos.distanceTo(cachePos);

    if (distance > PLAYER_RANGE_METERS) {
      alert("You are too far away to open this cache.");
      return;
    }

    const key = keyOf(cache.i, cache.j);
    const pickedUp = modifiedCacheState.get(key)?.pickedUp ?? false;

    // Render popup for this cache
    const popupDiv = renderCachePopup(cache, pickedUp);

    // Bind pickup button inside the popup
    popupDiv.querySelector("#pickup")!.addEventListener(
      "click",
      () => handleCachePickup(cache, popupDiv),
    );

    // Open a Leaflet popup at the cache's location
    cache.circle.bindPopup(popupDiv).openPopup();
  });
}

// Create a new cache at a cell
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
  bindCacheTap(cache);
  return cache;
}

/* ------------------------------------------------------
   VISIBLE CACHES DYNAMIC SPAWN
------------------------------------------------------ */
let visibleCaches: Map<string, Cache> = new Map(); // Track caches currently on map

// Update visible caches dynamically as map moves
function updateVisibleCaches() {
  const bounds = map.getBounds();
  const northWest = latLngToCell(bounds.getNorthWest());
  const southEast = latLngToCell(bounds.getSouthEast());

  const newVisible: Map<string, Cache> = new Map();

  // Loop through cells in bounds
  for (let i = southEast.i - 1; i <= northWest.i + 1; i++) {
    for (let j = northWest.j - 1; j <= southEast.j + 1; j++) {
      if (!shouldSpawnCache(i, j)) continue;
      const key = keyOf(i, j);

      let cache: Cache;
      if (visibleCaches.has(key)) {
        cache = visibleCaches.get(key)!;
      } else {
        cache = createCache(i, j);
      }

      const playerPos = playerMarker.getLatLng();
      const distance = playerPos.distanceTo(cellToLatLng({ i, j }));
      const inRange = distance <= PLAYER_RANGE_METERS;
      const pickedUp = modifiedCacheState.get(key)?.pickedUp ?? false;

      setCircleStyle(cache, inRange, pickedUp);
      if (inRange) bindCachePopup(cache);
      else cache.circle.unbindPopup();

      updateCircleTooltip(cache);
      newVisible.set(key, cache);
    }
  }

  // Remove caches no longer in view
  visibleCaches.forEach((c, key) => {
    if (!newVisible.has(key)) {
      map.removeLayer(c.circle);
      if (c.valueMarker) map.removeLayer(c.valueMarker);
    }
  });

  visibleCaches = newVisible;
}

// Update caches when map is dragged
map.on("move", updateVisibleCaches);

/* ------------------------------------------------------
   INITIAL SPAWN
------------------------------------------------------ */
loadGameState(); // Load previous game if available
updateStatus(); // Show player coin
updateVisibleCaches(); // Spawn visible caches
