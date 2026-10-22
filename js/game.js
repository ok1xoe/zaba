// Žába přes silnici – hra ve stylu Froggeru (vlastní grafika a texty). Využívá sadu speccy.js (Z).
(function () {
    'use strict';
    var W = 256, CH = 14, ROWS = 13, HUDY = 183;
    var DEN_X = [16, 64, 112, 160, 208];
    var HOP = 5;

    // ---------- Sprity (pole řetězců)
    function rotCW(rows) {
        var n = rows.length, out = [];
        for (var r = 0; r < n; r++) { var s = ''; for (var c = 0; c < n; c++) { s += rows[n - 1 - c].charAt(r); } out.push(s); }
        return out;
    }
    var FROG_UP = [
        '.gw......wg.',
        '.gkg....gkg.',
        '..gggggggg..',
        '.dggggggggd.',
        'dd.gggggg.dd',
        'dg.gggggg.gd',
        '...gggggg...',
        '..gggggggg..',
        '.dgg.gg.ggd.',
        'dd.g....g.dd',
        'd..gg..gg..d',
        '..dd....dd..'
    ];
    var FROG_RIGHT = rotCW(FROG_UP), FROG_DOWN = rotCW(FROG_RIGHT), FROG_LEFT = rotCW(FROG_DOWN);
    var FROGS = { up: FROG_UP, right: FROG_RIGHT, down: FROG_DOWN, left: FROG_LEFT };
    var FROG_PAL = { g: 12, d: 4, w: 7, k: 0 };
    var LADY_PAL = { g: 11, d: 3, w: 7, k: 0 };
    var CAR = [
        '................',
        '....bbbbbbbb....',
        '...bbwwbbwwbb...',
        '..bbbwwbbwwbbb..',
        'bbbbbbbbbbbbbbbb',
        'bbbbbbbbbbbbbbby',
        'bbbbbbbbbbbbbbbb',
        '.hhh.bbbbb.hhh..',
        '.hhh.......hhh..',
        '................'
    ];
    var FLY = [
        'w..w',
        '.kk.',
        '.kk.',
        'w..w'
    ];
    var CAR_COLS = [2, 6, 13, 10, 3, 14];

    // ---------- Stav
    var G = window.GAME = {
        state: 'title', t: 0, score: 0, hi: 0, lives: 3, lvl: 1,
        row: 12, fx: 120, face: 'up', hopT: 0, queued: null, best: 12,
        time: 0, timeMax: 1500, dt: 0, cause: '', carrying: false,
        dens: [0, 0, 0, 0, 0], // 0 volné, 1 žába
        fly: -1, flyT: 0, flyIn: 300, crocDen: -1, crocT: 0, crocIn: 600,
        ladyIt: null, ladyT: 0, ladyIn: 500, nextLife: 10000, newRec: false,
        lanes: []
    };
    var rnd = Z.rng(Date.now());
    var speedF = 1;

    function mod(a, m) { return ((a % m) + m) % m; }

    // ---------- Pruhy
    function buildLane(row, type, dir, base, pattern) {
        var items = [], off = 0, maxW = 0, i = 0, span = 0, k;
        pattern.forEach(function (p) { if (p.w > maxW) { maxW = p.w; } });
        var guard = 0;
        do {
            pattern.forEach(function (p) {
                items.push({ off: off, w: p.w, k: p.k, dive: !!p.dive, ph: (i * 97) % 400, col: p.col || CAR_COLS[i % CAR_COLS.length], lady: false });
                off += p.w + p.gap; i++;
            });
            span = off; guard++;
        } while (span < W + maxW + 16 && guard < 20);
        return { row: row, type: type, dir: dir, base: base, pos: 0, span: span, margin: maxW, items: items, dx: 0 };
    }
    function buildLanes() {
        var L = [];
        L[1] = buildLane(1, 'river', 1, 0.45, [{ w: 80, gap: 64, k: 'log' }]);
        L[2] = buildLane(2, 'river', -1, 0.55, [{ w: 48, gap: 48, k: 'turtle', dive: true }]);
        L[3] = buildLane(3, 'river', 1, 0.7, [{ w: 64, gap: 64, k: 'croc' }, { w: 48, gap: 48, k: 'log' }]);
        L[4] = buildLane(4, 'river', -1, 0.8, [{ w: 48, gap: 56, k: 'log' }]);
        L[5] = buildLane(5, 'river', 1, 0.5, [{ w: 32, gap: 48, k: 'turtle', dive: true }]);
        L[7] = buildLane(7, 'road', -1, 0.6, [{ w: 16, gap: 80, k: 'car' }]);
        L[8] = buildLane(8, 'road', 1, 0.5, [{ w: 32, gap: 100, k: 'truck' }]);
        L[9] = buildLane(9, 'road', -1, 1.0, [{ w: 16, gap: 48, k: 'car' }, { w: 16, gap: 96, k: 'car' }]);
        L[10] = buildLane(10, 'road', 1, 0.8, [{ w: 16, gap: 70, k: 'car' }]);
        L[11] = buildLane(11, 'road', -1, 0.7, [{ w: 32, gap: 90, k: 'truck' }, { w: 16, gap: 60, k: 'car' }]);
        G.lanes = L;
    }
    function itemX(lane, it, ahead) {
        return mod(it.off + lane.pos + lane.dir * lane.base * speedF * (ahead || 0), lane.span) - lane.margin;
    }
    // stav želvy: 0 nahoře, 1 noří se, 2 pod vodou, 3 vynořuje se
    function turtleState(it, ahead) {
        if (!it.dive) { return 0; }
        var t = (G.t + (ahead || 0) + it.ph) % 400;
        if (t < 240) { return 0; }
        if (t < 270) { return 1; }
        if (t < 330) { return 2; }
        if (t < 360) { return 3; }
        return 0;
    }
    function advanceLanes() {
        G.lanes.forEach(function (l) {
            if (!l) { return; }
            l.dx = l.dir * l.base * speedF;
            l.pos = mod(l.pos + l.dx, l.span);
        });
    }

    // ---------- Pravidla
    function frogY(row) { return row * CH; }
    function respawn() {
        G.row = 12; G.fx = 120; G.face = 'up'; G.hopT = 0; G.queued = null; G.best = 12;
        G.time = G.timeMax; G.carrying = false;
    }
    function newLevelSetup() {
        speedF = Math.min(2.2, 1 + 0.12 * (G.lvl - 1));
        G.timeMax = Math.max(900, 1500 - 80 * (G.lvl - 1));
        G.dens = [0, 0, 0, 0, 0]; G.fly = -1; G.crocDen = -1; G.flyIn = 300; G.crocIn = 600;
        if (G.ladyIt) { G.ladyIt.lady = false; G.ladyIt = null; }
        G.ladyIn = 400;
        buildLanes();
        respawn();
    }
    function startGame() {
        G.score = 0; G.lives = 3; G.lvl = 1; G.nextLife = 10000; G.newRec = false; G.hi = Z.hi.get('zaba');
        newLevelSetup();
        G.state = 'play'; Z.pauseOk = true;
    }
    function addScore(n) {
        G.score += n;
        if (G.score >= G.nextLife) { G.nextLife += 10000; G.lives++; Z.snd.win(); }
    }
    function die(cause) {
        if (G.state !== 'play') { return; }
        G.state = 'dying'; G.dt = 0; G.cause = cause; G.lives--; G.carrying = false;
        if (cause === 'car') { Z.snd.hit(); } else if (cause === 'water') { Z.snd.noise(0.4, 0.2); } else { Z.snd.die(); }
    }
    function gameOver() {
        G.state = 'over'; G.dt = 0; Z.pauseOk = false;
        var old = Z.hi.get('zaba');
        G.hi = Z.hi.submit('zaba', G.score);
        G.newRec = G.score > old;
        Z.snd.over();
    }
    function denAt(cx) {
        for (var i = 0; i < 5; i++) { if (cx >= DEN_X[i] - 4 && cx <= DEN_X[i] + 20) { return i; } }
        return -1;
    }
    function enterHome() {
        var d = denAt(G.fx + 8);
        if (d < 0 || G.dens[d] || G.crocDen === d) { die(d >= 0 && G.crocDen === d ? 'croc' : 'wall'); return; }
        G.dens[d] = 1;
        var secs = Math.ceil(G.time / 50);
        addScore(50 + secs * 10);
        if (G.fly === d) { addScore(200); G.fly = -1; }
        if (G.carrying) { addScore(200); G.carrying = false; }
        Z.snd.coin();
        if (G.dens.every(function (v) { return v; })) {
            addScore(1000);
            G.state = 'clear'; G.dt = 0; Z.snd.win();
        } else {
            respawn();
        }
    }
    function tryHop(dir) {
        var nr = G.row, nx = G.fx;
        G.face = dir;
        if (dir === 'up') { nr--; } else if (dir === 'down') { nr++; } else if (dir === 'left') { nx -= 16; } else { nx += 16; }
        if (nr < 0 || nr >= ROWS || nx < 0 || nx > 240) { return; }
        G.row = nr; G.fx = nx; G.hopT = HOP;
        Z.snd.jump();
        if (nr < G.best) { G.best = nr; addScore(10); }
        if (nr === 0) { enterHome(); }
    }
    function carrierOf(lane, cx, ahead) {
        for (var i = 0; i < lane.items.length; i++) {
            var it = lane.items[i], x = itemX(lane, it, ahead);
            if (cx >= x + 2 && cx <= x + it.w - 2) {
                if (it.k === 'turtle' && turtleState(it, ahead) === 2) { continue; }
                return { it: it, x: x };
            }
        }
        return null;
    }
    function crocHead(lane, it, x, cx) {
        var hx = lane.dir > 0 ? x + it.w - 16 : x;
        return cx >= hx && cx <= hx + 16;
    }
    // bezpečnost políčka za 'ahead' ticků (pro testovacího bota)
    G.safeAt = function (row, fx, ahead) {
        if (row === 12 || row === 6) { return true; }
        if (row === 0) { var d = denAt(fx + 8); return d >= 0 && !G.dens[d] && G.crocDen !== d; }
        var lane = G.lanes[row], cx = fx + 8, i, it, x;
        if (fx < -6 || fx > 246) { return false; }
        if (lane.type === 'road') {
            for (i = 0; i < lane.items.length; i++) {
                it = lane.items[i]; x = itemX(lane, it, ahead);
                if (Z.hit(fx + 3, 0, 10, 8, x + 1, 0, it.w - 2, 8)) { return false; }
                // okraje přes zalomení
            }
            return true;
        }
        var c = carrierOf(lane, cx, ahead);
        if (!c) { return false; }
        if (c.it.k === 'croc' && crocHead(lane, c.it, c.x, cx)) { return false; }
        return true;
    };

    function updateEvents() {
        // moucha
        if (G.fly >= 0) { if (--G.flyT <= 0) { G.fly = -1; } }
        else if (--G.flyIn <= 0) {
            var free = []; for (var i = 0; i < 5; i++) { if (!G.dens[i] && G.crocDen !== i) { free.push(i); } }
            if (free.length) { G.fly = free[(rnd() * free.length) | 0]; G.flyT = 300; }
            G.flyIn = 400 + ((rnd() * 500) | 0);
        }
        // krokodýl v doupěti od 2. úrovně
        if (G.lvl >= 2) {
            if (G.crocDen >= 0) { if (--G.crocT <= 0) { G.crocDen = -1; } }
            else if (--G.crocIn <= 0) {
                var f2 = []; for (var j = 0; j < 5; j++) { if (!G.dens[j] && G.fly !== j) { f2.push(j); } }
                if (f2.length) { G.crocDen = f2[(rnd() * f2.length) | 0]; G.crocT = 260; }
                G.crocIn = 500 + ((rnd() * 400) | 0);
            }
        }
        // žába-dívka na kládě
        if (G.ladyIt) {
            if (--G.ladyT <= 0) { G.ladyIt.lady = false; G.ladyIt = null; }
        } else if (--G.ladyIn <= 0 && !G.carrying) {
            var lane = G.lanes[rnd() < 0.5 ? 1 : 4], logs = lane.items.filter(function (it) { return it.k === 'log'; });
            var it = logs[(rnd() * logs.length) | 0];
            it.lady = true; G.ladyIt = it; G.ladyT = 900; G.ladyIn = 600;
        }
    }

    function tickPlay() {
        var inp = Z.input, dirs = ['up', 'down', 'left', 'right'], i;
        if (G.hopT > 0) { G.hopT--; }
        for (i = 0; i < 4; i++) { if (inp.hit(dirs[i])) { G.queued = dirs[i]; } }
        if (G.hopT === 0 && G.queued) { var q = G.queued; G.queued = null; tryHop(q); }
        if (G.state !== 'play') { return; }
        var row = G.row, lane = G.lanes[row], cx = G.fx + 8;
        if (row >= 1 && row <= 5) {
            var c = carrierOf(lane, cx, 0);
            if (!c) { die('water'); return; }
            if (c.it.k === 'croc' && crocHead(lane, c.it, c.x, cx)) { die('croc'); return; }
            G.fx += lane.dx;
            if (G.fx < -6 || G.fx > 246) { die('edge'); return; }
            if (c.it.lady && !G.carrying) {
                var lx = c.x + c.it.w / 2;
                if (Math.abs(cx - lx) < 12) { G.carrying = true; c.it.lady = false; G.ladyIt = null; addScore(200); Z.snd.coin(); }
            }
        } else if (lane && lane.type === 'road') {
            for (i = 0; i < lane.items.length; i++) {
                var it = lane.items[i], x = itemX(lane, it, 0);
                if (Z.hit(G.fx + 3, 0, 10, 8, x + 1, 0, it.w - 2, 8)) { die('car'); return; }
            }
        }
        if (--G.time <= 0) { die('time'); }
    }

    function tick() {
        G.t++;
        var s = G.state;
        if (s === 'title') {
            advanceLanes();
            if (Z.input.hit('fire')) { buildLanes(); startGame(); }
            return;
        }
        advanceLanes();
        if (s === 'play') { updateEvents(); tickPlay(); }
        else if (s === 'dying') {
            G.dt++;
            if (G.dt >= 70) {
                if (G.lives <= 0) { gameOver(); } else { respawn(); G.state = 'play'; }
            }
        } else if (s === 'clear') {
            G.dt++;
            if (G.dt >= 130) { G.lvl++; newLevelSetup(); G.state = 'play'; }
        } else if (s === 'over') {
            G.dt++;
            if ((G.dt > 40 && Z.input.hit('fire')) || G.dt > 600) { G.state = 'title'; buildLanes(); speedF = 1; }
        }
    }

    // ---------- Kreslení
    function drawBackground() {
        var i, k;
        Z.rect(0, 0, W, 182, 0);
        Z.rect(0, 0, W, CH, 4);
        for (i = 0; i < 5; i++) { Z.rect(DEN_X[i], 0, 16, CH, 1); }
        Z.rect(0, CH, W, CH * 5, 1);
        for (k = 0; k < 40; k++) { Z.pix((k * 53 + (G.t >> 3) * 3) % W, CH + ((k * 29) % (CH * 5)), 5); }
        Z.rect(0, 6 * CH, W, CH, 4);
        for (k = 0; k < 30; k++) { Z.pix((k * 37) % W, 6 * CH + (k * 5) % CH, 12); }
        Z.rect(0, 12 * CH, W, CH, 4);
        for (k = 0; k < 30; k++) { Z.pix((k * 41) % W, 12 * CH + (k * 7) % CH, 12); }
        for (i = 8; i <= 11; i++) { for (k = 0; k < W; k += 16) { Z.rect(k + 2, i * CH, 8, 1, 7); } }
        Z.rect(0, 7 * CH, W, 1, 6); Z.rect(0, 12 * CH - 1, W, 1, 6);
    }
    function drawTurtle(x, y, it, dir) {
        var st = turtleState(it, 0), n = it.w / 16, j, cx, cy = y + 7;
        for (j = 0; j < n; j++) {
            cx = x + j * 16 + 8;
            if (st === 2) { Z.ring(cx, cy, 3 + ((G.t >> 3) & 1), 5); continue; }
            Z.disc(cx, cy, 6, st === 1 || st === 3 ? 5 : 4);
            Z.disc(cx, cy, 3, st === 1 || st === 3 ? 13 : 12);
            Z.rect(cx + dir * 7 - 1, cy - 1, 3, 3, 12);
            Z.pix(cx - dir * 6, cy + 5, 12); Z.pix(cx + dir * 5, cy + 5, 12);
        }
    }
    function drawCroc(x, y, it, dir) {
        var w = it.w, hx = dir > 0 ? x + w - 16 : x, bx = dir > 0 ? x : x + 16, i;
        Z.rect(bx, y + 3, w - 16, 8, 4);
        for (i = 0; i < w - 16; i += 6) { Z.rect(bx + i + 1, y + 2, 2, 2, 12); }
        Z.rect(hx, y + 2, 16, 10, 4);
        var open = ((G.t >> 5) & 1) === 0;
        if (open) { Z.rect(hx + (dir > 0 ? 6 : 0), y + 6, 10, 4, 2); }
        for (i = 0; i < 10; i += 3) { Z.pix(hx + (dir > 0 ? 6 : 0) + i, y + 6, 7); }
        Z.rect(hx + (dir > 0 ? 3 : 11), y + 3, 2, 2, 14);
    }
    function drawLog(x, y, w) {
        Z.rect(x, y + 2, w, 10, 2);
        Z.rect(x, y + 3, w, 1, 10); Z.rect(x, y + 8, w, 1, 10);
        Z.rect(x, y + 2, 2, 10, 6); Z.rect(x + w - 2, y + 2, 2, 10, 6);
        for (var i = 12; i < w - 8; i += 20) { Z.pix(x + i, y + 6, 6); Z.pix(x + i + 1, y + 6, 6); }
    }
    function drawTruck(x, y, it, dir) {
        var boxX = dir > 0 ? x : x + 10, cabX = dir > 0 ? x + 22 : x;
        Z.rect(boxX, y + 2, 22, 10, 7);
        Z.rect(boxX, y + 2, 22, 1, 15);
        Z.rect(cabX, y + 4, 10, 8, 10);
        Z.rect(cabX + (dir > 0 ? 5 : 1), y + 5, 4, 3, 13);
        Z.rect(dir > 0 ? x + 31 : x, y + 9, 1, 2, 14);
        Z.rect(x + 3, y + 11, 5, 3, 15); Z.rect(x + 14, y + 11, 5, 3, 15); Z.rect(x + 24, y + 11, 5, 3, 15);
    }
    function drawLanes() {
        G.lanes.forEach(function (l) {
            if (!l) { return; }
            var y = l.row * CH;
            l.items.forEach(function (it) {
                var x = Math.round(itemX(l, it, 0));
                if (x > W || x + it.w < 0) { return; }
                if (it.k === 'log') {
                    drawLog(x, y, it.w);
                    if (it.lady) { Z.spriteC(x + ((it.w / 2) | 0) - 6, y + 1, FROGS.up, LADY_PAL); }
                } else if (it.k === 'turtle') { drawTurtle(x, y, it, l.dir); }
                else if (it.k === 'croc') { drawCroc(x, y, it, l.dir); }
                else if (it.k === 'truck') { drawTruck(x, y, it, l.dir); }
                else { Z.spriteC(x, y + 2, CAR, { b: it.col, w: 13, y: 14, h: 7 }, l.dir < 0); }
            });
        });
    }
    function drawDens() {
        for (var i = 0; i < 5; i++) {
            var x = DEN_X[i];
            if (G.dens[i]) { Z.spriteC(x + 2, 1, FROGS.down, FROG_PAL); }
            else if (G.crocDen === i) {
                Z.rect(x, 3, 16, 9, 4); Z.rect(x + 2, 7, 12, 3, 2); Z.rect(x + 3, 4, 2, 2, 14); Z.rect(x + 11, 4, 2, 2, 14);
                for (var k = 0; k < 12; k += 3) { Z.pix(x + 2 + k, 7, 7); }
            } else if (G.fly === i) {
                Z.spriteC(x + 6, 5 + ((G.t >> 3) & 1), FLY, { w: 15, k: 0 });
            }
        }
    }
    function drawFrog() {
        var x = Math.round(G.fx), y = frogY(G.row);
        if (G.state === 'dying') {
            var cx = x + 8, cy = y + 7, d = G.dt;
            if (G.cause === 'car') {
                Z.disc(cx, cy, 5, (d >> 2) & 1 ? 2 : 10);
                for (var a = 0; a < 8; a++) { Z.line(cx, cy, cx + Math.cos(a * 0.785) * 8, cy + Math.sin(a * 0.785) * 6, 7); }
            } else if (G.cause === 'water') {
                Z.ring(cx, cy, (d >> 2) % 9 + 1, 7); Z.ring(cx, cy, (d >> 2) % 6 + 1, 5);
                if (d < 20) { Z.spriteC(x + 2, y + 1 + (d >> 1), FROGS[G.face], FROG_PAL); }
            } else {
                Z.line(cx - 5, cy - 5, cx + 5, cy + 5, 10); Z.line(cx + 5, cy - 5, cx - 5, cy + 5, 10);
                Z.spriteC(x + 2, y + 1, FROGS[G.face], { g: 5, d: 1, w: 7, k: 0 });
            }
            return;
        }
        if (G.state === 'clear' && G.row === 0) { return; }
        Z.spriteC(x + 2, y + 1, FROGS[G.face], FROG_PAL);
        if (G.hopT > 2) { Z.pix(x + 1, y + 12, 7); Z.pix(x + 14, y + 12, 7); }
        if (G.carrying) { Z.rect(x + 6, y + 5, 4, 4, 11); Z.pix(x + 7, y + 6, 7); }
    }
    function drawHud() {
        Z.rect(0, 182, W, 10, 0);
        Z.text(0, HUDY, 'SKÓRE ' + Z.pad(G.score, 5), 7);
        Z.text(96, HUDY, 'REK ' + Z.pad(Math.max(G.hi, G.score), 5), 6);
        for (var i = 0; i < Math.min(G.lives, 4); i++) { Z.rect(172 + i * 8, HUDY + 1, 6, 5, 12); Z.pix(172 + i * 8, HUDY, 12); Z.pix(177 + i * 8, HUDY, 12); }
        Z.text(256, HUDY, 'ÚR ' + G.lvl, 14, { align: 'right' });
        var f = Z.clamp(G.time / G.timeMax, 0, 1);
        Z.rect(0, 191, (W * f) | 0, 1, f > 0.5 ? 12 : f > 0.2 ? 14 : 10);
    }
    function drawPlay() {
        drawBackground(); drawLanes(); drawDens(); drawFrog(); drawHud();
        if (G.state === 'clear') {
            Z.rect(48, 70, 160, 40, 0); Z.frame(48, 70, 160, 40, 14);
            Z.text(128, 78, 'ÚROVEŇ ' + G.lvl + ' SPLNĚNA!', 14, { align: 'center' });
            Z.text(128, 92, 'BONUS +1000', 12, { align: 'center' });
        }
        if (G.state === 'dying' && G.dt > 20) {
            var msg = { car: 'PŘEJETA!', water: 'UTONULA!', time: 'ČAS VYPRŠEL!', croc: 'SNĚDENA!', wall: 'NARAZILA!', edge: 'ODPLAVALA!' }[G.cause];
            Z.text(128, 88, msg || '', 15, { align: 'center', paper: 0 });
        }
    }
    function drawTitle() {
        Z.rect(0, 0, W, 192, 0);
        Z.rect(0, 150, W, 42, 0);
        // vodní proužek a silnice jako dekorace
        Z.rect(0, 118, W, 14, 1);
        var k;
        for (k = 0; k < W; k += 8) { Z.pix(k + ((G.t >> 3) & 7), 122 + ((k >> 3) & 3) * 2, 5); }
        G.lanes.forEach(function (l, row) {
            if (!l || (row !== 1 && row !== 8)) { return; }
            l.items.forEach(function (it) {
                var x = Math.round(itemX(l, it, 0));
                if (row === 1) { drawLog(x, 118, it.w); } else { drawTruck(x, 136, it, l.dir); }
            });
        });
        Z.text(128, 10, 'ŽÁBA PŘES', 12, { align: 'center', scale: 2 });
        Z.text(128, 28, 'SILNICI', 14, { align: 'center', scale: 2 });
        Z.spriteCS(112, 48, FROGS.down, FROG_PAL, 2);
        Z.text(128, 76, 'DOSTAŇ 5 ŽABEK DO DOUPAT', 7, { align: 'center' });
        Z.text(128, 86, 'PŘES SILNICI A ŘEKU', 7, { align: 'center' });
        Z.text(128, 98, 'VYHÝBEJ SE AUTŮM A KROKODÝLŮM', 5, { align: 'center' });
        Z.text(128, 108, 'POZOR NA POTÁPĚJÍCÍ SE ŽELVY', 5, { align: 'center' });
        Z.text(128, 154, 'ŠIPKY/WASD SKÁČOU  P PAUZA  M ZVUK', 7, { align: 'center' });
        Z.text(128, 164, 'MOUCHA +200  ŽÁBA-DÍVKA +200', 11, { align: 'center' });
        if ((G.t >> 5) & 1) { Z.text(128, 174, 'STISKNI MEZERNÍK', 14, { align: 'center' }); }
        Z.text(128, 183, 'REKORD ' + Z.pad(Z.hi.get('zaba'), 5), 6, { align: 'center' });
    }
    function drawOver() {
        drawPlay();
        Z.rect(40, 62, 176, 64, 0); Z.frame(40, 62, 176, 64, 10);
        Z.text(128, 70, 'KONEC HRY', 10, { align: 'center', scale: 2 });
        Z.text(128, 92, 'SKÓRE ' + Z.pad(G.score, 5), 15, { align: 'center' });
        Z.text(128, 102, G.newRec ? 'NOVÝ REKORD!' : 'REKORD ' + Z.pad(G.hi, 5), G.newRec ? 14 : 6, { align: 'center' });
        if ((G.t >> 5) & 1) { Z.text(128, 114, 'MEZERNÍK = ZPĚT', 7, { align: 'center' }); }
    }
    function draw() {
        Z.border = G.state === 'dying' ? 2 : 0;
        if (G.state === 'title') { drawTitle(); }
        else if (G.state === 'over') { drawOver(); }
        else { drawPlay(); }
    }

    Z.init({
        title: 'Žába přes silnici',
        touch: [
            { act: 'left', label: '◀' }, { act: 'up', label: '▲' }, { act: 'down', label: '▼' },
            { act: 'right', label: '▶' }, { act: 'fire', label: 'START', cls: 'big' }
        ]
    });
    G.hi = Z.hi.get('zaba');
    buildLanes();
    Z.pauseOk = false;
    Z.run({ tick: tick, draw: draw });
})();
