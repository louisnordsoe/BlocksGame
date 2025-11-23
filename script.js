const BOARD_SIZE = 10;
const BASE_POINTS_PER_TILE = 10;
const LINE_CLEAR_BONUS = 80;
const SNAP_DISTANCE_PX = 250;

const boardElement = document.getElementById("board");
const scoreElement = document.getElementById("score");
const statusElement = document.getElementById("status");
const nextContainer = document.getElementById("next-container");
const resetButton = document.getElementById("reset-btn");

let board;
let boardCells;
let nextShapes;
let selectedShapeIndex;
let score;
let isGameOver;
let previewCells = [];
let isDragging = false;
let dragPointerId = null;
let lastHoverCell = null;
let selectedPivot = null;

const SHAPES = [
  { name: "Single", color: "#f94144", matrix: [[1]] },
  { name: "Domino", color: "#f3722c", matrix: [[1, 1]] },
  { name: "Bar3", color: "#f8961e", matrix: [[1, 1, 1]] },
  { name: "Bar4", color: "#f9c74f", matrix: [[1, 1, 1, 1]] },
  { name: "Tall3", color: "#90be6d", matrix: [[1], [1], [1]] },
  { name: "Tall4", color: "#43aa8b", matrix: [[1], [1], [1], [1]] },
  { name: "L3", color: "#577590", matrix: [[1, 0], [1, 0], [1, 1]] },
  { name: "L4", color: "#277da1", matrix: [[1, 0, 0], [1, 0, 0], [1, 1, 1]] },
  { name: "Square", color: "#9b5de5", matrix: [[1, 1], [1, 1]] },
  { name: "T", color: "#f15bb5", matrix: [[1, 1, 1], [0, 1, 0]] },
  { name: "Z", color: "#00bbf9", matrix: [[1, 1, 0], [0, 1, 1]] },
  { name: "S", color: "#00f5d4", matrix: [[0, 1, 1], [1, 1, 0]] },
  { name: "Cross", color: "#ffbd00", matrix: [[0, 1, 0], [1, 1, 1], [0, 1, 0]] },
  { name: "BigL", color: "#fb5607", matrix: [[1, 0], [1, 0], [1, 0], [1, 1]] },
  { name: "Chunk", color: "#b5179e", matrix: [[1, 1, 0], [1, 1, 1]] }
];

document.addEventListener("DOMContentLoaded", () => {
  initGame();
  resetButton.addEventListener("click", initGame);
});

function initGame() {
  stopDragging(true);
  board = createEmptyBoard();
  boardCells = createBoardCells();
  nextShapes = dealShapes();
  selectedShapeIndex = null;
  score = 0;
  isGameOver = false;
  lastHoverCell = null;
  previewCells = [];
  selectedPivot = null;
  updateScore(0);
  renderBoard();
  renderNextShapes();
  statusElement.textContent = "";
  statusElement.classList.remove("lose");
  checkForMoveAvailability();
}

function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function createBoardCells() {
  boardElement.innerHTML = "";
  const cells = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    const rowCells = [];
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = row;
      cell.dataset.col = col;
      boardElement.appendChild(cell);
      rowCells.push(cell);
    }
    cells.push(rowCells);
  }
  return cells;
}

function dealShapes() {
  const batch = [];
  while (batch.length < 4) {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    batch.push({
      id: createShapeId(),
      name: shape.name,
      matrix: shape.matrix.map((row) => [...row]),
      color: shape.color
    });
  }
  return batch;
}

function renderBoard() {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = boardCells[row][col];
      const value = board[row][col];
      cell.style.removeProperty("--preview-color");
      if (value) {
        cell.style.setProperty("--fill-color", value);
      } else {
        cell.style.removeProperty("--fill-color");
      }
      cell.classList.toggle("filled", Boolean(value));
    }
  }
}

function renderNextShapes() {
  nextContainer.innerHTML = "";
  nextShapes.forEach((shape, index) => {
    const wrapper = document.createElement("button");
    wrapper.type = "button";
    wrapper.className = "next-shape";
    wrapper.dataset.index = index;
    wrapper.setAttribute("aria-label", `${shape.name} shape`);
    const cols = shape.matrix[0].length;
    wrapper.style.gridTemplateColumns = `repeat(${cols}, 22px)`;

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

    if (index === selectedShapeIndex) {
      wrapper.classList.add("selected");
    }

    wrapper.addEventListener("pointerdown", (event) => {
      const pivot = resolveShapePivot(event, shape);
      startShapeDrag(index, event, pivot);
    });

    wrapper.addEventListener("click", (event) => {
      event.preventDefault();
    });

    nextContainer.appendChild(wrapper);
  });
}

function clearPreview() {
  if (!boardCells || !previewCells.length) {
    previewCells = [];
    return;
  }
  previewCells.forEach(({ row, col }) => {
    const cellEl = boardCells[row] && boardCells[row][col];
    if (!cellEl) {
      return;
    }
    cellEl.classList.remove("preview");
    cellEl.style.removeProperty("--preview-color");
  });
  previewCells = [];
}

function startShapeDrag(index, event, pivotOverride) {
  if (isGameOver) {
    return;
  }
  if (event.button !== undefined && event.button !== 0) {
    return;
  }
  event.preventDefault();
  if (isDragging) {
    stopDragging();
  }
  selectedShapeIndex = index;
  const shape = nextShapes[index];
  if (!shape) {
    return;
  }
  const pivot = pivotOverride ?? defaultPivotForShape(shape);
  selectedPivot = pivot;
  updateShapeSelection();
  isDragging = true;
  dragPointerId = typeof event.pointerId === "number" ? event.pointerId : "mouse";
  lastHoverCell = null;
  clearPreview();
  addDragListeners();
  onDragMove(event);
}

function addDragListeners() {
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragCancel);
}

function removeDragListeners() {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  window.removeEventListener("pointercancel", onDragCancel);
}

function onDragMove(event) {
  if (!isDragging || !pointerMatches(event)) {
    return;
  }
  event.preventDefault();
  const anchor = getCellFromPoint(event.clientX, event.clientY);
  if (!anchor) {
    if (lastHoverCell !== null) {
      lastHoverCell = null;
      clearPreview();
    }
    return;
  }
  previewPlacement(anchor.row, anchor.col);
}

function onDragEnd(event) {
  if (!isDragging || !pointerMatches(event)) {
    return;
  }
  event.preventDefault();
  const dropCell = lastHoverCell;
  const didPlace = dropCell ? attemptPlacement(dropCell.row, dropCell.col) : false;
  if (!didPlace) {
    if (!dropCell) {
      pulseStatus("Drag onto the grid to place.");
    }
    clearPreview();
  }
  stopDragging();
}

function onDragCancel(event) {
  if (!isDragging || !pointerMatches(event)) {
    return;
  }
  clearPreview();
  stopDragging();
}

function pointerMatches(event) {
  const pointerId = typeof event.pointerId === "number" ? event.pointerId : "mouse";
  return dragPointerId === pointerId;
}

function getCellFromPoint(clientX, clientY) {
  if (selectedShapeIndex === null || !boardCells || !boardCells.length) {
    return null;
  }
  const shape = nextShapes[selectedShapeIndex];
  if (!shape) {
    return null;
  }
  const pivot = selectedPivot ?? defaultPivotForShape(shape);
  return findBestAnchor(shape.matrix, clientX, clientY, pivot);
}

function findBestAnchor(matrix, clientX, clientY, pivot) {
  const boardRect = boardElement.getBoundingClientRect();
  const maxDistance = SNAP_DISTANCE_PX;
  if (
    clientX < boardRect.left - maxDistance ||
    clientX > boardRect.right + maxDistance ||
    clientY < boardRect.top - maxDistance ||
    clientY > boardRect.bottom + maxDistance
  ) {
    return null;
  }

  const cellWidth = boardRect.width / BOARD_SIZE;
  const cellHeight = boardRect.height / BOARD_SIZE;
  if (cellWidth <= 0 || cellHeight <= 0) {
    return null;
  }

  const pointerColCoord = (clientX - boardRect.left) / cellWidth;
  const pointerRowCoord = (clientY - boardRect.top) / cellHeight;

  const pivotRow = pivot?.row ?? 0;
  const pivotCol = pivot?.col ?? 0;
  const rounders = [Math.round, Math.floor, Math.ceil];

  let bestAnchor = null;
  let bestDistance = maxDistance;

  rounders.forEach((roundRow) => {
    rounders.forEach((roundCol) => {
      const anchorRow = roundRow(pointerRowCoord - pivotRow);
      const anchorCol = roundCol(pointerColCoord - pivotCol);
      const placement = getPlacementCells(matrix, anchorRow, anchorCol);
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
        cellWidth,
        cellHeight,
        boardRect
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
  let fallbackDistance = maxDistance;

  for (let anchorRow = 0; anchorRow < BOARD_SIZE; anchorRow += 1) {
    for (let anchorCol = 0; anchorCol < BOARD_SIZE; anchorCol += 1) {
      const placement = getPlacementCells(matrix, anchorRow, anchorCol);
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
        cellWidth,
        cellHeight,
        boardRect
      );
      if (distance <= fallbackDistance) {
        fallbackDistance = distance;
        fallbackAnchor = { row: anchorRow, col: anchorCol };
      }
    }
  }

  return fallbackAnchor;
}

function distanceToPivot(clientX, clientY, anchorRow, anchorCol, pivotRow, pivotCol, cellWidth, cellHeight, boardRect) {
  const centerX = boardRect.left + (anchorCol + pivotCol + 0.5) * cellWidth;
  const centerY = boardRect.top + (anchorRow + pivotRow + 0.5) * cellHeight;
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

function previewPlacement(row, col) {
  if (selectedShapeIndex === null) {
    return;
  }
  const shape = nextShapes[selectedShapeIndex];
  const placement = getPlacementCells(shape.matrix, row, col);
  lastHoverCell = { row, col };
  clearPreview();
  if (!placement.valid) {
    return;
  }
  previewCells = placement.cells;
  const previewColor = computePreviewColor(shape.color);
  previewCells.forEach(({ row: r, col: c }) => {
    const cellEl = boardCells[r][c];
    cellEl.style.setProperty("--preview-color", previewColor);
    cellEl.classList.add("preview");
  });
}

function updateShapeSelection() {
  const buttons = nextContainer.querySelectorAll(".next-shape");
  buttons.forEach((button, index) => {
    button.classList.toggle("selected", index === selectedShapeIndex);
  });
}

function attemptPlacement(anchorRow, anchorCol) {
  if (selectedShapeIndex === null || isGameOver) {
    return false;
  }
  const currentShape = nextShapes[selectedShapeIndex];
  const placement = getPlacementCells(currentShape.matrix, anchorRow, anchorCol);
  if (!placement.valid) {
    pulseStatus("That shape does not fit there.");
    return false;
  }

  placement.cells.forEach(({ row, col }) => {
    board[row][col] = currentShape.color;
  });

  const tilesPlaced = placement.cells.length;
  let pointsEarned = tilesPlaced * BASE_POINTS_PER_TILE;
  const linesCleared = clearFullLines();
  if (linesCleared > 0) {
    pointsEarned += linesCleared * LINE_CLEAR_BONUS;
    pulseStatus(`Cleared ${linesCleared} ${linesCleared === 1 ? "line" : "lines"}!`);
  }

  score += pointsEarned;
  updateScore(score);
  nextShapes.splice(selectedShapeIndex, 1);
  selectedShapeIndex = null;
  clearPreview();
  renderBoard();
  renderNextShapes();

  if (nextShapes.length === 0) {
    nextShapes = dealShapes();
    renderNextShapes();
  }

  checkForMoveAvailability();
  return true;
}

function stopDragging(resetSelection = false) {
  if (!isDragging && !resetSelection) {
    return;
  }
  removeDragListeners();
  isDragging = false;
  dragPointerId = null;
  lastHoverCell = null;
  selectedPivot = null;
  clearPreview();
  if (resetSelection) {
    selectedShapeIndex = null;
  }
  updateShapeSelection();
}

function updateScore(value) {
  scoreElement.textContent = `Score: ${value}`;
}

function getPlacementCells(matrix, anchorRow, anchorCol) {
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

function clearFullLines() {
  const fullRows = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    if (board[row].every((cell) => Boolean(cell))) {
      fullRows.push(row);
    }
  }

  if (fullRows.length === 0) {
    return 0;
  }

  // Drop filled rows and add new empty rows at the top.
  fullRows.reverse().forEach((rowIndex) => {
    board.splice(rowIndex, 1);
    board.unshift(Array(BOARD_SIZE).fill(null));
  });

  return fullRows.length;
}

function checkForMoveAvailability() {
  if (isGameOver) {
    return;
  }

  const canPlaceAny = nextShapes.some((shape) => canPlaceShape(shape.matrix));

  if (!canPlaceAny) {
    isGameOver = true;
    statusElement.textContent = "No moves left. Game over!";
    statusElement.classList.add("lose");
  }
}

function canPlaceShape(matrix) {
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const placement = getPlacementCells(matrix, row, col);
      if (placement.valid) {
        return true;
      }
    }
  }
  return false;
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
  const expanded = hex.length === 3
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

function pulseStatus(message) {
  statusElement.textContent = message;
  statusElement.classList.remove("lose");
  statusElement.classList.add("pulse");
  setTimeout(() => {
    statusElement.classList.remove("pulse");
  }, 350);
}

function createShapeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `shape-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
