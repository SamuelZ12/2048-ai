function BotManager(gameManager) {
    this.gameManager = gameManager;
    this.isEnabled = false;
    this.isRandomEnabled = false;
    this.depth = 3;
    this.moveSpeed = this.fpsToMs(localStorage.getItem('moveSpeed') || 15);
    this.botHighScore = localStorage.getItem('botHighScore') || 0;
    this.randomHighScore = localStorage.getItem('randomHighScore') || 0;
    this.updateHighScoreDisplay();
    this.addControls();
    this.addSpeedControls();
}

BotManager.prototype.fpsToMs = function(fps) {
    return Math.round(1000 / fps);
};

BotManager.prototype.addControls = function() {
    var self = this;
    
    var botButton = document.querySelector('.bot-button');
    var randomButton = document.querySelector('.random-button');
    
    botButton.addEventListener('click', function() {
        if (self.isRandomEnabled) {
            self.isRandomEnabled = false;
            randomButton.classList.remove('active');
        }
        self.isEnabled = !self.isEnabled;
        botButton.classList.toggle('active');
        if (self.isEnabled) {
            self.makeNextMove();
        }
    });
    
    randomButton.addEventListener('click', function() {
        if (self.isEnabled) {
            self.isEnabled = false;
            botButton.classList.remove('active');
        }
        self.isRandomEnabled = !self.isRandomEnabled;
        randomButton.classList.toggle('active');
        if (self.isRandomEnabled) {
            self.makeRandomMove();
        }
    });
};

BotManager.prototype.addSpeedControls = function() {
    var self = this;
    var speedSlider = document.querySelector('.move-speed');
    var speedValue = document.querySelector('.move-speed-value');

    // Set initial values
    var initialFps = Math.round(1000 / this.moveSpeed);
    speedSlider.value = initialFps;
    speedValue.textContent = initialFps + ' FPS';

    // Add event listener
    speedSlider.addEventListener('input', function(e) {
        var fps = parseInt(e.target.value);
        self.moveSpeed = self.fpsToMs(fps);
        speedValue.textContent = fps + ' FPS';
        localStorage.setItem('moveSpeed', fps);
    });
};

BotManager.prototype.makeRandomMove = function() {
    if (!this.isRandomEnabled) return;
    
    var moves = [0, 1, 2, 3]; // up, right, down, left
    var randomMove = moves[Math.floor(Math.random() * moves.length)];
    
    this.gameManager.move(randomMove);
    
    var self = this;
    setTimeout(function() {
        if (!self.gameManager.isGameTerminated()) {
            self.makeRandomMove();
        }
    }, this.moveSpeed);
};

BotManager.prototype.makeNextMove = function() {
    if (!this.isEnabled) return;
    
    var bestMoveResult = this.findBestMove();
    if (bestMoveResult.move !== null) {
        this.gameManager.move(bestMoveResult.move);
        var self = this;
        setTimeout(function() {
            if (!self.gameManager.isGameTerminated()) {
                self.makeNextMove();
            }
        }, this.moveSpeed);
    }
};

BotManager.prototype.findBestMove = function() {
    return this.expectimaxSearch(this.gameManager.grid, this.depth);
};

BotManager.prototype.expectimaxSearch = function(grid, depth) {
    // Base case: depth limit reached or game over
    if (depth === 0 || this.checkGameOver(grid)) {
        return { move: null, score: this.calculateHeuristic(grid) }; // Use heuristic at leaf nodes
    }

    var bestScore = -Infinity;
    var bestMove = null;

    // Max Node: Iterate through possible moves (0: up, 1: right, 2: down, 3: left)
    for (var direction = 0; direction < 4; direction++) {
        if (this.canMoveOnGrid(grid, direction)) {
            // Step 3: Simulate the move
            var simulationResult = this.simulateMove(grid, direction);
            if (simulationResult.moved) {
                var simulatedGrid = simulationResult.grid;
                var moveScore = simulationResult.score; // Score gained from merges in this move

                // Step 2 (Chance Node): Evaluate the expected score after random tile placement
                var expectedScore = this.evaluateChanceNode(simulatedGrid, depth); // Depth stays same for chance node eval, recursion within handles depth-1
                
                var currentMoveScore = moveScore + expectedScore; // Total score = immediate reward + expected future reward

                if (currentMoveScore > bestScore) {
                    bestScore = currentMoveScore;
                    bestMove = direction;
                }
            } else {
                // If the move simulation didn't change the grid, treat it like an invalid move
                // This shouldn't happen if canMoveOnGrid is accurate, but good to handle.
            }
        }
    }
    
    // Handle case where no moves are possible (should be caught by checkGameOver earlier, but as safety)
    if (bestMove === null) {
        return { move: null, score: this.calculateHeuristic(grid) }; 
    }

    return { move: bestMove, score: bestScore };
};

// Evaluates the expected score of a grid state after a random tile is placed
BotManager.prototype.evaluateChanceNode = function(grid, depth) {
    var emptyCells = grid.availableCells();
    var numEmpty = emptyCells.length;

    if (numEmpty === 0 || this.checkGameOver(grid)) {
        // If no empty cells or game over, return heuristic of the current state
        // Although technically a tile MUST be placed if move was made, 
        // checkGameOver covers cases where placing a tile might lead to an immediate loss
        return this.calculateHeuristic(grid);
    }

    var totalExpectedScore = 0;

    // Calculate expected score considering 2 and 4 tile placements
    for (var i = 0; i < numEmpty; i++) {
        var cell = emptyCells[i];
        var tile2 = new Tile(cell, 2);
        var tile4 = new Tile(cell, 4);

        // Expected score if a 2 is placed
        var gridWith2 = this.copyGrid(grid);
        gridWith2.insertTile(tile2);
        var score2 = this.expectimaxSearch(gridWith2, depth - 1).score; // Recurse for next MAX node
        totalExpectedScore += score2 * 0.9;

        // Expected score if a 4 is placed
        var gridWith4 = this.copyGrid(grid); // Need a fresh copy
        gridWith4.insertTile(tile4);
        var score4 = this.expectimaxSearch(gridWith4, depth - 1).score; // Recurse for next MAX node
        totalExpectedScore += score4 * 0.1;
    }

    // Average the score over all possible placements
    var averageExpectedScore = totalExpectedScore / numEmpty;

    return averageExpectedScore;
};

// Placeholder for the heuristic function (Step 4)
BotManager.prototype.calculateHeuristic = function(grid) {
    // Game Over Check: Strongly penalize terminal states.
    if (this.checkGameOver(grid)) {
        return -Infinity;
    }

    var sumOfTiles = 0;
    var numEmpty = 0;
    var weightEmpty = 1000; // Tunable weight for empty cells

    grid.eachCell(function (x, y, tile) {
        if (tile) {
            sumOfTiles += tile.value;
        } else {
            numEmpty++;
        }
    });

    // Simple heuristic: Sum of tiles + weighted number of empty cells.
    var heuristicValue = sumOfTiles + numEmpty * weightEmpty;

    // TODO: Optionally add other components like smoothness, monotonicity, corner bonus here.

    return heuristicValue; 
};

// Checks if the game is over for a given grid state
BotManager.prototype.checkGameOver = function(grid) {
    // Game is over if no moves are possible
    for (var direction = 0; direction < 4; direction++) {
        if (this.canMoveOnGrid(grid, direction)) {
            return false; // Move is possible
        }
    }
    return true; // No moves possible
};

BotManager.prototype.simulateMove = function(grid, direction) {
    var gridCopy = this.copyGrid(grid);
    var vector = this.gameManager.getVector(direction);
    var traversals = this.gameManager.buildTraversals(vector);
    var moved = false;
    var moveScore = 0;

    var selfGameManager = this.gameManager;

    gridCopy.eachCell(function (x, y, tile) {
        if (tile) {
            tile.mergedFrom = null;
        }
    });

    traversals.x.forEach(function (x) {
        traversals.y.forEach(function (y) {
            var cell = { x: x, y: y };
            var tile = gridCopy.cellContent(cell);

            if (tile) {
                var positions = selfGameManager.findFarthestPosition.call(
                    { grid: gridCopy },
                    cell,
                    vector
                );
                var next = gridCopy.cellContent(positions.next);

                if (next && next.value === tile.value && !next.mergedFrom) {
                    var merged = new Tile(positions.next, tile.value * 2);
                    merged.mergedFrom = [tile, next];

                    gridCopy.insertTile(merged);
                    gridCopy.removeTile(tile);

                    moveScore += merged.value;
                    moved = true;
                } else {
                    gridCopy.cells[tile.x][tile.y] = null;
                    gridCopy.cells[positions.farthest.x][positions.farthest.y] = tile;
                    tile.updatePosition(positions.farthest);
                }

                // Check if the tile moved from its original spot
                // Pass the tile object directly, as positionsEqual expects {x, y} properties
                if (!selfGameManager.positionsEqual(cell, tile)) { 
                    moved = true;
                }
            }
        });
    });
    
    return { grid: gridCopy, score: moveScore, moved: moved };
};

BotManager.prototype.canMoveOnGrid = function(grid, direction) {
    var gridCopy = this.copyGrid(grid);
    var vector = this.gameManager.getVector(direction);
    var traversals = this.gameManager.buildTraversals(vector);
    var moved = false;

    var selfGameManager = this.gameManager;

    traversals.x.forEach(function(x) {
        traversals.y.forEach(function(y) {
            var cell = { x: x, y: y };
            var tile = gridCopy.cellContent(cell);

            if (tile) {
                var positions = selfGameManager.findFarthestPosition.call(
                    { grid: gridCopy },
                    cell,
                    vector
                );
                var next = gridCopy.cellContent(positions.next);

                if (next && next.value === tile.value && !next.mergedFrom) {
                    moved = true;
                } else if (!selfGameManager.positionsEqual(cell, positions.farthest)) {
                    moved = true;
                }
            }
        });
    });

    return moved;
};

BotManager.prototype.canMove = function(direction) {
    return this.canMoveOnGrid(this.gameManager.grid, direction);
};

// Corrected copyGrid function in js/bot_manager.js
BotManager.prototype.copyGrid = function(grid) {
    var serialized = grid.serialize();
    // Create a new Grid instance using the serialized state's size and cells
    return new Grid(serialized.size, serialized.cells);
};

BotManager.prototype.updateHighScoreDisplay = function() {
    document.querySelector('.bot-high-score').textContent = this.botHighScore;
    document.querySelector('.random-high-score').textContent = this.randomHighScore;
};

BotManager.prototype.checkAndUpdateHighScores = function(score) {
    if (this.isEnabled && score > this.botHighScore) {
        this.botHighScore = score;
        localStorage.setItem('botHighScore', score);
        this.updateHighScoreDisplay();
    } else if (this.isRandomEnabled && score > this.randomHighScore) {
        this.randomHighScore = score;
        localStorage.setItem('randomHighScore', score);
        this.updateHighScoreDisplay();
    }
}; 