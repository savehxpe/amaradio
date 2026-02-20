/* ═══════════════════════════════════════════
   AMARADIO — Interactive App Logic
   ═══════════════════════════════════════════ */

// ─── State ───
let isPlaying = false;
let isMuted = false;
let isFavorite = false;
let schedulePanelOpen = false;
let aboutOpen = false;
let elapsedSeconds = 0;
let timerInterval = null;
let waveformAnimId = null;

// ─── DOM Elements ───
const audio = document.getElementById('radioAudio');
const playIcon = document.getElementById('playIcon');
const playLabel = document.getElementById('playLabel');
const playButton = document.getElementById('playButton');
const playWrapper = document.getElementById('playButtonWrapper');
const eqBars = document.getElementById('eqBars');
const waveformContainer = document.getElementById('waveformContainer');
const nowPlayingLabel = document.getElementById('nowPlayingLabel');
const trackTime = document.getElementById('trackTime');
const neonGlow = playWrapper.querySelector('.neon-pulse');

// ─── Initialize Waveform Bars ───
function initWaveform() {
  waveformContainer.innerHTML = '';
  const barCount = 60;
  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement('div');
    bar.className = 'waveform-bar';
    bar.style.setProperty('--delay', `${(i * 0.05) % 1}s`);
    bar.style.setProperty('--duration', `${0.5 + Math.random() * 0.8}s`);
    bar.style.setProperty('--max-height', `${20 + Math.random() * 40}px`);
    bar.style.height = '4px';
    waveformContainer.appendChild(bar);
  }
}
initWaveform();

// ─── Toggle Playback ───
function togglePlayback() {
  if (isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  audio.play().catch(() => {
    showToast('⚠ Audio blocked — click again');
    return;
  });
  isPlaying = true;
  document.body.classList.add('is-playing');

  // Update play button
  playIcon.textContent = 'pause';
  playIcon.style.marginLeft = '0';
  playLabel.textContent = 'STREAMING';

  // Neon glow intensify
  neonGlow.classList.remove('neon-pulse');
  neonGlow.classList.add('neon-pulse-active');

  // Show EQ bars
  eqBars.style.opacity = '1';

  // Show waveform
  waveformContainer.style.opacity = '1';
  document.querySelectorAll('.waveform-bar').forEach(bar => bar.classList.add('active'));

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

  playIcon.textContent = 'play_arrow';
  playIcon.style.marginLeft = '8px';
  playLabel.textContent = 'INITIATE';

  neonGlow.classList.remove('neon-pulse-active');
  neonGlow.classList.add('neon-pulse');

  eqBars.style.opacity = '0';
  waveformContainer.style.opacity = '0';
  document.querySelectorAll('.waveform-bar').forEach(bar => bar.classList.remove('active'));

  nowPlayingLabel.textContent = 'Paused';
  nowPlayingLabel.classList.remove('text-primary');
  nowPlayingLabel.classList.add('text-slate-500');

  clearInterval(timerInterval);
  animateListenerCount(4204, 4203);
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

// ─── Toggle Mute ───
function toggleMute() {
  isMuted = !isMuted;
  audio.muted = isMuted;
  const btn = document.getElementById('volBtn');
  const icon = btn.querySelector('.material-symbols-outlined');
  icon.textContent = isMuted ? 'volume_off' : 'volume_up';
  showToast(isMuted ? '🔇 Muted' : '🔊 Unmuted');
}

// ─── Toggle Favorite ───
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

// ─── Share ───
function shareStation() {
  if (navigator.share) {
    navigator.share({ title: 'Amaradio', text: 'Listen to Amaradio — Underground AI Radio', url: window.location.href });
  } else {
    navigator.clipboard?.writeText(window.location.href);
    showToast('🔗 Link copied to clipboard');
  }
}

// ─── About Overlay ───
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

// ─── Schedule Panel ───
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

// ─── Smooth Scroll ───
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Toast Notification ───
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── Ripple Effect on Buttons ───
document.querySelectorAll('.ripple-btn').forEach(btn => {
  btn.addEventListener('click', function(e) {
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

// ─── Particle Background ───
(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let particles = [];
  const COUNT = 40;

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
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(108, 13, 242, ${p.alpha})`;
      ctx.fill();
      p.x += p.dx;
      p.y += p.dy;
      if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

// ─── Latency Ticker (cosmetic) ───
setInterval(() => {
  const el = document.getElementById('latencyVal');
  if (el) el.textContent = (10 + Math.floor(Math.random() * 8));
}, 2000);

// ─── Keyboard Shortcuts ───
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !aboutOpen) { e.preventDefault(); togglePlayback(); }
  if (e.code === 'Escape') {
    if (aboutOpen) closeAboutOverlay();
    if (schedulePanelOpen) toggleSchedulePanel();
  }
  if (e.code === 'KeyM') toggleMute();
});
