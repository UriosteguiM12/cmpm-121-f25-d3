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

/**
 * Generates a string key from grid coordinates for use in Maps.
 */
const keyOf = (i: number, j: number) => `${i},${j}`;

/**
 * Converts a GridCell {i, j} to a Leaflet LatLng.
 */
const cellToLatLng = ({ i, j }: GridCell) =>
  leaflet.latLng(
    i * TILE_DEGREES + TILE_DEGREES / 2,
    j * TILE_DEGREES + TILE_DEGREES / 2,
  );

/**
 * Converts a Leaflet LatLng to grid coordinates {i, j}.
 */
const latLngToCell = (latlng: leaflet.LatLng) => ({
  i: Math.floor(latlng.lat / TILE_DEGREES),
  j: Math.floor(latlng.lng / TILE_DEGREES),
});

/**
 * Determines if a cache should spawn at the given coordinates
 * based on the defined probability and luck function.
 */
const shouldSpawnCache = (i: number, j: number) =>
  luck([i, j, "initialValue"].toString()) < CACHE_SPAWN_PROBABILITY;

/**
 * Returns the coin value for a cache at the given coordinates,
 * using the luck function to pseudo-randomly select from COIN_VALUES.
 */
function pickCacheValue(i: number, j: number): number {
  const raw = luck([i, j, "initialValue"].toString());
  return COIN_VALUES[Math.floor(raw * 1_000_000) % COIN_VALUES.length];
}

/* ------------------------------------------------------
   DATA STORES (Flyweight + Memento)
------------------------------------------------------ */
const cellValues: Map<string, number> = new Map();
const modifiedCacheState: Map<string, { pickedUp: boolean }> = new Map();

/**
 * Returns the stored value for a cell, generating it if it
 * does not exist yet. Implements the Flyweight pattern.
 */
function getCellValue(i: number, j: number) {
  const key = keyOf(i, j);
  if (!cellValues.has(key)) cellValues.set(key, pickCacheValue(i, j));
  return cellValues.get(key)!;
}

/* ------------------------------------------------------
   UI SETUP
------------------------------------------------------ */

/**
 * Creates and appends a panel div with the given ID to the DOM.
 */
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

geoBtn.addEventListener("click", () => {
  enableGeolocationMovement();
  alert("Geolocation movement enabled!");
});

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

/**
 * Updates the status panel to display the player's currently held coin.
 */
function updateStatus() {
  statusPanelDiv.textContent = `You have: Coin of value ${playerHeldCoin}`;
}
updateStatus();

const playerCell: GridCell = latLngToCell(CLASSROOM_LATLNG);
const playerMarker = leaflet.marker(CLASSROOM_LATLNG).bindTooltip("That's you!")
  .addTo(map);

/**
 * Moves the player by a grid delta (dI, dJ), updates the marker
 * and pans the map, then refreshes the visible caches.
 */
function movePlayerByStep(dI: number, dJ: number) {
  playerCell.i += dI;
  playerCell.j += dJ;
  const newLatLng = cellToLatLng(playerCell);
  playerMarker.setLatLng(newLatLng);
  map.panTo(newLatLng);
  updateVisibleCaches();
}

/**
 * Moves the player to a specific real-world LatLng (from geolocation),
 * updates map and caches.
 */
function movePlayerToLatLng(pos: leaflet.LatLng) {
  const { i, j } = latLngToCell(pos);

  playerCell.i = i;
  playerCell.j = j;

  playerMarker.setLatLng(pos);
  map.panTo(pos);

  updateVisibleCaches();
}

/**
 * Starts using the browser Geolocation API to move the player.
 */
function enableGeolocationMovement() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported by this browser.");
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      movePlayerToLatLng(leaflet.latLng(lat, lng));
    },
    (err) => {
      console.error("Geolocation error:", err);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 5000,
    },
  );
}

// Wire movement buttons
["up", "down", "left", "right"].forEach((dir) => {
  const btn = document.getElementById(`btn-${dir}`)!;
  const moves: Record<string, [number, number]> = {
    up: [1, 0],
    down: [-1, 0],
    left: [0, -1],
    right: [0, 1],
  };
  btn.addEventListener("click", () => movePlayerByStep(...moves[dir]));
});

/* ------------------------------------------------------
   CACHE LOGIC
------------------------------------------------------ */

/**
 * Sets the visual style of a cache circle based on its range and
 * whether it has been picked up.
 */
function setCircleStyle(cache: Cache, inRange: boolean, pickedUp: boolean) {
  cache.circle.setStyle({
    fillOpacity: inRange ? 0.5 : 0.2,
    color: pickedUp ? "gray" : inRange ? "blue" : "gray",
    fillColor: pickedUp ? "#aaa" : inRange ? "#30f" : "#ccc",
  });
}

/**
 * Updates the tooltip and value marker for a cache to reflect its current value.
 */
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

/**
 * Creates the HTML content for a cache popup, including the value
 * and a pickup button.
 */
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

/**
 * Handles the logic when a player picks up a cache:
 * - updates coin values
 * - marks cache as picked up
 * - updates UI
 */
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
}

/**
 * Binds the cache popup to its circle, wiring the pickup button
 * to the handleCachePickup function.
 */
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

/**
 * Creates a cache at the given grid coordinates, including its circle,
 * value marker, and popup binding.
 */
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
   UPDATE VISIBLE CACHES
------------------------------------------------------ */
let visibleCaches: Cache[] = [];

/**
 * Updates the visible caches around the player, removing old
 * caches and creating new ones in the visible neighborhood.
 */
function updateVisibleCaches() {
  // Remove old caches
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
   MAP MOVEMENT EVENT
------------------------------------------------------ */

/**
 * Handles updating caches when the map is moved by panning or zoom.
 */
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

/**
 * Initial call to populate the visible caches around the player.
 */
updateVisibleCaches();
