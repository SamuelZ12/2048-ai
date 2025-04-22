function BotManager(gameManager) {
    this.gameManager = gameManager;
    this.isEnabled = false;
    this.isRandomEnabled = false;
    this.depth = 3; // This will now act as the max depth for IDDFS
    this.timeLimitPerMove = 100; // Default time limit in milliseconds
    this.moveSpeed = this.fpsToMs(localStorage.getItem('moveSpeed') || 15);
    this.botHighScore = localStorage.getItem('botHighScore') || 0;
    this.randomHighScore = localStorage.getItem('randomHighScore') || 0;
    this.updateHighScoreDisplay();
    this.addControls();
    this.addSpeedControls();

    // Worker related properties
    this.worker = null;
    this.isCalculating = false; // Flag to prevent sending new tasks while worker is busy
}

BotManager.prototype.fpsToMs = function(fps) {
    return Math.round(1000 / fps);
};

BotManager.prototype.initializeWorker = function() {
    var self = this;
    if (this.worker) {
        // Terminate existing worker if any (e.g., if re-initializing)
        this.worker.terminate();
    }
    console.log("Initializing Bot Worker...");
    this.worker = new Worker('src/js/bot_worker.js');

    this.worker.onmessage = function(event) {
        // console.log("BotManager received message from worker:", event.data); // Debug log
        self.isCalculating = false; // Worker finished calculation

        if (event.data.bestMove !== null && typeof event.data.bestMove !== 'undefined') {
            var bestMove = event.data.bestMove;

            // Only proceed if the bot is still enabled and the game isn't over
            if (self.isEnabled && !self.gameManager.isGameTerminated()) {
                console.log("Bot making move:", bestMove);
                self.gameManager.move(bestMove);

                // Schedule the next move calculation after the configured delay
                setTimeout(function() {
                    // Check again if still enabled and game not over before scheduling next move
                    if (self.isEnabled && !self.gameManager.isGameTerminated()) {
                        self.makeNextMove();
                    }
                }, self.moveSpeed);
            } else {
                console.log("Bot received move but is disabled or game is over. Ignoring.");
                self.terminateWorker(); // Clean up worker if disabled or game ended
            }
        } else if (event.data.status === 'ready') {
             console.log("Bot Worker reported status: ready");
             // Worker is ready, potentially trigger first move if needed
             if (self.isEnabled && !self.isCalculating) {
                 self.makeNextMove();
             }
        } else {
            console.warn("BotManager received unknown message or no move from worker:", event.data);
            // Handle cases where worker couldn't find a move (e.g., game over state reached during calculation)
            // Or if worker sends other message types
            if (self.isEnabled && !self.gameManager.isGameTerminated()) {
                // Maybe try again after a delay, or stop the bot?
                 setTimeout(function() {
                    if (self.isEnabled && !self.gameManager.isGameTerminated()) {
                        self.makeNextMove();
                    }
                }, self.moveSpeed);
            } else {
                 self.terminateWorker();
            }
        }
    };

    this.worker.onerror = function(error) {
        console.error("Error in Bot Worker:", error.message, "at", error.filename, ":", error.lineno);
        self.isCalculating = false;
        self.terminateWorker(); // Stop the bot on worker error
        // Optionally, update UI to show bot error
        var botButton = document.querySelector('.bot-button');
        if (botButton) botButton.classList.remove('active');
        self.isEnabled = false;
    };

     // Optional: Send a ping to confirm worker loaded
     // this.worker.postMessage({ command: 'ping' });
};

BotManager.prototype.terminateWorker = function() {
    if (this.worker) {
        console.log("Terminating Bot Worker...");
        this.worker.terminate();
        this.worker = null;
        this.isCalculating = false;
    }
};

BotManager.prototype.addControls = function() {
    var self = this;
    
    var botButton = document.querySelector('.bot-button');
    var randomButton = document.querySelector('.random-button');
    
    botButton.addEventListener('click', function() {
        if (self.isRandomEnabled) {
            self.isRandomEnabled = false;
            randomButton.classList.remove('active');
            // No need to terminate worker here, as random bot doesn't use it
        }
        self.isEnabled = !self.isEnabled;
        botButton.classList.toggle('active');

        if (self.isEnabled) {
            console.log("AI Bot Enabled");
            self.makeNextMove(); // Start the bot's move calculation loop
        } else {
            console.log("AI Bot Disabled");
            self.terminateWorker(); // Terminate worker when disabled
        }
    });
    
    randomButton.addEventListener('click', function() {
        if (self.isEnabled) {
            self.isEnabled = false;
            botButton.classList.remove('active');
            self.terminateWorker(); // Terminate AI bot worker if it was active
        }
        self.isRandomEnabled = !self.isRandomEnabled;
        randomButton.classList.toggle('active');
        if (self.isRandomEnabled) {
            console.log("Random Bot Enabled");
            self.makeRandomMove(); // Start random moves
        } else {
             console.log("Random Bot Disabled");
             // Stop random moves (setTimeout chain will naturally stop)
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
    // Check game state *before* setting timeout for the next move
    if (!self.gameManager.isGameTerminated() && self.isRandomEnabled) {
         setTimeout(function() {
            self.makeRandomMove();
        }, this.moveSpeed);
    }
};

BotManager.prototype.makeNextMove = function() {
    // Ensure bot is enabled and game is not over
    if (!this.isEnabled || this.gameManager.isGameTerminated()) {
        console.log("makeNextMove called but bot disabled or game over.");
        this.terminateWorker(); // Ensure worker is terminated if game ended while bot was running
        return;
    }

    // Initialize worker if it doesn't exist
    if (!this.worker) {
        this.initializeWorker();
        // Worker initialization is async, wait for worker to signal ready or first message response
        // Let the onmessage handler trigger subsequent makeNextMove calls
        // We can send an initial task immediately after creating worker
    }

    // Check if worker exists and is not already calculating
    if (this.worker && !this.isCalculating) {
        console.log("Requesting next move from worker. Max Depth:", this.depth, "Time Limit:", this.timeLimitPerMove, "ms");
        this.isCalculating = true;
        try {
            // Send current grid state, max depth, and time limit to the worker
            var gridState = this.gameManager.grid.serialize();
            this.worker.postMessage({
                gridState: gridState,
                maxDepth: this.depth, // Pass current depth setting as maxDepth
                timeLimit: this.timeLimitPerMove // Pass the time limit
            });
        } catch (error) {
            console.error("Error posting message to worker:", error);
            this.isCalculating = false;
            this.terminateWorker(); // Stop bot if communication fails
            // Optionally, update UI
            var botButton = document.querySelector('.bot-button');
             if (botButton) botButton.classList.remove('active');
            this.isEnabled = false;
        }
    } else if (this.isCalculating) {
        // console.log("Worker is already calculating, waiting...");
        // Do nothing, the worker's onmessage handler will schedule the next call
    } else if (!this.worker) {
         console.log("Worker not yet initialized, waiting...");
         // Do nothing, initializeWorker should have been called, wait for it
    }
};

BotManager.prototype.updateHighScoreDisplay = function() {
    var botScoreElement = document.querySelector('.bot-high-score');
    var randomScoreElement = document.querySelector('.random-high-score');
    if (botScoreElement) botScoreElement.textContent = this.botHighScore;
    if (randomScoreElement) randomScoreElement.textContent = this.randomHighScore;
};

BotManager.prototype.updateBotHighScore = function(score) {
    if (score > this.botHighScore) {
        this.botHighScore = score;
        localStorage.setItem('botHighScore', this.botHighScore);
        this.updateHighScoreDisplay();
    }
};

BotManager.prototype.updateRandomHighScore = function(score) {
    if (score > this.randomHighScore) {
        this.randomHighScore = score;
        localStorage.setItem('randomHighScore', this.randomHighScore);
        this.updateHighScoreDisplay();
    }
};

// Add listeners for game events (Keep and potentially adapt)
BotManager.prototype.listen = function() {
    var self = this;
    // Modify gameManager listeners if needed, e.g., to update high scores
    // based on which bot is active.

    // Example: Update high score based on which bot is active
    this.gameManager.on('gameOver', function(data) {
        if (self.isEnabled) { // AI Bot was active
            self.updateBotHighScore(data.score);
            self.terminateWorker(); // Stop worker on game over
            var botButton = document.querySelector('.bot-button');
             if (botButton) botButton.classList.remove('active');
             self.isEnabled = false; // Ensure bot is marked as disabled
        } else if (self.isRandomEnabled) { // Random Bot was active
            self.updateRandomHighScore(data.score);
             var randomButton = document.querySelector('.random-button');
             if (randomButton) randomButton.classList.remove('active');
             self.isRandomEnabled = false; // Ensure bot is marked as disabled
        }
    });

     this.gameManager.on('win', function(data) {
        if (self.isEnabled) { // AI Bot was active
            self.updateBotHighScore(data.score);
            // Decide if bot should continue after winning
            // self.terminateWorker();
            // var botButton = document.querySelector('.bot-button');
            // if (botButton) botButton.classList.remove('active');
            // self.isEnabled = false;
        } else if (self.isRandomEnabled) { // Random Bot was active
            self.updateRandomHighScore(data.score);
             // var randomButton = document.querySelector('.random-button');
             // if (randomButton) randomButton.classList.remove('active');
             // self.isRandomEnabled = false;
        }
    });

    // We might not need the 'move' listener anymore for the AI bot,
    // as the worker loop handles the next move trigger.
    // Random bot still uses setTimeout loop.

    // Consider adding a listener for window unload to terminate worker
    window.addEventListener('beforeunload', function() {
        self.terminateWorker();
    });
};

// Reset bot controls (called by GameManager on restart)
BotManager.prototype.resetControls = function() {
    console.log("Resetting Bot Controls.");
    // Disable AI bot
    if (this.isEnabled) {
        this.isEnabled = false;
        var botButton = document.querySelector('.bot-button');
        if (botButton) botButton.classList.remove('active');
        this.terminateWorker(); // Terminate worker if it was running
    }
    // Disable Random bot
    if (this.isRandomEnabled) {
        this.isRandomEnabled = false;
        var randomButton = document.querySelector('.random-button');
        if (randomButton) randomButton.classList.remove('active');
        // No worker to terminate for random bot
    }
    this.isCalculating = false; // Ensure calculation flag is reset
};

// Enable the AI bot programmatically (called by GameManager on keepPlaying)
BotManager.prototype.enableBot = function() {
    if (!this.isEnabled) {
        console.log("Programmatically enabling AI Bot.");
        // Ensure random bot is disabled
        if (this.isRandomEnabled) {
            this.isRandomEnabled = false;
            var randomButton = document.querySelector('.random-button');
            if (randomButton) randomButton.classList.remove('active');
        }

        // Enable AI bot state and UI
        this.isEnabled = true;
        var botButton = document.querySelector('.bot-button');
        if (botButton) botButton.classList.add('active');

        // Start the bot's move cycle
        this.makeNextMove();
    } else {
        console.log("enableBot called, but bot was already enabled.");
    }
}; 