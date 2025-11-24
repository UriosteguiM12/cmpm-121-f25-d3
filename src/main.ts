import leaflet from "leaflet";

// Styles
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./_leafletWorkaround.ts"; // fix missing marker images

// Luck function
import luck from "./_luck.ts";

// UI SETUP
function createPanel(id: string, parent: HTMLElement = document.body) {
  const div = document.createElement("div");
  div.id = id;
  parent.append(div);
  return div;
}

const mapDiv = createPanel("map");
const statusPanelDiv = createPanel("statusPanel");

// Movement buttons
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
let playerHeldCoin: number | null = 1;
const playerMarker = leaflet.marker(CLASSROOM_LATLNG).bindTooltip("That's you!")
  .addTo(map);

statusPanelDiv.textContent = `You have: Coin of value ${playerHeldCoin}`;

type GridCell = { i: number; j: number };

function cellToLatLng(cell: GridCell): leaflet.LatLng {
  return leaflet.latLng(
    cell.i * TILE_DEGREES + TILE_DEGREES / 2,
    cell.j * TILE_DEGREES + TILE_DEGREES / 2,
  );
}

function latLngToCell(latlng: leaflet.LatLng): GridCell {
  return {
    i: Math.floor(latlng.lat / TILE_DEGREES),
    j: Math.floor(latlng.lng / TILE_DEGREES),
  };
}

const playerCell: GridCell = latLngToCell(CLASSROOM_LATLNG);

function movePlayerByStep(dI: number, dJ: number) {
  playerCell.i += dI;
  playerCell.j += dJ;

  const newLatLng = cellToLatLng(playerCell);
  playerMarker.setLatLng(newLatLng);

  map.panTo(newLatLng);
  updateVisibleCaches();
}

// Movement buttons
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
type Cache = { i: number; j: number; circle: leaflet.Circle };

// Track which caches are visible in the current neighborhood
let visibleCaches: Cache[] = [];

// Track picked-up state per cell
const cacheState: Record<string, { pickedUp: boolean }> = {};

function pickCacheValue(i: number, j: number): number {
  const raw = luck([i, j, "initialValue"].toString());
  const index = Math.floor(raw * 1_000_000) % COIN_VALUES.length;
  return COIN_VALUES[index];
}

function createCache(i: number, j: number): Cache {
  const center = cellToLatLng({ i, j });

  const circle = leaflet.circle(center, {
    radius: 5,
    color: "blue",
    fillColor: "#30f",
    fillOpacity: 0.5,
  }).addTo(map);

  const key = `${i},${j}`;
  if (!cacheState[key]) cacheState[key] = { pickedUp: false };

  circle.bindTooltip(`${pickCacheValue(i, j)}`, {
    permanent: true,
    direction: "center",
    className: "cell-label",
  }).openTooltip();

  const cache: Cache = { i, j, circle };
  bindCachePopup(cache);
  return cache;
}

function bindCachePopup(cache: Cache) {
  cache.circle.bindPopup(() => {
    const key = `${cache.i},${cache.j}`;
    const value = cacheState[key].pickedUp
      ? 0
      : pickCacheValue(cache.i, cache.j);

    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>Cache at "${cache.i},${cache.j}" — value: <span id="value">${value}</span></div>
      <button id="pickup">Pick up</button>
      <div id="message"></div>
    `;

    const pickupBtn = popupDiv.querySelector<HTMLButtonElement>("#pickup")!;
    const valueSpan = popupDiv.querySelector<HTMLSpanElement>("#value")!;
    const messageDiv = popupDiv.querySelector<HTMLDivElement>("#message")!;

    pickupBtn.addEventListener("click", () => {
      const currentValue = cacheState[key].pickedUp
        ? 0
        : pickCacheValue(cache.i, cache.j);

      if (playerHeldCoin === null) {
        playerHeldCoin = currentValue;
        statusPanelDiv.textContent =
          `You have: Coin of value ${playerHeldCoin}`;
        valueSpan.textContent = "0";
        cache.circle.setStyle({ fillColor: "#aaa", color: "gray" });
        messageDiv.textContent = "You picked up the coin!";
        cacheState[key].pickedUp = true;
      } else if (playerHeldCoin === currentValue) {
        playerHeldCoin *= 2;
        statusPanelDiv.textContent =
          `You have: Coin of value ${playerHeldCoin}`;
        valueSpan.textContent = "0";
        cache.circle.setStyle({ fillColor: "#aaa", color: "gray" });
        messageDiv.textContent = playerHeldCoin === 256
          ? "You win!"
          : "You upgraded!";
        cacheState[key].pickedUp = true;
      } else {
        messageDiv.textContent = "You can’t pick this up (value mismatch).";
      }

      // Update tooltip to reflect picked-up
      updateCircleTooltip(cache);
    });

    return popupDiv;
  });
}

function updateCircleTooltip(cache: Cache) {
  const key = `${cache.i},${cache.j}`;
  const value = cacheState[key].pickedUp ? 0 : pickCacheValue(cache.i, cache.j);
  cache.circle.setTooltipContent(`${value}`);
}

// MEMORYLESS CACHE SPAWNING
function updateVisibleCaches() {
  const playerPos = playerMarker.getLatLng();
  const newCaches: Cache[] = [];

  // Reset memory for all cells that went off-screen
  for (const cache of visibleCaches) {
    const key = `${cache.i},${cache.j}`;
    cacheState[key].pickedUp = false;
  }

  // Remove old caches from map
  for (const cache of visibleCaches) {
    map.removeLayer(cache.circle);
  }
  visibleCaches = [];

  // Spawn new caches around player
  const playerI = playerCell.i;
  const playerJ = playerCell.j;

  for (let di = -NEIGHBORHOOD_SIZE; di <= NEIGHBORHOOD_SIZE; di++) {
    for (let dj = -NEIGHBORHOOD_SIZE; dj <= NEIGHBORHOOD_SIZE; dj++) {
      const i = playerI + di;
      const j = playerJ + dj;

      if (luck([i, j, "initialValue"].toString()) < CACHE_SPAWN_PROBABILITY) {
        const cache = createCache(i, j);

        // Only interactive if in range
        if (
          playerPos.distanceTo(cellToLatLng({ i, j })) <= PLAYER_RANGE_METERS
        ) {
          cache.circle.setStyle({
            color: "blue",
            fillColor: "#30f",
            fillOpacity: 0.5,
            interactive: true,
          });
        } else {
          // Reset picked-up if leaving range
          const key = `${i},${j}`;
          cacheState[key].pickedUp = false;

          cache.circle.setStyle({
            color: "gray",
            fillColor: "#ccc",
            fillOpacity: 0.2,
            interactive: false,
          });

          if (cache.circle.getPopup()) {
            cache.circle.unbindPopup();
            cache.circle.closePopup();
          }
        }

        updateCircleTooltip(cache); // update tooltip value
        newCaches.push(cache);
      }
    }
  }

  visibleCaches = newCaches;
}

// PLAYER MOVEMENT + MAP EVENTS
map.on("moveend", () => {
  const centerLatLng = map.getCenter();
  const centerCell = latLngToCell(centerLatLng);

  const prevI = playerCell.i;
  const prevJ = playerCell.j;

  playerCell.i = centerCell.i;
  playerCell.j = centerCell.j;

  updateVisibleCaches();

  playerCell.i = prevI;
  playerCell.j = prevJ;
});

// Initialize first spawn
updateVisibleCaches();
