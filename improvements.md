Phase 1: Performance Optimizations (Making it Faster to Allow Deeper Search)

The biggest limitation is the search depth (currently 3). Deeper searches generally lead to better decisions but require significantly more computation. The goal here is to make the search efficient enough to handle greater depths (e.g., 4, 5, or even more dynamically) within a reasonable time frame (e.g., < 100-200ms per move).

Verify and Optimize Transposition Tables (Memoization):

Concept: Your bot_worker.js already implements a transpositionTable using a Map. This is crucial. It stores the calculated score (and best move for max nodes) for a given grid state and depth. If the search encounters the same grid state again at the same or lesser depth, it reuses the stored result instead of re-calculating, dramatically pruning the search tree.
Verification Steps:
Check Usage: Ensure that both the expectimaxSearch (player/max node) and evaluateChanceNode (chance node) functions check the transpositionTable before doing any simulation or recursion (transpositionTable.has(gridKey)).
Check Storage: Ensure that both functions store their results in the transpositionTable after calculation (transpositionTable.set(gridKey, ...)).
Depth Check: Double-check the logic for using stored values. You should only reuse a stored value if the stored depth (entry.depth) is greater than or equal to the current required depth. This ensures you're using a result that was calculated sufficiently deep. (Your current implementation seems to do this correctly).
Key Generation (getGridKey): Ensure getGridKey is efficient. String concatenation, as used now, is generally okay but could be profiled. Ensure the key uniquely represents the board state (tile values and positions). Your current implementation seems correct.
Potential Optimizations:
Table Size: A simple Map might grow very large. Consider strategies to limit its size if memory becomes an issue (e.g., Least Recently Used (LRU) eviction, or simply clearing it periodically or only keeping entries above a certain depth). For typical 2048 AI runs, a standard Map is usually sufficient unless going extremely deep.
Hashing: For potentially faster lookups (though JavaScript Map is often highly optimized), consider using a numerical hash of the grid state instead of a string key, but ensure hash collisions are handled or minimized. Stick with the string key unless profiling shows getGridKey or Map operations are bottlenecks.
Implement Iterative Deepening Depth-Limited Search (IDDFS):

Concept: Instead of picking a fixed depth (like 3), run the Expectimax search iteratively with increasing depth limits (1, 2, 3, 4...) until a time limit per move is approached. This provides the best possible move within the allocated time.
Implementation Steps (Conceptual changes in bot_worker.js's findBestMove and potentially bot_manager.js):
Modify findBestMove: Wrap the main expectimaxSearch call in a loop.
JavaScript

// Inside bot_worker.js - findBestMove
function findBestMove(gridState, initialMaxDepth, timeLimit) {
    console.log("Worker received task. Max Depth:", initialMaxDepth, "Time Limit:", timeLimit);
    transpositionTable = new Map(); // Clear TT for each new top-level call
    const startTime = performance.now();
    var grid = new Grid(gridState.size, gridState.cells);
    let bestMoveFound = -1;
    let currentDepth = 1;

    while (true) {
        const currentTime = performance.now();
        if (currentTime - startTime > timeLimit || currentDepth > initialMaxDepth) {
             console.log("IDDFS: Time limit reached or max depth exceeded. Using move from depth", currentDepth - 1);
             break; // Exit loop if time is up or max depth reached
        }

        console.log(`IDDFS: Starting search for depth ${currentDepth}`);
        // Clear TT entries only from lower depths if needed, or rely on depth check
        // transpositionTable.forEach((value, key) => {
        //    if (value.depth < currentDepth) transpositionTable.delete(key);
        // });

        try {
             let result = expectimaxSearch(grid, currentDepth); // Pass current depth limit
             if (result.move !== -1) { // Store the best move found at this depth
                 bestMoveFound = result.move;
                 console.log(`IDDFS: Found move ${result.move} at depth ${currentDepth}. Score: ${result.score.toFixed(2)}`);
             } else {
                 // If no move found at this depth (e.g., immediate game over),
                 // stick with the move from the previous depth.
                 console.log(`IDDFS: No valid move found at depth ${currentDepth}.`);
                 break;
             }
        } catch (e) {
             console.error(`IDDFS: Error during search at depth ${currentDepth}:`, e);
             break; // Stop searching on error
        }


        // Check time again *after* completing a depth, maybe break early
         const postSearchTime = performance.now();
         if (postSearchTime - startTime > timeLimit) {
             console.log("IDDFS: Time limit reached after completing depth", currentDepth);
             break;
         }


        currentDepth++;
    }

    const endTime = performance.now();
    console.log("Bot Worker: Task completed in", (endTime - startTime).toFixed(2), "ms. Final Move:", bestMoveFound, " Reached Depth:", currentDepth -1);

    if (bestMoveFound === -1) {
        // If no move was ever found (e.g., game over from start, or error at depth 1)
        // Try a failsafe (e.g., find *any* valid move if possible)
         console.warn("IDDFS: No best move identified. Checking for any valid move.");
         for (let dir = 0; dir < 4; dir++) {
             if (simulateMove(grid, dir).moved) {
                 bestMoveFound = dir;
                 console.log("IDDFS: Failsafe: picked first valid move:", dir);
                 break;
             }
         }
     }


    return { move: bestMoveFound }; // Return only the best move direction
}
Modify bot_manager.js:
Add a time limit property (e.g., this.timeLimitPerMove = 100; // milliseconds).
When calling this.worker.postMessage, send the timeLimit and potentially a maximum depth (this.depth could now act as the max depth for IDDFS).
JavaScript

 // Inside bot_manager.js - makeNextMove
 if (this.worker && !this.isCalculating) {
     // ... (rest of the code)
     this.isCalculating = true;
     try {
         var gridState = this.gameManager.grid.serialize();
         // Send grid, max depth (optional, could use a large number), and time limit
         this.worker.postMessage({
             gridState: gridState,
             depth: this.depth, // Or a higher fixed number like 10
             timeLimit: this.timeLimitPerMove || 100 // Add a default
          });
     } catch (error) { //...
     }
 } // ...
Worker Message Handler: Ensure the worker's onmessage correctly calls the modified findBestMove and sends back just the resulting move. (Your existing structure seems mostly fine, just adapt the findBestMove call).
Benefits: Guarantees a move within the time limit, uses deeper search when possible, leverages transposition table effectively across iterations.
Profile Worker Code:

Concept: Use your browser's Developer Tools (usually F12) to profile the JavaScript execution within the Web Worker. This will pinpoint exactly which functions are consuming the most time.
Steps:
Open Developer Tools.
Go to the "Sources" tab. Find your bot_worker.js script (often under a "worker" or "(no domain)" section).
Go to the "Profiler" tab.
Start recording a profile.
Let the AI make a few moves.
Stop recording.
Analyze the results (usually shown as a call tree or bottom-up list). Look for functions with high "Self Time" (time spent in the function itself) and "Total Time" (time spent in the function and functions it calls).
Focus: Pay attention to calculateHeuristic, copyGrid, simulateMove, getGridKey, and the Map operations (get, set, has). Optimization efforts should target the biggest time sinks identified here.
Optimize Core Logic (Based on Profiling):

calculateHeuristic: If the heuristic is slow, simplify it or find faster ways to calculate its components (e.g., avoid redundant loops, use simpler math where possible without sacrificing too much quality).
copyGrid/simulateMove: If grid copying/simulation is slow:
Consider representing the grid differently internally within the worker (e.g., a single flat array cells[x * size + y]) which might be slightly faster to copy, though access becomes grid.cells[cell.x * grid.size + cell.y]. Benchmark this change carefully.
Minimize object creation inside tight loops if profiling shows it's an issue.
Avoid Redundant Checks: Ensure checkGameOver or similar expensive checks aren't called more often than necessary.
Consider WebAssembly (Advanced):

Concept: Rewrite the performance-critical parts (expectimaxSearch, evaluateChanceNode, simulateMove, calculateHeuristic, Grid representation) in a language like C++ or Rust and compile it to WebAssembly (WASM). JavaScript would then call the WASM module.
Benefits: WASM often runs significantly faster than JavaScript for CPU-intensive tasks.
Drawback: Requires knowledge of C++/Rust, build tools, and interfacing between JS and WASM. This is a larger undertaking.
Phase 2: Effectiveness Optimizations (Getting Higher Scores)

Once the performance allows for deeper searches (e.g., depth 4, 5, or more via IDDFS), focus on improving the decision-making quality.

Tune Heuristic Weights:

Concept: Your heuristic in bot_worker.js already includes several good components (empty cells, smoothness, monotonicity, corner bonus). The relative importance of these components is determined by their weights (weightEmpty, weightSmoothness, etc.). Finding the optimal weights is key.
Steps:
Identify Weights: List the weights used in calculateHeuristic.
Experimentation: This is often trial-and-error. Set up a framework (if possible) to run the AI many times automatically with different weight combinations and track the average/max scores achieved.
Manual Tuning: If automatic testing isn't feasible, manually adjust weights based on observed AI behavior.
AI getting stuck? Maybe increase weightEmpty or weightSmoothness.
Highest tile not staying in corner? Increase weightCornerBonus or weightMonotonicity.
Board looks messy? Increase weightSmoothness.
Low scores overall? Ensure the heuristic generally correlates with the actual game score (perhaps add a small weight for sumOfTiles or Math.log2(maxValue) if not already implicitly covered).
Focus: weightEmpty, weightMonotonicity, and weightCornerBonus are often the most impactful. weightSmoothness helps prevent fragmentation.
Refine Heuristic Components:

Monotonicity: Ensure it strongly encourages a "snake-like" pattern towards the corner with the highest tile (e.g., values strictly increasing/decreasing towards two chosen edges). The current implementation checks rows and columns independently and takes the max; consider enforcing specific directions (e.g., always prefer increasing towards top-left).
Corner Bonus: Make it more robust. The current bonus applies if the max tile is in any corner. Often, sticking to one specific corner is better. Modify the heuristic to heavily reward the max tile being in a chosen corner (e.g., top-left) and potentially penalize it if it's not there or not on an edge.
Smoothness: The current smoothness uses Math.log2 differences. This is good. Ensure the weight is appropriate.
Empty Cells: Using numEmpty * weightEmpty is standard. Consider non-linear scaling (e.g., Math.log(numEmpty + 1) * weightEmpty) if you find the bot becomes too focused on empty cells late in the game.
Add Advanced Heuristic Features (Optional):

Weighted Grid: Assign a static bonus/penalty to each cell based on its position. Cells in the target corner get the highest bonus, decreasing towards the opposite corner (e.g., using a geometric sequence). Add this weighted sum to the heuristic.
 // Example Weighted Grid (for top-left corner preference)
 const gridWeights = [
   [10, 8, 7, 6.5],
   [ 8, 6, 5, 4 ],
   [ 7, 5, 3, 1 ],
   [6.5, 4, 1, 0 ]
 ];
 // In calculateHeuristic:
 let weightedSum = 0;
 grid.eachCell((x, y, tile) => {
    if (tile) {
      weightedSum += gridWeights[x][y] * tile.value; // Or Math.log2(tile.value)
    }
 });
 // Add weightedSum * weightGridBonus to the final heuristic score
Potential Merges: Add a small bonus for the number of adjacent tiles with the same value.
Increase Search Depth:

Concept: With performance optimizations (especially IDDFS and Transposition Tables) in place, you can now explore deeper.
Steps:
If using IDDFS, increase the timeLimitPerMove in bot_manager.js slightly (e.g., to 150ms, 200ms, or more – experiment!) to allow the search to naturally reach deeper levels. You can also increase the initialMaxDepth passed to the worker if you want a hard cap.
If not using IDDFS (less recommended), manually increase this.depth in bot_manager.js to 4 or 5 and test performance. Only do this if moves consistently complete within your desired timeframe.
