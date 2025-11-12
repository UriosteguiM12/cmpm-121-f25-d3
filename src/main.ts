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
function createCache(i: number, j: number): void {
  const origin = CLASSROOM_LATLNG;
  const center = leaflet.latLng(
    origin.lat + (i + 0.5) * TILE_DEGREES,
    origin.lng + (j + 0.5) * TILE_DEGREES,
  );

  const circle = leaflet.circle(center, {
    radius: 5,
    color: "blue",
    fillColor: "#30f",
    fillOpacity: 0.4,
  }).addTo(map);

  const value = COIN_VALUES[
    Math.floor(luck([i, j, "initialValue"].toString()) * COIN_VALUES.length)
  ];
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
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      createCache(i, j);
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

  for (const { circle, center, value } of allCaches) {
    const inRange = playerPos.distanceTo(center) <= PLAYER_RANGE_METERS;

    if (inRange) {
      circle.setStyle({ color: "blue", fillColor: "#30f", fillOpacity: 0.5 });
      circle.setTooltipContent(`${value}`);
    } else {
      circle.setStyle({ color: "gray", fillColor: "#ccc", fillOpacity: 0.2 });
      circle.closePopup();
      circle.unbindTooltip();
    }
  }
}

// Initialize visibility state when the game starts
updateVisibleCaches();
