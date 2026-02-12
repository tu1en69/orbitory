/* game.js
   A lightweight, mobile-friendly “Orbito-like” 2-player game (HTML5 Canvas + touch).
   - Board: 4x4
   - Turn: place a piece on an empty cell -> then the board “orbits” (rotates) one step clockwise
   - Win: 4 in a row (horizontal / vertical / diagonal)
   - Architecture: small, modular, easy to extend later (AI, animations, different board sizes, rules)

   How to run:
   1) Create an index.html that includes a <canvas id="game"></canvas> and loads this file.
   2) Open index.html in a browser (mobile or desktop).

   Minimal index.html (put next to game.js):
   ----------------------------------------------------
   <!doctype html>
   <html>
   <head>
     <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
     <style>
       html,body{margin:0;height:100%;background:#0b0f14;overflow:hidden;}
       canvas{display:block;touch-action:manipulation;}
     </style>
   </head>
   <body>
     <canvas id="game"></canvas>
     <script src="./game.js"></script>
   </body>
   </html>
   ----------------------------------------------------
*/

(() => {
  "use strict";

  // ====== CONFIG ======
  const CFG = {
    size: 4,                   // 4x4 grid (Orbito-like)
    orbitStepsPerTurn: 1,      // rotate 1 step clockwise after each move
    bg: "#0b0f14",
    boardFill: "#121926",
    boardStroke: "#2b3b57",
    gridStroke: "#22314b",
    p1: "#7dd3fc",             // Player 1 color
    p2: "#fb7185",             // Player 2 color
    empty: 0,
    player1: 1,
    player2: 2,
    uiText: "#cbd5e1",
    uiSubText: "#94a3b8",
    buttonFill: "#1f2a3d",
    buttonStroke: "#334a6b",
    buttonText: "#e2e8f0",
    radiusFactor: 0.34,        // piece radius relative to cell size
  };

  // ====== UTIL ======
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function deepCloneGrid(grid) {
    return grid.map(row => row.slice());
  }

  // ====== ORBIT LOGIC ======
  // We model two rings for a 4x4:
  // - Outer ring: all boundary cells (12 cells)
  // - Inner ring: the 2x2 center cells (4 cells)
  //
  // Rotation = shift each ring list by +steps (clockwise direction).
  //
  // Coordinates are [r,c].
  function ringCoordsOuter4() {
    // Clockwise order around boundary:
    // top row left->right, right col top->bottom (excluding corners already), bottom row right->left, left col bottom->top (excluding corners)
    const coords = [];
    const N = 4;

    for (let c = 0; c < N; c++) coords.push([0, c]);
    for (let r = 1; r < N - 1; r++) coords.push([r, N - 1]);
    for (let c = N - 1; c >= 0; c--) coords.push([N - 1, c]);
    for (let r = N - 2; r >= 1; r--) coords.push([r, 0]);

    return coords; // length 12
  }

  function ringCoordsInner4() {
    // 2x2 center in clockwise order
    return [
      [1, 1], [1, 2],
      [2, 2], [2, 1],
    ];
  }

  function rotateRing(grid, coords, steps) {
    const values = coords.map(([r, c]) => grid[r][c]);
    const L = values.length;
    const s = ((steps % L) + L) % L;
    // Clockwise shift: last elements move forward
    const shifted = values.map((_, i) => values[(i - s + L) % L]);
    coords.forEach(([r, c], i) => { grid[r][c] = shifted[i]; });
  }

  function orbitRotate(grid, steps = 1) {
    // For now, only implement 4x4 orbital rotation as two rings.
    // Extending to other sizes: add ring generator(s).
    const N = grid.length;
    if (N !== 4) throw new Error("This implementation currently supports only 4x4. Extend ring generators for other sizes.");

    const next = deepCloneGrid(grid);
    rotateRing(next, ringCoordsOuter4(), steps);
    rotateRing(next, ringCoordsInner4(), steps);
    return next;
  }

  // ====== WIN CHECK ======
  function checkWinner(grid) {
    const N = grid.length;

    const lines = [];

    // rows
    for (let r = 0; r < N; r++) lines.push(grid[r].map((_, c) => [r, c]));
    // cols
    for (let c = 0; c < N; c++) lines.push(Array.from({ length: N }, (_, r) => [r, c]));
    // diag TL->BR
    lines.push(Array.from({ length: N }, (_, i) => [i, i]));
    // diag TR->BL
    lines.push(Array.from({ length: N }, (_, i) => [i, N - 1 - i]));

    for (const line of lines) {
      const vals = line.map(([r, c]) => grid[r][c]);
      if (vals.every(v => v === CFG.player1)) return CFG.player1;
      if (vals.every(v => v === CFG.player2)) return CFG.player2;
    }
    return CFG.empty;
  }

  function isBoardFull(grid) {
    for (const row of grid) for (const v of row) if (v === CFG.empty) return false;
    return true;
  }

  // ====== GAME STATE ======
  class Game {
    constructor() {
      this.reset();
    }

    reset() {
      this.grid = Array.from({ length: CFG.size }, () => Array(CFG.size).fill(CFG.empty));
      this.current = CFG.player1;
      this.winner = CFG.empty;
      this.draw = false;
      this.lastMove = null; // {r,c} before orbit
      this.lastOrbit = null; // grid snapshot after orbit (for debugging/visual enhancements)
    }

    canPlay() {
      return this.winner === CFG.empty && !this.draw;
    }

    playAt(r, c) {
      if (!this.canPlay()) return false;
      if (!this.inBounds(r, c)) return false;
      if (this.grid[r][c] !== CFG.empty) return false;

      // place
      this.grid[r][c] = this.current;
      this.lastMove = { r, c };

      // orbit rotate
      for (let i = 0; i < CFG.orbitStepsPerTurn; i++) {
        this.grid = orbitRotate(this.grid, 1);
      }
      this.lastOrbit = deepCloneGrid(this.grid);

      // resolve
      const w = checkWinner(this.grid);
      if (w !== CFG.empty) {
        this.winner = w;
        return true;
      }
      if (isBoardFull(this.grid)) {
        this.draw = true;
        return true;
      }

      // switch player
      this.current = (this.current === CFG.player1) ? CFG.player2 : CFG.player1;
      return true;
    }

    inBounds(r, c) {
      return r >= 0 && r < CFG.size && c >= 0 && c < CFG.size;
    }
  }

  // ====== RENDERING / INPUT ======
  class UI {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.game = game;

      this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      this.layout = {
        boardRect: { x: 0, y: 0, w: 0, h: 0 },
        cellSize: 0,
        margin: 16,
        headerH: 96,
        footerH: 96,
        resetBtn: { x: 0, y: 0, w: 0, h: 0 },
      };

      this._bind();
      this.resize();
      this.loop();
    }

    _bind() {
      window.addEventListener("resize", () => this.resize(), { passive: true });

      // Touch + mouse unify via pointer events.
      this.canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const p = this._pointerToCanvas(e);
        this.onTap(p.x, p.y);
      }, { passive: false });
    }

    _pointerToCanvas(e) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left),
        y: (e.clientY - rect.top),
      };
    }

    resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Canvas in CSS pixels; scale backing store by DPR.
      this.canvas.style.width = w + "px";
      this.canvas.style.height = h + "px";
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // Layout: board centered, header top, footer bottom.
      const margin = this.layout.margin;
      const headerH = this.layout.headerH;
      const footerH = this.layout.footerH;

      const usableH = h - headerH - footerH - margin * 2;
      const usableW = w - margin * 2;

      const boardSize = Math.min(usableW, usableH);
      const boardX = (w - boardSize) / 2;
      const boardY = headerH + margin + (usableH - boardSize) / 2;

      this.layout.boardRect = { x: boardX, y: boardY, w: boardSize, h: boardSize };
      this.layout.cellSize = boardSize / CFG.size;

      // Reset button in footer (centered)
      const btnW = Math.min(220, w - margin * 2);
      const btnH = 44;
      const btnX = (w - btnW) / 2;
      const btnY = h - footerH / 2 - btnH / 2;

      this.layout.resetBtn = { x: btnX, y: btnY, w: btnW, h: btnH };
    }

    onTap(x, y) {
      // Reset button?
      if (this._inRect(x, y, this.layout.resetBtn)) {
        this.game.reset();
        return;
      }

      // Board tap -> map to cell
      const b = this.layout.boardRect;
      if (!this._inRect(x, y, b)) return;

      const cs = this.layout.cellSize;
      const c = clamp(Math.floor((x - b.x) / cs), 0, CFG.size - 1);
      const r = clamp(Math.floor((y - b.y) / cs), 0, CFG.size - 1);

      this.game.playAt(r, c);
    }

    _inRect(x, y, r) {
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    }

    loop() {
      this.draw();
      requestAnimationFrame(() => this.loop());
    }

    draw() {
      const ctx = this.ctx;
      const w = this.canvas.width / this.dpr;
      const h = this.canvas.height / this.dpr;

      // background
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = CFG.bg;
      ctx.fillRect(0, 0, w, h);

      this.drawHeader(ctx, w);
      this.drawBoard(ctx);
      this.drawFooter(ctx, h);
    }

    drawHeader(ctx, w) {
      const y = 24;

      ctx.fillStyle = CFG.uiText;
      ctx.font = "600 20px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const g = this.game;
      let title = "";
      if (g.winner === CFG.player1) title = "Player 1 wins!";
      else if (g.winner === CFG.player2) title = "Player 2 wins!";
      else if (g.draw) title = "Draw!";
      else title = (g.current === CFG.player1) ? "Player 1 turn" : "Player 2 turn";

      ctx.fillText(title, w / 2, y);

      ctx.fillStyle = CFG.uiSubText;
      ctx.font = "400 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      const sub = "Tap an empty cell to place → then the board orbits (rotates) clockwise.";
      ctx.fillText(sub, w / 2, y + 28);
    }

    drawBoard(ctx) {
      const b = this.layout.boardRect;
      const N = CFG.size;
      const cs = this.layout.cellSize;

      // board panel
      ctx.fillStyle = CFG.boardFill;
      ctx.strokeStyle = CFG.boardStroke;
      ctx.lineWidth = 2;
      this._roundRect(ctx, b.x, b.y, b.w, b.h, 18);
      ctx.fill();
      ctx.stroke();

      // grid lines
      ctx.strokeStyle = CFG.gridStroke;
      ctx.lineWidth = 1;

      for (let i = 1; i < N; i++) {
        // vertical
        ctx.beginPath();
        ctx.moveTo(b.x + i * cs, b.y);
        ctx.lineTo(b.x + i * cs, b.y + b.h);
        ctx.stroke();

        // horizontal
        ctx.beginPath();
        ctx.moveTo(b.x, b.y + i * cs);
        ctx.lineTo(b.x + b.w, b.y + i * cs);
        ctx.stroke();
      }

      // pieces
      const r = cs * CFG.radiusFactor;
      for (let row = 0; row < N; row++) {
        for (let col = 0; col < N; col++) {
          const v = this.game.grid[row][col];
          if (v === CFG.empty) continue;

          const cx = b.x + col * cs + cs / 2;
          const cy = b.y + row * cs + cs / 2;

          ctx.beginPath();
          ctx.fillStyle = (v === CFG.player1) ? CFG.p1 : CFG.p2;
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();

          // subtle outline
          ctx.globalAlpha = 0.25;
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // (Optional) ring hints for clarity (outer + inner)
      this.drawOrbitHints(ctx, b, cs);
    }

    drawOrbitHints(ctx, b, cs) {
      // very subtle orbital guides, easy to remove if you dislike it
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;

      // outer ring guide
      this._roundRect(ctx, b.x + cs * 0.18, b.y + cs * 0.18, b.w - cs * 0.36, b.h - cs * 0.36, 14);
      ctx.stroke();

      // inner ring guide (center 2x2)
      const innerX = b.x + cs * 1.15;
      const innerY = b.y + cs * 1.15;
      const innerS = cs * 1.7;
      this._roundRect(ctx, innerX, innerY, innerS, innerS, 10);
      ctx.stroke();

      ctx.restore();
    }

    drawFooter(ctx, h) {
      const btn = this.layout.resetBtn;

      // button
      ctx.fillStyle = CFG.buttonFill;
      ctx.strokeStyle = CFG.buttonStroke;
      ctx.lineWidth = 2;
      this._roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = CFG.buttonText;
      ctx.font = "600 16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Reset", btn.x + btn.w / 2, btn.y + btn.h / 2);

      // tiny debug line
      ctx.fillStyle = CFG.uiSubText;
      ctx.font = "400 12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("Tip: extend rules in Game.playAt() and orbitRotate().", (this.canvas.width / this.dpr) / 2, h - 16);
    }

    _roundRect(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }
  }

  // ====== BOOTSTRAP ======
  const canvas = document.getElementById("game");
  if (!canvas) {
    throw new Error('Canvas with id="game" not found. Create it in your HTML.');
  }

  const game = new Game();
  const ui = new UI(canvas, game);

  // Expose for debugging / future extension in DevTools
  window.OrbitoLike = { CFG, game, ui, orbitRotate, checkWinner };
})();
