const boardEl = document.getElementById("board");
const suggestionEl = document.getElementById("suggestion");
const engineStatusEl = document.getElementById("engineStatus");
const statusTextEl = document.getElementById("statusText");
const redBarEl = document.getElementById("redBar");
const winrateLabelEl = document.getElementById("winrateLabel");


const startRedBtn = document.getElementById("startRed");
const startBlackBtn = document.getElementById("startBlack");
const restartBtn = document.getElementById("restartBtn");
const aiMoveBtn = document.getElementById("aiMove");
const undoBtn = document.getElementById("undo");

const ENGINE_DEPTH = 17;
// 设备检测：平板/手机用更长的思考时间
const isMobile = window.innerWidth <= 1024;
const ENGINE_MOVETIME = isMobile ? 20000 : 10000; // 手机平板20秒，电脑10秒



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
let engineReady = false;
let engineScore = 0;

const files = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

// ==================== 棋盘初始化 ====================

function createInitialBoard() {
  const emptyRow = () => Array(9).fill(null);
  const b = Array.from({ length: 10 }, emptyRow);
  // 黑方 (上方, y=0~4)
  b[0] = ["r", "n", "b", "a", "k", "a", "b", "n", "r"];
  b[2][1] = "c"; b[2][7] = "c";
  b[3][0] = "p"; b[3][2] = "p"; b[3][4] = "p"; b[3][6] = "p"; b[3][8] = "p";
  // 红方 (下方, y=5~9)
  b[9] = ["R", "N", "B", "A", "K", "A", "B", "N", "R"];
  b[7][1] = "C"; b[7][7] = "C";
  b[6][0] = "P"; b[6][2] = "P"; b[6][4] = "P"; b[6][6] = "P"; b[6][8] = "P";
  return b;
}

function cloneBoard(source) {
  return source.map(row => row.slice());
}

function getPieceColor(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? "red" : "black";
}

function inBounds(x, y) {
  return x >= 0 && x < 9 && y >= 0 && y < 10;
}

// ==================== 规则逻辑 ====================

function getKingPosition(boardState, color) {
  const target = color === "red" ? "K" : "k";
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      if (boardState[y][x] === target) return { x, y };
    }
  }
  return null;
}

function isInCheck(boardState, color) {
  const king = getKingPosition(boardState, color);
  if (!king) return false;
  const opponent = color === "red" ? "black" : "red";

  // 检查所有敌方棋子能否攻击到将/帅
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const piece = boardState[y][x];
      if (!piece || getPieceColor(piece) !== opponent) continue;
      const moves = getPseudoMoves(boardState, { x, y });
      if (moves.some(m => m.x === king.x && m.y === king.y)) return true;
    }
  }

  // 将帅对面规则
  const otherKing = getKingPosition(boardState, opponent);
  if (otherKing && otherKing.x === king.x) {
    const minY = Math.min(king.y, otherKing.y) + 1;
    const maxY = Math.max(king.y, otherKing.y);
    let blocked = false;
    for (let y = minY; y < maxY; y++) {
      if (boardState[y][king.x]) { blocked = true; break; }
    }
    if (!blocked) return true;
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
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const piece = boardState[y][x];
      if (piece && getPieceColor(piece) === color) {
        const from = { x, y };
        const legal = getLegalMoves(boardState, from);
        for (const to of legal) {
          moves.push({ from, to });
        }
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

  if (type === "r") {
    addLineMoves(boardState, from, moves, color, false);
  } else if (type === "c") {
    addLineMoves(boardState, from, moves, color, true);
  } else if (type === "n") {
    const steps = [
      { dx: 2, dy: 1, lx: 1, ly: 0 }, { dx: 2, dy: -1, lx: 1, ly: 0 },
      { dx: -2, dy: 1, lx: -1, ly: 0 }, { dx: -2, dy: -1, lx: -1, ly: 0 },
      { dx: 1, dy: 2, lx: 0, ly: 1 }, { dx: -1, dy: 2, lx: 0, ly: 1 },
      { dx: 1, dy: -2, lx: 0, ly: -1 }, { dx: -1, dy: -2, lx: 0, ly: -1 },
    ];
    for (const s of steps) {
      const legX = from.x + s.lx, legY = from.y + s.ly;
      if (!inBounds(legX, legY) || boardState[legY][legX]) continue; // 蹩马腿
      const x = from.x + s.dx, y = from.y + s.dy;
      if (inBounds(x, y)) pushMove(boardState, moves, { x, y }, color);
    }
  } else if (type === "b") {
    const steps = [{ dx: 2, dy: 2 }, { dx: 2, dy: -2 }, { dx: -2, dy: 2 }, { dx: -2, dy: -2 }];
    for (const s of steps) {
      const x = from.x + s.dx, y = from.y + s.dy;
      if (!inBounds(x, y)) continue;
      if (isRed && y < 5) continue; // 相不能过河
      if (!isRed && y > 4) continue; // 象不能过河
      const eyeX = from.x + s.dx / 2, eyeY = from.y + s.dy / 2;
      if (boardState[eyeY][eyeX]) continue; // 塞象眼
      pushMove(boardState, moves, { x, y }, color);
    }
  } else if (type === "a") {
    const steps = [{ dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }];
    for (const s of steps) {
      const x = from.x + s.dx, y = from.y + s.dy;
      if (!inBounds(x, y)) continue;
      if (isRed && (x < 3 || x > 5 || y < 7 || y > 9)) continue; // 红仕九宫
      if (!isRed && (x < 3 || x > 5 || y < 0 || y > 2)) continue; // 黑士九宫
      pushMove(boardState, moves, { x, y }, color);
    }
  } else if (type === "k") {
    const steps = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
    for (const s of steps) {
      const x = from.x + s.dx, y = from.y + s.dy;
      if (!inBounds(x, y)) continue;
      if (isRed && (x < 3 || x > 5 || y < 7 || y > 9)) continue;
      if (!isRed && (x < 3 || x > 5 || y < 0 || y > 2)) continue;
      pushMove(boardState, moves, { x, y }, color);
    }
  } else if (type === "p") {
    const forward = isRed ? -1 : 1;
    const forwardY = from.y + forward;
    if (inBounds(from.x, forwardY)) {
      pushMove(boardState, moves, { x: from.x, y: forwardY }, color);
    }
    // 过河后可以横走
    const crossedRiver = isRed ? from.y <= 4 : from.y >= 5;
    if (crossedRiver) {
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
        // 车
        if (p) {
          if (getPieceColor(p) !== color) moves.push({ x, y });
          break;
        }
        moves.push({ x, y });
      } else {
        // 炮
        if (!jumped) {
          if (p) jumped = true;
          else moves.push({ x, y });
        } else {
          if (p) {
            if (getPieceColor(p) !== color) moves.push({ x, y });
            break;
          }
        }
      }
      x += d.dx; y += d.dy;
    }
  }
}

// ==================== 游戏控制 ====================

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
  engineScore = 0;
  updateWinrate(0); // 重置胜率为 50%
  updateStatus();
  renderBoard();
  updateAnalysis();
}

function handleAiMove() {
  // AI 只为红方服务
  if (turn !== "red") {
    suggestionEl.textContent = "请等对方走棋...";
    return;
  }

  if (!engineReady) {
    suggestionEl.textContent = "引擎还在初始化，请稍等...";
    return;
  }

  if (!aiSuggestion || !aiSuggestion.move) {
    suggestionEl.textContent = "AI 正在思考，请稍等...";
    return;
  }

  const move = aiSuggestion.move;
  const piece = board[move.from.y]?.[move.from.x];

  if (!piece) {
    suggestionEl.textContent = "走法解析错误，请重新分析";
    updateAnalysis(); // 重新分析
    return;
  }

  if (getPieceColor(piece) !== "red") {
    suggestionEl.textContent = "走法异常，请重新分析";
    updateAnalysis();
    return;
  }

  movePiece(move.from, move.to);
}

// ==================== 渲染 ====================

function getPixelPosition(col, row) {
  // SVG坐标: 900x1000, 边距50, 格子100
  const xPercent = (50 + col * 100) / 900 * 100;
  const yPercent = (50 + row * 100) / 1000 * 100;
  return { x: `${xPercent}%`, y: `${yPercent}%` };
}

function getBoardCoords(event) {
  const rect = boardEl.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;
  const svgX = clickX * (900 / rect.width);
  const svgY = clickY * (1000 / rect.height);
  const col = Math.round((svgX - 50) / 100);
  const row = Math.round((svgY - 50) / 100);
  if (!inBounds(col, row)) return null;
  const centerX = 50 + col * 100;
  const centerY = 50 + row * 100;
  const dist = Math.hypot(svgX - centerX, svgY - centerY);
  if (dist > 50) return null;
  return { x: col, y: row };
}

function renderBoard() {
  boardEl.querySelectorAll(".piece, .legal-dot, .move-trace").forEach(el => el.remove());

  // 渲染移动轨迹高亮 (起点和终点)
  if (lastMove) {
    [lastMove.from, lastMove.to].forEach(pos => {
      const trace = document.createElement("div");
      trace.className = "move-trace";
      const p = getPixelPosition(pos.x, pos.y);
      trace.style.left = p.x;
      trace.style.top = p.y;
      boardEl.appendChild(trace);
    });
  }

  // 渲染棋子
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 9; x++) {
      const p = board[y][x];
      if (!p) continue;
      const el = document.createElement("div");
      el.className = `piece ${getPieceColor(p)}`;
      if (selected && selected.x === x && selected.y === y) el.classList.add("selected");
      el.textContent = pieceLabels[p];
      el.dataset.x = x;
      el.dataset.y = y;
      const pos = getPixelPosition(x, y);
      el.style.left = pos.x;
      el.style.top = pos.y;
      el.style.transform = "translate(-50%, -50%)";
      boardEl.appendChild(el);
    }
  }

  // 渲染可走位置的绿色点
  for (const move of legalMoves) {
    const dot = document.createElement("div");
    dot.className = "legal-dot";
    const pos = getPixelPosition(move.x, move.y);
    dot.style.left = pos.x;
    dot.style.top = pos.y;
    boardEl.appendChild(dot);
  }
}

function updateStatus() {
  let text = turn === "red" ? "红方走棋" : "黑方走棋（点击模拟对方的棋）";
  if (isInCheck(board, turn)) text = turn === "red" ? "红方被将军！" : "黑方被将军！";
  if (isCheckmate(board, turn)) text = turn === "red" ? "红方被将死！游戏结束" : "黑方被将死！你赢了！";
  statusTextEl.textContent = text;
  aiMoveBtn.disabled = isCheckmate(board, "red") || isCheckmate(board, "black");
}

function updateWinrate(scoreRed) {
  const wr = 1 / (1 + Math.exp(-scoreRed / 400));
  const pct = Math.round(wr * 100);
  redBarEl.style.width = `${pct}%`;
  winrateLabelEl.innerHTML = `红方 ${pct}% &nbsp; 黑方 ${100 - pct}%`;
}

function updateAnalysis() {
  aiSuggestion = null;

  // 只在红方回合分析（减少卡顿）
  if (turn !== "red") {
    suggestionEl.textContent = "等待对方走棋...";
    aiMoveBtn.disabled = true;
    return;
  }

  aiMoveBtn.disabled = false;

  if (engineReady) {
    suggestionEl.textContent = "AI 思考中...";
    const fen = boardToFen(board, "red");
    requestEngineMove(fen);
  } else {
    suggestionEl.textContent = "等待引擎初始化...";
  }
}



// ==================== 引擎通信 ====================

function boardToFen(b, side) {
  const rows = [];
  for (let y = 0; y < 10; y++) {
    let row = "", empty = 0;
    for (let x = 0; x < 9; x++) {
      const p = b[y][x];
      if (!p) { empty++; }
      else { if (empty) { row += empty; empty = 0; } row += p; }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join("/") + " " + (side === "red" ? "w" : "b") + " - - 0 1";
}

function parseUciMove(str) {
  if (!str) return null;
  // UCI 坐标格式: 列(a-i) + 行(1-10)
  // UCI: a1 = 左下角(红方车位置), i10 = 右上角(黑方车位置)
  // 我们代码: y=0 是顶部(黑方/rank 10), y=9 是底部(红方/rank 1)
  // 转换: y = 10 - rank
  const match = str.match(/^([a-i])(\d+)([a-i])(\d+)/);
  if (!match) return null;
  const fromFile = files.indexOf(match[1]);
  const fromRank = parseInt(match[2]);
  const toFile = files.indexOf(match[3]);
  const toRank = parseInt(match[4]);
  if ([fromFile, toFile].some(v => v < 0)) return null;
  if ([fromRank, toRank].some(v => isNaN(v) || v < 1 || v > 10)) return null;
  // 转换 UCI rank 到我们的 y 坐标
  return {
    from: { x: fromFile, y: 10 - fromRank },
    to: { x: toFile, y: 10 - toRank }
  };
}

let stockfish = null;

async function initEngine() {
  engineStatusEl.textContent = "引擎状态：加载中...";

  try {
    // 动态加载 Stockfish 脚本
    const script = document.createElement("script");
    script.src = "engine/stockfish.js";

    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    // 调用 Stockfish 工厂函数
    stockfish = await Stockfish();

    // 添加消息监听器
    stockfish.addMessageListener((line) => {
      if (line === "uciok") {
        stockfish.postMessage("setoption name UCI_Variant value xiangqi");
        stockfish.postMessage("setoption name Threads value 4");
        stockfish.postMessage("setoption name Contempt value 0"); // 客观模式：精准评估
        stockfish.postMessage("isready");
      } else if (line === "readyok") {
        engineReady = true;
        engineStatusEl.textContent = "引擎状态：Fairy-Stockfish 已就绪";
        updateAnalysis();
      } else if (line.startsWith("info") && line.includes("score")) {
        const m = line.match(/score (cp|mate) (-?\d+)/);
        if (m) {
          let sc = parseInt(m[2]);
          if (m[1] === "mate") sc = sc > 0 ? 100000 : -100000;
          // 暂存分数，等 bestmove 后再更新胜率
          engineScore = sc;
        }
      } else if (line.startsWith("bestmove")) {
        // 只在红方回合处理结果（防止使用旧分析）
        if (turn !== "red") return;

        const moveStr = line.split(" ")[1];
        if (moveStr) {
          const m = parseUciMove(moveStr);
          if (m && board[m.from.y] && board[m.from.y][m.from.x]) {
            const piece = board[m.from.y][m.from.x];
            // 确保是红方棋子
            if (getPieceColor(piece) !== "red") return;

            const label = pieceLabels[piece] || "?";
            suggestionEl.textContent = `建议：${label} (${m.from.x + 1},${m.from.y + 1}) → (${m.to.x + 1},${m.to.y + 1})`;
            aiSuggestion = { move: m, score: engineScore };
            // 只在 bestmove 后更新胜率，使用最终分数
            updateWinrate(engineScore);
          }
        }
      }
    });

    // 启动 UCI 协议
    stockfish.postMessage("uci");

  } catch (err) {
    console.error("引擎加载失败:", err);
    engineStatusEl.textContent = "引擎加载失败";
    suggestionEl.textContent = "AI 引擎加载失败，请刷新重试";
  }
}

function requestEngineMove(fen) {
  if (!stockfish || !engineReady) return;
  stockfish.postMessage("stop");
  stockfish.postMessage("ucinewgame");
  stockfish.postMessage("position fen " + fen);
  stockfish.postMessage(`go depth ${ENGINE_DEPTH} movetime ${ENGINE_MOVETIME}`);
}

// ==================== 事件监听 ====================

boardEl.addEventListener("mousedown", (e) => {
  const coord = getBoardCoords(e);
  if (!coord) return;
  const p = board[coord.y][coord.x];

  if (selected) {
    if (selected.x === coord.x && selected.y === coord.y) {
      selected = null; legalMoves = [];
      renderBoard(); return;
    }
    if (p && getPieceColor(p) === turn) {
      selected = coord;
      legalMoves = getLegalMoves(board, selected);
      renderBoard(); return;
    }
    const isLegal = legalMoves.some(m => m.x === coord.x && m.y === coord.y);
    if (isLegal) {
      movePiece(selected, coord);
      return;
    }
  }
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
  // 同步移动端按钮状态
  const mobileRed = document.getElementById("mobileStartRed");
  const mobileBlack = document.getElementById("mobileStartBlack");
  if (mobileRed) mobileRed.classList.add("active");
  if (mobileBlack) mobileBlack.classList.remove("active");
  resetGame();
});

startBlackBtn.addEventListener("click", () => {
  nextGameTurn = "black";
  startBlackBtn.classList.add("active");
  startRedBtn.classList.remove("active");
  // 同步移动端按钮状态
  const mobileRed = document.getElementById("mobileStartRed");
  const mobileBlack = document.getElementById("mobileStartBlack");
  if (mobileRed) mobileRed.classList.remove("active");
  if (mobileBlack) mobileBlack.classList.add("active");
  resetGame();
});

// 移动端切换按钮事件
const mobileStartRed = document.getElementById("mobileStartRed");
const mobileStartBlack = document.getElementById("mobileStartBlack");

if (mobileStartRed) {
  mobileStartRed.addEventListener("click", () => {
    nextGameTurn = "red";
    mobileStartRed.classList.add("active");
    mobileStartBlack.classList.remove("active");
    startRedBtn.classList.add("active");
    startBlackBtn.classList.remove("active");
    resetGame();
  });
}

if (mobileStartBlack) {
  mobileStartBlack.addEventListener("click", () => {
    nextGameTurn = "black";
    mobileStartBlack.classList.add("active");
    mobileStartRed.classList.remove("active");
    startBlackBtn.classList.add("active");
    startRedBtn.classList.remove("active");
    resetGame();
  });
}

restartBtn.addEventListener("click", resetGame);
undoBtn.addEventListener("click", handleUndo);
aiMoveBtn.addEventListener("click", handleAiMove);

// 注册 Service Worker

// 注册 Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => console.log("SW注册失败:", err));
  });
}

// ==================== 初始化 ====================
board = createInitialBoard();
startRedBtn.classList.add("active");
renderBoard();
updateStatus();
initEngine();
