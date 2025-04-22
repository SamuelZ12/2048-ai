// src/js/bot_worker.js

importScripts('tile.js', 'grid.js'); // Make main game logic available

// --- Tile Class (from src/js/tile.js) ---
// REMOVED INTERNAL TILE DEFINITION

// --- Grid Class (from src/js/grid.js and dependencies) ---
// REMOVED INTERNAL GRID DEFINITION

// --- Bitboard Implementation ---

// Constants for Bitboard manipulation
const NYBBLE_MASK = 0xFn;
const ROW_MASK = 0xFFFFn;
const GRID_SIZE = 4; // Assuming a 4x4 grid

// Lookup Tables (LUTs) for row movements (move left)
let moveRowResultLUT = new Array(65536);
let moveRowScoreLUT = new Array(65536);
let reverseRowLUT = new Array(65536); // Stores bit-reversed input rows for moveRight

/**
 * Generates the Lookup Tables (LUTs) for move results and scores.
 * This function should be called once when the worker initializes.
 */
function generateMoveLUTs() {
    for (let rowState = 0; rowState < 65536; rowState++) {
        // --- Refined Move Left Simulation --- 
        let line = [
            (rowState >> 0) & 0xF,
            (rowState >> 4) & 0xF,
            (rowState >> 8) & 0xF,
            (rowState >> 12) & 0xF
        ];

        let newLine = [0, 0, 0, 0];
        let newScore = 0;
        let lastMerged = -1; // Index in newLine that was result of a merge
        let target = 0; // Next available position in newLine

        for (let i = 0; i < 4; i++) {
            if (line[i] === 0) continue; // Skip empty cells

            // Check for merge possibility
            if (target > 0 && newLine[target - 1] === line[i] && (target - 1) !== lastMerged) {
                // Merge
                newLine[target - 1]++; // Increment the exponent
                newScore += (1 << newLine[target - 1]); // Add merged value (2^exponent) to score
                lastMerged = target - 1; // Mark this index as merged
            } else {
                // Pack (move tile to the next available spot)
                newLine[target] = line[i];
                target++;
            }
        }

        // Encode newLine back into resultRow
        let resultRow = 0;
        for (let i = 0; i < 4; i++) {
            resultRow |= (newLine[i] << (i * 4));
        }
        // --- End Refined Simulation ---

        // 4. Store in LUTs
        moveRowResultLUT[rowState] = resultRow;
        moveRowScoreLUT[rowState] = newScore;

        // 5. Generate reverseRowLUT (Reversed *Input* Row State)
        let reversedInputRow = 0;
        reversedInputRow |= ((rowState >> 0) & 0xF) << 12;
        reversedInputRow |= ((rowState >> 4) & 0xF) << 8;
        reversedInputRow |= ((rowState >> 8) & 0xF) << 4;
        reversedInputRow |= ((rowState >> 12) & 0xF) << 0;
        reverseRowLUT[rowState] = reversedInputRow; // Store the reversed input row state
    }
    console.log("Bitboard LUTs generated.");
}


/**
 * Encodes the standard Grid object into a 64-bit BigInt representation.
 * Each cell's exponent (log2 of value) is stored in a 4-bit nybble.
 * Layout: Row-major (Row 0 in bits 0-15, Row 1 in 16-31, etc.)
 * Within a row (16 bits), cell [x, y] is at bits x*4 to x*4+3.
 * @param {Grid} grid The Grid object to encode.
 * @returns {BigInt} The 64-bit BigInt representation of the board.
 */
function encodeGrid(grid) {
    let board = 0n;
    grid.eachCell(function (x, y, tile) {
        const exponent = tile ? BigInt(Math.log2(tile.value)) : 0n;
        // Shift calculation based on row-major layout described in bitboards.md
        // y determines the 16-bit block, x determines the 4-bit position within that block.
        const shift = BigInt(y * 16 + x * 4);
        board = board | (exponent << shift);
    });
    return board;
}

/**
 * Decodes a 64-bit BigInt board representation back into a Grid object.
 * Useful for debugging and verification.
 * @param {BigInt} board The 64-bit BigInt board representation.
 * @param {number} size The size of the grid (e.g., 4 for 4x4).
 * @returns {Grid} The decoded Grid object.
 */
function decodeBoard(board, size = GRID_SIZE) {
    const grid = new Grid(size); // Create an empty grid
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const shift = BigInt(y * 16 + x * 4);
            const exponent = (board >> shift) & NYBBLE_MASK;
            if (exponent > 0n) {
                const value = 1n << exponent; // 2n ** exponent also works
                // Need to convert BigInt value back to Number for the Tile constructor
                grid.insertTile(new Tile({ x: x, y: y }, Number(value)));
            }
        }
    }
    return grid;
}

/**
 * Gets the tile value (0 for empty, 2, 4, 8, ...) at a specific coordinate from the BigInt board.
 * @param {BigInt} board The 64-bit BigInt board representation.
 * @param {number} x The x-coordinate (column).
 * @param {number} y The y-coordinate (row).
 * @returns {BigInt} The value of the tile (0n, 2n, 4n, ...) as a BigInt.
 */
function getTileValue(board, x, y) {
    const shift = BigInt(y * 16 + x * 4);
    const exponent = (board >> shift) & NYBBLE_MASK;
    return exponent === 0n ? 0n : (1n << exponent);
}

/**
 * Performs a left move on the bitboard.
 * @param {BigInt} board The current board state.
 * @returns {{board: BigInt, score: BigInt, moved: boolean}}
 */
function moveLeft(board) {
    let newBoard = 0n;
    let totalScore = 0n;
    let moved = false;

    for (let y = 0; y < GRID_SIZE; y++) {
        const rowShift = BigInt(y * 16);
        const row = Number((board >> rowShift) & ROW_MASK); // Extract row, convert to Number for LUT index

        const resultRow = BigInt(moveRowResultLUT[row]);
        const rowScore = BigInt(moveRowScoreLUT[row]);

        newBoard |= (resultRow << rowShift);
        totalScore += rowScore;

        if (BigInt(row) !== resultRow) {
            moved = true;
        }
    }
    return { board: newBoard, score: totalScore, moved: moved };
}

/**
 * Reverses the nybbles within each 16-bit row of the board.
 * Used to implement moveRight using the moveLeft LUT.
 * @param {BigInt} board The board state.
 * @returns {BigInt} Board with nybbles in each row reversed (using LUT).
 */
function reverseBoardRows(board) {
    let reversedBoard = 0n;
    for (let y = 0; y < GRID_SIZE; y++) {
        const rowShift = BigInt(y * 16);
        const row = Number((board >> rowShift) & ROW_MASK);
        // Use the LUT storing the bit-reversed version of the input row
        const reversedRow = BigInt(reverseRowLUT[row]);
        reversedBoard |= (reversedRow << rowShift);
    }
    return reversedBoard;
}

/**
 * Performs a right move on the bitboard.
 * Achieved by reversing rows, moving left, and reversing back.
 * @param {BigInt} board The current board state.
 * @returns {{board: BigInt, score: BigInt, moved: boolean}}
 */
function moveRight(board) {
    // const originalBoard = board; // Keep original for comparison if needed, but rely on movedLeft
    const reversedInputBoard = reverseBoardRows(board); // Reverse the input first
    const { board: movedReversedBoard, score, moved: movedLeft } = moveLeft(reversedInputBoard); // Move the reversed board left
    const finalBoard = reverseBoardRows(movedReversedBoard); // Reverse the result back
    return { board: finalBoard, score: score, moved: movedLeft }; // Use the moved flag from the moveLeft call
}


/**
 * Transposes the 4x4 bitboard (swaps rows and columns).
 * Uses a standard bit manipulation algorithm for 64-bit matrix transpose.
 * Source: https://stackoverflow.com/questions/16737298/what-is-the-fastest-way-to-transpose-a-bit-matrix-of-any-size
 * (Adapted for 4x4 nybbles packed into 64 bits)
 * @param {BigInt} board The board state.
 * @returns {BigInt} The transposed board state.
 */
function transpose(board) {
    // Masks for swapping nybbles
    const MASK_1 = 0x0000FFFF0000FFFFn; // Swaps adjacent 16-bit blocks (rows 0&1 <-> 2&3)
    const MASK_2 = 0x00FF00FF00FF00FFn; // Swaps adjacent 8-bit blocks within 16-bit words
    const MASK_3 = 0x0F0F0F0F0F0F0F0Fn; // Swaps adjacent 4-bit nybbles (columns)

    let t;

    // Swap 32-bit halves (handled implicitly by swapping 16-bit blocks)
    // t = (board ^ (board >> 32n)) & MASK_0; // MASK_0 would be 0x...FFFFFFFF
    // board = board ^ t ^ (t << 32n);

    // Swap 16-bit blocks (Rows 0&1 <-> Rows 2&3)
    t = (board ^ (board >> 16n)) & MASK_1;
    board = board ^ t ^ (t << 16n);

    // Swap 8-bit blocks
    t = (board ^ (board >> 8n)) & MASK_2;
    board = board ^ t ^ (t << 8n);

    // Swap 4-bit nybbles
    t = (board ^ (board >> 4n)) & MASK_3;
    board = board ^ t ^ (t << 4n);

    return board;
}

// --- TEMPORARY DIAGNOSTIC CHECK ---
function checkTranspose() {
    console.log("Checking transpose function integrity...");
    let failed = false;
    // Test with a few sample boards (add more complex ones if needed)
    const testBoards = [0n, 0x1234123412341234n, 0x1111222233334444n, 0xFEDCBA9876543210n];
    for (const board of testBoards) {
        const transposedOnce = transpose(board);
        const transposedTwice = transpose(transposedOnce);
        if (transposedTwice !== board) {
            console.error(`Transpose check FAILED! Original: ${board.toString(16)}, T1: ${transposedOnce.toString(16)}, T2: ${transposedTwice.toString(16)}`);
            failed = true;
        }
    }
     if (!failed) {
         console.log("Transpose check PASSED basic tests.");
     } else {
         console.error("Transpose function seems flawed.");
     }
}
// checkTranspose(); // Keep commented out or remove if no longer needed
// --- END TEMPORARY DIAGNOSTIC CHECK ---

/**
 * Performs an up move on the bitboard.
 * Achieved by transposing, moving left, and transposing back.
 * @param {BigInt} board The current board state.
 * @returns {{board: BigInt, score: BigInt, moved: boolean}}
 */
function moveUp(board) {
    const originalBoard = board; // Keep original for logging
    console.log(`[moveUp] Initial: ${originalBoard.toString(16)}`);
    const transposedBoard = transpose(board);
    console.log(`[moveUp] Transposed: ${transposedBoard.toString(16)}`);
    const { board: movedTransposedBoard, score, moved: movedLeft } = moveLeft(transposedBoard);
    console.log(`[moveUp] Moved Transposed: ${movedTransposedBoard.toString(16)} (movedLeft: ${movedLeft})`);
    const newBoard = transpose(movedTransposedBoard);
    console.log(`[moveUp] Final: ${newBoard.toString(16)}`);
    // Compare final state to original for accurate 'moved' determination
    const actuallyMoved = newBoard !== originalBoard;
    return { board: newBoard, score: score, moved: actuallyMoved }; // Return result based on actual state change
}

/**
 * Performs a down move on the bitboard.
 * Achieved by transposing, moving right, and transposing back.
 * @param {BigInt} board The current board state.
 * @returns {{board: BigInt, score: BigInt, moved: boolean}}
 */
function moveDown(board) {
    const originalBoard = board; // Keep original for logging
    console.log(`[moveDown] Initial: ${originalBoard.toString(16)}`);
    const transposedBoard = transpose(board);
    console.log(`[moveDown] Transposed: ${transposedBoard.toString(16)}`);
    const { board: movedTransposedBoard, score, moved: movedRight } = moveRight(transposedBoard);
    console.log(`[moveDown] Moved Transposed: ${movedTransposedBoard.toString(16)} (movedRight: ${movedRight})`);
    const newBoard = transpose(movedTransposedBoard);
    console.log(`[moveDown] Final: ${newBoard.toString(16)}`);
    // Compare final state to original for accurate 'moved' determination
    const actuallyMoved = newBoard !== originalBoard;
    return { board: newBoard, score: score, moved: actuallyMoved }; // Return result based on actual state change
}

// --- AI Logic (Adapted from BotManager) ---

// --- Helper Functions for Bitboard Heuristic ---
function getExponent(board, pos) {
    return (board >> (BigInt(pos) * 4n)) & NYBBLE_MASK;
}

function getValueFromExponent(exp) {
    return exp === 0n ? 0n : (1n << exp);
}


// Heuristic function - Optimized to use a single board traversal on BigInt
function calculateHeuristic(board) {
    // Game Over Check: Strongly penalize terminal states.
    if (isGameOver(board)) {
        return -Infinity;
    }

    // Initialize heuristic components
    let numEmpty = 0;
    let smoothness = 0;
    let monotonicity = 0; // Calculated from penalties after the loop
    let cornerBonus = 0;
    let maxValue = 0n;
    let maxTilePos = -1; // Position index 0-15
    let snakePatternScore = 0n; // Use BigInt for potentially large scores
    let penalties = { up: 0, down: 0, left: 0, right: 0 }; // For monotonicity

    // Weights for different components (can be tuned)
    const weightEmpty = 1.5; // Prioritize empty cells
    const weightSmoothness = 0.1; // Penalize differences between adjacent tiles
    const weightMonotonicity = 1.0; // Encourage tiles values to increase/decrease along rows/cols
    const weightCornerBonus = 2.0; // Encourage the max value tile to be in a corner
    const weightSnakePattern = 3.0; // Encourage tiles to follow a snake pattern

    // Snake Pattern Weights (Top-Left Corner Snake) - Precompute logs or use values directly
    // Using exponents (log2) * weight for simplicity here
    const snakeWeights = [
        [15, 14, 13, 12],
        [8,  9, 10, 11],
        [7,  6,  5,  4 ],
        [0,  1,  2,  3 ]
    ];


    // Single pass through the board positions
    for (let pos = 0; pos < 16; pos++) {
        const x = pos % 4;
        const y = Math.floor(pos / 4);
        const exponent = getExponent(board, pos);

        if (exponent > 0n) {
            const value = getValueFromExponent(exponent);
            const logValue = Number(exponent); // Convert BigInt exponent to Number for calculations

            // Track max value and position
            if (value > maxValue) {
                maxValue = value;
                maxTilePos = pos;
            }

            // Snake Pattern Score (using exponent * weight)
            snakePatternScore += BigInt(Math.round(logValue * snakeWeights[y][x])); // Use y, x order

            // Smoothness & Monotonicity Calculation (Compare with neighbors)
            // RIGHT neighbor (pos + 1, same row y)
            if (x + 1 < GRID_SIZE) {
                const rightPos = pos + 1;
                const rightExponent = getExponent(board, rightPos);
                if (rightExponent > 0n) {
                    const rightLogValue = Number(rightExponent);
                    smoothness -= Math.abs(logValue - rightLogValue);
                    if (logValue > rightLogValue) {
                        penalties.right += rightLogValue - logValue;
                    } else if (rightLogValue > logValue) {
                        penalties.left += logValue - rightLogValue;
                    }
                }
                // else { smoothness -= logValue } // Optional penalty
            }

            // BOTTOM neighbor (pos + 4, same column x)
            if (y + 1 < GRID_SIZE) {
                const bottomPos = pos + 4;
                const bottomExponent = getExponent(board, bottomPos);
                if (bottomExponent > 0n) {
                    const bottomLogValue = Number(bottomExponent);
                    smoothness -= Math.abs(logValue - bottomLogValue);
                    if (logValue > bottomLogValue) {
                        penalties.down += bottomLogValue - logValue;
                    } else if (bottomLogValue > logValue) {
                        penalties.up += logValue - bottomLogValue;
                    }
                }
                // else { smoothness -= logValue } // Optional penalty
            }
        } else {
            numEmpty++;
        }
    }

    // Calculate final Monotonicity score from accumulated penalties
    monotonicity = Math.max(penalties.left, penalties.right) + Math.max(penalties.up, penalties.down);

    // Calculate Corner Bonus (after finding max tile)
    if (maxTilePos !== -1) {
        const maxX = maxTilePos % 4;
        const maxY = Math.floor(maxTilePos / 4);
        const isCorner = (maxX === 0 || maxX === GRID_SIZE - 1) &&
                       (maxY === 0 || maxY === GRID_SIZE - 1);
        if (isCorner) {
            cornerBonus = Number(maxValue > 0n ? Math.log2(Number(maxValue)) : 0); // Use log of max value
        }
    }

    // Combine heuristics with weights
    // Convert snakePatternScore back to number before weighting
    const finalScore = (numEmpty * weightEmpty) +
                       (smoothness * weightSmoothness) +
                       (monotonicity * weightMonotonicity) +
                       (cornerBonus * weightCornerBonus) +
                       (Number(snakePatternScore) * weightSnakePattern); // Convert BigInt score

    return finalScore;
}


// --- Transposition Table Key Generation ---
// No longer needed, use the BigInt board state directly as the key
// function getGridKey(grid) { ... }


// --- Expectimax Search Algorithm ---

var transpositionTable; // Defined in findBestMove
const moveFunctions = [moveUp, moveRight, moveDown, moveLeft]; // Ensure order matches 0,1,2,3

// Represents the 'chance' node in the expectimax tree (after player move)
// Calculates the expected score after a random tile is added. Operates on BigInt board.
function evaluateChanceNode(board, depth) {
    // Log entry and board state
    // console.log(`[DEBUG] evaluateChanceNode(depth=${depth}) called for board: ${board.toString(16)}`);

    // Transposition Table Check - Use BigInt board as key
    if (transpositionTable.has(board)) {
        const entry = transpositionTable.get(board);
        // Use stored value only if it was computed at least as deep as required now
        if (entry.type === 'chance' && entry.depth >= depth && typeof entry.score !== 'undefined') {
             // console.log(`TT Hit (Chance): Board=${board.toString(16)}, Depth=${depth}, Stored Score=${entry.score}`);
             return entry.score;
        }
    }

    // Find empty cell positions directly from the board BigInt
    let emptyCellPositions = [];
    for (let pos = 0; pos < 16; pos++) {
        if (((board >> (BigInt(pos) * 4n)) & NYBBLE_MASK) === 0n) {
            emptyCellPositions.push(pos);
        }
    }
    let numAvailable = emptyCellPositions.length;

    if (numAvailable === 0) {
        // If no cells available after a move, it implies game might be over or stuck.
        // Heuristic of the current board (which should be penalized if game over)
        return calculateHeuristic(board);
    }

    // If depth limit reached at this chance node
    if (depth === 0) {
      return calculateHeuristic(board);
    }

    let totalExpectedScore = 0;
    let scoreSum2 = 0;
    let scoreSum4 = 0;
    const exponent2 = 1n; // Exponent for value 2
    const exponent4 = 2n; // Exponent for value 4

    // Consider placing a '2' (exponent 1) tile in each empty cell
    for (let i = 0; i < numAvailable; i++) {
        const pos = emptyCellPositions[i];
        const boardWith2 = board | (exponent2 << (BigInt(pos) * 4n));
        // Check game over on the *new* board state
        if (isGameOver(boardWith2)){
            scoreSum2 += calculateHeuristic(boardWith2);
        } else {
            // Depth is decremented when moving from chance to max node
            scoreSum2 += expectimaxSearch(boardWith2, depth - 1).score;
        }
    }
    // Log score after checking 2s
    // console.log(`[DEBUG] evaluateChanceNode(depth=${depth}) - scoreSum2: ${scoreSum2}`);

    // Consider placing a '4' (exponent 2) tile in each empty cell
    for (let i = 0; i < numAvailable; i++) {
        const pos = emptyCellPositions[i];
        const boardWith4 = board | (exponent4 << (BigInt(pos) * 4n));
         // Check game over on the *new* board state
        if (isGameOver(boardWith4)){
             scoreSum4 += calculateHeuristic(boardWith4);
        } else {
            // Depth is decremented when moving from chance to max node
            scoreSum4 += expectimaxSearch(boardWith4, depth - 1).score;
        }
    }
    // Log score after checking 4s
    // console.log(`[DEBUG] evaluateChanceNode(depth=${depth}) - scoreSum4: ${scoreSum4}`);

    // Calculate the weighted average score
    // This assumes numAvailable > 0 based on the earlier check
    totalExpectedScore = (0.9 * (scoreSum2 / numAvailable)) + (0.1 * (scoreSum4 / numAvailable));

    // Log final score before returning
    // console.log(`[DEBUG] evaluateChanceNode(depth=${depth}) - totalExpectedScore: ${totalExpectedScore}`);

    // Store in transposition table - Use BigInt board as key
    transpositionTable.set(board, { type: 'chance', score: totalExpectedScore, depth: depth });

    return totalExpectedScore;
}

// Represents the 'max' node in the expectimax tree (player's turn)
// Chooses the move that maximizes the expected score from the subsequent chance node. Operates on BigInt board.
function expectimaxSearch(board, depth) {
    // Base case: Leaf node (max depth or game over)
    if (depth <= 0 || isGameOver(board)) {
        const heuristicScore = calculateHeuristic(board);
        // Store terminal node heuristic value
        // Use board BigInt as key directly
        transpositionTable.set(board, { type: 'max', depth: depth, score: heuristicScore, move: -1 });
        return { move: -1, score: heuristicScore };
    }

     // Transposition Table Check for Player Node
     // Use board BigInt as key directly
     if (transpositionTable.has(board)) {
         const entry = transpositionTable.get(board);
         // Use stored value only if computed at least as deep AND it's from a max node
         if (entry.type === 'max' && entry.depth >= depth && typeof entry.move !== 'undefined') {
             // console.log(`TT Hit (Max): Board=${board.toString(16)}, Depth=${depth}, Stored Move=${entry.move}, Score=${entry.score}`);
             return { move: entry.move, score: entry.score }; // Return the stored move and score
         }
     }

    let bestScore = -Infinity;
    let bestMove = -1; // 0: up, 1: right, 2: down, 3: left

    // Try each of the 4 possible moves using the Grid simulation helper
    for (let direction = 0; direction < 4; direction++) {
        // Use simulateGridMove to determine if the move is valid according to Grid logic
        // and get the resulting board state if it is.
        const simulationResult = simulateGridMove(board, direction);

        // Log the simulation result for this direction
        // console.log(`[DEBUG] expectimaxSearch(depth=${depth}) - Dir ${direction}: simulated moved=${simulationResult.moved}`);

        if (simulationResult.moved) {
            // If the move changes the board according to Grid logic,
            // evaluate the resulting chance node using the *new* bitboard state.
            // Depth remains the same for the chance node evaluation originating from this max node level
            const score = evaluateChanceNode(simulationResult.board, depth);

            // Log the score returned by the chance node evaluation
            // console.log(`[DEBUG] expectimaxSearch(depth=${depth}) - Dir ${direction}: evaluated score=${score}`);

            if (score > bestScore) {
                bestScore = score;
                bestMove = direction;
            }
        } else {
             // If simulateGridMove reports moved: false, this direction doesn't lead to a valid state change.
             // Do nothing, loop continues.
        }
    }

     // If no moves resulted in a change (bestMove is still -1)
     // This means the game is effectively over from this state, even if isGameOver check missed it somehow,
     // or we are at a state where no move is possible. Return the heuristic of the current state.
     if (bestMove === -1) {
         const heuristicScore = calculateHeuristic(board);
         // Store result for this dead-end max node
         transpositionTable.set(board, { type: 'max', depth: depth, score: heuristicScore, move: -1 });
         return { move: -1, score: heuristicScore };
     }

    // Store the best score and move found for this max node state
    // Use board BigInt as key directly
    transpositionTable.set(board, { type: 'max', depth: depth, score: bestScore, move: bestMove });

    return { move: bestMove, score: bestScore };
}

/**
 * Given a bitboard and a direction index (0=Up,1=Right,2=Down,3=Left),
 * return { moved, board } using the real Grid.move() logic.
 * This acts as a bridge between the bitboard representation used in the search
 * and the canonical move logic from the main game.
 */
function simulateGridMove(bitboard, direction) {
  try {
    const grid = decodeBoard(bitboard, GRID_SIZE); // Decode current state
    if (!grid) {
        console.error("simulateGridMove: Failed to decode board:", bitboard.toString(16));
        return { moved: false, board: bitboard }; // Cannot simulate if decode fails
    }

    const result = grid.move(direction); // Perform move using Grid logic

    // If the Grid logic says nothing moved, return the original bitboard
    if (!result.moved) {
      return { moved: false, board: bitboard };
    }

    // If the Grid moved, re-encode the *mutated* Grid back into bitboard format
    const newBitboard = encodeGrid(grid); // Use encodeGrid which reads the grid state
    return { moved: true, board: newBitboard };

  } catch (e) {
      console.error(`simulateGridMove: Error during simulation for direction ${direction} on board ${bitboard.toString(16)}:`, e);
      // Fallback to reporting no move if an error occurs during simulation
      return { moved: false, board: bitboard };
  }
}

// --- New findBestMove using Iterative Deepening ---
function findBestMove(initialBoard, initialMaxDepth, timeLimit) {
    console.log("Worker received task. Max Depth:", initialMaxDepth, "Time Limit:", timeLimit, "ms");
    console.log("Initial Board State (BigInt):", initialBoard.toString(16)); // Log initial board
    transpositionTable = new Map(); // Clear TT for each new top-level call
    const startTime = performance.now();


    let bestMoveFound = -1;
    let currentDepth = 1;
    let lastCompletedDepthResult = null;


    // Log the board value right before the check
    // console.log("[DEBUG] findBestMove - Checking game over for board:", initialBoard.toString(16));

    // Initial check for immediate game over using the bitboard state
    if (isGameOver(initialBoard)) {
        console.warn("IDDFS: Game is already over at the start.");
        return { move: -1 }; // Indicate no move possible
    }

    while (true) {
        const currentTime = performance.now();
        const timeElapsed = currentTime - startTime;

        // Check time limit *before* starting the search for the current depth
        // Also check if max depth exceeded
        if (timeElapsed > timeLimit || currentDepth > initialMaxDepth) {
            if (currentDepth > 1) {
                 console.log(`IDDFS: Time limit (${timeLimit}ms, elapsed ${timeElapsed.toFixed(0)}ms) or max depth (${initialMaxDepth}) exceeded before starting depth ${currentDepth}. Using move from depth ${currentDepth - 1}.`);
            } else {
                 console.log(`IDDFS: Time limit (${timeLimit}ms, elapsed ${timeElapsed.toFixed(0)}ms) or max depth (${initialMaxDepth}) exceeded before completing depth 1.`);
                 // If depth 1 didn't complete, we might not have a move.
                 // Handle this case after the loop based on bestMoveFound.
            }
            break; // Exit loop
        }

        console.log(`IDDFS: Starting search for depth ${currentDepth}. Time elapsed: ${timeElapsed.toFixed(0)}ms`);
        let currentDepthStartTime = performance.now();

        try {
            // Start expectimax search with the current depth limit using the BigInt board
             let result = expectimaxSearch(initialBoard, currentDepth);
             let currentDepthEndTime = performance.now();
             let depthDuration = (currentDepthEndTime - currentDepthStartTime).toFixed(2);

             // Check if a valid move was found *and* the search didn't immediately return heuristic (move != -1)
             if (result && typeof result.move !== 'undefined' && result.move !== -1) {
                 bestMoveFound = result.move;
                 lastCompletedDepthResult = result; // Store the full result (score+move)
                 console.log(`IDDFS: Depth ${currentDepth} completed in ${depthDuration} ms. Move: ${result.move}, Score: ${result.score.toFixed(2)}`);
             } else {
                 // If no valid move found (result.move === -1), it implies a game over state was reached
                 // or the board is gridlocked at this depth. Rely on the previous depth's result.
                 console.log(`IDDFS: No valid move found or returned at depth ${currentDepth} in ${depthDuration} ms. Using previous depth's result (if any).`);
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
    // Report 0 if no move was ever found OR if depth 1 didn't complete
    const finalDepthReached = bestMoveFound !== -1 ? (currentDepth - 1) : 0;


    console.log(`Bot Worker: Task completed in ${duration} ms. Final Move: ${bestMoveFound}, Reached Depth: ${finalDepthReached}`);

    // Failsafe: If no move was ever found (bestMoveFound is -1)
    if (bestMoveFound === -1) {
        console.warn("IDDFS: No best move identified by search (result was -1 or depth 1 incomplete/timed out).");
        // Double-check if game is *actually* over now using the bitboard state
        if (isGameOver(initialBoard)) {
             console.log("IDDFS: Failsafe confirmed game over via isGameOver(bitboard).");
             // Return -1 to indicate no move possible
             return { move: -1 };
        } else {
             // If game isn't over according to bitboard checks, but search returned no move,
             // try to find *any* valid move using the *actual Grid logic* as a last resort.
             console.warn("IDDFS: Failsafe: No move found by search, but isGameOver(bitboard) is false. Checking with Grid logic.");

             try {
                const grid = decodeBoard(initialBoard, GRID_SIZE); // Decode to Grid object
                if (!grid) {
                    console.error("IDDFS: Failsafe (Grid check) failed to decode board.");
                    return { move: -1 }; // Cannot proceed if decode fails
                }

                for (let dir = 0; dir < 4; dir++) {
                    // Create a copy of the grid to simulate the move, as grid.move modifies the grid
                    // Assumes the imported Grid has `serialize` and the constructor accepts serialized state
                    const gridState = grid.serialize(); // Get serializable state {size: ..., cells: ...}
                    // Check if gridState and gridState.cells are valid before creating new Grid
                    if (!gridState || !gridState.cells) {
                        console.error("IDDFS: Failsafe (Grid check) failed to serialize grid for testing move:", dir);
                        continue; // Try next direction
                    }
                     const testGrid = new Grid(gridState.size, gridState.cells);

                    // Use the actual Grid's move logic. Assumes grid.move(dir) returns {moved: boolean, ...}
                    if (testGrid.move(dir).moved) {
                        console.warn(`IDDFS: Failsafe (Grid check) found valid move: ${dir}`);
                        return { move: dir };
                    }
                }

                // If loop completes without finding a grid-valid move
                console.error("IDDFS: Failsafe (Grid check) could not find any valid move. Returning -1.");
                return { move: -1 };

             } catch (e) {
                console.error("IDDFS: Failsafe (Grid check) encountered an error:", e);
                // Fallback to returning -1 if the Grid check itself fails
                return { move: -1 };
             }
        }
    }

    return { move: bestMoveFound };
}

// --- Worker Message Handling ---
self.onmessage = function(event) {
    var data = event.data;
    if (data.gridState && typeof data.maxDepth !== 'undefined' && typeof data.timeLimit !== 'undefined') {

        // 1. Encode the received gridState directly into a BigInt board
        // Requires a temporary inline Grid/Tile structure for encodeGrid
        let board = 0n;
        const size = data.gridState.size;
        const cells = data.gridState.cells;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // Safely access cell and get value
                const tileValue = (cells && cells[x] && cells[x][y]) ? cells[x][y].value : 0;
                // Calculate exponent, ensure it's valid (log2(0) is -Infinity)
                const exponent = tileValue > 0 ? BigInt(Math.log2(tileValue)) : 0n;
                // Clamp exponent to max 15 (0xF)
                const safeExponent = (exponent > 15n) ? 15n : exponent;
                const shift = BigInt(y * 16 + x * 4);
                board |= (safeExponent << shift);
            }
        }
        const initialBoard = board;

        // Log the initial board being passed to findBestMove
        console.log("onmessage: initialBoard created:", initialBoard.toString(16));

        // 2. Call findBestMove with the initialBoard (BigInt)
        const result = findBestMove(initialBoard, data.maxDepth, data.timeLimit);

        // 3. Send the result back
        self.postMessage({ bestMove: result.move });

    } else if (data.command === 'ping') {
        console.log("Worker received ping");
        self.postMessage({ status: 'ready' });
    } else {
        console.error("Bot Worker: Received invalid message format:", data);
        self.postMessage({ bestMove: null, error: "Invalid message format" });
    }
};

// Generate LUTs on worker start
generateMoveLUTs();

// Log that the worker has loaded
console.log("Bot Worker: Loaded and ready with Bitboard logic.");

/**
 * Checks if the game is over based on the real Grid logic,
 * not on the bitboard moves.
 */
function isGameOver(board) {
  // 1) Decode the bitboard back into a Grid
  const grid = decodeBoard(board);  // you already have decodeBoard above
  if (!grid) {
      console.error("isGameOver: Failed to decode board. Assuming not over.");
      return false; // Safety: if decode fails, assume not over
  }

  // 2) If there's any empty cell, game is not over
  if (grid.availableCells().length > 0) return false;

  // 3) Check every tile for a possible merge with a neighbor
  let mergePossible = false; // Flag to break out of nested loops
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      const tile = grid.cellContent({x,y});
      if (!tile) continue;

      // Check neighbors [right, down] is sufficient since we iterate left-to-right, top-to-bottom
      const neighbors = [[1, 0], [0, 1]]; // Check right and down

      for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          const other = grid.cellContent({x: nx, y: ny});

          // Important: Check if other exists and has the same value
          if (other && other.value === tile.value) {
              mergePossible = true;
              break; // Found a merge, exit inner loop (neighbors)
          }
      }
      if (mergePossible) break; // Exit outer loop (y)
    }
     if (mergePossible) break; // Exit outer loop (x)
  }

  if (mergePossible) {
      return false; // Found a potential merge
  }

  // 4) No empty cells and no merges ⇒ game over
  return true;
}

// --- Previous isGameOver implementation (commented out or removed) ---
/*
function isGameOver(board) {
    // --- Fast path: is there at least one empty cell? ---
    for (let pos = 0; pos < 16; pos++) {
        const shift = BigInt(pos * 4);
        if (((board >> shift) & NYBBLE_MASK) === 0n) {
            return false; // Found empty cell => game continues
        }
    }

    // --- No empty cells: check if any move changes the board ---
    // We purposefully compare the resulting board state rather than relying on the
    // `.moved` flag, in case that flag is computed incorrectly inside the move helpers.
    if (moveUp(board).board !== board)   return false;
    if (moveDown(board).board !== board) return false;
    if (moveLeft(board).board !== board) return false;
    if (moveRight(board).board !== board) return false;

    // No empty cells and no move leads to a different board -> game over.
    return true;
}
*/ 