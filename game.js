/* =========================================================
   ECO-TEMPEST: EQUILIBRIO ELEMENTAL — game.js
   Motor de juego completo: Canvas 2D, partículas, física,
   Web Audio API, controles ratón/teclado/touch.
   ========================================================= */

'use strict';

/* ─── NAMESPACE GLOBAL ─── */
const Game = (() => {

  /* ──────────────────────────────────────────
     CONSTANTES Y CONFIGURACIÓN
  ────────────────────────────────────────── */
  const ELEMENTS = [
    { id: 'volcano', name: 'Volcán',  emoji: '🌋',
      color: '#FF4500', color2: '#FF8C00', color3: '#FFD700',
      glow: 'rgba(255,80,0,0.8)' },
    { id: 'aurora',  name: 'Aurora',  emoji: '🌌',
      color: '#00FF88', color2: '#AA00FF', color3: '#00BFFF',
      glow: 'rgba(0,255,136,0.8)' },
    { id: 'tsunami', name: 'Tsunami', emoji: '🌊',
      color: '#00BFFF', color2: '#0040FF', color3: '#00FFFF',
      glow: 'rgba(0,191,255,0.8)' },
    { id: 'tornado', name: 'Tornado', emoji: '🌪️',
      color: '#FFD700', color2: '#C0C0C0', color3: '#FFFFFF',
      glow: 'rgba(255,215,0,0.8)' },
  ];

  const SHIELD_SEGMENTS = 4; // Cuadrantes del escudo
  const BASE_ORB_SPEED  = 1.2;
  const MAX_LIVES       = 3;
  const COMBO_MAX       = 5;

  /* ──────────────────────────────────────────
     ESTADO DEL JUEGO
  ────────────────────────────────────────── */
  let state = {};

  function initState() {
    state = {
      screen: 'menu',
      score: 0,
      lives: MAX_LIVES,
      level: 1,
      combo: 0,
      maxCombo: 0,
      power: 0,         // 0-100
      shieldAngle: 0,   // radianes, rotación actual del escudo
      orbs: [],
      particles: [],
      bgParticles: [],
      frameId: null,
      running: false,
      lastTime: 0,
      orbTimer: 0,
      orbInterval: 3200, // ms entre orbes
      orbSpeed: BASE_ORB_SPEED,
    };
  }

  /* ──────────────────────────────────────────
     AUDIO (Web Audio API)
  ────────────────────────────────────────── */
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playSound(type) {
    try {
      const ctx = getAudioCtx();
      const now = ctx.currentTime;

      if (type === 'hit_good') {
        // Chime ascendente
        [440, 660, 880].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.08);
          gain.gain.setValueAtTime(0.18, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.35);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.4);
        });
      } else if (type === 'hit_bad') {
        // Explosión grave
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass'; filt.frequency.value = 300;
        src.buffer = buf;
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
        src.start(now);
      } else if (type === 'power') {
        // Sonido épico de poder
        [200, 400, 600, 800].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + i * 0.05);
          osc.frequency.exponentialRampToValueAtTime(freq * 2, now + 0.5);
          gain.gain.setValueAtTime(0.12, now + i * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(now + i * 0.05);
          osc.stop(now + 0.8);
        });
      } else if (type === 'combo') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(1400, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.35);
      }
    } catch(e) { /* silencioso si falla el audio */ }
  }

  /* ──────────────────────────────────────────
     CANVAS Y CONTEXTOS
  ────────────────────────────────────────── */
  let canvas, ctx2d, W, H, CX, CY;

  function initCanvas() {
    canvas = document.getElementById('game-canvas');
    ctx2d  = canvas.getContext('2d');
    resizeCanvas();
  }

  function resizeCanvas() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    CX = W / 2; CY = H / 2;
  }

  /* ──────────────────────────────────────────
     PARTÍCULAS DE FONDO (menú)
  ────────────────────────────────────────── */
  function initBgParticles(canvasEl) {
    const c = canvasEl.getContext('2d');
    const particles = [];
    const resizeFn = () => { canvasEl.width = window.innerWidth; canvasEl.height = window.innerHeight; };
    resizeFn();
    window.addEventListener('resize', resizeFn);
    for (let i = 0; i < 80; i++) {
      const el = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
      particles.push({
        x: Math.random() * canvasEl.width,
        y: Math.random() * canvasEl.height,
        r: Math.random() * 2 + 0.5,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        color: el.color,
        alpha: Math.random() * 0.5 + 0.1,
      });
    }
    let rafId;
    function loop() {
      rafId = requestAnimationFrame(loop);
      const cw = canvasEl.width, ch = canvasEl.height;
      c.clearRect(0, 0, cw, ch);
      // Gradiente de fondo profundo
      const grad = c.createRadialGradient(cw/2, ch/2, 0, cw/2, ch/2, Math.max(cw,ch)*0.7);
      grad.addColorStop(0, 'rgba(5,15,35,1)');
      grad.addColorStop(1, 'rgba(2,5,15,1)');
      c.fillStyle = grad; c.fillRect(0,0,cw,ch);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = cw; if (p.x > cw) p.x = 0;
        if (p.y < 0) p.y = ch; if (p.y > ch) p.y = 0;
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, Math.PI*2);
        c.fillStyle = p.color;
        c.globalAlpha = p.alpha;
        c.fill();
        c.globalAlpha = 1;
      });
    }
    loop();
    return () => cancelAnimationFrame(rafId);
  }

  let stopBg1, stopBg2, stopBgGo;

  /* ──────────────────────────────────────────
     NAVEGACIÓN DE PANTALLAS
  ────────────────────────────────────────── */
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + id).classList.add('active');
  }

  function showMenu() {
    stopGameLoop();
    showScreen('menu');
    if (stopBg1) stopBg1();
    stopBg1 = initBgParticles(document.getElementById('bg-canvas'));
  }

  function showHowTo() {
    showScreen('howto');
    if (stopBg2) stopBg2();
    stopBg2 = initBgParticles(document.getElementById('bg-canvas-howto'));
  }

  function showGameOver() {
    showScreen('gameover');
    document.getElementById('final-score').textContent = state.score.toLocaleString();
    document.getElementById('final-level').textContent = state.level;
    document.getElementById('final-combo').textContent = state.maxCombo;
    if (stopBgGo) stopBgGo();
    stopBgGo = initBgParticles(document.getElementById('bg-canvas-go'));
  }

  /* ──────────────────────────────────────────
     LÓGICA PRINCIPAL DEL JUEGO
  ────────────────────────────────────────── */
  function startGame() {
    initState();
    initCanvas();
    showScreen('game');
    updateHUD();
    spawnBgGameParticles();
    state.running = true;
    state.lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  function spawnBgGameParticles() {
    for (let i = 0; i < 60; i++) {
      state.bgParticles.push({
        x: Math.random() * (W || window.innerWidth),
        y: Math.random() * (H || window.innerHeight),
        r: Math.random() * 1.5 + 0.3,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        color: ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)].color,
        alpha: Math.random() * 0.3 + 0.05,
      });
    }
  }

  /* ── Bucle principal ── */
  function gameLoop(timestamp) {
    if (!state.running) return;
    const dt = Math.min(timestamp - state.lastTime, 50);
    state.lastTime = timestamp;

    update(dt);
    render();

    state.frameId = requestAnimationFrame(gameLoop);
  }

  function stopGameLoop() {
    state.running = false;
    if (state.frameId) { cancelAnimationFrame(state.frameId); state.frameId = null; }
  }

  /* ── Actualización ── */
  function update(dt) {
    // Rotación suave del escudo por teclado
    if (keys.ArrowLeft || keys.KeyA) state.shieldAngle -= 0.045;
    if (keys.ArrowRight || keys.KeyD) state.shieldAngle += 0.045;

    // Spawn de orbes
    state.orbTimer += dt;
    if (state.orbTimer >= state.orbInterval) {
      state.orbTimer = 0;
      spawnOrb();
      // Aumentar dificultad con el nivel
      if (state.orbInterval > 1000) state.orbInterval -= 15;
    }

    // Actualizar orbes
    state.orbs.forEach(orb => {
      const dx = CX - orb.x, dy = CY - orb.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      orb.x += (dx/dist) * orb.speed;
      orb.y += (dy/dist) * orb.speed;
      orb.angle += 0.04;

      // ¿Llegó al escudo?
      const SHIELD_R = getShieldRadius();
      if (dist < SHIELD_R + orb.r + 8) {
        handleOrbHit(orb);
        orb.dead = true;
      }
    });
    state.orbs = state.orbs.filter(o => !o.dead);

    // Actualizar partículas
    state.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity || 0;
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.spin) p.rotation = (p.rotation || 0) + p.spin;
    });
    state.particles = state.particles.filter(p => p.life > 0);

    // Partículas de fondo
    state.bgParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
    });
  }

  function getShieldRadius() {
    return Math.min(W, H) * 0.22;
  }

  function getCoreRadius() {
    return Math.min(W, H) * 0.10;
  }

  /* ── Spawn de un orbe ── */
  function spawnOrb() {
    const el   = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.max(W, H) * 0.65;
    state.orbs.push({
      x: CX + Math.cos(angle) * dist,
      y: CY + Math.sin(angle) * dist,
      r: 18,
      angle: 0,
      speed: state.orbSpeed + state.level * 0.25,
      element: el,
    });
  }

  /* ── Colisión orbe-escudo ── */
  function handleOrbHit(orb) {
    // Determinar qué segmento del escudo absorbe el orbe
    const dx = orb.x - CX, dy = orb.y - CY;
    let hitAngle = Math.atan2(dy, dx) - state.shieldAngle;
    // Normalizar a [0, 2π]
    hitAngle = ((hitAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    const segIdx = Math.floor(hitAngle / (Math.PI*2 / SHIELD_SEGMENTS)) % SHIELD_SEGMENTS;
    const shieldElement = ELEMENTS[segIdx];

    if (shieldElement.id === orb.element.id) {
      // ¡ACIERTO!
      state.score += 100 * (state.combo + 1);
      state.combo++;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;
      state.power = Math.min(100, state.power + 22);
      if (state.combo >= COMBO_MAX) { state.power = 100; }
      updateHUD();
      spawnHitParticles(orb.x, orb.y, orb.element, true);
      showNotif('✓ +' + (100 * state.combo), 'hit-good');
      playSound(state.combo >= 3 ? 'combo' : 'hit_good');
      // Subir de nivel
      if (state.score >= state.level * 1000) {
        state.level++;
        state.orbSpeed = BASE_ORB_SPEED + state.level * 0.2;
        showNotif('⬆ NIVEL ' + state.level, 'power');
      }
    } else {
      // ¡FALLO!
      state.combo = 0;
      state.lives--;
      updateHUD();
      spawnHitParticles(orb.x, orb.y, orb.element, false);
      flashScreen('#FF000055');
      showNotif('✗ ERROR', 'hit-bad');
      playSound('hit_bad');
      if (state.lives <= 0) {
        setTimeout(() => { stopGameLoop(); showGameOver(); }, 500);
      }
    }
  }

  /* ──────────────────────────────────────────
     PODER ESPECIAL
  ────────────────────────────────────────── */
  function activatePower() {
    if (state.power < 100) return;
    state.power = 0;
    state.orbs = [];
    updateHUD();
    playSound('power');
    showNotif('⚡ PODER PLANETARIO!', 'power');
    flashScreen('rgba(255,215,0,0.35)');
    // Gran explosión de aurora
    for (let i = 0; i < 250; i++) {
      const ang = (Math.PI*2 / 250) * i;
      const el  = ELEMENTS[i % 4];
      const sp  = 3 + Math.random() * 7;
      state.particles.push({
        x: CX, y: CY,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        r: 3 + Math.random() * 5,
        color: el.color,
        glow: el.glow,
        life: 1000 + Math.random() * 800,
        maxLife: 1800,
        alpha: 1,
        gravity: 0,
        type: 'aurora',
        rotation: 0,
        spin: (Math.random()-0.5)*0.2,
      });
    }
  }

  /* ──────────────────────────────────────────
     PARTÍCULAS POR IMPACTO
  ────────────────────────────────────────── */
  function spawnHitParticles(x, y, element, success) {
    const count = success ? 60 : 30;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp  = (success ? 2 : 1) + Math.random() * (success ? 6 : 4);
      const colors = [element.color, element.color2, element.color3];
      const col = colors[Math.floor(Math.random() * colors.length)];

      let type = element.id;
      if (!success) type = 'miss';

      state.particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        r: 2 + Math.random() * (success ? 6 : 3),
        color: success ? col : '#FF3300',
        glow:  success ? element.glow : 'rgba(255,50,0,0.6)',
        life: 400 + Math.random() * (success ? 700 : 350),
        maxLife: success ? 1100 : 750,
        alpha: 1,
        gravity: element.id === 'volcano' && success ? 0.06 : 0,
        type,
        rotation: 0,
        spin: (Math.random()-0.5)*0.15,
      });
    }

    // Anillos de onda
    if (success) {
      for (let r = 0; r < 3; r++) {
        state.particles.push({
          x, y, vx: 0, vy: 0,
          r: 10,
          targetR: 80 + r * 30,
          color: element.color,
          glow: element.glow,
          life: 350 - r*50, maxLife: 350,
          alpha: 1, gravity: 0,
          type: 'ring',
          rotation: 0, spin: 0,
        });
      }
    }
  }

  /* ──────────────────────────────────────────
     RENDER
  ────────────────────────────────────────── */
  function render() {
    ctx2d.clearRect(0, 0, W, H);

    // Fondo
    drawBackground();

    // Partículas detrás del núcleo
    drawParticles(false);

    // Núcleo + escudo
    drawCore();
    drawShield();

    // Partículas frente al núcleo
    drawParticles(true);

    // Orbes
    drawOrbs();
  }

  function drawBackground() {
    // Gradiente de fondo oscuro con leve color en el centro
    const grad = ctx2d.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W,H)*0.75);
    grad.addColorStop(0, 'rgba(8,15,35,1)');
    grad.addColorStop(1, 'rgba(2,5,12,1)');
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(0, 0, W, H);

    // Partículas de fondo
    state.bgParticles.forEach(p => {
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx2d.fillStyle = p.color;
      ctx2d.globalAlpha = p.alpha;
      ctx2d.fill();
    });
    ctx2d.globalAlpha = 1;
  }

  function drawCore() {
    const r = getCoreRadius();
    // Vida del núcleo = brillo y grietas
    const lifeRatio = state.lives / MAX_LIVES;

    // Pulso suave
    const pulse = 1 + Math.sin(Date.now() * 0.003) * 0.03;

    // Glow exterior según vida
    ctx2d.save();
    ctx2d.shadowColor = lifeRatio > 0.6 ? '#00FFAA' : lifeRatio > 0.3 ? '#FFD700' : '#FF4500';
    ctx2d.shadowBlur = 50 * lifeRatio + 10;

    // Gradiente del núcleo
    const grad = ctx2d.createRadialGradient(CX-r*0.3, CY-r*0.3, r*0.05, CX, CY, r*pulse);
    if (lifeRatio > 0.6) {
      grad.addColorStop(0,   '#AAFFEE');
      grad.addColorStop(0.4, '#00CC88');
      grad.addColorStop(1,   '#003322');
    } else if (lifeRatio > 0.3) {
      grad.addColorStop(0,   '#FFFFAA');
      grad.addColorStop(0.4, '#FFAA00');
      grad.addColorStop(1,   '#331100');
    } else {
      grad.addColorStop(0,   '#FF8888');
      grad.addColorStop(0.4, '#FF2200');
      grad.addColorStop(1,   '#220000');
    }

    ctx2d.beginPath();
    ctx2d.arc(CX, CY, r*pulse, 0, Math.PI*2);
    ctx2d.fillStyle = grad;
    ctx2d.fill();

    // Brillo interno
    const inner = ctx2d.createRadialGradient(CX-r*0.25, CY-r*0.35, 1, CX, CY, r*0.7);
    inner.addColorStop(0, 'rgba(255,255,255,0.35)');
    inner.addColorStop(1, 'rgba(255,255,255,0)');
    ctx2d.beginPath();
    ctx2d.arc(CX, CY, r*pulse, 0, Math.PI*2);
    ctx2d.fillStyle = inner;
    ctx2d.fill();

    ctx2d.restore();

    // Texto del emoji planetario
    ctx2d.save();
    ctx2d.globalAlpha = 0.9;
    ctx2d.font = `${r * 0.9}px serif`;
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText('🌍', CX, CY + 2);
    ctx2d.restore();
  }

  function drawShield() {
    const SHIELD_R = getShieldRadius();
    const SEG = Math.PI*2 / SHIELD_SEGMENTS;

    for (let i = 0; i < SHIELD_SEGMENTS; i++) {
      const el    = ELEMENTS[i];
      const start = state.shieldAngle + i * SEG;
      const end   = state.shieldAngle + (i+1) * SEG;
      const mid   = (start + end) / 2;

      ctx2d.save();

      // Glow del segmento
      ctx2d.shadowColor = el.glow;
      ctx2d.shadowBlur  = 18;

      // Arco
      ctx2d.beginPath();
      ctx2d.arc(CX, CY, SHIELD_R, start, end);
      ctx2d.arc(CX, CY, SHIELD_R - 22, end, start, true);
      ctx2d.closePath();

      // Gradiente del segmento
      const gx1 = CX + Math.cos(mid) * (SHIELD_R - 22);
      const gy1 = CY + Math.sin(mid) * (SHIELD_R - 22);
      const gx2 = CX + Math.cos(mid) * SHIELD_R;
      const gy2 = CY + Math.sin(mid) * SHIELD_R;
      const sGrad = ctx2d.createLinearGradient(gx1, gy1, gx2, gy2);
      sGrad.addColorStop(0, el.color2 + 'CC');
      sGrad.addColorStop(1, el.color  + 'FF');
      ctx2d.fillStyle = sGrad;
      ctx2d.fill();

      // Borde luminoso
      ctx2d.strokeStyle = el.color;
      ctx2d.lineWidth = 2;
      ctx2d.stroke();

      // Emoji del elemento
      ctx2d.shadowBlur = 0;
      ctx2d.font = `${SHIELD_R * 0.2}px serif`;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      const eR = SHIELD_R - 11;
      ctx2d.fillText(el.emoji, CX + Math.cos(mid)*eR, CY + Math.sin(mid)*eR);

      ctx2d.restore();
    }

    // Anillo de borde exterior
    ctx2d.save();
    ctx2d.beginPath();
    ctx2d.arc(CX, CY, SHIELD_R, 0, Math.PI*2);
    ctx2d.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx2d.lineWidth = 1.5;
    ctx2d.stroke();
    ctx2d.restore();
  }

  function drawOrbs() {
    state.orbs.forEach(orb => {
      const el = orb.element;
      ctx2d.save();

      // Glow
      ctx2d.shadowColor = el.glow;
      ctx2d.shadowBlur  = 25;

      // Cuerpo del orbe
      const grad = ctx2d.createRadialGradient(
        orb.x - orb.r*0.3, orb.y - orb.r*0.3, 1,
        orb.x, orb.y, orb.r
      );
      grad.addColorStop(0, el.color3 || '#fff');
      grad.addColorStop(0.5, el.color);
      grad.addColorStop(1, el.color2 + '88');

      ctx2d.beginPath();
      ctx2d.arc(orb.x, orb.y, orb.r, 0, Math.PI*2);
      ctx2d.fillStyle = grad;
      ctx2d.fill();

      // Anillo de orbe
      ctx2d.strokeStyle = el.color;
      ctx2d.lineWidth = 2;
      ctx2d.stroke();

      // Emoji girando
      ctx2d.shadowBlur = 0;
      ctx2d.save();
      ctx2d.translate(orb.x, orb.y);
      ctx2d.rotate(orb.angle);
      ctx2d.font = `${orb.r * 1.1}px serif`;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(el.emoji, 0, 0);
      ctx2d.restore();

      ctx2d.restore();
    });
  }

  function drawParticles(foreground) {
    state.particles.forEach(p => {
      if (p.type === 'ring') {
        // Anillo de onda expansivo
        const progress = 1 - p.life / p.maxLife;
        const r = p.r + (p.targetR - p.r) * progress;
        ctx2d.save();
        ctx2d.beginPath();
        ctx2d.arc(p.x, p.y, r, 0, Math.PI*2);
        ctx2d.strokeStyle = p.color;
        ctx2d.globalAlpha = p.alpha * 0.7;
        ctx2d.lineWidth = 3 * p.alpha;
        ctx2d.shadowColor = p.glow;
        ctx2d.shadowBlur  = 15;
        ctx2d.stroke();
        ctx2d.restore();
        return;
      }

      ctx2d.save();
      ctx2d.globalAlpha = p.alpha;
      ctx2d.shadowColor = p.glow;
      ctx2d.shadowBlur  = p.r * 2;

      if (p.type === 'tornado') {
        // Forma de rombo giratorio
        ctx2d.translate(p.x, p.y);
        ctx2d.rotate(p.rotation || 0);
        ctx2d.beginPath();
        ctx2d.moveTo(0, -p.r);
        ctx2d.lineTo(p.r, 0);
        ctx2d.lineTo(0, p.r);
        ctx2d.lineTo(-p.r, 0);
        ctx2d.closePath();
        ctx2d.fillStyle = p.color;
        ctx2d.fill();
      } else if (p.type === 'aurora') {
        // Estrella de 4 puntas
        ctx2d.translate(p.x, p.y);
        ctx2d.rotate(p.rotation || 0);
        ctx2d.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI/2)*i;
          const b = a + Math.PI/4;
          ctx2d.lineTo(Math.cos(a)*p.r, Math.sin(a)*p.r);
          ctx2d.lineTo(Math.cos(b)*p.r*0.4, Math.sin(b)*p.r*0.4);
        }
        ctx2d.closePath();
        ctx2d.fillStyle = p.color;
        ctx2d.fill();
      } else {
        // Círculo estándar
        ctx2d.beginPath();
        ctx2d.arc(p.x, p.y, Math.max(0.1, p.r * p.alpha), 0, Math.PI*2);
        ctx2d.fillStyle = p.color;
        ctx2d.fill();
      }
      ctx2d.restore();
    });
  }

  /* ──────────────────────────────────────────
     HUD & UI
  ────────────────────────────────────────── */
  function updateHUD() {
    const scoreEl = document.getElementById('score-display');
    const levelEl = document.getElementById('level-display');
    const comboEl = document.getElementById('combo-display');
    const comboN  = document.getElementById('combo-count');
    const powerEl = document.getElementById('power-bar');

    if (scoreEl) scoreEl.textContent = state.score.toLocaleString();
    if (levelEl) levelEl.textContent = state.level;
    if (comboEl && comboN) {
      if (state.combo >= 2) {
        comboEl.classList.remove('hidden');
        comboN.textContent = state.combo;
      } else {
        comboEl.classList.add('hidden');
      }
    }
    if (powerEl) powerEl.style.width = state.power + '%';

    // Corazones
    for (let i = 1; i <= MAX_LIVES; i++) {
      const h = document.getElementById('heart-' + i);
      if (h) {
        if (i <= state.lives) { h.classList.remove('lost'); h.textContent = '❤️'; }
        else                  { h.classList.add('lost');    h.textContent = '🖤'; }
      }
    }
  }

  function showNotif(text, type) {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'notif ' + type;
    el.textContent = text;
    container.appendChild(el);
    setTimeout(() => el.remove(), 1900);
  }

  function flashScreen(color) {
    let flash = document.getElementById('screen-flash');
    if (!flash) {
      flash = document.createElement('div');
      flash.id = 'screen-flash';
      document.body.appendChild(flash);
    }
    flash.style.background = color;
    flash.style.opacity = '1';
    setTimeout(() => { flash.style.opacity = '0'; }, 120);
  }

  /* ──────────────────────────────────────────
     CONTROLES
  ────────────────────────────────────────── */
  const keys = {};

  function setupControls() {
    // Teclado
    document.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (e.code === 'Space' && state.screen === 'game') {
        e.preventDefault();
        activatePower();
      }
    });
    document.addEventListener('keyup', e => { keys[e.code] = false; });

    // Touch / Mouse arrastre para rotar
    let lastTouchX = null;
    function onPointerMove(clientX) {
      if (lastTouchX !== null) {
        const dx = clientX - lastTouchX;
        state.shieldAngle += dx * 0.012;
        lastTouchX = clientX;
      }
    }
    document.addEventListener('mousedown',  e => { lastTouchX = e.clientX; });
    document.addEventListener('mousemove',  e => { if (e.buttons) onPointerMove(e.clientX); });
    document.addEventListener('mouseup',    () => { lastTouchX = null; });
    document.addEventListener('touchstart', e => { lastTouchX = e.touches[0].clientX; });
    document.addEventListener('touchmove',  e => { onPointerMove(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
    document.addEventListener('touchend',   () => { lastTouchX = null; });

    // Resize
    window.addEventListener('resize', () => { if (state.running) resizeCanvas(); });
  }

  /* ──────────────────────────────────────────
     INIT
  ────────────────────────────────────────── */
  function init() {
    setupControls();
    initState();
    // Arrancar pantalla de menú
    stopBg1 = initBgParticles(document.getElementById('bg-canvas'));
  }

  // Arrancar al cargar el DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── API pública ── */
  return { startGame, showMenu, showHowTo };

})();
