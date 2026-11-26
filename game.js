// "Defend this page!" - a tiny playable Tiny Kingdom Defense on the website.
// Everything drawn here is real Tiny Swords pack art (Pixel Frog). Click / tap invaders to strike them,
// Space or the Volley button rains arrows, your knight fights on his own. Survive 6 waves.
(function () {
	"use strict";
	var stage = document.getElementById("play-stage");
	if (!stage) return;
	var canvas = document.getElementById("play-canvas");
	var ctx = canvas.getContext("2d");
	var overlay = document.getElementById("play-overlay");
	var volleyBtn = document.getElementById("play-volley");

	// ------------------------------------------------------------------ art
	var SRC = {
		island: "images/pack/island_wide_green.png", castle: "images/pack/castle_blue.png",
		tree: "images/game/tree.png", bush: "images/game/bush.png",
		k_idle: "images/pack/knight_idle.png", k_run: "images/game/knight_run.png",
		k_atk1: "images/pack/knight_attack.png", k_atk2: "images/game/knight_attack2.png",
		r_run: "images/pack/red_run.png", r_atk: "images/pack/red_attack.png", r_guard: "images/pack/red_guard.png",
		l_run: "images/game/red_lancer_run.png", l_atk: "images/game/red_lancer_attack.png",
		a_run: "images/game/red_archer_run.png", a_shoot: "images/game/red_archer_shoot.png",
		arrow_b: "images/game/arrow_blue.png", arrow_r: "images/game/arrow_red.png",
		dust: "images/pack/dust.png", dust2: "images/game/dust2.png", spark: "images/game/spark.png",
		boom: "images/game/explosion.png", target: "images/game/target.png",
		bar: "images/game/bar_base.png", fill: "images/game/bar_fill.png", ribbon: "images/ui/ribbon_red.png",
		ribbon_b: "images/ui/ribbon_blue.png", sheep: "images/pack/sheep.png"
	};
	var IMG = {}, loading = 0;
	Object.keys(SRC).forEach(function (k) {
		var im = new Image();
		loading++;
		im.onload = im.onerror = function () { loading--; };
		im.src = SRC[k];
		IMG[k] = im;
	});

	// Unit types. fw = frame size, ax/ay = where the feet are inside a frame.
	var TYPES = {
		warrior: {run: "r_run", runN: 6, atk: "r_atk", atkN: 4, fw: 192, ax: 96, ay: 136, hp: 3, speed: 52, dmg: 1, atkTime: 0.9, pts: 10, r: 30},
		lancer: {run: "l_run", runN: 6, atk: "l_atk", atkN: 3, fw: 320, ax: 160, ay: 198, hp: 2, speed: 105, dmg: 1, atkTime: 0.8, pts: 15, r: 32},
		archer: {run: "a_run", runN: 4, atk: "a_shoot", atkN: 8, fw: 192, ax: 96, ay: 136, hp: 2, speed: 44, dmg: 1, atkTime: 1.7, pts: 15, r: 28, ranged: true},
		brute: {run: "r_run", runN: 6, atk: "r_atk", atkN: 4, fw: 192, ax: 96, ay: 136, hp: 26, speed: 26, dmg: 3, atkTime: 1.1, pts: 250, r: 30, scale: 1.8}
	};
	var WAVES = [
		{warrior: 7, gap: 1.2},
		{warrior: 10, lancer: 4, gap: 0.9},
		{warrior: 10, archer: 5, lancer: 5, gap: 0.72},
		{warrior: 14, archer: 7, lancer: 7, gap: 0.58},
		{warrior: 16, archer: 8, lancer: 10, gap: 0.48},
		{brute: 2, warrior: 16, archer: 9, lancer: 10, gap: 0.42}
	];
	var CASTLE_HP = 30, VOLLEY_CD = 12, BEST_KEY = "tkd-web-defend-best";
	var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

	// ------------------------------------------------------------------ layout (logical px)
	var H = 480, ISLE_Y = 178, W = 1000, S = 1, dpr = 1;
	var CASTLE_X = 180;                      // castle centre
	var FRONT = CASTLE_X + 150;              // invaders stop here
	var LANE_TOP = ISLE_Y + 42, LANE_BOT = ISLE_Y + 168;

	function resize() {
		var cssW = stage.clientWidth;
		S = cssW >= 820 ? 1 : cssW >= 560 ? 0.75 : 0.58;
		W = cssW / S;
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.style.height = Math.round(H * S) + "px";
		canvas.width = Math.round(cssW * dpr);
		canvas.height = Math.round(H * S * dpr);
		ctx.imageSmoothingEnabled = false;
	}

	// ------------------------------------------------------------------ state
	var g;  // the running game
	function best() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch (e) { return 0; } }
	function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) {} }

	function newGame(mode) {
		g = {
			mode: mode,  // "idle" | "play" | "won" | "lost"
			t: 0, wave: 0, queue: [], spawnT: 0, betweenT: 2.2, banner: mode === "play" ? 2.2 : 0,
			castle: CASTLE_HP, castleFlash: 0, castleGone: 0,
			foes: [], fx: [], arrows: [], texts: [],
			knight: {x: FRONT + 60, y: (LANE_TOP + LANE_BOT) / 2, state: "idle", t: 0, face: 1, cd: 0, swing: 0, target: null},
			score: 0, kills: 0, combo: 0, comboT: 0, volley: 0, shake: 0, hover: null, fireT: 0,
			sheep: [{x: 70, y: ISLE_Y + 60, t: 0}, {x: 115, y: ISLE_Y + 158, t: 0.7}]
		};
		if (mode === "idle") {  // a calm scene behind the start panel
			g.foes.push(makeFoe("warrior", W - 150, ISLE_Y + 70, "guard"));
			g.foes.push(makeFoe("archer", W - 90, ISLE_Y + 120, "guard"));
			g.foes.push(makeFoe("lancer", W - 190, ISLE_Y + 150, "guard"));
		}
		updateVolley();
	}

	function makeFoe(type, x, y, state) {
		var d = TYPES[type];
		return {type: type, d: d, x: x, y: y, hp: d.hp, state: state || "land", t: Math.random(), atk: 0,
			hop: state ? 0 : 0.5, flash: 0, die: 0, kx: 0, stopX: FRONT + Math.random() * 26 + (d.ranged ? 170 + Math.random() * 90 : 0),
			scale: d.scale || 1, shot: false};
	}

	function startWave(n) {
		g.wave = n;
		var w = WAVES[n - 1];
		var q = [];
		["warrior", "lancer", "archer"].forEach(function (k) { for (var i = 0; i < (w[k] || 0); i++) q.push(k); });
		for (var i = q.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = q[i]; q[i] = q[j]; q[j] = t; }
		for (var b = 0; b < (w.brute || 0); b++) q.splice(Math.floor(q.length * (b + 1) / (w.brute + 1)), 0, "brute");
		g.queue = q;
		g.gap = w.gap * Math.max(0.75, Math.min(1.5, 700 / (W - FRONT)));  // short runway (phones) = slower spawns
		g.spawnT = 0.4;
		g.banner = 2.2;
	}

	// ------------------------------------------------------------------ helpers
	function rnd(a, b) { return a + Math.random() * (b - a); }
	function speedMul() { return Math.max(0.6, Math.min(1.35, (W - FRONT) / 560)); }
	function fx(img, n, x, y, dur, scale, fw) { g.fx.push({img: img, n: n, x: x, y: y, t: 0, dur: dur, s: scale || 1, fw: fw}); }
	function text(x, y, s, color, size) { g.texts.push({x: x, y: y, s: s, c: color || "#fff3b0", size: size || 22, t: 0}); }

	function drawFrame(key, n, i, fw, fh, x, y, ax, ay, scale, flip, alpha) {
		var im = IMG[key];
		if (!im || !im.complete || !im.naturalWidth) return;
		i = Math.max(0, Math.min(n - 1, i | 0));
		ctx.save();
		if (alpha != null) ctx.globalAlpha = alpha;
		ctx.translate(Math.round(x), Math.round(y));
		if (flip) ctx.scale(-1, 1);
		ctx.drawImage(im, i * fw, 0, fw, fh, -ax * scale, -ay * scale, fw * scale, fh * scale);
		ctx.restore();
	}

	function hurt(f, dmg, byPlayer, px, py) {
		if (f.state === "dead" || f.state === "guard") return false;
		f.hp -= dmg;
		f.flash = 0.12;
		f.kx = 7;
		if (f.hp > 0) return false;
		f.state = "dead";
		f.die = 0;
		g.kills++;
		var pts = f.d.pts;
		if (byPlayer) {
			g.combo = g.comboT > 0 ? g.combo + 1 : 1;
			g.comboT = 1.3;
			pts *= Math.min(g.combo, 6);
			if (g.combo >= 2) text(f.x, f.y - 92 * f.scale, "COMBO x" + Math.min(g.combo, 6), "#f0c75e", 20 + Math.min(g.combo, 6) * 2);
		} else pts = Math.ceil(pts / 2);
		g.score += pts;
		text(f.x, f.y - 62 * f.scale, "+" + pts);
		fx("dust", 8, f.x, f.y + 6, 0.5, 1.2 * f.scale, 64);
		if (f.type === "brute") {
			for (var i = 0; i < 4; i++) fx("boom", 8, f.x + rnd(-40, 40), f.y - rnd(10, 70), 0.7, 0.8, 192);
			g.shake = 0.5;
		}
		return true;
	}

	// ------------------------------------------------------------------ input
	function toWorld(e) {
		var r = canvas.getBoundingClientRect();
		return {x: (e.clientX - r.left) / S, y: (e.clientY - r.top) / S};
	}
	function foeAt(p, slack) {
		var hit = null;
		g.foes.forEach(function (f) {
			if (f.state === "dead" || f.state === "guard") return;
			var cy = f.y - 34 * f.scale - f.hop * 60;
			var dx = p.x - f.x, dy = p.y - cy, r = (f.d.r + slack) * f.scale;
			if (dx * dx + dy * dy <= r * r && (!hit || f.y > hit.y)) hit = f;
		});
		return hit;
	}
	canvas.addEventListener("pointerdown", function (e) {
		if (!g || g.mode !== "play") return;
		var p = toWorld(e);
		var f = foeAt(p, e.pointerType === "touch" ? 22 : 10);
		if (f) {
			fx("spark", 8, p.x, p.y + 14, 0.35, 0.9, 64);
			hurt(f, 1, true);
		} else {
			fx("dust", 8, p.x, p.y + 10, 0.4, 0.6, 64);
		}
	});
	canvas.addEventListener("pointermove", function (e) { if (g && g.mode === "play" && e.pointerType === "mouse") g.hover = foeAt(toWorld(e), 10); });
	canvas.addEventListener("pointerleave", function () { if (g) g.hover = null; });

	function volley() {
		if (!g || g.mode !== "play" || g.volley > 0) return;
		g.volley = VOLLEY_CD;
		var alive = g.foes.filter(function (f) { return f.state !== "dead" && f.state !== "guard"; });
		for (var i = 0; i < 16; i++) {
			var f = alive.length ? alive[i % alive.length] : null;
			var lead = f && f.state === "run" ? f.d.speed * speedMul() * 0.75 : 0;
			var tx = f ? f.x - lead + rnd(-14, 14) : rnd(FRONT + 40, W - 60);
			var ty = f ? f.y + rnd(-6, 6) : rnd(LANE_TOP, LANE_BOT);
			g.arrows.push({img: "arrow_b", x0: CASTLE_X + rnd(-40, 40), y0: ISLE_Y - 40, x1: tx, y1: ty, t: -i * 0.035, dur: 0.75, arc: 150,
				hit: function (a) {
					fx("spark", 8, a.x1, a.y1, 0.3, 0.7, 64);
					g.foes.forEach(function (o) {
						if (o.state !== "dead" && Math.abs(o.x - a.x1) < 30 * o.scale && Math.abs(o.y - a.y1) < 26) hurt(o, 1, false);
					});
				}});
		}
		updateVolley();
	}
	volleyBtn.addEventListener("click", volley);
	document.addEventListener("keydown", function (e) {
		if (e.code === "Space" && g && g.mode === "play" && isOnScreen) { e.preventDefault(); volley(); }
	});
	function updateVolley() {
		var ready = g && g.mode === "play" && g.volley <= 0;
		volleyBtn.disabled = !ready;
		volleyBtn.hidden = !g || g.mode !== "play";
		volleyBtn.textContent = ready ? "Arrow Volley (Space)" : "Volley in " + Math.ceil(g ? g.volley : 0);
	}

	// ------------------------------------------------------------------ update
	function update(dt) {
		g.t += dt;
		var sm = speedMul();
		if (g.shake > 0) g.shake -= dt;
		if (g.castleFlash > 0) g.castleFlash -= dt;
		if (g.comboT > 0) g.comboT -= dt;
		if (g.banner > 0) g.banner -= dt;
		if (g.volley > 0) { var before = Math.ceil(g.volley); g.volley -= dt; if (Math.ceil(g.volley) !== before || g.volley <= 0) updateVolley(); }
		g.sheep.forEach(function (s) { s.t += dt; });

		// waves
		if (g.mode === "play") {
			if (g.wave === 0 || (!g.queue.length && !g.foes.some(function (f) { return f.state !== "dead"; }))) {
				if (g.wave >= WAVES.length) return win();
				g.betweenT -= dt;
				if (g.betweenT <= 0) { startWave(g.wave + 1); g.betweenT = 2.4; }
			} else if (g.queue.length) {
				g.spawnT -= dt;
				if (g.spawnT <= 0) {
					var type = g.queue.shift();
					var f = makeFoe(type, W - rnd(40, 90), rnd(LANE_TOP, LANE_BOT));
					g.foes.push(f);
					g.spawnT = g.gap * rnd(0.6, 1.4);
				}
			}
		}

		// invaders
		g.foes.forEach(function (f) {
			f.t += dt;
			if (f.flash > 0) f.flash -= dt;
			if (f.kx > 0) { f.x += f.kx * dt * 20; f.kx = Math.max(0, f.kx - dt * 60); }
			if (f.state === "dead") { f.die += dt; return; }
			if (f.state === "guard") return;
			if (f.state === "land") {
				f.hop -= dt;
				if (f.hop <= 0) { f.hop = 0; f.state = "run"; fx("dust2", 10, f.x, f.y + 4, 0.5, 1, 64); }
				return;
			}
			if (f.state === "run") {
				f.x -= f.d.speed * sm * dt;
				if (f.x <= f.stopX) { f.x = f.stopX; f.state = "attack"; f.atk = 0; f.shot = false; }
				return;
			}
			if (f.state === "attack") {
				if (g.castleGone) { f.state = "cheer"; return; }
				f.atk += dt;
				var frac = f.atk / f.d.atkTime;
				if (!f.shot && frac >= (f.d.ranged ? 0.7 : 0.55)) {
					f.shot = true;
					if (f.d.ranged) {
						g.arrows.push({img: "arrow_r", x0: f.x - 20, y0: f.y - 50, x1: CASTLE_X + rnd(-60, 70), y1: ISLE_Y + rnd(0, 70), t: 0, dur: 0.8, arc: 110,
							hit: function (a) { fx("spark", 8, a.x1, a.y1, 0.3, 0.8, 64); damageCastle(1); }});
					} else damageCastle(f.d.dmg);
				}
				if (f.atk >= f.d.atkTime) { f.atk = 0; f.shot = false; }
			}
		});
		g.foes = g.foes.filter(function (f) { return f.state !== "dead" || f.die < 0.7; });

		// knight
		var k = g.knight;
		k.t += dt;
		if (g.mode === "play" && !g.castleGone) {
			if (k.state !== "attack") {  // always go for the invader closest to the castle
				var near = null;
				g.foes.forEach(function (f) {
					if (f.state === "dead" || f.state === "land" || f.state === "guard" || f.x > FRONT + 430) return;
					if (!near || f.x < near.x) near = f;
				});
				k.target = near;
			}
			var tx, ty, tgt = k.target;
			if (tgt) { tx = tgt.x - 44 * tgt.scale; ty = tgt.y; } else { tx = FRONT + 60; ty = (LANE_TOP + LANE_BOT) / 2; }
			var dx = tx - k.x, dy = ty - k.y, dist = Math.sqrt(dx * dx + dy * dy);
			if (k.state === "attack") {
				k.swing += dt;
				if (!k.hitDone && k.swing >= 0.22) {
					k.hitDone = true;
					if (tgt && Math.abs(tgt.x - k.x) < 75 * tgt.scale && Math.abs(tgt.y - k.y) < 34) {
						hurt(tgt, 1, false);
						fx("spark", 8, tgt.x - 10, tgt.y - 34 * tgt.scale, 0.3, 0.6, 64);
					}
				}
				if (k.swing >= 0.45) { k.state = "idle"; k.cd = 0.12; }
			} else if (dist > 6) {
				var sp = 150 * Math.max(0.8, sm);
				var step = Math.min(dist, sp * dt);
				k.x += dx / dist * step; k.y += dy / dist * step;
				k.state = "run";
				if (Math.abs(dx) > 2) k.face = dx > 0 ? 1 : -1;
			} else {
				k.state = "idle";
				if (tgt) { k.face = 1; k.cd -= dt; if (k.cd <= 0) { k.state = "attack"; k.swing = 0; k.hitDone = false; k.alt = !k.alt; } }
			}
		} else if (k.state !== "idle") { k.state = "idle"; }

		// arrows + effects + texts
		g.arrows.forEach(function (a) { a.t += dt; if (a.t >= a.dur && !a.done) { a.done = true; a.hit(a); } });
		g.arrows = g.arrows.filter(function (a) { return !a.done; });
		g.fx.forEach(function (e) { e.t += dt; });
		g.fx = g.fx.filter(function (e) { return e.t < e.dur; });
		g.texts.forEach(function (t) { t.t += dt; });
		g.texts = g.texts.filter(function (t) { return t.t < 1.1; });

		// a burning castle smokes; a fallen one keeps exploding for a moment
		if (g.castle < CASTLE_HP * 0.5 && !g.castleGone) {
			g.fireT -= dt;
			if (g.fireT <= 0) { g.fireT = g.castle < CASTLE_HP * 0.25 ? 0.25 : 0.5; fx("dust2", 10, CASTLE_X + rnd(-110, 110), ISLE_Y + rnd(-60, 40), 0.9, 1.1, 64); }
		}
		if (g.castleGone) {
			g.castleGone += dt;
			if (g.castleGone < 1.4 && Math.random() < dt * 9) fx("boom", 8, CASTLE_X + rnd(-120, 120), ISLE_Y + rnd(-70, 60), 0.7, 1, 192);
		}
		if (g.mode === "won" && Math.random() < dt * 5) {  // victory fireworks
			fx("spark", 8, rnd(60, W - 60), rnd(30, ISLE_Y), 0.6, rnd(1.2, 2), 64);
		}
	}

	function damageCastle(n) {
		if (g.mode !== "play" || g.castleGone) return;
		g.castle = Math.max(0, g.castle - n);
		g.castleFlash = 0.12;
		g.shake = Math.max(g.shake, 0.12);
		if (g.castle <= 0) lose();
	}

	// ------------------------------------------------------------------ win / lose
	function finish(won) {
		g.mode = won ? "won" : "lost";
		updateVolley();
		var b = best(), rec = g.score > b;
		if (rec) saveBest(g.score);
		setTimeout(function () {
			showPanel(won ? "You held the line!" : "Your castle fell!",
				(won ? "All 6 waves beaten." : "You reached wave " + g.wave + " of 6.") +
				"<br>Score <b>" + g.score + "</b>" + (rec ? " &nbsp;<span class=\"new-best\">NEW BEST!</span>" : " &nbsp;(best " + b + ")") +
				"<br>The real game has 5 islands, a hero that levels up, buildings, an army and online co-op.",
				won ? "Play again" : "Try again", true);
		}, won ? 1400 : 1800);
	}
	function win() { finish(true); }
	function lose() {
		g.castleGone = 0.001;
		g.shake = 0.8;
		finish(false);
	}

	// ------------------------------------------------------------------ draw
	function drawIsland() {
		var im = IMG.island;
		if (!im.complete || !im.naturalWidth) return;
		var x0 = 8, x1 = W - 8, y = ISLE_Y - 8;
		ctx.drawImage(im, 0, 0, 64, 296, x0, y, 64, 296);
		var x = x0 + 64;
		while (x < x1 - 64) {
			var w = Math.min(384, x1 - 64 - x);
			w = Math.floor(w / 64) * 64 || Math.min(64, x1 - 64 - x);
			ctx.drawImage(im, 64, 0, w, 296, x, y, w, 296);
			x += w;
		}
		ctx.drawImage(im, 448, 0, 64, 296, x, y, 64, 296);
	}

	function drawBar(x, y, w, frac) {
		var b = IMG.bar, f = IMG.fill;
		if (!b.complete || !b.naturalWidth) return;
		ctx.drawImage(b, 40, 9, 24, 51, x, y, 24, 51);
		for (var m = x + 24; m < x + w - 24; m += 64) ctx.drawImage(b, 128, 9, Math.min(64, x + w - 24 - m), 51, m, y, Math.min(64, x + w - 24 - m), 51);
		ctx.drawImage(b, 256, 9, 24, 51, x + w - 24, y, 24, 51);
		var inner = Math.round((w - 23) * Math.max(0, Math.min(1, frac)));
		if (inner > 0) ctx.drawImage(f, 0, 20, 64, 24, x + 11, y + 11, inner, 24);
	}

	function drawRibbon(key, cx, cy, w, scale) {
		var im = IMG[key];
		if (!im.complete || !im.naturalWidth) return;
		var s = scale, mid = Math.max(0, w - 195 * s);
		var x = cx - (195 * s + mid) / 2;
		ctx.drawImage(im, 0, 0, 97, 103, x, cy - 52 * s, 97 * s, 103 * s);
		ctx.drawImage(im, 97, 0, 64, 103, x + 97 * s, cy - 52 * s, mid, 103 * s);
		ctx.drawImage(im, 161, 0, 98, 103, x + 97 * s + mid, cy - 52 * s, 98 * s, 103 * s);
	}

	function label(s, x, y, size, color, align) {
		ctx.font = "700 " + size + "px 'Pixelify Sans', sans-serif";
		ctx.textAlign = align || "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		ctx.lineWidth = Math.max(3, size / 5);
		ctx.strokeStyle = "#2a1a12";
		ctx.strokeText(s, x, y);
		ctx.fillStyle = color || "#fffbea";
		ctx.fillText(s, x, y);
	}
	function titleText(s, x, y, size) {
		ctx.font = size + "px 'Jacquard 24', Georgia, serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineJoin = "round";
		ctx.lineWidth = 7;
		ctx.strokeStyle = "#f4ecd2";
		ctx.strokeText(s, x, y);
		ctx.fillStyle = "#99262b";
		ctx.fillText(s, x, y);
	}

	function draw() {
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		var sx = 0, sy = 0;
		if (g.shake > 0 && !reduced) { sx = rnd(-4, 4); sy = rnd(-3, 3); }
		ctx.setTransform(S * dpr, 0, 0, S * dpr, sx * S * dpr, sy * S * dpr);
		ctx.imageSmoothingEnabled = false;

		var bob = reduced ? 0 : Math.round(Math.sin(g.t * 1.4) * 3);
		ctx.save();
		ctx.translate(0, bob);
		drawIsland();

		// y-sorted things standing on the island
		var list = [];
		list.push({y: ISLE_Y + 8, draw: function () { drawFrame("tree", 8, (g.t * 8) % 8, 192, 256, W - 70, ISLE_Y + 20, 96, 228, 0.9); }});
		list.push({y: ISLE_Y + 4, draw: function () { drawFrame("bush", 8, (g.t * 8) % 8, 128, 128, W - 150, ISLE_Y + 20, 64, 96, 0.7); }});
		if (W > 700) list.push({y: ISLE_Y + 2, draw: function () { drawFrame("tree", 8, (g.t * 8 + 3) % 8, 192, 256, FRONT + 120, ISLE_Y + 14, 96, 228, 0.75); }});
		g.sheep.forEach(function (s) {
			list.push({y: s.y, draw: function () { drawFrame("sheep", 12, (s.t * 7.5) % 12, 128, 128, s.x, s.y, 64, 96, 0.7); }});
		});
		if (g.castleGone < 1.2) list.push({y: ISLE_Y + 118, draw: function () {
			var a = g.castleGone ? Math.max(0, 1 - g.castleGone / 1.2) : 1;
			drawFrame("castle", 1, 0, 320, 256, CASTLE_X, ISLE_Y + 140, 160, 256, 1, false, a);
			if (g.castleFlash > 0) {
				ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.45;
				drawFrame("castle", 1, 0, 320, 256, CASTLE_X, ISLE_Y + 140, 160, 256, 1);
				ctx.restore();
			}
		}});
		g.foes.forEach(function (f) { list.push({y: f.y, draw: function () { drawFoe(f); }}); });
		var k = g.knight;
		list.push({y: k.y, draw: function () {
			if (k.state === "attack") drawFrame(k.alt ? "k_atk2" : "k_atk1", 4, k.swing / 0.45 * 4, 192, 192, k.x, k.y, 96, 136, 1, k.face < 0);
			else if (k.state === "run") drawFrame("k_run", 6, (k.t * 12) % 6, 192, 192, k.x, k.y, 96, 136, 1, k.face < 0);
			else drawFrame("k_idle", 8, (k.t * 8) % 8, 192, 192, k.x, k.y, 96, 136, 1, k.face < 0);
		}});
		list.sort(function (a, b) { return a.y - b.y; });
		list.forEach(function (o) { o.draw(); });

		// hover target corners
		if (g.hover && g.hover.state !== "dead" && g.mode === "play") {
			var h = g.hover, pulse = 1 + Math.sin(g.t * 10) * 0.05;
			drawFrame("target", 1, 0, 128, 128, h.x, h.y - 34 * h.scale - h.hop * 60, 64, 64, 0.62 * h.scale * pulse);
		}
		ctx.restore();

		// arrows
		g.arrows.forEach(function (a) {
			if (a.t < 0) return;
			var u = Math.min(1, a.t / a.dur);
			var x = a.x0 + (a.x1 - a.x0) * u, y = a.y0 + (a.y1 - a.y0) * u - a.arc * 4 * u * (1 - u);
			var vx = (a.x1 - a.x0), vy = (a.y1 - a.y0) - a.arc * 4 * (1 - 2 * u);
			ctx.save();
			ctx.translate(Math.round(x), Math.round(y + bob));
			ctx.rotate(Math.atan2(vy, vx));
			if (IMG[a.img].complete) ctx.drawImage(IMG[a.img], -32, -32, 64, 64);
			ctx.restore();
		});
		// effects
		g.fx.forEach(function (e) {
			var fw = e.fw;
			drawFrame(e.img, e.n, e.t / e.dur * e.n, fw, fw === 192 ? 192 : 64, e.x, e.y + bob, fw / 2, fw === 192 ? 96 : 48, e.s);
		});
		// floating texts
		g.texts.forEach(function (t) {
			ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t.t - 0.6) / 0.5);
			label(t.s, t.x, t.y - t.t * 42 + bob, t.size, t.c);
			ctx.globalAlpha = 1;
		});

		// HUD
		if (g.mode !== "idle") {
			var bw = Math.min(260, W * 0.32);
			label("Castle", 20, 22, 18, "#fffbea", "left");
			drawBar(14, 30, bw, g.castle / CASTLE_HP);
			label(g.castle + " / " + CASTLE_HP, 14 + bw / 2, 55, 15, "#fffbea");
			label("WAVE " + Math.max(1, g.wave) + " / " + WAVES.length, W / 2, 28, 24, "#fffbea");
			label(String(g.score), W - 20, 30, 30, "#f0c75e", "right");
			label("Best " + Math.max(best(), 0), W - 20, 60, 15, "#fffbea", "right");
			if (g.combo >= 2 && g.comboT > 0) label("COMBO x" + Math.min(g.combo, 6), W / 2, 60, 18, "#f0c75e");
		}
		if (g.banner > 0 && g.mode === "play" && g.wave > 0) {
			var a = Math.min(1, g.banner * 2, (2.2 - g.banner) * 4);
			ctx.globalAlpha = a;
			var last = g.wave === WAVES.length;
			drawRibbon(last ? "ribbon" : "ribbon_b", W / 2, ISLE_Y - 20, last ? 380 : 300, 0.9);
			label(last ? "FINAL WAVE!" : "WAVE " + g.wave, W / 2, ISLE_Y - 27, 30, "#fff6dc");
			ctx.globalAlpha = 1;
		}
	}

	function drawFoe(f) {
		var d = f.d, s = f.scale, hopY = f.hop > 0 ? -Math.sin((1 - f.hop / 0.5) * Math.PI) * 60 - f.hop * 40 : 0;
		var alpha = f.state === "dead" ? Math.max(0, 1 - f.die / 0.6) : 1;
		if (f.state === "dead") {  // tip over and fade
			ctx.save();
			ctx.translate(f.x, f.y);
			ctx.rotate(Math.min(1, f.die / 0.25) * 1.3);
			ctx.translate(-f.x, -f.y);
			drawFrame(d.run, d.runN, 0, d.fw, d.fw, f.x, f.y, d.ax, d.ay, s, true, alpha);
			ctx.restore();
			return;
		}
		var key, n, i;
		if (f.state === "guard" || f.state === "cheer") {
			if (f.type === "warrior" || f.type === "brute") { key = "r_guard"; n = 6; i = (f.t * 7) % 6; }
			else { key = d.run; n = d.runN; i = 0; }
		} else if (f.state === "attack") { key = d.atk; n = d.atkN; i = f.atk / d.atkTime * n; }
		else { key = d.run; n = d.runN; i = (f.t * (d.speed > 80 ? 14 : 10)) % n; }
		var fw = key === "r_guard" ? 192 : d.fw;
		// shadow
		ctx.save();
		ctx.globalAlpha = 0.25 * alpha;
		ctx.fillStyle = "#14303a";
		ctx.beginPath();
		ctx.ellipse(f.x, f.y + 2, 22 * s, 6 * s, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
		drawFrame(key, n, i, fw, fw, f.x, f.y + hopY, key === "r_guard" ? 96 : d.ax, key === "r_guard" ? 136 : d.ay, s, true, alpha);
		if (f.flash > 0) {
			ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.7;
			drawFrame(key, n, i, fw, fw, f.x, f.y + hopY, d.ax, d.ay, s, true);
			ctx.restore();
		}
		if (f.hp < d.hp && f.type === "brute") drawBar(f.x - 60, f.y - 150, 120, f.hp / d.hp);
	}

	// ------------------------------------------------------------------ panels
	function showPanel(title, body, btnText, withDownload) {
		overlay.innerHTML =
			"<div class=\"paper play-panel\">" +
			"<h3>" + title + "</h3><p>" + body + "</p>" +
			"<div class=\"play-btns\"><button type=\"button\" class=\"btn small-btn red\" id=\"play-go\">" + btnText + "</button>" +
			(withDownload ? "<a class=\"btn small-btn\" href=\"https://isajakeyy.itch.io/tiny-kingdom-defense\">Get the full game</a>" : "") +
			"</div></div>";
		overlay.hidden = false;
		document.getElementById("play-go").addEventListener("click", function () {
			overlay.hidden = true;
			newGame("play");
		});
	}

	// ------------------------------------------------------------------ loop (only while on screen)
	var isOnScreen = false, raf = 0, last = 0;
	function frame(now) {
		raf = 0;
		var dt = Math.min(0.05, (now - last) / 1000 || 0);
		last = now;
		if (!loading) { update(dt); draw(); }
		if (isOnScreen && !document.hidden) raf = requestAnimationFrame(frame);
	}
	function kick() { if (!raf && isOnScreen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
	if ("IntersectionObserver" in window) {
		new IntersectionObserver(function (es) { isOnScreen = es[0].isIntersecting; kick(); }, {rootMargin: "100px"}).observe(stage);
	} else isOnScreen = true;
	document.addEventListener("visibilitychange", kick);
	window.addEventListener("resize", function () { resize(); if (!raf && g) draw(); });

	resize();
	newGame("idle");
	showPanel("Invaders incoming!",
		"Invaders are landing on this island. <b>Click or tap them</b> to strike them down before they reach your castle." +
		"<br>Press <b>Space</b> for an arrow volley. Your knight fights alongside you. Survive 6 waves!",
		"Play now", false);
	kick();
})();
