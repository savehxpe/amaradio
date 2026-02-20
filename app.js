/* ═══════════════════════════════════════════
   AMARADIO — Interactive App v2.0
   Uses RadioEngine for streaming
   ═══════════════════════════════════════════ */

// ─── UI State ───
let isFavorite = false;
let schedulePanelOpen = false;
let aboutOpen = false;
let elapsedSeconds = 0;
let timerInterval = null;

// ─── Beat Detection State ───
let energyHistory = [];
const ENERGY_HISTORY_SIZE = 43;
let lastBeatTime = 0;
let beatCooldown = 150;
let currentBPM = 128;
let beatTimes = [];

// ─── DOM Elements ───
const playIcon = document.getElementById('playIcon');
const playLabel = document.getElementById('playLabel');
const playButton = document.getElementById('playButton');
const playWrapper = document.getElementById('playButtonWrapper');
const eqBars = document.getElementById('eqBars');
const waveformContainer = document.getElementById('waveformContainer');
const waveformCanvas = document.getElementById('waveformCanvas');
const nowPlayingLabel = document.getElementById('nowPlayingLabel');
const trackTime = document.getElementById('trackTime');
const bgImage = document.getElementById('bgImage');
const heroTitle = document.getElementById('heroTitle');
const trackTitleEl = document.getElementById('trackTitle');
const trackArtistEl = document.getElementById('trackArtist');
const trackDurationEl = document.getElementById('trackDuration');
const channelButtons = document.querySelectorAll('.channel-btn');

/* ═══════════════════════════════════════════
   RADIO ENGINE SETUP
   ═══════════════════════════════════════════ */

const radio = new RadioEngine({
  crossfadeDuration: 3,
  preloadAhead: 10
});

// ─── Register Genre Channels ───

radio.registerChannel('hiphop', {
  name: 'Hip-Hop Frequency',
  genre: 'Hip-Hop',
  icon: 'mic',
  color: '#f59e0b',
  description: 'Underground vibes & lyrical frequencies',
  stream: 'https://stream.zeno.fm/0r0xa792kwzuv',
  tracks: [
    { title: 'Midnight Cipher', artist: 'Neural Beats', genre: 'Hip-Hop', duration: '4:22', url: 'https://stream.zeno.fm/0r0xa792kwzuv' },
    { title: 'Dark Alley Flow', artist: 'AI Lyricist', genre: 'Hip-Hop', duration: '3:45', url: 'https://stream.zeno.fm/0r0xa792kwzuv' },
    { title: 'Code Switch', artist: 'Binary Bars', genre: 'Hip-Hop', duration: '4:01', url: 'https://stream.zeno.fm/0r0xa792kwzuv' }
  ]
});

radio.registerChannel('amapiano', {
  name: 'Amapiano Pulse',
  genre: 'Amapiano',
  icon: 'piano',
  color: '#10b981',
  description: 'Deep log drum rhythms & synth melodies',
  stream: 'https://stream.zeno.fm/0r0xa792kwzuv',
  tracks: [
    { title: 'Johannesburg Sunrise', artist: 'Synth Tribe', genre: 'Amapiano', duration: '5:30', url: 'https://stream.zeno.fm/0r0xa792kwzuv' },
    { title: 'Shaker Protocol', artist: 'AMA.AI', genre: 'Amapiano', duration: '4:15', url: 'https://stream.zeno.fm/0r0xa792kwzuv' },
    { title: 'Log Drum Machine', artist: 'Deep Pulse', genre: 'Amapiano', duration: '6:02', url: 'https://stream.zeno.fm/0r0xa792kwzuv' }
  ]
});

radio.registerChannel('industrial', {
  name: 'Industrial Void',
  genre: 'Experimental',
  icon: 'factory',
  color: '#ef4444',
  description: 'Harsh textures & machine rhythms',
  stream: 'https://stream.zeno.fm/0r0xa792kwzuv',
  tracks: [
    { title: 'Rust & Circuitry', artist: 'Machine Ghost', genre: 'Industrial', duration: '5:45', url: 'https://stream.zeno.fm/0r0xa792kwzuv' },
    { title: 'Static Worship', artist: 'Void Collective', genre: 'Industrial', duration: '6:10', url: 'https://stream.zeno.fm/0r0xa792kwzuv' },
    { title: 'Abandoned Frequency', artist: 'Signal Decay', genre: 'Industrial', duration: '4:33', url: 'https://stream.zeno.fm/0r0xa792kwzuv' }
  ]
});

// ─── Set default channel ───
radio.switchChannel('hiphop');

/* ═══════════════════════════════════════════
   ENGINE EVENT HANDLERS
   ═══════════════════════════════════════════ */

radio.onTrackChange = (track) => {
  if (!track) return;

  // Update track info in status bar
  if (trackTitleEl) trackTitleEl.textContent = track.title || 'Unknown';
  if (trackArtistEl) trackArtistEl.textContent = track.artist || 'Amaradio';
  if (trackDurationEl) trackDurationEl.textContent = track.duration || '∞';
};

radio.onStateChange = (state) => {
  if (state.isPlaying) {
    document.body.classList.add('is-playing');
    playIcon.textContent = 'pause';
    playIcon.style.marginLeft = '0';
    playLabel.textContent = 'STREAMING';

    const glowEl = playWrapper.querySelector('.neon-pulse, .neon-pulse-active');
    if (glowEl) {
      glowEl.classList.remove('neon-pulse');
      glowEl.classList.add('neon-pulse-active');
    }

    eqBars.style.opacity = '1';
    waveformContainer.style.opacity = '1';
    resizeWaveformCanvas();

    nowPlayingLabel.textContent = 'Now Playing';
    nowPlayingLabel.classList.remove('text-slate-500');
    nowPlayingLabel.classList.add('text-primary');

    startTimer();
    animateListenerCount(4203, 4204);
  } else {
    document.body.classList.remove('is-playing');
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

    // Reset animation CSS vars
    const root = document.documentElement.style;
    root.setProperty('--glow-intensity', '0');
    root.setProperty('--beat-scale', '1');
  }
};

radio.onChannelChange = (data) => {
  showToast(`📻 Switched to ${data.name}`);
  updateChannelUI(data.channel);

  // Update genre badge in schedule panel
  const genreBadge = document.getElementById('currentGenreBadge');
  if (genreBadge) genreBadge.textContent = data.genre.toUpperCase();
};

radio.onError = (err) => {
  console.warn('[Amaradio] Error:', err);
  if (err.type === 'playback') {
    showToast('⚠ Audio blocked — click again');
  }
};

/* ═══════════════════════════════════════════
   PLAYBACK CONTROLS
   ═══════════════════════════════════════════ */

async function togglePlayback() {
  const result = await radio.togglePlay();
  if (result === true) {
    showToast('📡 Signal locked — streaming live');
  }
}

function skipNext() {
  radio.next();
}

function skipPrev() {
  radio.previous();
}

function switchChannel(channelKey) {
  radio.switchChannel(channelKey);
}

function updateChannelUI(activeKey) {
  channelButtons.forEach(btn => {
    const key = btn.dataset.channel;
    if (key === activeKey) {
      btn.classList.add('channel-active');
    } else {
      btn.classList.remove('channel-active');
    }
  });
}

/* ═══════════════════════════════════════════
   WAVEFORM CANVAS
   ═══════════════════════════════════════════ */

const waveCtx = waveformCanvas ? waveformCanvas.getContext('2d') : null;

function resizeWaveformCanvas() {
  if (!waveformCanvas) return;
  const rect = waveformContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  waveformCanvas.width = rect.width * dpr;
  waveformCanvas.height = rect.height * dpr;
  waveformCanvas.style.width = rect.width + 'px';
  waveformCanvas.style.height = rect.height + 'px';
  if (waveCtx) waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener('resize', resizeWaveformCanvas);
resizeWaveformCanvas();

function drawWaveform(bands) {
  if (!waveCtx || !waveformCanvas) return;
  const rect = waveformContainer.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  waveCtx.clearRect(0, 0, w, h);

  const timeDomain = radio.getTimeDomainData();
  const freqData = radio.getFrequencyData();

  if (!timeDomain || !freqData) {
    drawIdleWaveform(w, h);
    return;
  }

  const barCount = 80;
  const barWidth = (w / barCount) * 0.7;
  const gap = (w / barCount) * 0.3;
  const centerY = h / 2;

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * timeDomain.length);
    const value = timeDomain[dataIndex] / 128.0 - 1;
    const freqValue = freqData[Math.floor((i / barCount) * freqData.length)] / 255;
    const barHeight = Math.max(2, (Math.abs(value) * h * 0.8 + freqValue * h * 0.4));
    const x = i * (barWidth + gap);

    const hue = 270 - (i / barCount) * 40;
    const saturation = 70 + freqValue * 30;
    const lightness = 40 + freqValue * 30;
    const alpha = 0.4 + freqValue * 0.6;

    const gradient = waveCtx.createLinearGradient(x, centerY - barHeight / 2, x, centerY + barHeight / 2);
    gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, ${alpha * 0.3})`);
    gradient.addColorStop(0.3, `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`);
    gradient.addColorStop(0.5, `hsla(${hue}, ${saturation}%, ${lightness + 10}%, ${alpha})`);
    gradient.addColorStop(0.7, `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`);
    gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, ${alpha * 0.3})`);

    waveCtx.fillStyle = gradient;

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

    if (freqValue > 0.6) {
      waveCtx.shadowColor = `hsla(${hue}, 100%, 60%, 0.5)`;
      waveCtx.shadowBlur = 8;
      waveCtx.fill();
      waveCtx.shadowBlur = 0;
    }
  }

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
   PARALLAX SYSTEM
   ═══════════════════════════════════════════ */

let targetParallaxX = 0, targetParallaxY = 0;
let currentParallaxX = 0, currentParallaxY = 0;

document.addEventListener('mousemove', (e) => {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  targetParallaxX = ((e.clientX - cx) / cx) * 15;
  targetParallaxY = ((e.clientY - cy) / cy) * 10;
});

if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma !== null && e.beta !== null) {
      targetParallaxX = (e.gamma / 45) * 15;
      targetParallaxY = ((e.beta - 45) / 45) * 10;
    }
  });
}

function updateParallax() {
  currentParallaxX += (targetParallaxX - currentParallaxX) * 0.08;
  currentParallaxY += (targetParallaxY - currentParallaxY) * 0.08;

  document.documentElement.style.setProperty('--parallax-x', `${currentParallaxX}px`);
  document.documentElement.style.setProperty('--parallax-y', `${currentParallaxY}px`);

  if (bgImage) {
    bgImage.style.transform = `scale(1.05) translate3d(${currentParallaxX * 3}px, ${currentParallaxY * 3}px, 0)`;
  }
}

/* ═══════════════════════════════════════════
   BEAT DETECTION
   ═══════════════════════════════════════════ */

function detectBeat(energy) {
  energyHistory.push(energy);
  if (energyHistory.length > ENERGY_HISTORY_SIZE) energyHistory.shift();
  if (energyHistory.length < 10) return false;

  const avg = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
  const now = performance.now();

  if (energy > avg * 1.3 && energy > 0.6 && (now - lastBeatTime) > beatCooldown) {
    lastBeatTime = now;
    beatTimes.push(now);
    if (beatTimes.length > 20) beatTimes.shift();

    if (beatTimes.length > 3) {
      const intervals = [];
      for (let i = 1; i < beatTimes.length; i++) intervals.push(beatTimes[i] - beatTimes[i - 1]);
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      currentBPM = Math.max(60, Math.min(200, Math.round(60000 / avgInterval)));
    }
    return true;
  }
  return false;
}

/* ═══════════════════════════════════════════
   MASTER ANIMATION LOOP — 60FPS
   ═══════════════════════════════════════════ */

let animationFrameId = null;
let dataUpdateCounter = 0;

function animationLoop() {
  animationFrameId = requestAnimationFrame(animationLoop);
  updateParallax();

  if (!radio.isPlaying) return;

  const bands = radio.getFrequencyBands();
  const isBeat = detectBeat(bands.low);

  const root = document.documentElement.style;
  const glowIntensity = Math.min(1, bands.overall * 2);
  root.setProperty('--glow-intensity', glowIntensity.toFixed(3));
  root.setProperty('--freq-low', bands.low.toFixed(3));
  root.setProperty('--freq-mid', bands.mid.toFixed(3));
  root.setProperty('--freq-high', bands.high.toFixed(3));

  if (isBeat) {
    root.setProperty('--beat-scale', '1.03');
    setTimeout(() => root.setProperty('--beat-scale', '1'), 100);
  }

  drawWaveform(bands);
  updateDecorativeData(bands);
}

animationFrameId = requestAnimationFrame(animationLoop);

function updateDecorativeData(bands) {
  dataUpdateCounter++;
  if (dataUpdateCounter % 10 !== 0) return;

  const freqEl = document.getElementById('freqVal');
  const bpmEl = document.getElementById('bpmVal');
  if (freqEl) freqEl.textContent = Math.round(200 + bands.mid * 800);
  if (bpmEl) bpmEl.textContent = currentBPM;
}

/* ═══════════════════════════════════════════
   TIMER
   ═══════════════════════════════════════════ */

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    if (trackTime) trackTime.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}

/* ═══════════════════════════════════════════
   LISTENER COUNT ANIMATION
   ═══════════════════════════════════════════ */

function animateListenerCount(from, to) {
  const el = document.getElementById('listenerCount');
  const duration = 800;
  const start = performance.now();
  function update(time) {
    const p = Math.min((time - start) / duration, 1);
    el.textContent = Math.round(from + (to - from) * p).toLocaleString();
    if (p < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

/* ═══════════════════════════════════════════
   CONTROLS (mute, favorite, share)
   ═══════════════════════════════════════════ */

function toggleMute() {
  const muted = radio.toggleMute();
  const btn = document.getElementById('volBtn');
  const icon = btn.querySelector('.material-symbols-outlined');
  icon.textContent = muted ? 'volume_off' : 'volume_up';
  showToast(muted ? '🔇 Muted' : '🔊 Unmuted');
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
  document.getElementById('aboutOverlay').classList.add('active');
  aboutOpen = true;
  document.body.style.overflow = 'hidden';
}

function closeAboutOverlay() {
  document.getElementById('aboutOverlay').classList.remove('active');
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
   RIPPLE EFFECT
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
   PARTICLE BACKGROUND
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
      hue: 270 + Math.random() * 40 - 20
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const glowIntensity = radio.isPlaying
      ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--glow-intensity') || '0')
      : 0;

    particles.forEach((p, i) => {
      if (radio.isPlaying && glowIntensity > 0) {
        p.r = p.baseR + glowIntensity * 3;
        p.alpha = Math.min(1, p.baseAlpha + glowIntensity * 0.4);
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
   COSMETIC TICKER
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
  if (e.code === 'ArrowRight') skipNext();
  if (e.code === 'ArrowLeft') skipPrev();
  // Channel quick-switch: 1, 2, 3
  if (e.code === 'Digit1') switchChannel('hiphop');
  if (e.code === 'Digit2') switchChannel('amapiano');
  if (e.code === 'Digit3') switchChannel('industrial');
});
