# Implementing Bitboards for 2048 AI (Step-by-Step Instructions)

This document provides conceptual step-by-step instructions on how to implement a Bitboard representation for a 4x4 2048 game AI, aiming to improve performance. These instructions focus on the logic and structure, not specific code implementation. This primarily affects the AI logic, likely within `bot_worker.js`.

## Core Concepts

1.  **Bitboard Representation:** The 4x4 grid is represented by a single 64-bit integer (use JavaScript's `BigInt`).
2.  **Nybble Encoding:** Each cell (tile) uses 4 bits (a "nybble") to store the exponent of the tile's value (0 for empty, 1 for $2^1$, 2 for $2^2$, ..., 15 for $2^{15}$).
3.  **Board Layout:** The 16 nybbles (64 bits total) are packed into the `BigInt`. A common layout is row-major:
    * Bits 0-15: Row 0 ([0,0], [1,0], [2,0], [3,0])
    * Bits 16-31: Row 1 ([0,1], [1,1], [2,1], [3,1])
    * Bits 32-47: Row 2 ([0,2], [1,2], [2,2], [3,2])
    * Bits 48-63: Row 3 ([0,3], [1,3], [2,3], [3,3])
    * Within each 16-bit row, the nybble for cell `[x, y]` is typically at bits `x*4` to `x*4+3`.
4.  **Lookup Tables (LUTs):** Moves are performed efficiently using precomputed tables mapping every 16-bit row state (65536 possibilities) to its resulting state and the score generated after a move (e.g., "move left").
5.  **Transposition:** Up/down moves are handled by transposing the board's bit representation (swapping rows and columns), performing a left/right move, and transposing back.

## Step-by-Step Implementation Instructions

### Phase 1: Setup and Representation

1.  **Choose Data Type:**
    * Use JavaScript's `BigInt`. Remember the `n` suffix (e.g., `0n`, `15n`, `0xFFFFn`).
2.  **Define Constants:**
    * Define bitmask constants like `NYBBLE_MASK = 0xFn`, `ROW_MASK = 0xFFFFn`.
3.  **Implement Encoding Function (`encodeGrid`):**
    * Create `encodeGrid(grid)` taking the original `Grid` object.
    * Initialize `board = 0n`.
    * Iterate through cells `(x, y)`.
    * Get tile exponent: `exponent = tile ? BigInt(Math.log2(tile.value)) : 0n`.
    * Calculate bit shift: `shift = BigInt(y * 16 + x * 4)`.
    * Place exponent into board: `board = board | (exponent << shift)`.
    * Return `board`.
4.  **Implement Decoding Function (`decodeBoard`):**
    * Create `decodeBoard(board)` taking the `BigInt` board.
    * Create a new empty `Grid` object.
    * Iterate through positions `pos` from 0 to 15 (or `x`, `y`).
    * Calculate `shift = BigInt(y * 16 + x * 4)`.
    * Extract exponent: `exponent = (board >> shift) & NYBBLE_MASK`.
    * If `exponent > 0n`:
        * Calculate value: `value = 1n << exponent` (or `2n ** exponent`).
        * Create `new Tile({ x: x, y: y }, Number(value))` (convert back to `Number`).
        * Insert into the `Grid` object.
    * Return the `Grid` (useful for debugging).
5.  **Implement Tile Value Function (`getTileValue`):**
    * Create helper `getTileValue(board, x, y)`.
    * Calculate `shift = BigInt(y * 16 + x * 4)`.
    * Extract exponent: `exponent = (board >> shift) & NYBBLE_MASK`.
    * Return `exponent === 0n ? 0n : (1n << exponent)`.

### Phase 2: Move Logic and Lookup Tables

6.  **Design Lookup Tables (LUTs):**
    * Declare two global arrays in the worker:
        * `moveRowResultLUT = new Array(65536)`
        * `moveRowScoreLUT = new Array(65536)`
7.  **Generate Move LUTs (`generateMoveLUTs`):**
    * Create this function to run *once* on worker initialization.
    * Iterate `rowState` from 0 to 65535.
    * **Inside the loop:**
        * Decode `rowState` into four 4-bit exponents (`c1`..`c4`).
        * Simulate **"move left"** logic on these exponents:
            * Pack non-zero values to the left.
            * Merge identical adjacent non-zero exponents (e.g., `[2, 2, 1, 0]` becomes `[3, 1, 0, 0]`), updating `rowScore` (`+= (1 << merged_exponent)`). Handle only one merge per pair.
            * Pack again after merges.
        * Encode the resulting four exponents back into `resultRow` (16 bits).
        * Store: `moveRowResultLUT[rowState] = resultRow`, `moveRowScoreLUT[rowState] = rowScore`.
8.  **Implement Row Moves (Left):**
    * Create `moveLeft(board)`.
    * Initialize `newBoard = 0n`, `totalScore = 0n`.
    * Iterate rows `y` from 0 to 3:
        * Calculate `rowShift = BigInt(y * 16)`.
        * Extract row: `row = (board >> rowShift) & ROW_MASK`.
        * Look up result: `resultRow = BigInt(moveRowResultLUT[Number(row)])`.
        * Look up score: `rowScore = BigInt(moveRowScoreLUT[Number(row)])`.
        * `totalScore += rowScore`.
        * Combine result: `newBoard = newBoard | (resultRow << rowShift)`.
    * Return `{ board: newBoard, score: totalScore, moved: board !== newBoard }`.
9.  **Implement Transpose Function (`transpose`):**
    * Create `transpose(board)` taking and returning `BigInt`.
    * This involves complex bit manipulation to swap nybbles corresponding to `cell[x][y]` and `cell[y][x]`. Use masks and shifts. Search for efficient "64-bit matrix transpose bit manipulation" algorithms.
10. **Implement Column Moves (Up):**
    * Create `moveUp(board)`.
    * `transposedBoard = transpose(board)`.
    * `{ board: movedTransposedBoard, score } = moveLeft(transposedBoard)`.
    * `newBoard = transpose(movedTransposedBoard)`.
    * Return `{ board: newBoard, score: score, moved: board !== newBoard }`.
11. **Implement Other Moves (Right, Down):**
    * **`moveRight(board)`:** Either generate a separate `moveRight` LUT or implement by reversing nybbles within each 16-bit row, using the `moveLeft` LUT, and reversing the result nybbles.
    * **`moveDown(board)`:** Use `transpose`, `moveRight`, `transpose`.

### Phase 3: Game Logic and Integration

12. **Implement Random Tile Insertion (`insertRandomTile`):**
    * Create `insertRandomTile(board)`.
    * Find indices (`pos` 0-15) where `(board >> (BigInt(pos) * 4n)) & NYBBLE_MASK === 0n`.
    * If no empty indices, return `board`.
    * Select a random empty `pos`.
    * Determine exponent: `exponent = Math.random() < 0.9 ? 1n : 2n`.
    * Insert: `return board | (exponent << (BigInt(pos) * 4n))`.
13. **Adapt Game Over Check (`isGameOver`):**
    * Create `isGameOver(board)`.
    * Check for empty cells. If found, return `false`.
    * Simulate all 4 moves using the bitboard functions.
    * If any move results in `moved: true`, return `false`.
    * If all moves result in `moved: false`, return `true`.
14. **Adapt Heuristic Function (`calculateHeuristic`):**
    * Modify `calculateHeuristic` to accept the `BigInt` board.
    * Iterate `pos` from 0 to 15.
    * Calculate `x = pos % 4`, `y = Math.floor(pos / 4)`.
    * Extract `exponent` and `value` using shifts and masks as needed.
    * Calculate heuristic components **directly from the `BigInt` representation**, using bitwise operations to access neighbors (e.g., right neighbor is at `pos + 4`). Avoid decoding the whole board.
15. **Integrate into AI Worker (`bot_worker.js`):**
    * Call `generateMoveLUTs()` once at worker start.
    * In `onmessage`, use `encodeGrid` to convert the initial state.
    * Replace `Grid` state with `BigInt` board state in `findBestMove`, `expectimaxSearch`, `evaluateChanceNode`.
    * Replace calls to `simulateMove` with calls to the new bitboard move functions (`moveLeft`, `moveUp`, etc.).
    * Use the new `isGameOver(board)`.
    * Pass the `BigInt` board to the adapted `calculateHeuristic(board)`.
    * Use `insertRandomTile(board)` in the chance node.
    * Use the `BigInt` board state itself as the key for the `transpositionTable` Map (`transpositionTable.set(board, { ... })`).
16. **Testing:**
    * Test `encodeGrid`/`decodeBoard` extensively.
    * Verify each bitboard move function against known scenarios and compare with the old grid logic results.
    * Test `isGameOver` and `insertRandomTile`.
    * Verify the adapted `calculateHeuristic` produces equivalent results.

---

Implementing bitboards is a significant change requiring careful bit manipulation but offers substantial performance improvements for the AI.