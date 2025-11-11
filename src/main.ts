// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // student-controlled page style

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
import luck from "./_luck.ts";

// Create basic UI elements

const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 22;
const CACHE_SPAWN_PROBABILITY = 0.1;
const PLAYER_RANGE_METERS = 30;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer(
    `https://tile.thunderforest.com/pioneer/{z}/{x}/{y}.png?apikey=3571fe386fc0421aad3eb2983e8ff8b3`,
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="http://www.thunderforest.com/">Thunderforest</a>, ' +
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  )
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
let playerCoins = 0;
statusPanelDiv.innerHTML = "No coins yet...";

// used to store cells globally to toggle visbility later
const allCaches: {
  circle: leaflet.Circle;
  center: leaflet.LatLng;
  pointValue: number;
}[] = [];

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number) {
  // Convert cell numbers into lat/lng bounds
  const origin = CLASSROOM_LATLNG;

  // Compute the center of each cell
  const lat = origin.lat + (i + 0.5) * TILE_DEGREES;
  const lng = origin.lng + (j + 0.5) * TILE_DEGREES;
  const center = leaflet.latLng(lat, lng);

  // Make each cell a crcle instead of a rectangle
  const radiusInMeters = 5;
  const circle = leaflet.circle(center, {
    radius: radiusInMeters,
    color: "blue", // will most likely be changed for each coin value
    fillColor: "#30f",
    fillOpacity: 0.4,
  }).addTo(map);

  // Deterministic point value for each cell
  const pointValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100); // this is what makes the values consistent across page loads, based on luck value

  // Add to the array
  allCaches.push({ circle, center, pointValue });

  // Attach a *permanent tooltip* that always shows the value
  circle.bindTooltip(`${pointValue}`, {
    permanent: true,
    direction: "center",
    className: "cell-label",
  }).openTooltip();

  // Handle interactions with the cache
  circle.bindPopup(() => {
    // Each cache has a random point value, mutable by the player
    let pointValue = Math.floor(luck([i, j, "initialValue"].toString()) * 100);

    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
                <div>There is a cache here at "${i},${j}". It has value <span id="value">${pointValue}</span>.</div>
                <button id="trade">Trade</button>`;

    // Clicking the button decrements the cache's value and increments the player's points
    popupDiv
      .querySelector<HTMLButtonElement>("#trade")!
      .addEventListener("click", () => {
        pointValue--;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
          pointValue.toString();
        playerCoins++;
        statusPanelDiv.innerHTML = `${playerCoins} coins accumulated`;
      });

    return popupDiv;
  });
}

// Look around the player's neighborhood for caches to spawn
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    // If location i,j is lucky enough, spawn a cache!
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}

withinRange(); // toggle visibility of cells depending on distance to player

function withinRange() {
  const playerPos = playerMarker.getLatLng();

  for (const { circle, center, pointValue } of allCaches) {
    const distance = playerPos.distanceTo(center);

    if (distance <= PLAYER_RANGE_METERS) {
      // Within range, highlight it and show its value
      circle.setStyle({
        color: "blue",
        fillColor: "#30f",
        fillOpacity: 0.5,
      });

      // Show tooltip
      circle.bindTooltip(`${pointValue}`, {
        permanent: true,
        direction: "center",
        className: "cell-label",
      }).openTooltip();
    } else {
      // Out of range, grey it out and hide its tooltip
      circle.setStyle({
        color: "gray",
        fillColor: "#ccc",
        fillOpacity: 0.2,
      });
      circle.off("click");
      circle.unbindTooltip();
      circle.closePopup();
    }
  }
}
