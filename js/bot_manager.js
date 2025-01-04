function BotManager(gameManager) {
    this.gameManager = gameManager;
    this.isEnabled = false;
    this.depth = 4; // Maximum depth for expectimax search
    this.addBotButton();
}

BotManager.prototype.addBotButton = function() {
    var self = this;
    var container = document.querySelector('.above-game');
    
    var botButton = document.createElement('a');
    botButton.className = 'bot-button';
    botButton.textContent = 'Enable Bot';
    botButton.style.marginLeft = '10px';
    
    botButton.addEventListener('click', function() {
        self.isEnabled = !self.isEnabled;
        botButton.textContent = self.isEnabled ? 'Disable Bot' : 'Enable Bot';
        if (self.isEnabled) {
            self.makeNextMove();
        }
    });
    
    container.appendChild(botButton);
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
        }, 100);
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