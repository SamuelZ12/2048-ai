# 2048 AI

A web-based version of the classic 2048 game featuring both manual play and an AI player powered by the Expectimax algorithm with Iterative Deepening. 

## Table of Contents

* [Features](#features)
* [How to Play](#how-to-play)
* [Running Locally](#running-locally)
* [AI Details](#ai-details)
* [Technology Stack](#technology-stack)
* [Deployment](#deployment)
* [Contributing](#contributing)
* [License](#license)
* [Acknowledgements](#acknowledgements)

## Features

* **Classic 2048 Gameplay:** Play the standard 2048 game manually using arrow keys, WASD, or swipes.
* **Expectimax AI Bot:** Activate an intelligent AI that uses the Expectimax search algorithm within an Iterative Deepening framework to determine the best move.
* **Random Bot:** Activate a simple bot that makes random valid moves.
* **Adjustable Speed:** Control the speed (moves per second) at which the AI bots make their moves using a slider.
* **Adjustable AI Depth:** Control the maximum search depth for the Expectimax AI using a slider.
* **Web Worker AI:** AI calculations run in a separate Web Worker thread to prevent UI freezing during complex searches.
* **High Score Tracking:** Keeps track of your best score for *manual play* separately from the *AI Bot's* best score and the *Random Bot's* best score, using Local Storage. Bot settings (speed, depth) are also saved.

## How to Play

**Manual Play:**

* Use your **arrow keys** (Up, Down, Left, Right).
* Alternatively, use **WASD** keys.
* On touch devices, **swipe** up, down, left, or right.
* **Goal:** Merge tiles with the same number by moving them. When two identical tiles touch, they merge into one tile with double the value. Reach the 2048 tile to win! You can continue playing after reaching 2048 to achieve an even higher score.
* The "Best" score shown next to the current score tracks your highest manual score.

**AI Controls (Sidebar):**

* **Bot Button:** Click to toggle the Expectimax AI on/off. An indicator light shows if it's active.
* **Random Button:** Click to toggle the Random move bot on/off. An indicator light shows if it's active. (Note: Only one bot can be active at a time).
* **Speed Slider:** Drag the slider to adjust how fast the active bot makes moves (measured in Frames Per Second - FPS). Saved in Local Storage.
* **Max Depth Slider:** Drag the slider to adjust the maximum search depth the AI uses for its calculations. Higher depth means potentially smarter moves but longer calculation time per move. Saved in Local Storage.
* **High Scores:** View the highest scores achieved *specifically by the Expectimax Bot and the Random Bot* during the current browser session (saved in Local Storage).

## Running Locally

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/SamuelZ12/2048-ai.git
    cd 2048-ai
    ```
2.  **Open the game:** Simply open the `index.html` file in your web browser. No build step is required for basic play.

3.  **(Optional) Development - Compiling SCSS:**
    * If you modify the `.scss` files in the `src/styles/` directory, you need to recompile them into `src/styles/main.css`.
    * You'll need a SASS compiler. If you don't have one, you can install it globally using npm:
        ```bash
        npm install -g sass
        ```
    * To compile once:
        ```bash
        sass src/styles/main.scss src/styles/main.css
        ```
    * To automatically watch for changes and recompile:
        ```bash
        sass --watch src/styles/main.scss:src/styles/main.css
        ```

## AI Details

The primary AI (`bot_worker.js`) uses several techniques:

* **Web Worker:** The core AI calculation runs in a separate thread (`bot_worker.js`) using a Web Worker. This prevents the main browser UI from freezing while the AI "thinks". The `bot_manager.js` coordinates communication with the worker.
* **Iterative Deepening Depth First Search (IDDFS):** Instead of searching to a fixed depth immediately, the AI performs searches starting at depth 1, then depth 2, depth 3, and so on, up to the user-defined **Max Depth**. It uses the result from the deepest completed search within a time limit per move (`timeLimitPerMove` in `bot_worker.js`, currently 150ms). This allows the AI to make a reasonable move quickly, even if a deeper search would take too long.
* **Expectimax Algorithm:** Within each depth iteration, the AI uses the Expectimax search algorithm:
    * **Max Nodes:** Represent the AI's turn. The AI chooses the move (Up, Down, Left, Right) that maximizes the *expected* score evaluated from the subsequent Chance Node.
    * **Chance Nodes:** Represent the game's random tile placement (90% chance of a 2, 10% chance of a 4 in a random empty cell). The algorithm calculates the *expected* score by averaging the values of the states resulting from all possible random tile placements, weighted by their probabilities.
* **Heuristic Function:** To evaluate board states at the search depth limit (or when a game-over state is reached during simulation), a heuristic function estimates the "goodness" of the board. It currently considers a weighted sum of:
    * **Empty Cells:** More empty cells offer more flexibility (higher weight).
    * **Smoothness:** Penalizes large value differences between adjacent tiles (encourages mergeable neighbors).
    * **Monotonicity:** Encourages rows/columns to be generally increasing or decreasing.
    * **Corner Bonus:** Rewards having the highest value tile in a corner.
    * **Snake Pattern Score:** Rewards arranging tiles in a snake-like pattern (e.g., highest in top-left, decreasing across the row, snaking down).
* **Transposition Table:** A simple `Map` is used within the worker to cache the scores of previously evaluated game states (identified by a string key representing tile values) at specific depths, avoiding redundant calculations during the search.

## Technology Stack

* HTML5
* CSS3 (SCSS for development)
* Vanilla JavaScript (ES5/ES6)
* Web Workers API

## Deployment

* This project is automatically deployed to GitHub Pages using the GitHub Actions workflow defined in `.github/workflows/static.yml`.
* The workflow triggers on every push to the `main` branch.
* It checks out the code, sets up GitHub Pages, uploads the entire repository content as an artifact, and deploys it.
* The live site URL is: [https://samuelz12.github.io/2048-ai/](https://samuelz12.github.io/2048-ai/)

## Contributing

Contributions are welcome!

1.  **Issues:** Report bugs or suggest features by opening an issue.
2.  **Pull Requests:**
    * Fork the repository.
    * Create a new branch for your feature or bug fix (`git checkout -b feature/your-feature-name`).
    * Make your changes and commit them (`git commit -m 'Add some feature'`).
    * Push your changes to your fork (`git push origin feature/your-feature-name`).
    * Open a Pull Request back to the main repository.

## License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

Copyright (c) 2025 Samuel Zhang

## Acknowledgements

* Based on the original 2048 game created by Gabriele Cirulli.
* Uses the Clear Sans font.
* AI implementation inspired by common approaches for solving 2048.