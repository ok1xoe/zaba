// Testy v Node: stavy, NaN, bot dokončí první úroveň, screenshoty.
const H = require('/Users/hyman/EngetoAcademy/TizenOS/_kit/headless.js');
const path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2] || '/tmp';
const g = H.load([root + '/js/speccy.js', root + '/js/game.js']);
const G = g.sandbox.GAME;
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok:', m); };
const tap = (code) => { g.key(code, true); g.step(1); g.key(code, false); };

g.step(60); assert(G.state === 'title', 'start na titulce');
g.png(out + '/title.png', 3);
tap(32); g.step(2); assert(G.state === 'play', 'mezerník spustí hru');

// ruční test: skok nahoru a stav
const r0 = G.row; tap(38); g.step(1); assert(G.row === r0 - 1, 'skok nahoru');
// vlastní smrt: pustit auta (zůstat na místě bez pohybu) -> čas vyprší
G.row = 12; G.time = 3; g.step(5); assert(G.state === 'dying' && G.lives === 2, 'smrt časem');
g.step(80); assert(G.state === 'play', 'respawn po smrti');

// bot
function bot() {
    if (G.state !== 'play' || G.hopT > 0) { return null; }
    const row = G.row, fx = G.fx;
    const okRoad = (r, x) => [1, 3, 6, 10].every(a => G.safeAt(r, x, a));
    const okRiv = (r, x) => [1, 2, 4].every(a => G.safeAt(r, x, a)) ;
    const ok = (r, x) => (r >= 1 && r <= 5) ? okRiv(r, x) : r === 0 ? G.safeAt(0, x, 0) : okRoad(r, x);
    if (row === 1) {
        // zarovnat na volné doupě
        const free = [0,1,2,3,4].filter(i => !G.dens[i] && G.crocDen !== i);
        let best = free.map(i => 16 + 48 * i).sort((a, b) => Math.abs(a - fx) - Math.abs(b - fx))[0];
        if (G.safeAt(0, fx, 0)) { return 'up'; }
        if (best !== undefined) {
            const d = best - fx;
            if (Math.abs(d) > 6) { const dir = d > 0 ? 'right' : 'left'; if (ok(1, fx + (d > 0 ? 16 : -16))) { return dir; } }
        }
        return null;
    }
    if (ok(row - 1, fx)) { return 'up'; }
    if (row >= 7 && row <= 11 && !okRoad(row, fx)) {
        for (const [d, nx, nr] of [['left', fx - 16, row], ['right', fx + 16, row], ['down', fx, row + 1]]) { if (nx >= 0 && nx <= 240 && ok(nr, nx)) { return d; } }
    }
    return null;
}
const keys = { up: 38, down: 40, left: 37, right: 39 };
G.lives = 99;
let ticks = 0, deaths = 0;
const start = G.lvl;
while (G.lvl === start && ticks < 40000) {
    const d = bot();
    if (d) { tap(keys[d]); ticks++; } else { g.step(1); ticks++; }
    if (ticks === 600) { g.png(out + '/play.png', 3); }
    if (g.hasNaN(G)) { assert(false, 'NaN ve stavu'); }
}
assert(G.lvl === start + 1, 'bot dokončil úroveň 1 (' + ticks + ' ticků, skóre ' + G.score + ', životů ztraceno ' + (99 - G.lives) + ')');
g.png(out + '/level2.png', 3);
// konec hry
G.lives = 1; G.row = 12; G.time = 2; g.step(5); g.step(80);
assert(G.state === 'over', 'konec hry'); g.png(out + '/over.png', 3);
g.step(60); tap(32); g.step(2); assert(G.state === 'title', 'návrat na titulku');
console.log('hi', g.Z.hi.get('zaba'));
