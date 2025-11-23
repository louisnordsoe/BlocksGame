"use strict";

(() => {
  const BOARD_SIZE = 8;
  const BASE_POINTS_PER_TILE = 10;
  const LINE_CLEAR_BONUS = 80;
  const SNAP_DISTANCE_PX = 250;
  const SHAPES_PER_BATCH = 3;

  const SHAPES = [
    { name: "Single", color: "#f94144", matrix: [[1]] },
    { name: "Domino", color: "#f3722c", matrix: [[1, 1]] },
    { name: "Bar3", color: "#f8961e", matrix: [[1, 1, 1]] },
    { name: "Bar4", color: "#f9c74f", matrix: [[1, 1, 1, 1]] },
    { name: "Tall3", color: "#90be6d", matrix: [[1], [1], [1]] },
    { name: "Tall4", color: "#43aa8b", matrix: [[1], [1], [1], [1]] },
    { name: "Tall5", color: "#43aa8b", matrix: [[1], [1], [1], [1], [1]] },
    { name: "L1", color: "#27c227ff", matrix: [[1, 1], [1]] },
    { name: "L3", color: "#577590", matrix: [[1, 0], [1, 0], [1, 1]] },
    { name: "L4", color: "#277da1", matrix: [[1, 0, 0], [1, 0, 0], [1, 1, 1]] },
    { name: "Square", color: "#9b5de5", matrix: [[1, 1], [1, 1]] },
    { name: "T", color: "#f15bb5", matrix: [[1, 1, 1], [0, 1, 0]] },
    { name: "Z", color: "#00bbf9", matrix: [[1, 1, 0], [0, 1, 1]] },
    { name: "S", color: "#00f5d4", matrix: [[0, 1, 1], [1, 1, 0]] },
    { name: "Cross", color: "#ffbd00", matrix: [[0, 1, 0], [1, 1, 1], [0, 1, 0]] },
    { name: "BigL", color: "#fb5607", matrix: [[1, 0], [1, 0], [1, 0], [1, 1]] },
    { name: "Chunk", color: "#b5179e", matrix: [[1, 1, 0], [1, 1, 1]] },
    { name: "Block", color: "#b57e17ff", matrix: [[1, 1, 1], [1, 1, 1]] }
  ];

  const SOUND_FILES = {
    place: "sounds/place-block.mp3",
    clear: "sounds/line-clear.mp3",
    gameOver: "sounds/game-over.mp3"
  };

  document.addEventListener("DOMContentLoaded", () => {
    const elements = {
      board: document.getElementById("board"),
      score: document.getElementById("score"),
      status: document.getElementById("status"),
      nextContainer: document.getElementById("next-container"),
      resetButton: document.getElementById("reset-btn"),
      gameOverModal: document.getElementById("game-over-modal"),
      modalRestartButton: document.getElementById("modal-restart-btn")
    };

    if (Object.values(elements).some((el) => !(el instanceof HTMLElement))) {
      console.error("BlocksGame: required DOM nodes are missing.");
      return;
    }

    const audio = createAudioController(SOUND_FILES);
    const game = createGame(elements, audio);

    game.init();
    elements.resetButton.addEventListener("click", () => game.init());
    elements.modalRestartButton.addEventListener("click", () => game.init());
  });

  function createGame(elements, audio) {
    const state = {
      board: [],
      boardCells: [],
      nextShapes: [],
      selectedShapeIndex: null,
      score: 0,
      isGameOver: false,
      previewCells: [],
      statusPulseTimeout: null,
      drag: {
        active: false,
        pointerId: null,
        lastHover: null,
        pivot: null,
        metrics: null,
        ghostEl: null,
        ghostOffset: null
      }
    };

    const handleDragMove = (event) => {
      if (!state.drag.active || !pointerMatches(event)) {
        return;
      }
      event.preventDefault();
      updateDragGhostPosition(event);
      const anchor = getCellFromPoint(event.clientX, event.clientY);
      if (!anchor) {
        if (state.drag.lastHover) {
          state.drag.lastHover = null;
          clearPreview();
        }
        return;
      }
      previewPlacement(anchor.row, anchor.col);
    };

    const handleDragEnd = (event) => {
      if (!state.drag.active || !pointerMatches(event)) {
        return;
      }
      event.preventDefault();
      updateDragGhostPosition(event);
      const dropCell = state.drag.lastHover;
      const didPlace = dropCell ? attemptPlacement(dropCell.row, dropCell.col) : false;
      if (!didPlace) {
        if (!dropCell) {
          pulseStatus("Drag onto the grid to place.");
        }
        clearPreview();
      }
      stopDragging();
    };

    const handleDragCancel = (event) => {
      if (!state.drag.active || !pointerMatches(event)) {
        return;
      }
      clearPreview();
      stopDragging();
    };

    function init() {
      stopDragging(true);
      resetStatus();
      hideGameOverModal();
      state.board = createEmptyBoard();
      state.boardCells = buildBoardCells();
      state.nextShapes = createShapeBatch();
      state.selectedShapeIndex = null;
      state.score = 0;
      state.isGameOver = false;
      state.previewCells = [];
      updateScore(0);
      renderBoard();
      renderNextShapes();
      checkForMoveAvailability();
    }

    function resetStatus() {
      cancelStatusPulse();
      elements.status.textContent = "";
      elements.status.classList.remove("lose");
    }

    function buildBoardCells() {
      elements.board.innerHTML = "";
      const fragment = document.createDocumentFragment();
      const cells = [];
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        const rowCells = [];
        for (let col = 0; col < BOARD_SIZE; col += 1) {
          const cell = document.createElement("div");
          cell.className = "cell";
          cell.dataset.row = String(row);
          cell.dataset.col = String(col);
          fragment.appendChild(cell);
          rowCells.push(cell);
        }
        cells.push(rowCells);
      }
      elements.board.appendChild(fragment);
      return cells;
    }

    function renderBoard() {
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
          const cellEl = state.boardCells[row]?.[col];
          if (!cellEl) {
            continue;
          }
          const value = state.board[row][col];
          cellEl.classList.remove("preview");
          cellEl.style.removeProperty("--preview-color");
          if (value) {
            cellEl.style.setProperty("--fill-color", value);
            cellEl.classList.add("filled");
          } else {
            cellEl.style.removeProperty("--fill-color");
            cellEl.classList.remove("filled");
          }
        }
      }
    }

    function renderNextShapes() {
      const availability = state.nextShapes.map((shape) => canPlaceShape(shape.matrix, state.board));
      if (state.selectedShapeIndex !== null && !availability[state.selectedShapeIndex]) {
        state.selectedShapeIndex = null;
        clearPreview();
      }
      const fragment = document.createDocumentFragment();
      state.nextShapes.forEach((shape, index) => {
        const wrapper = document.createElement("button");
        wrapper.type = "button";
        wrapper.className = "next-shape";
        wrapper.dataset.index = String(index);
        wrapper.setAttribute("aria-label", `${shape.name} shape`);
        const cols = shape.matrix[0]?.length ?? 1;
        wrapper.style.gridTemplateColumns = `repeat(${cols}, 22px)`;
        const isPlaceable = availability[index];
        wrapper.disabled = !isPlaceable;
        wrapper.classList.toggle("unavailable", !isPlaceable);
        if (!isPlaceable) {
          wrapper.setAttribute("aria-disabled", "true");
        } else {
          wrapper.removeAttribute("aria-disabled");
        }

        shape.matrix.forEach((rowValues, rowIndex) => {
          rowValues.forEach((value, colIndex) => {
            const miniCell = document.createElement("span");
            miniCell.dataset.row = String(rowIndex);
            miniCell.dataset.col = String(colIndex);
            if (value) {
              miniCell.className = "next-cell";
              miniCell.style.backgroundColor = shape.color;
            } else {
              miniCell.className = "next-cell empty";
              miniCell.style.backgroundColor = "transparent";
            }
            wrapper.appendChild(miniCell);
          });
        });

        if (index === state.selectedShapeIndex) {
          wrapper.classList.add("selected");
        }

        wrapper.addEventListener("pointerdown", (event) => {
          const pivot = resolveShapePivot(event, shape);
          startShapeDrag(index, event, pivot);
        });

        wrapper.addEventListener("click", (event) => {
          event.preventDefault();
        });

        fragment.appendChild(wrapper);
      });

      elements.nextContainer.replaceChildren(fragment);
      updateShapeSelection();
    }

    function updateShapeSelection() {
      const buttons = elements.nextContainer.querySelectorAll(".next-shape");
      buttons.forEach((button, index) => {
        button.classList.toggle("selected", index === state.selectedShapeIndex);
      });
    }

    function startShapeDrag(index, event, pivotOverride) {
      if (state.isGameOver) {
        return;
      }
      if (event.button !== undefined && event.button !== 0) {
        return;
      }
      event.preventDefault();
      if (state.drag.active) {
        stopDragging();
      }
      const shape = state.nextShapes[index];
      if (!shape || !canPlaceShape(shape.matrix, state.board)) {
        state.selectedShapeIndex = null;
        return;
      }
      state.selectedShapeIndex = index;
      const pivot = pivotOverride ?? defaultPivotForShape(shape);
      state.drag.active = true;
      state.drag.pointerId = typeof event.pointerId === "number" ? event.pointerId : "mouse";
      state.drag.lastHover = null;
      state.drag.pivot = pivot;
      state.drag.metrics = null;
      state.drag.ghostOffset = null;
      createDragGhost(shape, pivot, event);
      state.previewCells = [];
      updateShapeSelection();
      window.addEventListener("pointermove", handleDragMove);
      window.addEventListener("pointerup", handleDragEnd);
      window.addEventListener("pointercancel", handleDragCancel);
      handleDragMove(event);
    }

    function stopDragging(resetSelection = false) {
      window.removeEventListener("pointermove", handleDragMove);
      window.removeEventListener("pointerup", handleDragEnd);
      window.removeEventListener("pointercancel", handleDragCancel);
      state.drag.active = false;
      state.drag.pointerId = null;
      state.drag.lastHover = null;
      state.drag.pivot = null;
      state.drag.metrics = null;
      state.drag.ghostOffset = null;
      removeDragGhost();
      clearPreview();
      if (resetSelection) {
        state.selectedShapeIndex = null;
      }
      updateShapeSelection();
    }

    function updateScore(value) {
      elements.score.textContent = `Score: ${value}`;
    }

    function previewPlacement(row, col) {
      if (state.selectedShapeIndex === null) {
        return;
      }
      const shape = state.nextShapes[state.selectedShapeIndex];
      if (!shape) {
        return;
      }
      const placement = getPlacementCells(shape.matrix, row, col, state.board);
      state.drag.lastHover = { row, col };
      clearPreview();
      if (!placement.valid) {
        return;
      }
      state.previewCells = placement.cells;
      const previewColor = computePreviewColor(shape.color);
      state.previewCells.forEach(({ row: r, col: c }) => {
        const cellEl = state.boardCells[r]?.[c];
        if (!cellEl) {
          return;
        }
        cellEl.style.setProperty("--preview-color", previewColor);
        cellEl.classList.add("preview");
      });
    }

    function clearPreview() {
      if (!state.previewCells.length) {
        state.previewCells = [];
        return;
      }
      state.previewCells.forEach(({ row, col }) => {
        const cellEl = state.boardCells[row]?.[col];
        if (!cellEl) {
          return;
        }
        cellEl.classList.remove("preview");
        cellEl.style.removeProperty("--preview-color");
      });
      state.previewCells = [];
    }

    function attemptPlacement(anchorRow, anchorCol) {
      if (state.selectedShapeIndex === null || state.isGameOver) {
        return false;
      }
      const shape = state.nextShapes[state.selectedShapeIndex];
      if (!shape) {
        return false;
      }
      const placement = getPlacementCells(shape.matrix, anchorRow, anchorCol, state.board);
      if (!placement.valid) {
        pulseStatus("That shape does not fit there.");
        return false;
      }

      placement.cells.forEach(({ row, col }) => {
        state.board[row][col] = shape.color;
      });

      const tilesPlaced = placement.cells.length;
      let pointsEarned = tilesPlaced * BASE_POINTS_PER_TILE;
      const { totalLines, rowsCleared, colsCleared } = clearCompletedLines(state.board);
      if (totalLines > 0) {
        pointsEarned += totalLines * LINE_CLEAR_BONUS;
        const parts = [];
        if (rowsCleared) {
          parts.push(`${rowsCleared} ${rowsCleared === 1 ? "row" : "rows"}`);
        }
        if (colsCleared) {
          parts.push(`${colsCleared} ${colsCleared === 1 ? "column" : "columns"}`);
        }
        const description = parts.join(" and ") || `${totalLines} ${totalLines === 1 ? "line" : "lines"}`;
        pulseStatus(`Cleared ${description}!`);
        audio.play("clear");
      } else {
        audio.play("place");
      }

      state.score += pointsEarned;
      updateScore(state.score);
      state.nextShapes.splice(state.selectedShapeIndex, 1);
      state.selectedShapeIndex = null;
      state.drag.lastHover = null;
      clearPreview();
      renderBoard();
      renderNextShapes();

      if (state.nextShapes.length === 0) {
        state.nextShapes = createShapeBatch();
        renderNextShapes();
      }

      checkForMoveAvailability();
      return true;
    }

    function pulseStatus(message) {
      cancelStatusPulse();
      elements.status.textContent = message;
      elements.status.classList.remove("lose");
      elements.status.classList.add("pulse");
      state.statusPulseTimeout = window.setTimeout(() => {
        elements.status.classList.remove("pulse");
        state.statusPulseTimeout = null;
      }, 350);
    }

    function cancelStatusPulse() {
      if (state.statusPulseTimeout !== null) {
        window.clearTimeout(state.statusPulseTimeout);
        state.statusPulseTimeout = null;
      }
      elements.status.classList.remove("pulse");
    }

    function checkForMoveAvailability() {
      if (state.isGameOver) {
        return;
      }
      const canPlaceAny = state.nextShapes.some((shape) => canPlaceShape(shape.matrix, state.board));
      if (!canPlaceAny) {
        state.isGameOver = true;
        stopDragging(true);
        cancelStatusPulse();
        elements.status.textContent = "No moves left. Game over!";
        elements.status.classList.add("lose");
        audio.play("gameOver");
        showGameOverModal();
      }
    }

    function pointerMatches(event) {
      const pointerId = typeof event.pointerId === "number" ? event.pointerId : "mouse";
      return state.drag.pointerId === pointerId;
    }

    function getCellFromPoint(clientX, clientY) {
      if (state.selectedShapeIndex === null) {
        return null;
      }
      const shape = state.nextShapes[state.selectedShapeIndex];
      if (!shape) {
        return null;
      }
      const pivot = state.drag.pivot ?? defaultPivotForShape(shape);
      const metrics = getBoardMetrics();
      if (!metrics) {
        return null;
      }
      return findBestAnchor(shape.matrix, clientX, clientY, pivot, metrics, state.board);
    }

    function getBoardMetrics() {
      const rect = elements.board.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      const previous = state.drag.metrics;
      if (
        !previous ||
        previous.rect.width !== rect.width ||
        previous.rect.height !== rect.height ||
        previous.rect.left !== rect.left ||
        previous.rect.top !== rect.top
      ) {
        state.drag.metrics = {
          rect,
          cellWidth: rect.width / BOARD_SIZE,
          cellHeight: rect.height / BOARD_SIZE
        };
      }
      return state.drag.metrics;
    }

    function createDragGhost(shape, pivot, event) {
      removeDragGhost();
      if (!shape) {
        return;
      }
      const metrics =
        getBoardMetrics() ?? {
          rect: null,
          cellWidth: elements.board.clientWidth / BOARD_SIZE || 32,
          cellHeight: elements.board.clientHeight / BOARD_SIZE || 32
        };
      const boardStyles = window.getComputedStyle(elements.board);
      const gapTokens = boardStyles.gap.trim().split(/\s+/).filter(Boolean);
      const parseToken = (value) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const gapX = gapTokens.length > 0 ? parseToken(gapTokens[0]) : 0;
      const gapY = gapTokens.length > 1 ? parseToken(gapTokens[1]) : gapX;
      const cols = shape.matrix[0]?.length ?? 1;
      const ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      ghost.style.gridTemplateColumns = `repeat(${cols}, ${metrics.cellWidth}px)`;
      ghost.style.gridAutoRows = `${metrics.cellHeight}px`;
      if (gapX > 0 || gapY > 0) {
        ghost.style.columnGap = `${gapX}px`;
        ghost.style.rowGap = `${gapY}px`;
      }
      shape.matrix.forEach((rowValues) => {
        rowValues.forEach((value) => {
          if (!value) {
            const emptyCell = document.createElement("span");
            emptyCell.className = "drag-ghost-cell empty";
            ghost.appendChild(emptyCell);
            return;
          }
          const cell = document.createElement("span");
          cell.className = "drag-ghost-cell filled";
          cell.style.setProperty("--fill-color", shape.color);
          ghost.appendChild(cell);
        });
      });
      document.body.appendChild(ghost);
      state.drag.ghostEl = ghost;
      const pivotRow = pivot?.row ?? 0;
      const pivotCol = pivot?.col ?? 0;
      state.drag.ghostOffset = {
        x: pivotCol * metrics.cellWidth + pivotCol * gapX + metrics.cellWidth / 2,
        y: pivotRow * metrics.cellHeight + pivotRow * gapY + metrics.cellHeight / 2
      };
      if (event) {
        updateDragGhostPosition(event);
      }
    }

    function updateDragGhostPosition(event) {
      const ghost = state.drag.ghostEl;
      if (!ghost || !event) {
        return;
      }
      const offset = state.drag.ghostOffset;
      if (!offset) {
        return;
      }
      const x = event.clientX - offset.x;
      const y = event.clientY - offset.y;
      ghost.style.transform = `translate(${x}px, ${y}px)`;
    }

    function removeDragGhost() {
      if (state.drag.ghostEl && state.drag.ghostEl.parentElement) {
        state.drag.ghostEl.parentElement.removeChild(state.drag.ghostEl);
      }
      state.drag.ghostEl = null;
      state.drag.ghostOffset = null;
    }

    function showGameOverModal() {
      if (!(elements.gameOverModal instanceof HTMLElement)) {
        return;
      }
      elements.gameOverModal.hidden = false;
      if (elements.modalRestartButton instanceof HTMLElement) {
        window.setTimeout(() => {
          try {
            elements.modalRestartButton.focus({ preventScroll: true });
          } catch (error) {
            elements.modalRestartButton.focus();
          }
        }, 0);
      }
    }

    function hideGameOverModal() {
      if (!(elements.gameOverModal instanceof HTMLElement)) {
        return;
      }
      elements.gameOverModal.hidden = true;
    }

    return { init };
  }

  function createAudioController(soundFiles) {
    if (typeof Audio === "undefined") {
      return { play: () => {} };
    }

    const pool = new Map();
    Object.entries(soundFiles).forEach(([name, src]) => {
      const audio = new Audio(src);
      audio.preload = "auto";
      audio.volume = 0.75;
      pool.set(name, audio);
    });

    let unlocked = false;

    const unlock = () => {
      if (unlocked) {
        return;
      }
      unlocked = true;
      const unlockTasks = [];
      pool.forEach((audio) => {
        try {
          const playPromise = audio.play();
          if (playPromise && typeof playPromise.then === "function") {
            unlockTasks.push(
              playPromise
                .then(() => {
                  audio.pause();
                  audio.currentTime = 0;
                })
                .catch(() => {})
            );
          } else {
            audio.pause();
            audio.currentTime = 0;
          }
        } catch (error) {
          // ignore unlock errors triggered by autoplay policies.
        }
      });
      if (unlockTasks.length) {
        Promise.all(unlockTasks).catch(() => {});
      }
    };

    const unlockOptions = {
      pointerdown: { once: true, passive: true },
      touchstart: { once: true, passive: true },
      keydown: { once: true }
    };

    Object.entries(unlockOptions).forEach(([eventName, options]) => {
      document.addEventListener(eventName, unlock, options);
    });

    return {
      play(name) {
        if (!unlocked) {
          return;
        }
        const audio = pool.get(name);
        if (!audio) {
          return;
        }
        try {
          audio.currentTime = 0;
          const playPromise = audio.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {});
          }
        } catch (error) {
          // Ignore playback errors to keep gameplay responsive.
        }
      }
    };
  }

  function createEmptyBoard() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  }

// Function to rotate a matrix 90 degrees clockwise
function rotateMatrix(matrix) {
  if (!matrix || matrix.length === 0) return [];
  const rows = matrix.length;
  const cols = matrix[0].length;
  // Initialize the new matrix (dimensions are swapped)
  const newMatrix = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Rotation logic: new_row = old_col, new_col = (rows - 1) - old_row
      newMatrix[c][rows - 1 - r] = matrix[r][c];
    }
  }
  return newMatrix;
}

function createShapeBatch() {
    const batch = [];
    
    // Create a temporary list of shapes that should be considered as templates
    // Exclude the fixed, explicit vertical shapes like Tall3/Tall4 if we are rotating.
    const rotationTemplates = SHAPES.filter(shape => 
        shape.name !== "Tall3" && shape.name !== "Tall4"
    );

    while (batch.length < SHAPES_PER_BATCH) {
        // 1. Pick a base shape template (e.g., Bar4)
        const template = rotationTemplates[Math.floor(Math.random() * rotationTemplates.length)];
        let newShape = cloneShapeDefinition(template);

        // 2. Decide how many rotations to apply (0, 1, 2, or 3 times)
        const rotations = Math.floor(Math.random() * 4); // 0 to 3 rotations

        // 3. Apply the rotations
        for (let i = 0; i < rotations; i++) {
            newShape.matrix = rotateMatrix(newShape.matrix);
        }

        // 4. Handle Symmetrical Shapes
        // After rotating, a shape like 'Square' or 'Cross' will return to its original matrix.
        // Asymmetrical shapes like 'L3' will yield 4 unique variations.

        batch.push(newShape);
    }
    return batch;
}

  function cloneShapeDefinition(template) {
    return {
      id: createShapeId(),
      name: template.name,
      matrix: template.matrix.map((row) => row.slice()),
      color: template.color
    };
  }

  function getPlacementCells(matrix, anchorRow, anchorCol, board) {
    const cells = [];
    for (let r = 0; r < matrix.length; r += 1) {
      for (let c = 0; c < matrix[r].length; c += 1) {
        if (!matrix[r][c]) {
          continue;
        }
        const targetRow = anchorRow + r;
        const targetCol = anchorCol + c;
        if (
          targetRow < 0 ||
          targetRow >= BOARD_SIZE ||
          targetCol < 0 ||
          targetCol >= BOARD_SIZE ||
          board[targetRow][targetCol]
        ) {
          return { valid: false, cells: [] };
        }
        cells.push({ row: targetRow, col: targetCol });
      }
    }
    return { valid: true, cells };
  }

  function canPlaceShape(matrix, board) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (getPlacementCells(matrix, row, col, board).valid) {
          return true;
        }
      }
    }
    return false;
  }

  function clearCompletedLines(board) {
    const rowsToClear = [];
    const colsToClear = [];

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      if (board[row].every((cell) => Boolean(cell))) {
        rowsToClear.push(row);
      }
    }

    for (let col = 0; col < BOARD_SIZE; col += 1) {
      let fullColumn = true;
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        if (!board[row][col]) {
          fullColumn = false;
          break;
        }
      }
      if (fullColumn) {
        colsToClear.push(col);
      }
    }

    if (!rowsToClear.length && !colsToClear.length) {
      return { rowsCleared: 0, colsCleared: 0, totalLines: 0 };
    }

    rowsToClear.forEach((rowIndex) => {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        board[rowIndex][col] = null;
      }
    });

    colsToClear.forEach((colIndex) => {
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        board[row][colIndex] = null;
      }
    });

    return {
      rowsCleared: rowsToClear.length,
      colsCleared: colsToClear.length,
      totalLines: rowsToClear.length + colsToClear.length
    };
  }

  function findBestAnchor(matrix, clientX, clientY, pivot, metrics, board) {
    const { rect, cellWidth, cellHeight } = metrics;
    if (
      clientX < rect.left - SNAP_DISTANCE_PX ||
      clientX > rect.right + SNAP_DISTANCE_PX ||
      clientY < rect.top - SNAP_DISTANCE_PX ||
      clientY > rect.bottom + SNAP_DISTANCE_PX
    ) {
      return null;
    }

    const pointerColCoord = (clientX - rect.left) / cellWidth;
    const pointerRowCoord = (clientY - rect.top) / cellHeight;
    const pivotRow = pivot?.row ?? 0;
    const pivotCol = pivot?.col ?? 0;
    const rounders = [Math.round, Math.floor, Math.ceil];

    let bestAnchor = null;
    let bestDistance = SNAP_DISTANCE_PX;

    rounders.forEach((roundRow) => {
      rounders.forEach((roundCol) => {
        const anchorRow = roundRow(pointerRowCoord - pivotRow);
        const anchorCol = roundCol(pointerColCoord - pivotCol);
        const placement = getPlacementCells(matrix, anchorRow, anchorCol, board);
        if (!placement.valid) {
          return;
        }
        const distance = distanceToPivot(
          clientX,
          clientY,
          anchorRow,
          anchorCol,
          pivotRow,
          pivotCol,
          metrics
        );
        if (distance <= bestDistance) {
          bestDistance = distance;
          bestAnchor = { row: anchorRow, col: anchorCol };
        }
      });
    });

    if (bestAnchor) {
      return bestAnchor;
    }

    let fallbackAnchor = null;
    let fallbackDistance = SNAP_DISTANCE_PX;

    for (let anchorRow = 0; anchorRow < BOARD_SIZE; anchorRow += 1) {
      for (let anchorCol = 0; anchorCol < BOARD_SIZE; anchorCol += 1) {
        const placement = getPlacementCells(matrix, anchorRow, anchorCol, board);
        if (!placement.valid) {
          continue;
        }
        const distance = distanceToPivot(
          clientX,
          clientY,
          anchorRow,
          anchorCol,
          pivotRow,
          pivotCol,
          metrics
        );
        if (distance <= fallbackDistance) {
          fallbackDistance = distance;
          fallbackAnchor = { row: anchorRow, col: anchorCol };
        }
      }
    }

    return fallbackAnchor;
  }

  function distanceToPivot(clientX, clientY, anchorRow, anchorCol, pivotRow, pivotCol, metrics) {
    const { rect, cellWidth, cellHeight } = metrics;
    const centerX = rect.left + (anchorCol + pivotCol + 0.5) * cellWidth;
    const centerY = rect.top + (anchorRow + pivotRow + 0.5) * cellHeight;
    return Math.hypot(clientX - centerX, clientY - centerY);
  }

  function resolveShapePivot(event, shape) {
    if (!shape) {
      return { row: 0, col: 0 };
    }
    const target = event.target instanceof Element ? event.target.closest(".next-cell") : null;
    if (target) {
      const row = Number(target.dataset.row);
      const col = Number(target.dataset.col);
      if (
        Number.isInteger(row) &&
        Number.isInteger(col) &&
        shape.matrix[row] &&
        shape.matrix[row][col]
      ) {
        return { row, col };
      }
    }
    return defaultPivotForShape(shape);
  }

  function defaultPivotForShape(shape) {
    if (!shape || !shape.matrix) {
      return { row: 0, col: 0 };
    }
    for (let row = 0; row < shape.matrix.length; row += 1) {
      for (let col = 0; col < shape.matrix[row].length; col += 1) {
        if (shape.matrix[row][col]) {
          return { row, col };
        }
      }
    }
    return { row: 0, col: 0 };
  }

  function computePreviewColor(hexColor) {
    if (!hexColor || typeof hexColor !== "string") {
      return "rgba(76, 201, 240, 0.4)";
    }
    const normalized = hexColor.trim();
    if (!normalized.startsWith("#")) {
      return normalized;
    }
    const hex = normalized.slice(1);
    const expanded =
      hex.length === 3
        ? hex
            .split("")
            .map((char) => char + char)
            .join("")
        : hex;
    if (expanded.length !== 6) {
      return "rgba(76, 201, 240, 0.4)";
    }
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    if ([r, g, b].some((channel) => Number.isNaN(channel))) {
      return "rgba(76, 201, 240, 0.4)";
    }
    return `rgba(${r}, ${g}, ${b}, 0.8)`;
  }

  function createShapeId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `shape-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
})();
