function BotManager(gameManager) {
    this.gameManager = gameManager;
    this.isEnabled = false;
    this.isRandomEnabled = false;
    this.depth = 4;
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
    
    var bestMove = this.findBestMove();
    if (bestMove !== null) {
        this.gameManager.move(bestMove);
        var self = this;
        setTimeout(function() {
            if (!self.gameManager.isGameTerminated()) {
                self.makeNextMove();
            }
        }, this.moveSpeed);
    }
};

BotManager.prototype.findBestMove = function() {
    var bestScore = -Infinity;
    var bestMove = null;
    
    // Try all possible moves
    for (var move = 0; move < 4; move++) {
        var gridCopy = this.copyGrid(this.gameManager.grid);
        var score = this.expectimax(gridCopy, this.depth, false);
        
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }
    
    return bestMove;
};

BotManager.prototype.expectimax = function(grid, depth, isMax) {
    if (depth === 0) {
        return this.evaluateGrid(grid);
    }
    
    if (isMax) {
        var maxScore = -Infinity;
        for (var move = 0; move < 4; move++) {
            var gridCopy = this.copyGrid(grid);
            // Try move and get resulting score
            var score = this.expectimax(gridCopy, depth - 1, false);
            maxScore = Math.max(maxScore, score);
        }
        return maxScore;
    } else {
        var avgScore = 0;
        var emptyCells = this.getEmptyCells(grid);
        var probability = 1 / emptyCells.length;
        
        emptyCells.forEach(function(cell) {
            // Try adding a 2 (90% probability)
            var gridCopy = this.copyGrid(grid);
            gridCopy.cells[cell.x][cell.y] = new Tile({ x: cell.x, y: cell.y }, 2);
            avgScore += 0.9 * probability * this.expectimax(gridCopy, depth - 1, true);
            
            // Try adding a 4 (10% probability)
            gridCopy = this.copyGrid(grid);
            gridCopy.cells[cell.x][cell.y] = new Tile({ x: cell.x, y: cell.y }, 4);
            avgScore += 0.1 * probability * this.expectimax(gridCopy, depth - 1, true);
        }, this);
        
        return avgScore;
    }
};

BotManager.prototype.evaluateGrid = function(grid) {
    var score = 0;
    var emptyCells = 0;
    var monotonicity = 0;
    var smoothness = 0;
    
    // Count empty cells and calculate monotonicity
    for (var x = 0; x < 4; x++) {
        for (var y = 0; y < 4; y++) {
            if (!grid.cells[x][y]) {
                emptyCells++;
            } else {
                var value = grid.cells[x][y].value;
                score += value;
                
                // Prefer larger values in corners
                if ((x === 0 || x === 3) && (y === 0 || y === 3)) {
                    score += value * 2;
                }
            }
        }
    }
    
    return score + (emptyCells * 100);
};

BotManager.prototype.copyGrid = function(grid) {
    var gridCopy = new Grid(grid.size);
    for (var x = 0; x < grid.size; x++) {
        for (var y = 0; y < grid.size; y++) {
            if (grid.cells[x][y]) {
                gridCopy.cells[x][y] = new Tile(
                    {x: x, y: y},
                    grid.cells[x][y].value
                );
            }
        }
    }
    return gridCopy;
};

BotManager.prototype.getEmptyCells = function(grid) {
    var emptyCells = [];
    for (var x = 0; x < grid.size; x++) {
        for (var y = 0; y < grid.size; y++) {
            if (!grid.cells[x][y]) {
                emptyCells.push({x: x, y: y});
            }
        }
    }
    return emptyCells;
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