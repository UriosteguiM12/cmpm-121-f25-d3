# D3: Game Title TBD (Coin Merge)

## Game Design Vision

In this game, the goal is for the user to trade coins until they reach a value of 256. In order to collect coins, the user must travel across the world and find a place where the respective coin needed spawns and only collect it once they are close enough. The user is able to see the value of each coin before travelling to it.

## Technologies

- Typescript for most game code, little to no explicit HTML, and all CSS collected in common 'style.css' file
- Deno and Vite for building
- Github Actions + Github Pages for deployment automation

## Assignments

## D3.a: Core mecahnics (coin collection and trading)

Key technical challenge: Can you assemble a map-based user interface useing the Leaflet mapping framework?

Key gameplay challenge: Can players collect and trade coins from nearby locations to finally trade for a coin with value 256?

### 3A Steps

### Software Features

- [x] Use Leaflet to render an interactive map
- [x] Make the player's location fixed to the CMPM 121 classroom
- [x] Render grid cells of some fixed circle size on the map
- [x] The coin value of a cell is displayed without needing to be clicked
- [x] Cells can be clicked and interacted with using a button that says 'Trade'
- [x] Token spawning consistency is implemented using a deterministic hashing mechanism

### Gameplay Features

#### Map

- [x] Cover the visible map with coins upon initial load of the game
- [x] Make coins farther than 3 cells away grayed out, value is not visible (cannot interact with this)
- [x] If the coin is within the 3 cell range, make it blue with it's value visible (can interact with this)
- [x] The initial state of coins is consistent across page loads

#### Inventory

- [x] The player starts off with a coin of value 1
- [x] The player is able to pick up at most one coin
- [x] Picking up a coin removes the value from the cell, if it matches the currently held coin value
- [x] Display if the player holds a coin or not

#### Crafting

- [x] If the player has a coin, they can only interact will a cell of the same value
- [x] If this condition is met, the player will be handed a coin with double the value

## D3.b: Globe-spanning Gameplay

### 3B Steps

### Software requirements

- [] Create four buttons on screen that let the player move one grid step up/down/left/right
- [] Cells update as the player moves (i.e. they spawn/despawn as necessary to keep the screen full)
- [] Represent the world as a global grid anchored at Null Island (0° lat, 0° lng), using fixed-size latitude/longitude increments for each cell
- [] Convert any map location into a grid cell ID (i, j) by dividing its coordinates by the cell size and flooring the result
- [] Use the stable (i, j) IDs for rendering cells, spawning tokens deterministically, and handling gameplay interactions
