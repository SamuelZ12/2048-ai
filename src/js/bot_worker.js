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
// Optimized version: Avoids full simulation
function canMoveOnGrid(grid, direction) {
    var vector = getVector(direction);
    var size = grid.size;

    for (var x = 0; x < size; x++) {
        for (var y = 0; y < size; y++) {
            var cell = { x: x, y: y };
            var tile = grid.cellContent(cell);

            if (tile) {
                // Check the cell right next to the tile in the move direction
                var nextCell = { x: cell.x + vector.x, y: cell.y + vector.y };

                // Ensure the next cell is within bounds
                if (grid.withinBounds(nextCell)) {
                    var nextTile = grid.cellContent(nextCell);

                    // Move is possible if the next cell is empty
                    if (!nextTile) {
                        return true; // Tile can slide into an empty space
                    }

                    // Move is possible if the next cell has a tile of the same value (can merge)
                    if (nextTile.value === tile.value) {
                        return true; // Tiles can merge
                    }
                }
                // If nextCell is out of bounds, the tile is at the edge and cannot move further
                // in this direction unless merging (which is handled above).
            }
            // If the current cell is empty, it doesn't contribute to a move possibility directly,
            // but an adjacent tile might move into it (handled when iterating over that adjacent tile).
        }
    }

    // If we iterated through all cells and found no possible slide or merge
    return false;
}

// Checks if the game is over (no possible moves)
function checkGameOver(grid) {
    // Game is over if no moves are available in any direction
    for (let direction = 0; direction < 4; direction++) {
        if (canMoveOnGrid(grid, direction)) {
            return false; // Found a possible move
        }
    }
    // If no move is possible in any direction
    return true;
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


// --- Transposition Table Key Generation ---
function getGridKey(grid) {
    let key = '';
    for (let x = 0; x < grid.size; x++) {
        for (let y = 0; y < grid.size; y++) {
            let tile = grid.cellContent({ x: x, y: y });
            key += (tile ? tile.value : 0) + '-'; // Use '-' as separator
        }
    }
    return key;
}


// --- Expectimax Search Algorithm ---

var transpositionTable; // Defined in findBestMove

// Represents the 'chance' node in the expectimax tree (after player move)
// Calculates the expected score after a random tile is added.
function evaluateChanceNode(grid, depth) {
    // Transposition Table Check
    const gridKey = getGridKey(grid);
    if (transpositionTable.has(gridKey)) {
        const entry = transpositionTable.get(gridKey);
        // Use stored value only if it was computed at least as deep as required now
        if (entry.depth >= depth && typeof entry.score !== 'undefined') {
             // console.log(`TT Hit (Chance): Key=${gridKey.substring(0,10)}..., Depth=${depth}, Stored Score=${entry.score}`);
             return entry.score;
        }
    }

    let availableCells = grid.availableCells();
    let numAvailable = availableCells.length;

    if (numAvailable === 0) {
        return calculateHeuristic(grid); // No place for tiles, return current state heuristic
    }

    // If depth limit reached at this chance node
    if (depth === 0) {
      return calculateHeuristic(grid);
    }


    var totalExpectedScore = 0;

    // Consider placing a '2' tile in each empty cell
    var scoreSum2 = 0;
    for (var i = 0; i < numAvailable; i++) {
        var cell = availableCells[i];
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
    for (var i = 0; i < numAvailable; i++) {
        var cell = availableCells[i];
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
    totalExpectedScore = (0.9 * (scoreSum2 / numAvailable)) + (0.1 * (scoreSum4 / numAvailable));

    // Store in transposition table
    transpositionTable.set(gridKey, { score: totalExpectedScore, depth: depth });

    return totalExpectedScore;
}

// Represents the 'max' node in the expectimax tree (player's turn)
// Chooses the move that maximizes the expected score from the subsequent chance node.
function expectimaxSearch(grid, depth) {
    // Base case: Leaf node (max depth or game over)
    // Note: checkGameOver is potentially expensive, consider calling it less often if profiling shows issues
    if (depth <= 0 || checkGameOver(grid)) {
        const heuristicScore = calculateHeuristic(grid);
        // Store terminal node heuristic value (conceptually at depth 0)
        const gridKey = getGridKey(grid);
        transpositionTable.set(gridKey, { type: 'max', depth: depth, score: heuristicScore, move: -1 });
        return { move: -1, score: heuristicScore };
    }

     // Transposition Table Check for Player Node
     const gridKey = getGridKey(grid);
     if (transpositionTable.has(gridKey)) {
         const entry = transpositionTable.get(gridKey);
         // Use stored value only if it was computed at least as deep as required now
         // AND if it stores a move (indicating it came from a player node evaluation)
         if (entry.type === 'max' && entry.depth >= depth && typeof entry.move !== 'undefined') {
             // console.log(`TT Hit (Max): Depth=${depth}, Stored Move=${entry.move}, Score=${entry.score}`);
             return { move: entry.move, score: entry.score }; // Return the stored move and score
         }
     }

    let bestScore = -Infinity;
    let bestMove = -1; // 0: up, 1: right, 2: down, 3: left

    // Try each of the 4 possible moves (0: up, 1: right, 2: down, 3: left)
    for (let direction = 0; direction < 4; direction++) {
        const simulationResult = simulateMove(grid, direction);

        if (simulationResult.moved) {
            // If the move changes the board, evaluate the resulting chance node
            // Depth remains the same when evaluating the chance node stemming from this move
            const score = evaluateChanceNode(simulationResult.grid, depth);

            // Update best move if this one is better
            if (score > bestScore) {
                bestScore = score;
                bestMove = direction;
            }
        } else {
             // If a move doesn't change the board, it's generally not considered
        }
    }

     // If no moves resulted in a change (e.g., board full and gridlocked)
     if (bestMove === -1) {
         const heuristicScore = calculateHeuristic(grid);
         // Store result for this dead-end max node
         transpositionTable.set(gridKey, { type: 'max', depth: depth, score: heuristicScore, move: -1 });
         return { move: -1, score: heuristicScore };
     }

    // Store the best score and move found for this max node state
    transpositionTable.set(gridKey, { type: 'max', depth: depth, score: bestScore, move: bestMove });

    return { move: bestMove, score: bestScore };
}


// --- New findBestMove using Iterative Deepening ---
function findBestMove(gridState, initialMaxDepth, timeLimit) {
    console.log("Worker received task. Max Depth:", initialMaxDepth, "Time Limit:", timeLimit);
    transpositionTable = new Map(); // Clear TT for each new top-level call
    const startTime = performance.now();
    var grid = new Grid(gridState.size, gridState.cells); // Reconstruct grid from state

    let bestMoveFound = -1;
    let currentDepth = 1;
    let lastCompletedDepthResult = null;

    // Initial check for immediate game over
    if (checkGameOver(grid)) {
        console.warn("IDDFS: Game is already over at the start.");
        return { move: -1 }; // Indicate no move possible
    }

    while (true) {
        const currentTime = performance.now();
        // Check time limit *before* starting the search for the current depth
        if (currentTime - startTime > timeLimit || currentDepth > initialMaxDepth) {
            if (currentDepth > 1) {
                 console.log(`IDDFS: Time limit (${timeLimit}ms) reached or max depth (${initialMaxDepth}) exceeded before starting depth ${currentDepth}. Using move from depth ${currentDepth - 1}`);
            } else {
                 console.log(`IDDFS: Time limit (${timeLimit}ms) reached or max depth (${initialMaxDepth}) exceeded before completing depth 1.`);
            }
            break; // Exit loop if time is up or max depth reached before starting next iteration
        }

        console.log(`IDDFS: Starting search for depth ${currentDepth}`);

        try {
            // Start expectimax search with the current depth limit
            // The depth passed here is the *maximum* depth allowed for this iteration
             let result = expectimaxSearch(grid, currentDepth);

             // Check if a valid move was found *and* the search didn't immediately return heuristic (move != -1)
             if (result && typeof result.move !== 'undefined' && result.move !== -1) {
                 bestMoveFound = result.move;
                 lastCompletedDepthResult = result; // Store the full result (score+move)
                 console.log(`IDDFS: Depth ${currentDepth} completed. Move: ${result.move}, Score: ${result.score.toFixed(2)}`);
             } else {
                 // If no valid move found (result.move === -1), it implies a game over state was reached
                 // or the board is gridlocked at this depth. Rely on the previous depth's result.
                 console.log(`IDDFS: No valid move found or returned at depth ${currentDepth}. Using previous depth's result.`);
                 break; // Stop deepening if no valid move can be found
             }
        } catch (e) {
             console.error(`IDDFS: Error during search at depth ${currentDepth}:`, e);
             // Stop searching on error, rely on previously found move (if any)
             break;
        }

        // Check time again *after* completing a depth iteration
        const postSearchTime = performance.now();
        if (postSearchTime - startTime > timeLimit) {
            console.log(`IDDFS: Time limit (${timeLimit}ms) reached after completing depth ${currentDepth}. Using this depth's result.`);
            break; // Exit loop if time is up after completing the depth
        }

        // If time permits and max depth not reached, continue to the next depth
        currentDepth++;
    }

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);
    // If we broke the loop *before* starting depth `currentDepth`, the last completed depth is `currentDepth - 1`
    const finalDepthReached = bestMoveFound !== -1 ? currentDepth - 1 : 0; // Report 0 if no move ever found

    console.log(`Bot Worker: Task completed in ${duration} ms. Final Move: ${bestMoveFound}, Reached Depth: ${finalDepthReached}`);

    // Failsafe: If no move was ever found (e.g., error at depth 1, or immediate game over missed)
    if (bestMoveFound === -1) {
        console.warn("IDDFS: No best move identified after search. Checking for any valid fallback move.");
        for (let dir = 0; dir < 4; dir++) {
             // Check if the move is possible *without* simulating if game is over
             if (canMoveOnGrid(grid, dir)) {
                 const sim = simulateMove(grid, dir); // Simulate only if possible
                 if (sim.moved) { // Double-check if it actually moved
                    bestMoveFound = dir;
                    console.log("IDDFS: Failsafe: picked first valid move:", dir);
                    break;
                }
             }
        }
         // If still -1, the game is truly over or gridlocked immediately
         if (bestMoveFound === -1) {
             console.error("IDDFS: Failsafe failed. No valid moves possible.");
             // Return null or a specific value BotManager can interpret as "no move"
             return { move: null }; // Let BotManager handle this
         }
    }

    // Return the best move found within the time/depth limits
    return { move: bestMoveFound };
}


// --- Worker Message Handling ---
self.onmessage = function(event) {
    var data = event.data;
    // Check for the new expected parameters: gridState, maxDepth, timeLimit
    if (data.gridState && typeof data.maxDepth !== 'undefined' && typeof data.timeLimit !== 'undefined') {
        // console.log(`Worker received task: MaxDepth=${data.maxDepth}, TimeLimit=${data.timeLimit}ms`);

        // Call the new findBestMove function with IDDFS logic
        const result = findBestMove(data.gridState, data.maxDepth, data.timeLimit);

        // Send the determined best move back to the main thread
        // Result structure is { move: bestMoveFound } or { move: null }
        self.postMessage({ bestMove: result.move });

    } else if (data.command === 'ping') {
        // Optional: Handle simple ping for checking worker status
        console.log("Worker received ping");
        self.postMessage({ status: 'ready' });
    } else {
        console.error("Bot Worker: Received invalid message format:", data);
        // Send back null move on error
        self.postMessage({ bestMove: null, error: "Invalid message format" });
    }
};

// Log that the worker has loaded
console.log("Bot Worker: Loaded and ready."); 