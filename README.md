# 2048 AI

A web-based version of the classic 2048 game featuring both manual play and an AI player powered by the Expectimax algorithm. See if the AI can beat your high score!

## Features

* **Classic 2048 Gameplay:** Play the standard 2048 game manually.
* **Expectimax AI Bot:** Activate an AI that uses the Expectimax search algorithm to determine the best move.
* **Random Bot:** Activate a bot that simply makes random valid moves.
* **Adjustable Speed:** Control the speed at which the AI bots make their moves using a slider.
* **High Score Tracking:** Keeps track of your best score, the AI Bot's best score, and the Random Bot's best score using Local Storage.
* **Responsive Design:** Adapts to different screen sizes, playable on desktop and mobile.

## How to Play

**Manual Play:**

* Use your **arrow keys** (Up, Down, Left, Right).
* Alternatively, use **WASD** keys.
* On touch devices, **swipe** up, down, left, or right.
* **Goal:** Merge tiles with the same number by moving them. When two identical tiles touch, they merge into one tile with double the value. Reach the 2048 tile to win! You can continue playing after reaching 2048 to achieve an even higher score.

**AI Controls (Sidebar):**

* **Bot Button:** Click to toggle the Expectimax AI on/off. An indicator light shows if it's active.
* **Random Button:** Click to toggle the Random move bot on/off. An indicator light shows if it's active. (Note: Only one bot can be active at a time).
* **Speed Slider:** Drag the slider to adjust how fast the active bot makes moves (measured in Frames Per Second - FPS).
* **High Scores:** View the highest scores achieved by the Expectimax Bot and the Random Bot during the current browser session.

## Running Locally

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/YOUR_USERNAME/YOUR_REPONAME.git](https://github.com/YOUR_USERNAME/YOUR_REPONAME.git)
    cd YOUR_REPONAME
    ```
2.  **Open the game:** Simply open the `index.html` file in your web browser.

*(Note: If you modify the `.scss` files, you will need to recompile them into `style/main.css`. You can use a SASS compiler for this, e.g., `sass --watch style/main.scss:style/main.css`)*

## AI Details

The primary AI uses the **Expectimax search algorithm**:

* It explores possible game states up to a certain **depth** (currently 3 moves ahead).
* **Max Nodes:** Represent the AI's turn, where it chooses the move (Up, Down, Left, Right) that maximizes the expected score.
* **Chance Nodes:** Represent the game's turn, where a random tile (90% chance of a 2, 10% chance of a 4) appears in a random empty cell. The algorithm calculates the *expected* score by averaging the outcomes of all possible random tile placements.
* **Heuristic Function:** To evaluate board states at the search depth limit, a heuristic function is used. It currently considers:
    * Sum of tile values on the board.
    * Number of empty cells (more empty cells are generally better).
    * *(Future enhancements could include smoothness, monotonicity, and corner bonuses)*

## Technology Stack

* HTML5
* CSS3 (SCSS for development)
* Vanilla JavaScript (ES5/ES6 with polyfills for older browser compatibility)

## License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## Acknowledgements

* Based on the original 2048 game created by Gabriele Cirulli.
* Uses the Clear Sans font.