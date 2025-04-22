// src/js/bot_worker.js

// --- Tile Class (from src/js/tile.js) ---
function Tile(position, value) {
  this.x = position.x;
  this.y = position.y;
  this.value = value || 2;

  this.previousPosition = null;
  this.mergedFrom = null; // Tracks tiles that merged together
}

Tile.prototype.savePosition = function () {
  this.previousPosition = { x: this.x, y: this.y };
};

Tile.prototype.updatePosition = function (position) {
  this.x = position.x;
  this.y = position.y;
};

Tile.prototype.serialize = function () {
  return {
    position: {
      x: this.x,
      y: this.y
    },
    value: this.value
  };
};

// --- Grid Class (from src/js/grid.js and dependencies) ---
function Grid(size, previousState) {
  this.size = size;
  // If previousState is provided, load from it, otherwise create an empty grid
  this.cells = previousState ? this.fromState(previousState) : this.empty();
}

// Build a grid of the specified size
Grid.prototype.empty = function () {
  var cells = [];

  for (var x = 0; x < this.size; x++) {
    var row = cells[x] = [];

    for (var y = 0; y < this.size; y++) {
      row.push(null);
    }
  }

  return cells;
};

Grid.prototype.fromState = function (state) {
  var cells = [];

  for (var x = 0; x < this.size; x++) {
    var row = cells[x] = [];

    for (var y = 0; y < this.size; y++) {
      var tile = state[x][y];
      // When reconstructing from serialized state, use the provided value directly
      row.push(tile ? new Tile(tile.position, tile.value) : null);
    }
  }

  return cells;
};

// Find the first available random position (Might not be needed directly by bot, but good for completeness)
Grid.prototype.randomAvailableCell = function () {
  var cells = this.availableCells();

  if (cells.length) {
    return cells[Math.floor(Math.random() * cells.length)];
  }
};

Grid.prototype.availableCells = function () {
  var cells = [];

  this.eachCell(function (x, y, tile) {
    if (!tile) {
      cells.push({ x: x, y: y });
    }
  });

  return cells;
};

// Call callback for every cell
Grid.prototype.eachCell = function (callback) {
  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      callback(x, y, this.cells[x][y]);
    }
  }
};

// Check if there are any cells available
Grid.prototype.cellsAvailable = function () {
  return !!this.availableCells().length;
};

// Check if the specified cell is taken
Grid.prototype.cellAvailable = function (cell) {
  return !this.cellOccupied(cell);
};

Grid.prototype.cellOccupied = function (cell) {
  return !!this.cellContent(cell);
};

Grid.prototype.cellContent = function (cell) {
  if (this.withinBounds(cell)) {
    return this.cells[cell.x][cell.y];
  } else {
    return null;
  }
};

// Inserts a tile at its position
Grid.prototype.insertTile = function (tile) {
  this.cells[tile.x][tile.y] = tile;
};

Grid.prototype.removeTile = function (tile) {
  this.cells[tile.x][tile.y] = null;
};

Grid.prototype.withinBounds = function (position) {
  return position.x >= 0 && position.x < this.size &&
         position.y >= 0 && position.y < this.size;
};

// --- Grid Helper Functions (Needed for simulateMove which uses Grid.prototype.move logic) ---

// Represents the direction of motion
function getVector(direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };
  return map[direction];
}

// Build a list of positions to traverse in the right order
function buildTraversals(vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
}

function findFarthestPosition(cell, vector) {
  var previous;

  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.withinBounds(cell) && this.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Used to check if a merge is required
  };
}

function positionsEqual(first, second) {
  return first.x === second.x && first.y === second.y;
}


// --- AI Logic (Adapted from BotManager) ---

// Creates a deep copy of the grid
function copyGrid(grid) {
    var newGrid = new Grid(grid.size);
    newGrid.cells = grid.cells.map(function(row) {
        return row.map(function(cell) {
            if (cell) {
                // Reconstruct tile slightly differently for copy within worker
                var newTile = new Tile({x: cell.x, y: cell.y}, cell.value);
                newTile.mergedFrom = cell.mergedFrom ? cell.mergedFrom.map(mf => new Tile({x: mf.x, y: mf.y}, mf.value)) : null;
                newTile.previousPosition = cell.previousPosition ? {x: cell.previousPosition.x, y: cell.previousPosition.y} : null;
                return newTile;
            }
            return null;
        });
    });
    return newGrid;
}


// Simulates a move on a given grid state without modifying the original
// Replicates the core logic of GameManager.move and Grid.move
function simulateMove(grid, direction) {
    var self = grid; // Keep context for grid methods used inside helpers
    var cell, tile;

    var vector = getVector(direction);
    var traversals = buildTraversals.call(self, vector); // Ensure correct 'this' context
    var moved = false;
    var score = 0;
    var won = false; // Not strictly needed for bot, but good to keep structure similar

    var newGrid = copyGrid(self); // Work on a copy

    // Save the current tile positions and remove merger information
    newGrid.eachCell(function (x, y, tile) {
        if (tile) {
            tile.mergedFrom = null;
            tile.savePosition();
        }
    });

    // Traverse the grid in the right direction and move tiles
    traversals.x.forEach(function (x) {
        traversals.y.forEach(function (y) {
            cell = { x: x, y: y };
            tile = newGrid.cellContent(cell);

            if (tile) {
                var positions = findFarthestPosition.call(newGrid, cell, vector); // Ensure correct 'this' context
                var next = newGrid.cellContent(positions.next);

                // Only one merger per row traversal?
                if (next && next.value === tile.value && !next.mergedFrom) {
                    var merged = new Tile(positions.next, tile.value * 2);
                    merged.mergedFrom = [tile, next];

                    newGrid.insertTile(merged);
                    newGrid.removeTile(tile);

                    // Converge the two tiles' positions
                    tile.updatePosition(positions.next);

                    // Update the score
                    score += merged.value;

                    // The mighty 2048 tile
                    if (merged.value === 2048) won = true; // Track win state if needed
                } else {
                     // Move tile
                     var currentPos = {x: tile.x, y: tile.y};
                     newGrid.cells[tile.x][tile.y] = null; // Remove tile from old position
                     newGrid.cells[positions.farthest.x][positions.farthest.y] = tile; // Place tile in new position
                     tile.updatePosition(positions.farthest); // Update tile's internal position


                }

                // Check if the tile moved AFTER potential merge or move
                if (!positionsEqual(cell, tile)) {
                    moved = true; // The tile moved from its original cell!
                }
            }
        });
    });

    return { grid: newGrid, moved: moved, score: score, won: won };
}


// Check if any move is possible on the grid
function movesAvailable(grid) {
    return grid.cellsAvailable() || tileMatchesAvailable(grid);
}

// Check for available matches between tiles (more expensive check)
function tileMatchesAvailable(grid) {
    var self = grid;
    var tile;

    for (var x = 0; x < self.size; x++) {
        for (var y = 0; y < self.size; y++) {
            tile = self.cellContent({ x: x, y: y });

            if (tile) {
                for (var direction = 0; direction < 4; direction++) {
                    var vector = getVector(direction);
                    var cell   = { x: x + vector.x, y: y + vector.y };
                    var other  = self.cellContent(cell);

                    if (other && other.value === tile.value) {
                        return true; // These two tiles can merge
                    }
                }
            }
        }
    }
    return false;
}

// Checks if a specific move is possible from the given grid state
function canMoveOnGrid(grid, direction) {
    // Optimize: Check if the simulated move actually changes the grid state.
    var simulation = simulateMove(grid, direction);
    return simulation.moved;
}

// Checks if the game is over (no possible moves)
function checkGameOver(grid) {
    // Game is over if no moves are available
    return !movesAvailable(grid);
}


// Heuristic function
function calculateHeuristic(grid) {
    // Game Over Check: Strongly penalize terminal states.
    if (checkGameOver(grid)) {
        return -Infinity;
    }

    var sumOfTiles = 0;
    var numEmpty = 0;
    var smoothness = 0;
    var monotonicity = 0;
    var cornerBonus = 0; // Added corner bonus component
    var maxValue = 0;
    var maxTilePosition = null;

    // Weights for different components (can be tuned)
    var weightEmpty = 2.7; // Prioritize empty cells
    var weightSmoothness = 0.1; // Penalize differences between adjacent tiles
    var weightMonotonicity = 1.0; // Encourage tiles values to increase/decrease along rows/cols
    var weightCornerBonus = 2.0; // Encourage the max value tile to be in a corner

    grid.eachCell(function (x, y, tile) {
        if (tile) {
            sumOfTiles += tile.value; // Simple sum of values (less important than others)

            // Track max value and position
            if (tile.value > maxValue) {
                maxValue = tile.value;
                maxTilePosition = { x: x, y: y };
            }

            // Smoothness Calculation: Penalize large differences between adjacent tiles (log scale)
            var logValue = Math.log2(tile.value);
            // Compare with right neighbor
            if (x + 1 < grid.size) {
                var rightNeighbor = grid.cellContent({ x: x + 1, y: y });
                if (rightNeighbor) {
                    smoothness -= Math.abs(logValue - Math.log2(rightNeighbor.value));
                }
            }
            // Compare with bottom neighbor
            if (y + 1 < grid.size) {
                var bottomNeighbor = grid.cellContent({ x: x, y: y + 1 });
                if (bottomNeighbor) {
                    smoothness -= Math.abs(logValue - Math.log2(bottomNeighbor.value));
                }
            }
        } else {
            numEmpty++;
        }
    });

    // Monotonicity Calculation: Penalize direction changes in rows and columns
    var monoTotals = [0, 0, 0, 0]; // up/down (- / +), left/right (- / +)

    // Rows (left/right)
    for (var x = 0; x < grid.size; x++) {
        var current = 0;
        var next = current + 1;
        while (next < grid.size) {
            while (next < grid.size && grid.cellContent({x: x, y: next}) === null) { next++; } // Skip empty cells
            if (next >= grid.size) break; // End of row

            var currentTile = grid.cellContent({x: x, y: current});
            var currentValue = currentTile ? Math.log2(currentTile.value) : 0;
            var nextTile = grid.cellContent({x: x, y: next});
            var nextValue = nextTile ? Math.log2(nextTile.value) : 0;

            if (currentValue > nextValue) {
                monoTotals[0] += nextValue - currentValue; // Penalize decreasing rightward
            } else if (nextValue > currentValue) {
                monoTotals[1] += currentValue - nextValue; // Penalize increasing rightward
            }
            current = next;
            next++;
        }
    }

    // Columns (up/down)
    for (var y = 0; y < grid.size; y++) {
         current = 0;
         next = current + 1;
        while (next < grid.size) {
             while (next < grid.size && grid.cellContent({x: next, y: y}) === null) { next++; } // Skip empty cells
             if (next >= grid.size) break; // End of column

             currentTile = grid.cellContent({x: current, y: y});
             currentValue = currentTile ? Math.log2(currentTile.value) : 0;
             nextTile = grid.cellContent({x: next, y: y});
             nextValue = nextTile ? Math.log2(nextTile.value) : 0;

            if (currentValue > nextValue) {
                monoTotals[2] += nextValue - currentValue; // Penalize decreasing downward
            } else if (nextValue > currentValue) {
                monoTotals[3] += currentValue - nextValue; // Penalize increasing downward
            }
            current = next;
            next++;
        }
    }

    // Choose the best monotonicity score (least penalty) from the two directions for rows and columns
    monotonicity = Math.max(monoTotals[0], monoTotals[1]) + Math.max(monoTotals[2], monoTotals[3]);


    // Corner Bonus: Add a bonus if the max value tile is in a corner
    if (maxTilePosition) {
        var isCorner = (maxTilePosition.x === 0 || maxTilePosition.x === grid.size - 1) &&
                       (maxTilePosition.y === 0 || maxTilePosition.y === grid.size - 1);
        if (isCorner) {
            // Give higher bonus if max tile is MUCH larger than others
            cornerBonus = Math.log2(maxValue); // Bonus scales with log of max value
        }
         // Optional: Penalize max tile not being on edge?
         // else if (maxTilePosition.x > 0 && maxTilePosition.x < grid.size - 1 &&
         //          maxTilePosition.y > 0 && maxTilePosition.y < grid.size - 1) {
         //     cornerBonus -= Math.log2(maxValue); // Penalize if not on edge
         // }

    }


    // Combine heuristics with weights
    // Adding log(maxValue) might be beneficial too, or just relying on corner bonus + monotonicity
    return (numEmpty * weightEmpty) +
           (smoothness * weightSmoothness) +
           (monotonicity * weightMonotonicity) +
           (cornerBonus * weightCornerBonus);
           // + Math.log2(maxValue) // Optional: Directly reward high tiles
}


// Evaluates the expected score of a grid state after a random tile is placed
function evaluateChanceNode(grid, depth) {
    var emptyCells = grid.availableCells();
    var numEmpty = emptyCells.length;

    if (numEmpty === 0) {
        return calculateHeuristic(grid); // No place for tiles, return current state heuristic
    }

    // If depth limit reached at this chance node
    if (depth === 0) {
      return calculateHeuristic(grid);
    }


    var totalExpectedScore = 0;

    // Consider placing a '2' tile in each empty cell
    var scoreSum2 = 0;
    for (var i = 0; i < numEmpty; i++) {
        var cell = emptyCells[i];
        var gridWith2 = copyGrid(grid);
        gridWith2.insertTile(new Tile(cell, 2));
        // If inserting the tile makes the game over, use heuristic, otherwise recurse
        if (checkGameOver(gridWith2)){
            scoreSum2 += calculateHeuristic(gridWith2);
        } else {
            // Depth is decremented when moving from chance to max node
            scoreSum2 += expectimaxSearch(gridWith2, depth - 1).score;
        }
    }

    // Consider placing a '4' tile in each empty cell
    var scoreSum4 = 0;
    for (var i = 0; i < numEmpty; i++) {
        var cell = emptyCells[i];
        var gridWith4 = copyGrid(grid); // Need a fresh copy
        gridWith4.insertTile(new Tile(cell, 4));
         // If inserting the tile makes the game over, use heuristic, otherwise recurse
        if (checkGameOver(gridWith4)){
             scoreSum4 += calculateHeuristic(gridWith4);
        } else {
            // Depth is decremented when moving from chance to max node
            scoreSum4 += expectimaxSearch(gridWith4, depth - 1).score;
        }
    }


    // Calculate the weighted average score over all possible placements
    totalExpectedScore = (0.9 * (scoreSum2 / numEmpty)) + (0.1 * (scoreSum4 / numEmpty));

    return totalExpectedScore;
}

function expectimaxSearch(grid, depth) {
    // Base case: depth limit reached or game over
    if (depth === 0 || checkGameOver(grid)) {
        return { move: null, score: calculateHeuristic(grid) };
    }

    var bestScore = -Infinity;
    var bestMove = null;

    // Max Node: Iterate through possible moves (0: up, 1: right, 2: down, 3: left)
    for (var direction = 0; direction < 4; direction++) {
        var simulationResult = simulateMove(grid, direction);

        if (simulationResult.moved) {
            var simulatedGrid = simulationResult.grid;
            var moveScore = simulationResult.score; // Score gained from merges in this move

            // Evaluate the expected score after random tile placement (Chance Node)
            // Depth remains the same when evaluating the chance node stemming from this move
            var expectedScore = evaluateChanceNode(simulatedGrid, depth);

            var currentMoveScore = moveScore + expectedScore; // Total score = immediate reward + expected future reward

            // Handle -Infinity case from evaluateChanceNode (if placing a tile leads to immediate game over)
            if (currentMoveScore === -Infinity && bestScore === -Infinity) {
                 // If this is the first valid move and it leads to game over, take it
                 if (bestMove === null) {
                     bestScore = currentMoveScore;
                     bestMove = direction;
                 }
                 // Otherwise, prefer moves that don't lead to immediate game over
            } else if (currentMoveScore > bestScore) {
                bestScore = currentMoveScore;
                bestMove = direction;
            }
        }
    }

    // If no moves resulted in a changed grid state (game should be over)
    if (bestMove === null) {
        return { move: null, score: calculateHeuristic(grid) };
    }

    return { move: bestMove, score: bestScore };
}

// Main entry point for the worker calculation
function findBestMove(gridState, depth) {
    var grid = new Grid(gridState.size, gridState.cells);
    return expectimaxSearch(grid, depth);
}


// --- Worker Message Handling ---
self.onmessage = function(event) {
    var data = event.data;
    if (data.gridState && typeof data.depth !== 'undefined') {
        // console.log("Worker received task: Depth", data.depth, "Grid:", data.gridState); // Debug log
        var startTime = performance.now();
        var result = findBestMove(data.gridState, data.depth);
        var endTime = performance.now();
        console.log("Bot Worker: Task completed in", (endTime - startTime).toFixed(2), "ms. Move:", result.move, "Score:", result.score.toFixed(2));

        // Send the result back to the main thread
        self.postMessage({ bestMove: result.move });
    } else if (data.command === 'ping') {
        // Optional: Handle simple ping for checking worker status
        self.postMessage({ status: 'ready' });
    }
    else {
        console.error("Bot Worker: Received invalid message:", data);
    }
};

// Log that the worker has loaded
console.log("Bot Worker: Loaded and ready."); 