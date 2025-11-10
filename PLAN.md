# D3: Game Title TBD (Coin Collector/Merge?)

## Game Design Vision

In this game, the goal is for the user to trade coins until they reach a value of 256. In order to collect coins, the user must travel across the world and find a place where the respective coin needed spawns and only collect it once they are close enough. The user is able to see the value of each coin before travelling to it.

## Technologies

- Typescript for most game code, little to no explicit HTML, and all CSS collected in common 'style.css' file
- Deno and Vite for building
- Github Actions + Github Pages for deployment automation

## Assignments

### D3.a: Core mecahnics (coin collection and trading)

Key technical challenge: Can you assemble a map-based user interface useing the Leaflet mapping framework?

Key gameplay challenge: Can players collect and trade coins from nearby locations to finally trade for a coin with value 256?

### Steps

### Software Features

- [x] Use Leaflet to render an interactive map
- [x] Make the player's location fixed to the CMPM 121 classroom
- [x] Render grid cells of some fixed circle size on the map
- [X] The coin value of a cell is displayed without needing to be clicked
- [X] Cells can be clicked and interacted with using a button that says 'Trade'
- [x] Token spawning consistency is implemented using a deterministic hashing mechanism

### Gameplay Features

#### Map

- [] Cover the visible map with coins upon initial load of the game
- [] Make coins farther than 3 cells away grayed out, value is not visible
- [] If the coin is within the 3 cell range, make it blue with it's value visible
- [] The initial state of coins is consistent across page loads
