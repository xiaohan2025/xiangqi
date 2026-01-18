const boardEl = document.getElementById("board");
const suggestionEl = document.getElementById("suggestion");
const engineStatusEl = document.getElementById("engineStatus");
const statusTextEl = document.getElementById("statusText");
const turnLabelEl = document.getElementById("turnLabel");
const playerLabelEl = document.getElementById("playerLabel");
const winrateLabelEl = document.getElementById("winrateLabel");
const redBarEl = document.getElementById("redBar");
const lastMoveArrow = document.getElementById("lastMoveArrow");

const startRedBtn = document.getElementById("startRed");
const startBlackBtn = document.getElementById("startBlack");
const aiMoveBtn = document.getElementById("aiMove");
const undoBtn = document.getElementById("undo");

const ENGINE_DEPTH = 12;
const ENGINE_MOVETIME = 8000;
const FALLBACK_DEPTH = 2;

const pieceLabels = {
  r: "车",
  n: "马",
  b: "象",
  a: "士",
  k: "将",
  c: "炮",
  p: "卒",
  R: "车",
  N: "马",
  B: "相",
  A: "仕",
  K: "帅",
  C: "炮",
  P: "兵",
};

const pieceValues = {
  k: 10000,
  r: 1000,
  c: 500,
  n: 300,
  b: 200,
  a: 200,
  p: 100,
};

let board = createInitialBoard();
let turn = "red";
const playerSide = "red";
let selected = null;
let legalMoves = [];
let history = [];
let aiSuggestion = null;
let lastMove = null;
let autoMoveOnSuggestion = false;
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
      if (moves.some((move) => move.x === king.x && move.y === king.y)) {
        return true;
      }
    }
  }

  if (king) {
    const otherKing = getKingPosition(boardState, opponent);
    if (otherKing && otherKing.x === king.x) {
      const minY = Math.min(king.y, otherKing.y) + 1;
      const maxY = Math.max(king.y, otherKing.y);
      let blocked = false;
      for (let y = minY; y < maxY; y += 1) {
        if (boardState[y][king.x]) {
          blocked = true;
          break;
        }
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
    if (!isInCheck(copy, color)) {
      legal.push(move);
    }
  }
  return legal;
}

function getAllLegalMoves(boardState, color) {
  const moves = [];
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const piece = boardState[y][x];
      if (!piece || getPieceColor(piece) !== color) continue;
      const from = { x, y };
      const legal = getLegalMoves(boardState, from);
      for (const move of legal) {
        moves.push({ from, to: move });
      }
    }
  }
  return moves;
}

function isCheckmate(boardState, color) {
  if (!isInCheck(boardState, color)) return false;
  return getAllLegalMoves(boardState, color).length === 0;
}

function getPseudoMoves(boardState, from) {
  const piece = boardState[from.y][from.x];
  if (!piece) return [];
  const color = getPieceColor(piece);
  const isRed = color === "red";
  const type = piece.toLowerCase();
  const moves = [];

  if (type === "r") {
    addLineMoves(boardState, from, moves, color, false);
  } else if (type === "c") {
    addLineMoves(boardState, from, moves, color, true);
  } else if (type === "n") {
    const horseSteps = [
      { dx: 2, dy: 1, leg: { dx: 1, dy: 0 } },
      { dx: 2, dy: -1, leg: { dx: 1, dy: 0 } },
      { dx: -2, dy: 1, leg: { dx: -1, dy: 0 } },
      { dx: -2, dy: -1, leg: { dx: -1, dy: 0 } },
      { dx: 1, dy: 2, leg: { dx: 0, dy: 1 } },
      { dx: -1, dy: 2, leg: { dx: 0, dy: 1 } },
      { dx: 1, dy: -2, leg: { dx: 0, dy: -1 } },
      { dx: -1, dy: -2, leg: { dx: 0, dy: -1 } },
    ];
    for (const step of horseSteps) {
      const legX = from.x + step.leg.dx;
      const legY = from.y + step.leg.dy;
      if (!inBounds(legX, legY) || boardState[legY][legX]) continue;
      const x = from.x + step.dx;
      const y = from.y + step.dy;
      if (!inBounds(x, y)) continue;
      pushMove(boardState, moves, { x, y }, color);
    }
  } else if (type === "b") {
    const deltas = [
      { dx: 2, dy: 2 },
      { dx: 2, dy: -2 },
      { dx: -2, dy: 2 },
      { dx: -2, dy: -2 },
    ];
    for (const delta of deltas) {
      const eyeX = from.x + delta.dx / 2;
      const eyeY = from.y + delta.dy / 2;
      const x = from.x + delta.dx;
      const y = from.y + delta.dy;
      if (!inBounds(x, y)) continue;
      if (boardState[eyeY][eyeX]) continue;
      if (isRed && y < 5) continue;
      if (!isRed && y > 4) continue;
      pushMove(boardState, moves, { x, y }, color);
    }
  } else if (type === "a") {
    const deltas = [
      { dx: 1, dy: 1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: -1 },
    ];
    for (const delta of deltas) {
      const x = from.x + delta.dx;
      const y = from.y + delta.dy;
      if (!inBounds(x, y)) continue;
      if (isRed) {
        if (x < 3 || x > 5 || y < 7 || y > 9) continue;
      } else {
        if (x < 3 || x > 5 || y < 0 || y > 2) continue;
      }
      pushMove(boardState, moves, { x, y }, color);
    }
  } else if (type === "k") {
    const deltas = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    for (const delta of deltas) {
      const x = from.x + delta.dx;
      const y = from.y + delta.dy;
      if (!inBounds(x, y)) continue;
      if (isRed) {
        if (x < 3 || x > 5 || y < 7 || y > 9) continue;
      } else {
        if (x < 3 || x > 5 || y < 0 || y > 2) continue;
      }
      pushMove(boardState, moves, { x, y }, color);
    }
  } else if (type === "p") {
    const forward = isRed ? -1 : 1;
    const forwardY = from.y + forward;
    if (inBounds(from.x, forwardY)) {
      pushMove(boardState, moves, { x: from.x, y: forwardY }, color);
    }
    const crossedRiver = isRed ? from.y <= 4 : from.y >= 5;
    if (crossedRiver) {
      const sideMoves = [
        { x: from.x - 1, y: from.y },
        { x: from.x + 1, y: from.y },
      ];
      for (const move of sideMoves) {
        if (inBounds(move.x, move.y)) {
          pushMove(boardState, moves, move, color);
        }
      }
    }
  }

  return moves;
}

function pushMove(boardState, moves, target, color) {
  const targetPiece = boardState[target.y][target.x];
  if (!targetPiece || getPieceColor(targetPiece) !== color) {
    moves.push(target);
  }
}

function addLineMoves(boardState, from, moves, color, isCannon) {
  const directions = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  for (const dir of directions) {
    let x = from.x + dir.dx;
    let y = from.y + dir.dy;
    let jumped = false;
    while (inBounds(x, y)) {
      const targetPiece = boardState[y][x];
      if (!isCannon) {
        if (targetPiece) {
          if (getPieceColor(targetPiece) !== color) moves.push({ x, y });
          break;
        }
        moves.push({ x, y });
      } else {
        if (!jumped) {
          if (!targetPiece) {
            moves.push({ x, y });
          } else {
            jumped = true;
          }
        } else {
          if (targetPiece) {
            if (getPieceColor(targetPiece) !== color) moves.push({ x, y });
            break;
          }
        }
      }
      x += dir.dx;
      y += dir.dy;
    }
  }
}

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

function getBoardMetrics() {
  const rect = boardEl.getBoundingClientRect();
  const marginX = rect.width / 9;
  const marginY = rect.height / 10;
  const cellX = (rect.width - marginX * 2) / 8;
  const cellY = (rect.height - marginY * 2) / 9;
  const cellSize = Math.min(cellX, cellY);
  return { rect, marginX, marginY, cellX, cellY, cellSize };
}

function handleBoardClick(event) {
  const pieceEl = event.target.closest(".piece");
  if (pieceEl) {
    const x = Number(pieceEl.dataset.x);
    const y = Number(pieceEl.dataset.y);
    const piece = board[y][x];
    const color = getPieceColor(piece);
    if (selected && color !== turn) {
      const isLegal = legalMoves.some((move) => move.x === x && move.y === y);
      if (isLegal) {
        movePiece(selected, { x, y });
      }
      return;
    }
    if (color !== turn) return;
    if (selected && selected.x === x && selected.y === y) {
      selected = null;
      legalMoves = [];
    } else {
      selected = { x, y };
      legalMoves = getLegalMoves(board, selected);
    }
    renderBoard();
    return;
  }

  if (!selected) return;
  const pos = getBoardPosition(event);
  if (!pos) return;
  const isLegal = legalMoves.some((move) => move.x === pos.x && move.y === pos.y);
  if (isLegal) {
    movePiece(selected, pos);
  }
}

function getBoardPosition(event) {
  const { rect, marginX, marginY, cellX, cellY, cellSize } = getBoardMetrics();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const col = Math.round((x - marginX) / cellX);
  const row = Math.round((y - marginY) / cellY);
  if (!inBounds(col, row)) return null;
  const targetX = marginX + col * cellX;
  const targetY = marginY + row * cellY;
  const dist = Math.hypot(targetX - x, targetY - y);
  if (dist > cellSize * 0.48) return null;
  return { x: col, y: row };
}

function renderBoard() {
  boardEl.querySelectorAll(".piece, .legal-dot").forEach((el) => el.remove());

  const { cellSize } = getBoardMetrics();
  boardEl.style.setProperty("--cell", `${cellSize}px`);

  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const piece = board[y][x];
      if (!piece) continue;
      const pieceEl = document.createElement("div");
      pieceEl.className = `piece ${getPieceColor(piece)}`;
      if (selected && selected.x === x && selected.y === y) {
        pieceEl.classList.add("selected");
      }
      pieceEl.textContent = pieceLabels[piece];
      pieceEl.dataset.x = x;
      pieceEl.dataset.y = y;
      const pos = getPixelPosition(x, y);
      pieceEl.style.left = `${pos.x}px`;
      pieceEl.style.top = `${pos.y}px`;
      pieceEl.style.transform = "translate(-50%, -50%)";
      boardEl.appendChild(pieceEl);
    }
  }

  for (const move of legalMoves) {
    const dot = document.createElement("div");
    dot.className = "legal-dot";
    const pos = getPixelPosition(move.x, move.y);
    dot.style.left = `${pos.x}px`;
    dot.style.top = `${pos.y}px`;
    boardEl.appendChild(dot);
  }

  renderLastMoveArrow();
}

function getPixelPosition(x, y) {
  const { marginX, marginY, cellX, cellY } = getBoardMetrics();
  return {
    x: marginX + x * cellX,
    y: marginY + y * cellY,
  };
}

function renderLastMoveArrow() {
  if (!lastMove) {
    lastMoveArrow.classList.remove("active");
    return;
  }
  const { from, to } = lastMove;
  const start = getPixelPosition(from.x, from.y);
  const end = getPixelPosition(to.x, to.y);
  lastMoveArrow.setAttribute("x1", start.x);
  lastMoveArrow.setAttribute("y1", start.y);
  lastMoveArrow.setAttribute("x2", end.x);
  lastMoveArrow.setAttribute("y2", end.y);
  lastMoveArrow.classList.add("active");
}

function updateStatus() {
  turnLabelEl.textContent = turn === "red" ? "红方" : "黑方";
  playerLabelEl.textContent = "红方";
  let text = turn === "red" ? "轮到你走" : "轮到对方走";
  if (isInCheck(board, turn)) {
    text = `${turn === "red" ? "你" : "对方"}被将军`;
  }
  if (isCheckmate(board, turn)) {
    text = `${turn === "red" ? "你" : "对方"}被将死`;
  }
  statusTextEl.textContent = text;
  aiMoveBtn.disabled = turn !== "red";
}

function setSuggestion(move, score) {
  if (!move) {
    suggestionEl.textContent = "暂无建议";
    return;
  }
  const piece = board[move.from.y][move.from.x];
  const label = pieceLabels[piece] || "?";
  suggestionEl.textContent = `建议：${label} (${move.from.x + 1},${move.from.y + 1}) → (${move.to.x + 1},${move.to.y + 1})`;
  aiSuggestion = { move, score };
  renderLastMoveArrow();
  if (autoMoveOnSuggestion && turn === "red") {
    autoMoveOnSuggestion = false;
    handleAiMove();
  }
}

function updateWinrate(scoreForRed) {
  const winrate = 1 / (1 + Math.exp(-scoreForRed / 400));
  const redPercent = Math.round(winrate * 100);
  redBarEl.style.width = `${redPercent}%`;
  winrateLabelEl.textContent = `红方 ${redPercent}% · 黑方 ${100 - redPercent}%`;
}

function updateAnalysis() {
  updateStatus();
  updateWinrate(evaluateBoardLight(board));

  if (turn !== "red") {
    suggestionEl.textContent = "等待对方走棋...";
    aiSuggestion = null;
    renderLastMoveArrow();
    return;
  }

  const fen = boardToFen(board, turn);
  if (engineReady) {
    requestEngineMove(fen);
  } else {
    const suggestion = findBestMove(board, turn, FALLBACK_DEPTH);
    setSuggestion(suggestion.move, suggestion.score);
  }
}

function boardToFen(boardState, side) {
  const rows = [];
  for (let y = 0; y < 10; y += 1) {
    let row = "";
    let empty = 0;
    for (let x = 0; x < 9; x += 1) {
      const piece = boardState[y][x];
      if (!piece) {
        empty += 1;
      } else {
        if (empty > 0) {
          row += empty;
          empty = 0;
        }
        row += piece;
      }
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }
  const sideToken = side === "red" ? "w" : "b";
  return `${rows.join("/")} ${sideToken} - - 0 1`;
}

function parseUciMove(move) {
  if (!move || move.length < 4) return null;
  const fromFile = files.indexOf(move[0]);
  const fromRank = Number(move[1]);
  const toFile = files.indexOf(move[2]);
  const toRank = Number(move[3]);
  if ([fromFile, toFile, fromRank, toRank].some((v) => Number.isNaN(v) || v < 0)) return null;
  return { from: { x: fromFile, y: fromRank }, to: { x: toFile, y: toRank } };
}

function moveToUci(move) {
  return `${files[move.from.x]}${move.from.y}${files[move.to.x]}${move.to.y}`;
}

function initEngine() {
  try {
    engineWorker = new Worker("engine/stockfish.js");
  } catch (error) {
    engineStatusEl.textContent = "引擎状态：加载失败，使用备用 AI";
    return;
  }
  engineWorker.onerror = () => {
    engineStatusEl.textContent = "引擎状态：加载失败，使用备用 AI";
    engineWorker = null;
    engineReady = false;
  };
  engineWorker.onmessage = (event) => {
    const line = event.data ? event.data.toString() : "";
    if (line === "uciok") {
      engineWorker.postMessage("setoption name UCI_Variant value xiangqi");
      engineWorker.postMessage("setoption name Threads value 1");
      engineWorker.postMessage("setoption name Hash value 64");
      engineWorker.postMessage("isready");
    } else if (line === "readyok") {
      engineReady = true;
      engineStatusEl.textContent = "引擎状态：Fairy-Stockfish 已就绪";
      updateAnalysis();
    } else if (line.startsWith("info")) {
      const match = line.match(/score (cp|mate) (-?\d+)/);
      if (match) {
        const type = match[1];
        const value = Number(match[2]);
        if (type === "cp") {
          engineScore = value;
        } else {
          engineScore = value > 0 ? 100000 : -100000;
        }
      }
    } else if (line.startsWith("bestmove")) {
      const parts = line.split(" ");
      const moveText = parts[1];
      const parsed = parseUciMove(moveText);
      if (parsed) {
        if (turn !== "red") return;
        const scoreForRed = turn === "red" ? engineScore ?? 0 : -(engineScore ?? 0);
        setSuggestion(parsed, scoreForRed);
        updateWinrate(scoreForRed);
      }
    }
  };
  engineWorker.postMessage("uci");
}

function requestEngineMove(fen) {
  if (!engineWorker) return;
  engineScore = 0;
  if (engineTimer) clearTimeout(engineTimer);
  engineWorker.postMessage("ucinewgame");
  engineWorker.postMessage(`position fen ${fen}`);
  engineWorker.postMessage(`go depth ${ENGINE_DEPTH} movetime ${ENGINE_MOVETIME}`);
  engineTimer = setTimeout(() => {
    engineWorker.postMessage("stop");
  }, ENGINE_MOVETIME + 2000);
}

function evaluateBoard(boardState) {
  let score = 0;
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const piece = boardState[y][x];
      if (!piece) continue;
      const value = pieceValues[piece.toLowerCase()] || 0;
      score += getPieceColor(piece) === "red" ? value : -value;
    }
  }
  if (isInCheck(boardState, "red")) score -= 500;
  if (isInCheck(boardState, "black")) score += 300;
  if (isCheckmate(boardState, "red")) score -= 100000;
  if (isCheckmate(boardState, "black")) score += 100000;
  return score;
}

function evaluateBoardLight(boardState) {
  let score = 0;
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const piece = boardState[y][x];
      if (!piece) continue;
      const value = pieceValues[piece.toLowerCase()] || 0;
      score += getPieceColor(piece) === "red" ? value : -value;
    }
  }
  return score;
}

function findBestMove(boardState, side, depth) {
  const moves = getAllLegalMoves(boardState, side);
  if (moves.length === 0) return { move: null, score: evaluateBoard(boardState) };

  let bestScore = side === "red" ? -Infinity : Infinity;
  let bestMoves = [];

  for (const move of moves) {
    const copy = cloneBoard(boardState);
    const piece = copy[move.from.y][move.from.x];
    copy[move.to.y][move.to.x] = piece;
    copy[move.from.y][move.from.x] = null;
    const score = minimax(copy, depth - 1, -Infinity, Infinity, side !== "red");
    const isBetter = side === "red" ? score > bestScore : score < bestScore;
    if (isBetter) {
      bestScore = score;
      bestMoves = [move];
    } else if (Math.abs(score - bestScore) < 80) {
      bestMoves.push(move);
    }
  }

  const choice = bestMoves[Math.floor(Math.random() * bestMoves.length)];
  return { move: choice, score: bestScore };
}

function minimax(boardState, depth, alpha, beta, maximizing) {
  const side = maximizing ? "red" : "black";
  if (depth === 0) return evaluateBoard(boardState);
  const moves = getAllLegalMoves(boardState, side);
  if (moves.length === 0) return evaluateBoard(boardState);

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const copy = cloneBoard(boardState);
      const piece = copy[move.from.y][move.from.x];
      copy[move.to.y][move.to.x] = piece;
      copy[move.from.y][move.from.x] = null;
      const evalScore = minimax(copy, depth - 1, alpha, beta, false);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  }

  let minEval = Infinity;
  for (const move of moves) {
    const copy = cloneBoard(boardState);
    const piece = copy[move.from.y][move.from.x];
    copy[move.to.y][move.to.x] = piece;
    copy[move.from.y][move.from.x] = null;
    const evalScore = minimax(copy, depth - 1, alpha, beta, true);
    minEval = Math.min(minEval, evalScore);
    beta = Math.min(beta, evalScore);
    if (beta <= alpha) break;
  }
  return minEval;
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

function handleAiMove() {
  if (!aiSuggestion || !aiSuggestion.move) return;
  const move = aiSuggestion.move;
  const piece = board[move.from.y][move.from.x];
  if (!piece || getPieceColor(piece) !== turn) return;
  const legal = getLegalMoves(board, move.from);
  if (!legal.some((m) => m.x === move.to.x && m.y === move.to.y)) return;
  movePiece(move.from, move.to);
}

function resetGame(startingTurn) {
  board = createInitialBoard();
  turn = startingTurn;
  history = [];
  selected = null;
  legalMoves = [];
  aiSuggestion = null;
  lastMove = null;
  autoMoveOnSuggestion = false;
  updateStatus();
  renderBoard();
  updateAnalysis();
}

startRedBtn.addEventListener("click", () => {
  autoMoveOnSuggestion = true;
  resetGame("red");
});
startBlackBtn.addEventListener("click", () => {
  autoMoveOnSuggestion = false;
  resetGame("black");
});
undoBtn.addEventListener("click", handleUndo);
aiMoveBtn.addEventListener("click", handleAiMove);
boardEl.addEventListener("click", handleBoardClick);
window.addEventListener("resize", renderBoard);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

renderBoard();
updateAnalysis();
initEngine();
