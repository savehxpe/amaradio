/* ═══════════════════════════════════════════
   AMARADIO — Immersive Radio Engine v2.0
   Web Audio API + High-Performance Animations
   Target: 60fps on all interactions
   ═══════════════════════════════════════════ */

// ─── State ───
let isPlaying = false;
let isMuted = false;
let isFavorite = false;
let schedulePanelOpen = false;
let aboutOpen = false;
let elapsedSeconds = 0;
let timerInterval = null;

// ─── Audio Analysis State ───
let audioContext = null;
let analyser = null;
let sourceNode = null;
let frequencyData = null;
let timeDomainData = null;
let audioConnected = false;
let animationFrameId = null;

// Beat detection state
let beatThreshold = 0.6;
let lastBeatTime = 0;
let beatCooldown = 150; // ms between beats
let energyHistory = [];
const ENERGY_HISTORY_SIZE = 43; // ~1 second at 60fps
let currentBPM = 128;
let beatTimes = [];

// ─── DOM Elements ───
const audio = document.getElementById('radioAudio');
const playIcon = document.getElementById('playIcon');
const playLabel = document.getElementById('playLabel');
const playButton = document.getElementById('playButton');
const playWrapper = document.getElementById('playButtonWrapper');
const eqBars = document.getElementById('eqBars');
const waveformContainer = document.getElementById('waveformContainer');
const waveformCanvas = document.getElementById('waveformCanvas');
const nowPlayingLabel = document.getElementById('nowPlayingLabel');
const trackTime = document.getElementById('trackTime');
const neonGlow = playWrapper.querySelector('.neon-pulse, .neon-pulse-active');
const glitchOverlay = document.getElementById('glitchOverlay');
const heroTitle = document.getElementById('heroTitle');
const bgImage = document.getElementById('bgImage');

// ─── Waveform Canvas Setup ───
const waveCtx = waveformCanvas ? waveformCanvas.getContext('2d') : null;

function resizeWaveformCanvas() {
  if (!waveformCanvas) return;
  const rect = waveformContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  waveformCanvas.width = rect.width * dpr;
  waveformCanvas.height = rect.height * dpr;
  waveformCanvas.style.width = rect.width + 'px';
  waveformCanvas.style.height = rect.height + 'px';
  if (waveCtx) waveCtx.scale(dpr, dpr);
}

window.addEventListener('resize', resizeWaveformCanvas);
resizeWaveformCanvas();

/* ═══════════════════════════════════════════
   WEB AUDIO API — ANALYZER SETUP
   ═══════════════════════════════════════════ */

function initAudioAnalyzer() {
  if (audioConnected) return;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    sourceNode = audioContext.createMediaElementSource(audio);
    sourceNode.connect(analyser);
    analyser.connect(audioContext.destination);

    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    timeDomainData = new Uint8Array(analyser.frequencyBinCount);

    audioConnected = true;
  } catch (e) {
    console.warn('Web Audio API not available, falling back to CSS animations:', e);
  }
}

/* ═══════════════════════════════════════════
   AUDIO ANALYSIS — FREQUENCY BANDS + BEAT
   ═══════════════════════════════════════════ */

function getFrequencyBands() {
  if (!analyser || !frequencyData) return { low: 0, mid: 0, high: 0, overall: 0 };

  analyser.getByteFrequencyData(frequencyData);

  const binCount = frequencyData.length;
  const lowEnd = Math.floor(binCount * 0.15);   // ~0-700Hz
  const midEnd = Math.floor(binCount * 0.5);     // ~700-2300Hz

  let lowSum = 0, midSum = 0, highSum = 0;

  for (let i = 0; i < lowEnd; i++) lowSum += frequencyData[i];
  for (let i = lowEnd; i < midEnd; i++) midSum += frequencyData[i];
  for (let i = midEnd; i < binCount; i++) highSum += frequencyData[i];

  const low = lowSum / (lowEnd * 255);
  const mid = midSum / ((midEnd - lowEnd) * 255);
  const high = highSum / ((binCount - midEnd) * 255);
  const overall = (low * 0.5 + mid * 0.3 + high * 0.2);

  return { low, mid, high, overall };
}

function detectBeat(energy) {
  energyHistory.push(energy);
  if (energyHistory.length > ENERGY_HISTORY_SIZE) energyHistory.shift();

  if (energyHistory.length < 10) return false;

  const avg = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
  const now = performance.now();

  if (energy > avg * 1.3 && energy > beatThreshold && (now - lastBeatTime) > beatCooldown) {
    lastBeatTime = now;

    // Track beat times for BPM calculation
    beatTimes.push(now);
    if (beatTimes.length > 20) beatTimes.shift();

    if (beatTimes.length > 3) {
      const intervals = [];
      for (let i = 1; i < beatTimes.length; i++) {
        intervals.push(beatTimes[i] - beatTimes[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      currentBPM = Math.round(60000 / avgInterval);
      currentBPM = Math.max(60, Math.min(200, currentBPM)); // clamp
    }

    return true;
  }

  return false;
}

/* ═══════════════════════════════════════════
   REACTIVE WAVEFORM — CANVAS RENDERING
   ═══════════════════════════════════════════ */

function drawWaveform(bands) {
  if (!waveCtx || !waveformCanvas) return;

  const rect = waveformContainer.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  waveCtx.clearRect(0, 0, w, h);

  if (!analyser || !timeDomainData) {
    // Fallback: draw idle waveform
    drawIdleWaveform(w, h);
    return;
  }

  analyser.getByteTimeDomainData(timeDomainData);

  const barCount = 80;
  const barWidth = (w / barCount) * 0.7;
  const gap = (w / barCount) * 0.3;
  const centerY = h / 2;

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * timeDomainData.length);
    const value = timeDomainData[dataIndex] / 128.0 - 1; // -1 to 1
    const freqValue = frequencyData[Math.floor((i / barCount) * frequencyData.length)] / 255;

    const barHeight = Math.max(2, (Math.abs(value) * h * 0.8 + freqValue * h * 0.4));

    const x = i * (barWidth + gap);

    // Gradient color based on frequency band
    const hue = 270 - (i / barCount) * 40; // purple to blue-purple
    const saturation = 70 + freqValue * 30;
    const lightness = 40 + freqValue * 30;
    const alpha = 0.4 + freqValue * 0.6;

    // Draw mirrored bars
    const gradient = waveCtx.createLinearGradient(x, centerY - barHeight / 2, x, centerY + barHeight / 2);
    gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, ${alpha * 0.3})`);
    gradient.addColorStop(0.3, `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`);
    gradient.addColorStop(0.5, `hsla(${hue}, ${saturation}%, ${lightness + 10}%, ${alpha})`);
    gradient.addColorStop(0.7, `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`);
    gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, ${alpha * 0.3})`);

    waveCtx.fillStyle = gradient;

    // Rounded bar
    const radius = barWidth / 2;
    const barTop = centerY - barHeight / 2;
    waveCtx.beginPath();
    waveCtx.moveTo(x + radius, barTop);
    waveCtx.lineTo(x + barWidth - radius, barTop);
    waveCtx.quadraticCurveTo(x + barWidth, barTop, x + barWidth, barTop + radius);
    waveCtx.lineTo(x + barWidth, barTop + barHeight - radius);
    waveCtx.quadraticCurveTo(x + barWidth, barTop + barHeight, x + barWidth - radius, barTop + barHeight);
    waveCtx.lineTo(x + radius, barTop + barHeight);
    waveCtx.quadraticCurveTo(x, barTop + barHeight, x, barTop + barHeight - radius);
    waveCtx.lineTo(x, barTop + radius);
    waveCtx.quadraticCurveTo(x, barTop, x + radius, barTop);
    waveCtx.fill();

    // Glow effect on high-energy bars
    if (freqValue > 0.6) {
      waveCtx.shadowColor = `hsla(${hue}, 100%, 60%, 0.5)`;
      waveCtx.shadowBlur = 8;
      waveCtx.fill();
      waveCtx.shadowBlur = 0;
    }
  }

  // Center line glow
  waveCtx.strokeStyle = `rgba(108, 13, 242, ${0.1 + bands.overall * 0.2})`;
  waveCtx.lineWidth = 1;
  waveCtx.beginPath();
  waveCtx.moveTo(0, centerY);
  waveCtx.lineTo(w, centerY);
  waveCtx.stroke();
}

function drawIdleWaveform(w, h) {
  const centerY = h / 2;
  const time = performance.now() * 0.001;
  const barCount = 80;
  const barWidth = (w / barCount) * 0.7;
  const gap = (w / barCount) * 0.3;

  for (let i = 0; i < barCount; i++) {
    const x = i * (barWidth + gap);
    const wave = Math.sin(time * 2 + i * 0.15) * 0.3 + 0.3;
    const barHeight = Math.max(2, wave * h * 0.3);

    const alpha = 0.2 + wave * 0.3;
    waveCtx.fillStyle = `rgba(108, 13, 242, ${alpha})`;

    const barTop = centerY - barHeight / 2;
    const radius = barWidth / 2;
    waveCtx.beginPath();
    waveCtx.moveTo(x + radius, barTop);
    waveCtx.lineTo(x + barWidth - radius, barTop);
    waveCtx.quadraticCurveTo(x + barWidth, barTop, x + barWidth, barTop + radius);
    waveCtx.lineTo(x + barWidth, barTop + barHeight - radius);
    waveCtx.quadraticCurveTo(x + barWidth, barTop + barHeight, x + barWidth - radius, barTop + barHeight);
    waveCtx.lineTo(x + radius, barTop + barHeight);
    waveCtx.quadraticCurveTo(x, barTop + barHeight, x, barTop + barHeight - radius);
    waveCtx.lineTo(x, barTop + radius);
    waveCtx.quadraticCurveTo(x, barTop, x + radius, barTop);
    waveCtx.fill();
  }
}

/* ═══════════════════════════════════════════
   PARALLAX SYSTEM — MOUSE/GYROSCOPE
   ═══════════════════════════════════════════ */

let mouseX = 0, mouseY = 0;
let targetParallaxX = 0, targetParallaxY = 0;
let currentParallaxX = 0, currentParallaxY = 0;

document.addEventListener('mousemove', (e) => {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  targetParallaxX = ((e.clientX - cx) / cx) * 15; // max 15px
  targetParallaxY = ((e.clientY - cy) / cy) * 10; // max 10px
});

// Gyroscope support for mobile
if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma !== null && e.beta !== null) {
      targetParallaxX = (e.gamma / 45) * 15; // tilt left-right
      targetParallaxY = ((e.beta - 45) / 45) * 10; // tilt forward-back
    }
  });
}

function updateParallax() {
  // Smooth interpolation (lerp)
  currentParallaxX += (targetParallaxX - currentParallaxX) * 0.08;
  currentParallaxY += (targetParallaxY - currentParallaxY) * 0.08;

  document.documentElement.style.setProperty('--parallax-x', `${currentParallaxX}px`);
  document.documentElement.style.setProperty('--parallax-y', `${currentParallaxY}px`);

  // Background layer gets amplified parallax via CSS calc
  if (bgImage) {
    bgImage.style.transform = `scale(1.05) translate3d(${currentParallaxX * 3}px, ${currentParallaxY * 3}px, 0)`;
  }
}

/* ═══════════════════════════════════════════
   GLITCH TRANSITION ENGINE
   ═══════════════════════════════════════════ */

function triggerGlitchTransition() {
  if (!glitchOverlay) return;

  // Activate overlay
  glitchOverlay.classList.remove('active');
  void glitchOverlay.offsetWidth; // force reflow
  glitchOverlay.classList.add('active');

  // Glitch the title text
  if (heroTitle) {
    heroTitle.classList.add('glitch-text-active');
  }

  // Brief screen flash
  document.body.style.filter = 'brightness(1.3) saturate(1.5)';
  setTimeout(() => {
    document.body.style.filter = '';
  }, 50);

  // Clean up after animation
  setTimeout(() => {
    glitchOverlay.classList.remove('active');
    if (heroTitle) heroTitle.classList.remove('glitch-text-active');
  }, 600);
}

/* ═══════════════════════════════════════════
   MASTER ANIMATION LOOP — 60FPS
   ═══════════════════════════════════════════ */

function animationLoop() {
  animationFrameId = requestAnimationFrame(animationLoop);

  // Always update parallax
  updateParallax();

  if (!isPlaying || !audioConnected) return;

  // Get frequency data
  const bands = getFrequencyBands();
  const isBeat = detectBeat(bands.low);

  // ── Update CSS custom properties (GPU-friendly) ──
  const glowIntensity = Math.min(1, bands.overall * 2);
  const root = document.documentElement.style;
  root.setProperty('--glow-intensity', glowIntensity.toFixed(3));
  root.setProperty('--freq-low', bands.low.toFixed(3));
  root.setProperty('--freq-mid', bands.mid.toFixed(3));
  root.setProperty('--freq-high', bands.high.toFixed(3));

  // ── Beat scale pulse ──
  if (isBeat) {
    root.setProperty('--beat-scale', '1.03');
    setTimeout(() => root.setProperty('--beat-scale', '1'), 100);
  }

  // ── Draw reactive waveform ──
  drawWaveform(bands);

  // ── Update decorative data displays ──
  updateDecorativeData(bands);
}

// Start the master loop immediately
animationFrameId = requestAnimationFrame(animationLoop);

/* ═══════════════════════════════════════════
   DECORATIVE DATA DISPLAYS
   ═══════════════════════════════════════════ */

let dataUpdateCounter = 0;

function updateDecorativeData(bands) {
  dataUpdateCounter++;
  if (dataUpdateCounter % 10 !== 0) return; // Update every ~10 frames

  const freqEl = document.getElementById('freqVal');
  const bpmEl = document.getElementById('bpmVal');

  if (freqEl) {
    const freq = Math.round(200 + bands.mid * 800);
    freqEl.textContent = freq;
  }

  if (bpmEl) {
    bpmEl.textContent = currentBPM;
  }
}

/* ═══════════════════════════════════════════
   PLAYBACK CONTROLS
   ═══════════════════════════════════════════ */

function togglePlayback() {
  if (isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  // Initialize audio analyzer on first play
  initAudioAnalyzer();

  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }

  audio.play().catch(() => {
    showToast('⚠ Audio blocked — click again');
    return;
  });

  isPlaying = true;
  document.body.classList.add('is-playing');

  // Trigger glitch transition on play
  triggerGlitchTransition();

  // Update play button
  playIcon.textContent = 'pause';
  playIcon.style.marginLeft = '0';
  playLabel.textContent = 'STREAMING';

  // Switch neon glow to reactive mode
  const glowEl = playWrapper.querySelector('.neon-pulse, .neon-pulse-active');
  if (glowEl) {
    glowEl.classList.remove('neon-pulse');
    glowEl.classList.add('neon-pulse-active');
  }

  // Show EQ bars
  eqBars.style.opacity = '1';

  // Show waveform
  waveformContainer.style.opacity = '1';
  resizeWaveformCanvas();

  // Now playing label
  nowPlayingLabel.textContent = 'Now Playing';
  nowPlayingLabel.classList.remove('text-slate-500');
  nowPlayingLabel.classList.add('text-primary');

  // Start timer
  startTimer();

  // Increment listener count
  animateListenerCount(4203, 4204);

  showToast('📡 Signal locked — streaming live');
}

function stopPlayback() {
  audio.pause();
  isPlaying = false;
  document.body.classList.remove('is-playing');

  // Trigger glitch on stop
  triggerGlitchTransition();

  playIcon.textContent = 'play_arrow';
  playIcon.style.marginLeft = '8px';
  playLabel.textContent = 'INITIATE';

  const glowEl = playWrapper.querySelector('.neon-pulse, .neon-pulse-active');
  if (glowEl) {
    glowEl.classList.remove('neon-pulse-active');
    glowEl.classList.add('neon-pulse');
  }

  eqBars.style.opacity = '0';
  waveformContainer.style.opacity = '0';

  nowPlayingLabel.textContent = 'Paused';
  nowPlayingLabel.classList.remove('text-primary');
  nowPlayingLabel.classList.add('text-slate-500');

  clearInterval(timerInterval);
  animateListenerCount(4204, 4203);

  // Reset CSS vars
  const root = document.documentElement.style;
  root.setProperty('--glow-intensity', '0');
  root.setProperty('--beat-scale', '1');
  root.setProperty('--freq-low', '0');
  root.setProperty('--freq-mid', '0');
  root.setProperty('--freq-high', '0');
}

// ─── Timer ───
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    trackTime.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}

// ─── Listener Count Animation ───
function animateListenerCount(from, to) {
  const el = document.getElementById('listenerCount');
  const duration = 800;
  const start = performance.now();
  function update(time) {
    const p = Math.min((time - start) / duration, 1);
    const val = Math.round(from + (to - from) * p);
    el.textContent = val.toLocaleString();
    if (p < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

/* ═══════════════════════════════════════════
   CONTROLS
   ═══════════════════════════════════════════ */

function toggleMute() {
  isMuted = !isMuted;
  audio.muted = isMuted;
  const btn = document.getElementById('volBtn');
  const icon = btn.querySelector('.material-symbols-outlined');
  icon.textContent = isMuted ? 'volume_off' : 'volume_up';
  showToast(isMuted ? '🔇 Muted' : '🔊 Unmuted');
}

function toggleFavorite(btn) {
  isFavorite = !isFavorite;
  const icon = btn.querySelector('.material-symbols-outlined');
  if (isFavorite) {
    icon.style.fontVariationSettings = "'FILL' 1";
    btn.classList.remove('text-slate-400');
    btn.classList.add('text-red-400');
    showToast('❤️ Added to favorites');
  } else {
    icon.style.fontVariationSettings = "'FILL' 0";
    btn.classList.remove('text-red-400');
    btn.classList.add('text-slate-400');
    showToast('Removed from favorites');
  }
}

function shareStation() {
  if (navigator.share) {
    navigator.share({ title: 'Amaradio', text: 'Listen to Amaradio — Underground AI Radio', url: window.location.href });
  } else {
    navigator.clipboard?.writeText(window.location.href);
    showToast('🔗 Link copied to clipboard');
  }
}

/* ═══════════════════════════════════════════
   OVERLAYS & PANELS
   ═══════════════════════════════════════════ */

function openAboutOverlay() {
  const overlay = document.getElementById('aboutOverlay');
  overlay.classList.add('active');
  aboutOpen = true;
  document.body.style.overflow = 'hidden';
}

function closeAboutOverlay() {
  const overlay = document.getElementById('aboutOverlay');
  overlay.classList.remove('active');
  aboutOpen = false;
  document.body.style.overflow = '';
}

function toggleSchedulePanel() {
  const panel = document.getElementById('schedulePanel');
  schedulePanelOpen = !schedulePanelOpen;
  if (schedulePanelOpen) {
    panel.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    panel.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ═══════════════════════════════════════════
   TOAST NOTIFICATION
   ═══════════════════════════════════════════ */

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

/* ═══════════════════════════════════════════
   RIPPLE EFFECT ON BUTTONS
   ═══════════════════════════════════════════ */

document.querySelectorAll('.ripple-btn').forEach(btn => {
  btn.addEventListener('click', function (e) {
    const circle = document.createElement('span');
    circle.classList.add('ripple');
    const rect = this.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    circle.style.width = circle.style.height = size + 'px';
    circle.style.left = (e.clientX - rect.left - size / 2) + 'px';
    circle.style.top = (e.clientY - rect.top - size / 2) + 'px';
    this.appendChild(circle);
    setTimeout(() => circle.remove(), 600);
  });
});

/* ═══════════════════════════════════════════
   PARTICLE BACKGROUND — ENHANCED
   Now reacts to audio when playing
   ═══════════════════════════════════════════ */

(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  const COUNT = 50;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5,
      baseR: Math.random() * 2 + 0.5,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      baseDx: (Math.random() - 0.5) * 0.3,
      baseDy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1,
      baseAlpha: Math.random() * 0.5 + 0.1,
      hue: 270 + Math.random() * 40 - 20 // purple range
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const glowIntensity = isPlaying
      ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glow-intensity') || '0')
      : 0;

    particles.forEach((p, i) => {
      // React to audio
      if (isPlaying && glowIntensity > 0) {
        p.r = p.baseR + glowIntensity * 3;
        p.alpha = Math.min(1, p.baseAlpha + glowIntensity * 0.4);
        // Speed up particles based on beat intensity
        const speedMult = 1 + glowIntensity * 2;
        p.dx = p.baseDx * speedMult;
        p.dy = p.baseDy * speedMult;
      } else {
        p.r = p.baseR;
        p.alpha = p.baseAlpha;
        p.dx = p.baseDx;
        p.dy = p.baseDy;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue + glowIntensity * 30}, 80%, 60%, ${p.alpha})`;
      ctx.fill();

      // Glow for large particles during beat
      if (p.r > 2 && glowIntensity > 0.3) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${glowIntensity * 0.1})`;
        ctx.fill();
      }

      p.x += p.dx;
      p.y += p.dy;
      if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.dy *= -1;

      // Draw connections between nearby particles
      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dist = Math.hypot(p.x - p2.x, p.y - p2.y);
        const maxDist = 120 + glowIntensity * 60;
        if (dist < maxDist) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(108, 13, 242, ${(1 - dist / maxDist) * 0.15 * (1 + glowIntensity)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    });

    requestAnimationFrame(draw);
  }
  draw();
})();

/* ═══════════════════════════════════════════
   LATENCY TICKER (cosmetic)
   ═══════════════════════════════════════════ */

setInterval(() => {
  const el = document.getElementById('latencyVal');
  if (el) el.textContent = (10 + Math.floor(Math.random() * 8));
}, 2000);

/* ═══════════════════════════════════════════
   KEYBOARD SHORTCUTS
   ═══════════════════════════════════════════ */

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !aboutOpen) { e.preventDefault(); togglePlayback(); }
  if (e.code === 'Escape') {
    if (aboutOpen) closeAboutOverlay();
    if (schedulePanelOpen) toggleSchedulePanel();
  }
  if (e.code === 'KeyM') toggleMute();
  // Glitch transition on G key (for demo/testing)
  if (e.code === 'KeyG') triggerGlitchTransition();
});
