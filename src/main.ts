// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // student-controlled page style

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
import luck from "./_luck.ts";

// UI SETUP

/*
 * Purpose: Creates and appends a <div> element with a given ID to the parent container.
 * Used to organize the layout for the map and status panels.
 */
function createPanel(id: string, parent: HTMLElement = document.body) {
  const div = document.createElement("div");
  div.id = id;
  parent.append(div);
  return div;
}

const mapDiv = createPanel("map");
const statusPanelDiv = createPanel("statusPanel");

// MOVEMENT BUTTONS

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

// CONSTANTS
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

// MAP SETUP
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Add map tiles from Thunderforest
leaflet.tileLayer(
  "https://tile.thunderforest.com/pioneer/{z}/{x}/{y}.png?apikey=3571fe386fc0421aad3eb2983e8ff8b3",
  {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.thunderforest.com/">Thunderforest</a>, ' +
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
).addTo(map);

// PLAYER SETUP

// Creates a player marker and initializes a default coin.
let playerHeldCoin: number | null = 1;
const playerMarker = leaflet.marker(CLASSROOM_LATLNG)
  .bindTooltip("That's you!")
  .addTo(map);

statusPanelDiv.textContent = `You have: Coin of value ${playerHeldCoin}`;

type GridCell = {
  i: number;
  j: number;
};

// Convert global grid cell to lat/lng (center of the cell)
function cellToLatLng(cell: GridCell): leaflet.LatLng {
  return leaflet.latLng(
    cell.i * TILE_DEGREES + TILE_DEGREES / 2,
    cell.j * TILE_DEGREES + TILE_DEGREES / 2,
  );
}

// Convert lat/lng to global grid cell
function latLngToCell(latlng: leaflet.LatLng): GridCell {
  const i = Math.floor(latlng.lat / TILE_DEGREES);
  const j = Math.floor(latlng.lng / TILE_DEGREES);
  return { i, j };
}

const playerCell: GridCell = latLngToCell(CLASSROOM_LATLNG);

function movePlayerByStep(dI: number, dJ: number) {
  playerCell.i += dI;
  playerCell.j += dJ;

  const newLatLng = cellToLatLng(playerCell);
  playerMarker.setLatLng(newLatLng);

  updateVisibleCaches();
  spawnCachesAroundPlayer();
}

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

// CACHE LOGIC

// Defines the data structure for collectible caches.
type Cache = {
  circle: leaflet.Circle;
  center: leaflet.LatLng;
  value: number;
};

const allCaches: Cache[] = [];

/*
 * Purpose: Creates a coin cache at grid coordinates (i, j).
 * Each cache is represented as a small circle with a numeric value tooltip.
 */
// Helper to deterministically pick a coin value using luck
function pickCacheValue(i: number, j: number): number {
  const raw = luck([i, j, "initialValue"].toString());
  const index = Math.floor(raw * 1_000_000) % COIN_VALUES.length; // Spread small numbers across indexes
  return COIN_VALUES[index];
}

// Modified createCache function
function createCache(i: number, j: number): void {
  const center = cellToLatLng({ i, j });

  const circle = leaflet.circle(center, {
    radius: 5,
    color: "blue",
    fillColor: "#30f",
    fillOpacity: 0.4,
  }).addTo(map);

  // Use the helper to pick a value
  const value = pickCacheValue(i, j);

  const cache: Cache = { circle, center, value };
  allCaches.push(cache);

  circle.bindTooltip(`${value}`, {
    permanent: true,
    direction: "center",
    className: "cell-label",
  }).openTooltip();

  bindCachePopup(circle, cache, i, j);
}

/*
 * Purpose: Attaches an interactive popup to each cache, allowing
 * the player to pick up or upgrade coins depending on held value.
 */
function bindCachePopup(
  circle: leaflet.Circle,
  cache: Cache,
  i: number,
  j: number,
) {
  circle.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>Cache at "${i},${j}" — value: <span id="value">${cache.value}</span></div>
      <button id="pickup">Pick up</button>
      <div id="message"></div>
    `;

    const pickupBtn = popupDiv.querySelector<HTMLButtonElement>("#pickup")!;
    const valueSpan = popupDiv.querySelector<HTMLSpanElement>("#value")!;
    const messageDiv = popupDiv.querySelector<HTMLDivElement>("#message")!;

    pickupBtn.addEventListener("click", () => {
      if (playerHeldCoin === null) {
        pickUpCoin(cache, circle, valueSpan, messageDiv);
      } else if (playerHeldCoin === cache.value && cache.value > 0) {
        upgradeCoin(cache, circle, valueSpan, messageDiv);
      } else {
        messageDiv.textContent =
          "You can’t pick this up (value doesn’t match your coin).";
      }
    });

    return popupDiv;
  });
}

/*
 * Purpose: Handles logic for picking up a coin when the player
 * isn’t already holding one.
 */
function pickUpCoin(
  cache: Cache,
  circle: leaflet.Circle,
  valueSpan: HTMLElement,
  messageDiv: HTMLElement,
) {
  playerHeldCoin = cache.value;
  cache.value = 0;
  updateUIAfterPickup(
    cache,
    circle,
    valueSpan,
    messageDiv,
    "You picked up the coin!",
  );
}

/*
 * Purpose: Handles coin upgrades when the player interacts with a
 * matching-value cache. Doubles coin value up to 256.
 */
function upgradeCoin(
  cache: Cache,
  circle: leaflet.Circle,
  valueSpan: HTMLElement,
  messageDiv: HTMLElement,
) {
  playerHeldCoin! *= 2;
  cache.value = 0;
  const win = playerHeldCoin === 256;
  updateUIAfterPickup(
    cache,
    circle,
    valueSpan,
    messageDiv,
    win
      ? "You win! Coin of value 256 reached!"
      : "You matched your coin value and upgraded!",
  );
}

/*
 * Purpose: Updates the UI and visuals after a pickup or upgrade event.
 * Sets circle color, tooltip, and status message.
 */
function updateUIAfterPickup(
  _cache: Cache,
  circle: leaflet.Circle,
  valueSpan: HTMLElement,
  messageDiv: HTMLElement,
  message: string,
) {
  statusPanelDiv.textContent = `You have: Coin of value ${playerHeldCoin}`;
  valueSpan.textContent = "0";
  circle.setTooltipContent("0");
  circle.setStyle({ fillColor: "#aaa", color: "gray" });
  messageDiv.textContent = message;
}

// CACHE SPAWNING
// Populates the map with caches based on spawn probability.
spawnCachesAroundPlayer();

function spawnCachesAroundPlayer() {
  const playerI = playerCell.i;
  const playerJ = playerCell.j;

  for (let di = -NEIGHBORHOOD_SIZE; di <= NEIGHBORHOOD_SIZE; di++) {
    for (let dj = -NEIGHBORHOOD_SIZE; dj <= NEIGHBORHOOD_SIZE; dj++) {
      const i = playerI + di;
      const j = playerJ + dj;

      // Skip if a cache already exists at this cell
      const exists = allCaches.some(
        (cache) =>
          latLngToCell(cache.center).i === i &&
          latLngToCell(cache.center).j === j,
      );
      if (exists) continue;

      // Deterministically decide whether to spawn a cache
      if (luck([i, j, "initialValue"].toString()) < CACHE_SPAWN_PROBABILITY) {
        createCache(i, j);
      }
    }
  }
}

// RANGE HANDLING
/*
 * Purpose: Updates the appearance of caches based on the player’s proximity.
 * Caches within range appear blue; others gray out and hide their tooltips.
 */
function updateVisibleCaches() {
  const playerPos = playerMarker.getLatLng();

  for (const cache of allCaches) {
    const { circle, center, value } = cache;
    const inRange = playerPos.distanceTo(center) <= PLAYER_RANGE_METERS;

    if (inRange) {
      // Restore appearance
      circle.setStyle({
        color: "blue",
        fillColor: "#30f",
        fillOpacity: 0.5,
        interactive: true,
      });

      // Restore tooltip
      circle.bindTooltip(`${value}`, {
        permanent: true,
        direction: "center",
        className: "cell-label",
      });

      // Re-bind popup if needed
      if (!circle.getPopup()) {
        bindCachePopup(circle, cache, 0, 0);
      }
    } else {
      // Disable visual + interaction
      circle.setStyle({
        color: "gray",
        fillColor: "#ccc",
        fillOpacity: 0.2,
        interactive: false,
      });

      // Keep tooltip showing value
      circle.bindTooltip(`${value}`, {
        permanent: true,
        direction: "center",
        className: "cell-label",
      });

      // Remove clickability
      circle.unbindPopup();
      circle.closePopup();
    }
  }
}

// Initialize visibility state when the game starts
updateVisibleCaches();
