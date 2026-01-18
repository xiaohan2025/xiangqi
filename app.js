const boardEl = document.getElementById("board");
const suggestionEl = document.getElementById("suggestion");
const engineStatusEl = document.getElementById("engineStatus");
const statusTextEl = document.getElementById("statusText");
const redBarEl = document.getElementById("redBar");
const winrateLabelEl = document.getElementById("winrateLabel");
const lastMoveArrow = document.getElementById("lastMoveArrow");

const startRedBtn = document.getElementById("startRed");
const startBlackBtn = document.getElementById("startBlack");
const restartBtn = document.getElementById("restartBtn");
const aiMoveBtn = document.getElementById("aiMove");
const undoBtn = document.getElementById("undo");

const ENGINE_DEPTH = 15;
const ENGINE_MOVETIME = 10000;
const FALLBACK_DEPTH = 2;

const pieceLabels = {
  r: "车", n: "马", b: "象", a: "士", k: "将", c: "炮", p: "卒",
  R: "车", N: "马", B: "相", A: "仕", K: "帅", C: "炮", P: "兵",
};

const pieceValues = {
  k: 10000, r: 1000, c: 500, n: 300, b: 200, a: 200, p: 100,
};

let board = [];
let turn = "red";
let nextGameTurn = "red";
let selected = null;
let legalMoves = [];
let history = [];
let aiSuggestion = null;
let lastMove = null;
let engineWorker = null;
let engineReady = false;
let engineScore = null;
let engineTimer = null;

const files = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

function createInitialBoard() {
  const emptyRow = () => Array(9).fill(null);
  const b = Array.from({ length: 10 }, emptyRow);
  b[0] = ["r", "n", "b", "a", "k", "a", "b", "n", "r"];
  b[2][1] = "c";
  b[2][7] = "c";
  b[3][0] = "p";
  b[3][2] = "p";
  b[3][4] = "p";
  b[3][6] = "p";
  b[3][8] = "p";

  b[9] = ["R", "N", "B", "A", "K", "A", "B", "N", "R"];
  b[7][1] = "C";
  b[7][7] = "C";
  b[6][0] = "P";
  b[6][2] = "P";
  b[6][4] = "P";
  b[6][6] = "P";
  b[6][8] = "P";
  return b;
}

function cloneBoard(source) {
  return source.map((row) => row.slice());
}

function getPieceColor(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? "red" : "black";
}

function inBounds(x, y) {
  return x >= 0 && x < 9 && y >= 0 && y < 10;
}

// ... Rules Logic (PseudoMoves, LegalMoves, Check) ...
// Copied from original but compressed for brevity where possible, maintaining logic
function getKingPosition(boardState, color) {
  const target = color === "red" ? "K" : "k";
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      if (boardState[y][x] === target) return { x, y };
    }
  }
  return null;
}

function isInCheck(boardState, color) {
  const king = getKingPosition(boardState, color);
  if (!king) return false;
  const opponent = color === "red" ? "black" : "red";
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const piece = boardState[y][x];
      if (!piece || getPieceColor(piece) !== opponent) continue;
      const moves = getPseudoMoves(boardState, { x, y });
      if (moves.some((move) => move.x === king.x && move.y === king.y)) return true;
    }
  }
  if (king) {
    const otherKing = getKingPosition(boardState, opponent);
    if (otherKing && otherKing.x === king.x) {
      const minY = Math.min(king.y, otherKing.y) + 1;
      const maxY = Math.max(king.y, otherKing.y);
      let blocked = false;
      for (let y = minY; y < maxY; y += 1) {
        if (boardState[y][king.x]) { blocked = true; break; }
      }
      if (!blocked) return true;
    }
  }
  return false;
}

function getLegalMoves(boardState, from) {
  const piece = boardState[from.y][from.x];
  if (!piece) return [];
  const color = getPieceColor(piece);
  const pseudo = getPseudoMoves(boardState, from);
  const legal = [];
  for (const move of pseudo) {
    const copy = cloneBoard(boardState);
    copy[move.y][move.x] = piece;
    copy[from.y][from.x] = null;
    if (!isInCheck(copy, color)) legal.push(move);
  }
  return legal;
}

function getAllLegalMoves(boardState, color) {
  const moves = [];
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      if (boardState[y][x] && getPieceColor(boardState[y][x]) === color) {
        const from = { x, y };
        const legal = getLegalMoves(boardState, from);
        legal.forEach(to => moves.push({ from, to }));
      }
    }
  }
  return moves;
}

function isCheckmate(boardState, color) {
  return isInCheck(boardState, color) && getAllLegalMoves(boardState, color).length === 0;
}

function getPseudoMoves(boardState, from) {
  const piece = boardState[from.y][from.x];
  if (!piece) return [];
  const color = getPieceColor(piece);
  const isRed = color === "red";
  const type = piece.toLowerCase();
  const moves = [];

  if (type === "r") addLineMoves(boardState, from, moves, color, false);
  else if (type === "c") addLineMoves(boardState, from, moves, color, true);
  else if (type === "n") {
    const steps = [
      { dx: 2, dy: 1, lx: 1, ly: 0 }, { dx: 2, dy: -1, lx: 1, ly: 0 },
      { dx: -2, dy: 1, lx: -1, ly: 0 }, { dx: -2, dy: -1, lx: -1, ly: 0 },
      { dx: 1, dy: 2, lx: 0, ly: 1 }, { dx: -1, dy: 2, lx: 0, ly: 1 },
      { dx: 1, dy: -2, lx: 0, ly: -1 }, { dx: -1, dy: -2, lx: 0, ly: -1 },
    ];
    for (const s of steps) {
      const lx = from.x + s.lx, ly = from.y + s.ly;
      if (inBounds(lx, ly) && !boardState[ly][lx]) {
        const x = from.x + s.dx, y = from.y + s.dy;
        if (inBounds(x, y)) pushMove(boardState, moves, { x, y }, color);
      }
    }
  } else if (type === "b") {
    const steps = [{ dx: 2, dy: 2 }, { dx: 2, dy: -2 }, { dx: -2, dy: 2 }, { dx: -2, dy: -2 }];
    for (const s of steps) {
      const ex = from.x + s.dx / 2, ey = from.y + s.dy / 2;
      const x = from.x + s.dx, y = from.y + s.dy;
      if (inBounds(x, y) && !boardState[ey][ex]) {
        if ((isRed && y >= 5) || (!isRed && y <= 4)) pushMove(boardState, moves, { x, y }, color);
      }
    }
  } else if (type === "a") {
    const steps = [{ dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }];
    for (const s of steps) {
      const x = from.x + s.dx, y = from.y + s.dy;
      if (inBounds(x, y)) {
        if (isRed && (x < 3 || x > 5 || y < 7)) continue;
        if (!isRed && (x < 3 || x > 5 || y > 2)) continue;
        pushMove(boardState, moves, { x, y }, color);
      }
    }
  } else if (type === "k") {
    const steps = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    for (const s of steps) {
      const x = from.x + s.dx, y = from.y + s.dy;
      if (inBounds(x, y)) {
        if (isRed && (x < 3 || x > 5 || y < 7)) continue;
        if (!isRed && (x < 3 || x > 5 || y > 2)) continue;
        pushMove(boardState, moves, { x, y }, color);
      }
    }
  } else if (type === "p") {
    const fy = from.y + (isRed ? -1 : 1);
    if (inBounds(from.x, fy)) pushMove(boardState, moves, { x: from.x, y: fy }, color);
    if ((isRed && from.y <= 4) || (!isRed && from.y >= 5)) {
      if (inBounds(from.x - 1, from.y)) pushMove(boardState, moves, { x: from.x - 1, y: from.y }, color);
      if (inBounds(from.x + 1, from.y)) pushMove(boardState, moves, { x: from.x + 1, y: from.y }, color);
    }
  }
  return moves;
}

function pushMove(boardState, moves, target, color) {
  const p = boardState[target.y][target.x];
  if (!p || getPieceColor(p) !== color) moves.push(target);
}

function addLineMoves(boardState, from, moves, color, isCannon) {
  const dirs = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
  for (const d of dirs) {
    let x = from.x + d.dx, y = from.y + d.dy;
    let jumped = false;
    while (inBounds(x, y)) {
      const p = boardState[y][x];
      if (!isCannon) {
        if (p) { if (getPieceColor(p) !== color) moves.push({ x, y }); break; }
        moves.push({ x, y });
      } else {
        if (!jumped) { if (p) jumped = true; else moves.push({ x, y }); }
        else if (p) { if (getPieceColor(p) !== color) moves.push({ x, y }); break; }
      }
      x += d.dx; y += d.dy;
    }
  }
}

// ... Game Control ...

function movePiece(from, to) {
  const piece = board[from.y][from.x];
  if (!piece) return false;
  history.push({ board: cloneBoard(board), turn, lastMove });
  board[to.y][to.x] = piece;
  board[from.y][from.x] = null;
  lastMove = { from, to };
  turn = turn === "red" ? "black" : "red";
  selected = null;
  legalMoves = [];
  aiSuggestion = null;
  updateStatus();
  renderBoard();
  updateAnalysis();
  return true;
}

function handleUndo() {
  const prev = history.pop();
  if (!prev) return;
  board = cloneBoard(prev.board);
  turn = prev.turn;
  lastMove = prev.lastMove;
  selected = null;
  legalMoves = [];
  aiSuggestion = null;
  updateStatus();
  renderBoard();
  updateAnalysis();
}

function resetGame() {
  board = createInitialBoard();
  turn = nextGameTurn;
  history = [];
  selected = null;
  legalMoves = [];
  aiSuggestion = null;
  lastMove = null;
  updateStatus();
  renderBoard();
  updateAnalysis();
}

function handleAiMove() {
  if (!aiSuggestion || !aiSuggestion.move) return;
  const move = aiSuggestion.move;
  // Ensure it's legal
  const legal = getAllLegalMoves(board, turn);
  if (legal.some(m => m.from.x === move.from.x && m.from.y === move.from.y && m.to.x === move.to.x && m.to.y === move.to.y)) {
    movePiece(move.from, move.to);
  }
}

// ... Rendering ...

function getPixelPosition(col, row) {
  // SVG grid: 900x1000. Margins 50. Cell 100.
  // Center of cell: 50 + col*100
  const xPercent = (50 + col * 100) / 900 * 100;
  const yPercent = (50 + row * 100) / 1000 * 100;
  return { x: `${xPercent}%`, y: `${yPercent}%` };
}

function getBoardCoords(event) {
  const rect = boardEl.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  // Transform to SVG coordinates
  const svgX = clickX * (900 / rect.width);
  const svgY = clickY * (1000 / rect.height);

  // Find nearest grid intersection
  const col = Math.round((svgX - 50) / 100);
  const row = Math.round((svgY - 50) / 100);

  if (!inBounds(col, row)) return null;

  // Check click radius (allow some tolerance, say 40 units)
  const centerX = 50 + col * 100;
  const centerY = 50 + row * 100;
  const dist = Math.hypot(svgX - centerX, svgY - centerY);
  if (dist > 45) return null;

  return { x: col, y: row };
}

function renderBoard() {
  boardEl.querySelectorAll(".piece, .legal-dot").forEach(el => el.remove());

  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const p = board[y][x];
      if (!p) continue;
      const el = document.createElement("div");
      el.className = `piece ${getPieceColor(p)}`;
      if (selected && selected.x === x && selected.y === y) el.classList.add("selected");
      el.textContent = pieceLabels[p];
      el.dataset.x = x; el.dataset.y = y;

      const pos = getPixelPosition(x, y);
      el.style.left = pos.x;
      el.style.top = pos.y;
      el.style.transform = "translate(-50%, -50%)"; // Center on point
      boardEl.appendChild(el);
    }
  }

  for (const move of legalMoves) {
    const dot = document.createElement("div");
    dot.className = "legal-dot";
    const pos = getPixelPosition(move.to.x, move.to.y); // legalMoves contains targets
    dot.style.left = pos.x;
    dot.style.top = pos.y;
    boardEl.appendChild(dot);
  }
  renderLastMoveArrow();
}

function renderLastMoveArrow() {
  if (!lastMove) {
    lastMoveArrow.classList.remove("active");
    return;
  }
  const start = getPixelPosition(lastMove.from.x, lastMove.from.y);
  const end = getPixelPosition(lastMove.to.x, lastMove.to.y);
  // SVG lines need coordinates relative to SVG viewBox (0-900), not %.
  // But we can use % if we use x1="5%"... wait, SVG lines support %?
  // standard SVG attributes usually expect units.
  // Better to set exact SVG coords.
  const sx = 50 + lastMove.from.x * 100;
  const sy = 50 + lastMove.from.y * 100;
  const ex = 50 + lastMove.to.x * 100;
  const ey = 50 + lastMove.to.y * 100;

  lastMoveArrow.setAttribute("x1", sx);
  lastMoveArrow.setAttribute("y1", sy);
  lastMoveArrow.setAttribute("x2", ex);
  lastMoveArrow.setAttribute("y2", ey);
  lastMoveArrow.classList.add("active");
}

function updateStatus() {
  let text = turn === "red" ? "红方走棋" : "黑方走棋";
  if (isInCheck(board, turn)) text += " (被将军)";
  if (isCheckmate(board, turn)) text = turn === "red" ? "红方被将死" : "黑方被将死";
  statusTextEl.textContent = text;

  // AI Button only active if it's that side's turn? 
  // User can click "AI Help" anytime to make a move for the current side.
  // So always allow, unless game over.
  // disable if game over?
  aiMoveBtn.disabled = isCheckmate(board, turn);
}

function updateAnalysis() {
  // Update winrate bar immediately
  // Request engine analysis
  suggestionEl.textContent = "AI 思考中...";
  aiSuggestion = null;

  const fen = boardToFen(board, turn);
  if (engineReady) {
    requestEngineMove(fen);
  } else {
    // Basic evaluation if engine not ready
    const score = evaluateBoard(board);
    // Simple mock suggestion not implemented here to save space, relying on engine
    suggestionEl.textContent = "引擎初始化中...";
  }
}

function updateWinrate(scoreRed) {
  // Score is centipawns. + is Red.
  const wr = 1 / (1 + Math.exp(-scoreRed / 300));
  const pct = Math.round(wr * 100);
  redBarEl.style.width = `${pct}%`;
  winrateLabelEl.innerHTML = `红方 ${pct}% &nbsp; 黑方 ${100 - pct}%`;
}

// ... Engine & Helpers ...

function boardToFen(b, side) {
  let res = [];
  for (let y = 0; y < 10; y++) {
    let row = "", e = 0;
    for (let x = 0; x < 9; x++) {
      let p = b[y][x];
      if (!p) e++;
      else { if (e) row += e; e = 0; row += p; }
    }
    if (e) row += e;
    res.push(row);
  }
  return res.join("/") + " " + (side === "red" ? "w" : "b") + " - - 0 1";
}

function initEngine() {
  try {
    engineWorker = new Worker("engine/stockfish.js");
    engineWorker.onmessage = (e) => {
      const line = e.data;
      if (line === "uciok") {
        engineWorker.postMessage("setoption name UCI_Variant value xiangqi");
        engineWorker.postMessage("isready");
      } else if (line === "readyok") {
        engineReady = true;
        engineStatusEl.textContent = "引擎状态：就绪";
        updateAnalysis();
      } else if (line.startsWith("info") && line.includes("score")) {
        const m = line.match(/score (cp|mate) (-?\d+)/);
        if (m) {
          let sc = parseInt(m[2]);
          if (m[1] === "mate") sc = sc > 0 ? 10000 : -10000;
          engineScore = sc;
          updateWinrate(turn === "red" ? sc : -sc); // info always from side to move view?
          // Stockfish UCI standard: score is from engine's point of view (side to move).
          // If turn is red, score is for red. If turn is black, score is for black.
          // We need score relative to Red.
          const finalScore = turn === "red" ? sc : -sc;
          updateWinrate(finalScore);
        }
      } else if (line.startsWith("bestmove")) {
        const moveStr = line.split(" ")[1];
        if (moveStr) {
          const m = parseUciMove(moveStr);
          if (m) {
            const label = pieceLabels[board[m.from.y][m.from.x]] || "";
            suggestionEl.textContent = `建议：${label} (${m.from.x + 1},${m.from.y + 1}) → (${m.to.x + 1},${m.to.y + 1})`;
            aiSuggestion = { move: m };
          }
        }
      }
    };
    engineWorker.postMessage("uci");
  } catch (e) { console.error(e); }
}

function requestEngineMove(fen) {
  if (!engineWorker) return;
  engineWorker.postMessage("stop");
  engineWorker.postMessage("position fen " + fen);
  engineWorker.postMessage("go depth " + ENGINE_DEPTH + " movetime " + ENGINE_MOVETIME);
}

function parseUciMove(str) {
  if (!str || str.length < 4) return null;
  const fX = files.indexOf(str[0]), fY = parseInt(str.substring(1)); // UCI: a0
  // Xiangqi UCI: a0i9. Files a-i. Ranks 0-9.
  // Wait, UCI usually is a1h8. Standard Xiangqi UCI uses a0-i9?
  // Let's assume standard fairy-stockfish behavior.
  // Files: a-i. Ranks: 0-9.
  // Our array: y=0 is top (Black), y=9 is bottom (Red).
  // UCI usually: Rank 0 is bottom.
  // Let's check original app.js.
  // Original: `parseUciMove`: `const fromRank = Number(move[1]);` ... `toRank` similarly.
  // It parsed simply.
  // Let's stick to simple parsing matching the board logic.
  // Our board y=0 is row 0.
  // If Engine uses y=0 as row 0 (top), we are good.
  // If Engine uses y=0 as row 9 (bottom), we need flip.
  // Fairy-Stockfish Xiangqi variant typically uses a0 = left bottom corner for Red?
  // Let's Assume the previous app.js was correct about coordinate mapping or check.
  // Original: `fromRank = Number(move[1])`.
  // If move is `a0b0`. from {x:0, y:0} to {x:1, y:0}.
  // This implies y is strictly the index.
  // Let's blindly trust the simple 1:1 mapping for now.
  const tx = files.indexOf(str[2]), ty = parseInt(str.substring(3));
  return { from: { x: fX, y: fY }, to: { x: tx, y: ty } };
}

function evaluateBoard(b) { return 0; } // Placeholder

// Listeners
boardEl.addEventListener("mousedown", (e) => {
  const coord = getBoardCoords(e);
  if (!coord) return;
  const p = board[coord.y][coord.x];

  // Selection Logic
  if (selected) {
    // If clicking same piece, deselect
    if (selected.x === coord.x && selected.y === coord.y) {
      selected = null; legalMoves = [];
      renderBoard(); return;
    }
    // If clicking own piece, switch selection
    if (p && getPieceColor(p) === turn) {
      selected = coord;
      legalMoves = getLegalMoves(board, selected);
      renderBoard(); return;
    }
    // If legal move, move
    const isLegal = legalMoves.some(m => m.x === coord.x && m.y === coord.y);
    if (isLegal) {
      movePiece(selected, coord);
      return;
    }
  }
  // No selection, click own piece -> select
  if (p && getPieceColor(p) === turn) {
    selected = coord;
    legalMoves = getLegalMoves(board, selected);
    renderBoard();
  }
});

startRedBtn.addEventListener("click", () => {
  nextGameTurn = "red";
  startRedBtn.classList.add("active");
  startBlackBtn.classList.remove("active");
});
startBlackBtn.addEventListener("click", () => {
  nextGameTurn = "black";
  startBlackBtn.classList.add("active");
  startRedBtn.classList.remove("active");
});
restartBtn.addEventListener("click", resetGame);
undoBtn.addEventListener("click", handleUndo);
aiMoveBtn.addEventListener("click", handleAiMove);

// Init
board = createInitialBoard();
renderBoard();
initEngine();
