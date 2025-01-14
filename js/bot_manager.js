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
    // Try to move down first
    if (this.canMove(2)) { // 2 is down
        return 2;
    }
    // If can't move down, try left
    if (this.canMove(3)) { // 3 is left
        return 3;
    }
    // If can't move left, try down again
    if (this.canMove(2)) {
        return 2;
    }
    // If no preferred moves are available, try any available move
    for (var direction = 0; direction < 4; direction++) {
        if (this.canMove(direction)) {
            return direction;
        }
    }
    return null;
};

BotManager.prototype.canMove = function(direction) {
    var gridCopy = this.copyGrid(this.gameManager.grid);
    var vector = this.gameManager.getVector(direction);
    var traversals = this.gameManager.buildTraversals(vector);
    var moved = false;

    traversals.x.forEach(function(x) {
        traversals.y.forEach(function(y) {
            var cell = { x: x, y: y };
            var tile = gridCopy.cellContent(cell);

            if (tile) {
                var positions = this.gameManager.findFarthestPosition.call(
                    {grid: gridCopy}, 
                    cell, 
                    vector
                );
                var next = gridCopy.cellContent(positions.next);

                if (next && next.value === tile.value) {
                    moved = true;
                } else if (!this.gameManager.positionsEqual(cell, positions.farthest)) {
                    moved = true;
                }
            }
        }, this);
    }, this);

    return moved;
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