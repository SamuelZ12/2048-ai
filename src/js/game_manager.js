function GameManager(size, inputManagerInstance, actuatorInstance, storageManagerInstance) {
  this.size           = size; // Size of the grid
  this.inputManager   = inputManagerInstance;   // Use the passed instance
  this.storageManager = storageManagerInstance; // Use the passed instance
  this.actuator       = actuatorInstance;       // Use the passed instance
  this.botManager     = null; // Initialize botManager as null
  this.botWasAutoRunningBeforeWin = false; // Track bot state before winning

  this.startTiles     = 2;

  // Ensure events are bound correctly, assuming inputManagerInstance has the 'on' method
  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Add method to set the BotManager instance
GameManager.prototype.setBotManager = function (botManager) {
  this.botManager = botManager;
  // We might need to update the display initially if botManager already loaded scores
  if (this.botManager) {
      this.actuate(); // Trigger actuate to update display with potentially loaded scores
  }
};

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  if (this.botManager) {
    this.botManager.resetControls();
  }
  this.botWasAutoRunningBeforeWin = false;
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
  if (this.botManager && this.botWasAutoRunningBeforeWin) {
    console.log("Keep Playing: Re-enabling AI bot.");
    this.botManager.enableBot();
    this.botWasAutoRunningBeforeWin = false;
  }
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  return this.over; // Only terminate if the game is lost (no moves available)
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  var bestScoreToDisplay = 0; // Default best score to display

  // Update high score via BotManager if the game is over and a bot mode was active
  if (this.over && this.botManager) {
    if (this.botManager.isEnabled) {
      console.log("Game over for Bot. Updating high score.");
      this.botManager.updateBotHighScore(this.score);
      bestScoreToDisplay = this.botManager.botHighScore; // Use bot high score for display
    } else if (this.botManager.isRandomEnabled) {
      console.log("Game over for Random. Updating high score.");
      this.botManager.updateRandomHighScore(this.score);
       bestScoreToDisplay = this.botManager.randomHighScore; // Use random high score for display
    } else {
        // If game is over but no bot was active, maybe update the generic best score?
        // Or rely on BotManager's display update? Let's keep it simple for now.
        // Maybe fetch the appropriate score if needed for display below.
        // bestScoreToDisplay = this.storageManager.getBestScore(); // Example if we kept a general score
    }
    // Ensure BotManager's display is also up-to-date (redundant if update methods do it, but safe)
     if (this.botManager) { // Check if botManager exists before calling its methods
       this.botManager.updateHighScoreDisplay();
     }
  } else if (this.botManager) {
      // If game is not over, determine which score to display based on active mode
      if (this.botManager.isEnabled) {
          bestScoreToDisplay = this.botManager.botHighScore;
      } else if (this.botManager.isRandomEnabled) {
          bestScoreToDisplay = this.botManager.randomHighScore;
      } else {
          // Maybe display generic best score if manual play score exists?
          // bestScoreToDisplay = this.storageManager.getBestScore();
           // Default to 0 if no mode active and no generic score handled
          bestScoreToDisplay = 0; 
      }
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  // Pass the relevant data to the actuator
  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  bestScoreToDisplay, // Pass the determined best score for the main display
    terminated: this.isGameTerminated()
    // We no longer need to pass botManager state here, as it updates its own UI
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);

        // Only one merger per row traversal?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // Check for win condition
          if (merged.value === 2048 && !self.won) {
            self.won = true;
            if (self.botManager && self.botManager.isEnabled && !self.keepPlaying) {
              console.log("Win condition met while AI bot running. Setting flag and stopping bot.");
              self.botWasAutoRunningBeforeWin = true;
              // Explicitly terminate worker to ensure clean state before 'Keep Playing'
              self.botManager.terminateWorker(); 
            }
          }
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};