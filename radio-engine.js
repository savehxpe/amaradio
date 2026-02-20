/* ═══════════════════════════════════════════
   AMARADIO — RadioEngine v2.0
   Unified Sonic Identity Architecture
   
   Features:
   • Dual-player groove-preserving crossfade
   • Energy arc rotation (build → peak → release)
   • BPM-aware transitions (110–125 BPM range)
   • Bass-focused audio normalization
   • Genre-blended queue with natural flow
   • Preloading & seamless transitions
   ═══════════════════════════════════════════ */

class RadioEngine {
    constructor(options = {}) {
        // ─── Configuration ───
        this.crossfadeDuration = options.crossfadeDuration || 4; // longer for groove continuity
        this.preloadAhead = options.preloadAhead || 10;
        this.defaultVolume = options.defaultVolume || 1;
        this.bpmRange = options.bpmRange || { min: 110, max: 125 };

        // ─── Audio Context & Nodes ───
        this.audioContext = null;
        this.analyser = null;
        this.compressor = null;
        this.masterGain = null;
        this.bassBoost = null; // low-shelf filter for deep bass emphasis

        // ─── Dual Player System (A/B for crossfade) ───
        this.players = {
            A: { audio: null, source: null, gain: null, connected: false },
            B: { audio: null, source: null, gain: null, connected: false }
        };
        this.activePlayer = 'A';
        this.isCrossfading = false;
        this.crossfadeTimer = null;
        this.crossfadeRAF = null;

        // ─── Frequency Analysis Data ───
        this.frequencyData = null;
        this.timeDomainData = null;

        // ─── Playback State ───
        this.isPlaying = false;
        this.isMuted = false;
        this.currentVolume = this.defaultVolume;

        // ─── Genre Pool System (replaces isolated channels) ───
        this.genrePools = {};
        this.activeFilter = 'all'; // 'all', or a genre key for filtering
        this.currentGenreKey = null;

        // ─── Unified Track Queue ───
        this.masterLibrary = []; // all tracks from all genres
        this.queue = [];         // current play order (energy-sorted)
        this.queueIndex = -1;
        this.currentTrack = null;
        this.isTrackMode = false;

        // ─── Energy Arc System ───
        this.energyPhase = 'build';  // 'build' | 'peak' | 'release' | 'cooldown'
        this.tracksInPhase = 0;
        this.phaseConfig = {
            build: { tracks: 3, nextPhase: 'peak' },
            peak: { tracks: 2, nextPhase: 'release' },
            release: { tracks: 2, nextPhase: 'cooldown' },
            cooldown: { tracks: 1, nextPhase: 'build' }
        };

        // ─── Stream fallback ───
        this.fallbackStream = null;

        // ─── Event Callbacks ───
        this.onTrackChange = null;
        this.onStateChange = null;
        this.onChannelChange = null;
        this.onTimeUpdate = null;
        this.onError = null;
        this.onEnergyPhaseChange = null;

        // ─── Initialize ───
        this._createAudioElements();
        this._setupEventListeners();
    }

    /* ═══════════════════════════════════════════
       INITIALIZATION
       ═══════════════════════════════════════════ */

    _createAudioElements() {
        for (const key of ['A', 'B']) {
            const audio = new Audio();
            audio.crossOrigin = 'anonymous';
            audio.preload = 'auto';
            audio.volume = key === 'A' ? this.defaultVolume : 0;
            this.players[key].audio = audio;
        }
    }

    _initAudioContext() {
        if (this.audioContext) return true;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // ─── Bass-focused compressor for percussive content ───
            this.compressor = this.audioContext.createDynamicsCompressor();
            this.compressor.threshold.value = -20;   // catch more dynamics
            this.compressor.knee.value = 15;          // tighter knee for punch
            this.compressor.ratio.value = 4;          // moderate ratio
            this.compressor.attack.value = 0.002;     // very fast attack for percussive hits
            this.compressor.release.value = 0.1;      // quick release to preserve groove

            // ─── Low-shelf filter to emphasize deep bass textures ───
            this.bassBoost = this.audioContext.createBiquadFilter();
            this.bassBoost.type = 'lowshelf';
            this.bassBoost.frequency.value = 120;     // sub-bass region
            this.bassBoost.gain.value = 3;            // subtle bass warmth (+3dB)

            // ─── Master Gain ───
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.currentVolume;

            // ─── Analyser for visualizations ───
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;

            // ─── Signal Chain ───
            // player gain → bass boost → compressor → analyser → master → output
            this.bassBoost.connect(this.compressor);
            this.compressor.connect(this.analyser);
            this.analyser.connect(this.masterGain);
            this.masterGain.connect(this.audioContext.destination);

            // ─── Frequency data buffers ───
            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            this.timeDomainData = new Uint8Array(this.analyser.frequencyBinCount);

            // ─── Connect player A (active by default) ───
            this._connectPlayer('A');

            return true;
        } catch (e) {
            console.warn('[RadioEngine] Web Audio API unavailable:', e);
            this._fireEvent('error', { type: 'audioContext', message: e.message });
            return false;
        }
    }

    _connectPlayer(key) {
        const player = this.players[key];
        if (player.connected || !this.audioContext) return;

        try {
            player.source = this.audioContext.createMediaElementSource(player.audio);
            player.gain = this.audioContext.createGain();
            player.gain.gain.value = key === this.activePlayer ? 1 : 0;
            player.source.connect(player.gain);
            player.gain.connect(this.bassBoost); // route through bass boost
            player.connected = true;
        } catch (e) {
            console.warn(`[RadioEngine] Failed to connect player ${key}:`, e);
        }
    }

    _setupEventListeners() {
        for (const key of ['A', 'B']) {
            const audio = this.players[key].audio;

            audio.addEventListener('ended', () => {
                if (key === this.activePlayer && this.isTrackMode) {
                    this.next();
                }
            });

            audio.addEventListener('timeupdate', () => {
                if (key === this.activePlayer) {
                    this._fireEvent('timeUpdate', {
                        currentTime: audio.currentTime,
                        duration: audio.duration || 0
                    });

                    // Groove-aware crossfade trigger
                    if (this.isTrackMode && audio.duration && !this.isCrossfading) {
                        const remaining = audio.duration - audio.currentTime;
                        if (remaining <= this.crossfadeDuration + 0.5 && remaining > 0) {
                            this._startCrossfadeToNext();
                        }
                    }
                }
            });

            audio.addEventListener('error', (e) => {
                console.warn(`[RadioEngine] Player ${key} error:`, e);
                this._fireEvent('error', {
                    type: 'playback', player: key,
                    message: `Player ${key} failed to load audio`
                });
                if (key === this.activePlayer && this.isTrackMode) {
                    setTimeout(() => this.next(), 500);
                }
            });

            audio.addEventListener('canplaythrough', () => { });
        }
    }

    /* ═══════════════════════════════════════════
       GENRE POOL REGISTRATION
       Each genre contributes tracks to the master library.
       Instead of isolated channels, tracks blend together.
       ═══════════════════════════════════════════ */

    registerGenre(key, config) {
        const genre = {
            name: config.name || key,
            genre: config.genre || key,
            color: config.color || '#6c0df2',
            icon: config.icon || 'radio',
            stream: config.stream || null,
            description: config.description || '',
            artwork: config.artwork || null
        };

        // Each track gets tagged with its genre, energy level, and BPM
        const tracks = (config.tracks || []).map(t => ({
            ...t,
            genreKey: key,
            genreName: genre.name,
            genreColor: genre.color,
            genreIcon: genre.icon,
            energy: t.energy || 'mid',  // 'low' | 'mid' | 'high'
            bpm: t.bpm || 118           // default to middle of 110-125 range
        }));

        this.genrePools[key] = { ...genre, tracks };

        // Add tracks to master library
        this.masterLibrary.push(...tracks);

        // Set fallback stream if not already set
        if (!this.fallbackStream && genre.stream) {
            this.fallbackStream = genre.stream;
        }

        return this;
    }

    getGenres() {
        return Object.entries(this.genrePools).map(([key, g]) => ({
            key,
            name: g.name,
            genre: g.genre,
            color: g.color,
            icon: g.icon,
            trackCount: g.tracks.length,
            isActive: key === this.activeFilter || this.activeFilter === 'all'
        }));
    }

    /* ═══════════════════════════════════════════
       ENERGY ARC — BUILD / PEAK / RELEASE SYSTEM
       Structures the queue so energy flows naturally:
       
       [build] → low-mid energy tracks, percussive foundations
       [peak]  → high energy tracks, deep bass & driving rhythms
       [release] → mid energy, melodic elements come forward
       [cooldown] → low energy, atmospheric, spacious
       
       Then cycles back to build.
       ═══════════════════════════════════════════ */

    _buildEnergyQueue(filter = 'all') {
        // Get tracks based on filter
        let pool = filter === 'all'
            ? [...this.masterLibrary]
            : this.masterLibrary.filter(t => t.genreKey === filter);

        if (pool.length === 0) {
            // Fallback to all tracks
            pool = [...this.masterLibrary];
        }

        // Sort tracks by energy level into buckets
        const buckets = {
            low: pool.filter(t => t.energy === 'low'),
            mid: pool.filter(t => t.energy === 'mid'),
            high: pool.filter(t => t.energy === 'high')
        };

        // Build the queue following the energy arc
        const queue = [];
        const phases = ['build', 'peak', 'release', 'cooldown'];
        const energyMap = {
            build: ['low', 'mid'],     // start with foundations
            peak: ['high', 'mid'],     // drive up energy
            release: ['mid', 'low'],   // bring it back
            cooldown: ['low']          // let it breathe
        };

        // Create enough tracks for a full rotation (multiple cycles)
        for (let cycle = 0; cycle < 3; cycle++) {
            for (const phase of phases) {
                const preferredEnergies = energyMap[phase];
                const count = this.phaseConfig[phase].tracks;

                for (let i = 0; i < count; i++) {
                    let track = null;

                    // Try preferred energy levels first
                    for (const energy of preferredEnergies) {
                        if (buckets[energy].length > 0) {
                            // Pick random from bucket
                            const idx = Math.floor(Math.random() * buckets[energy].length);
                            track = buckets[energy][idx];
                            break;
                        }
                    }

                    // Fallback: pick from any bucket
                    if (!track) {
                        const allAvailable = [...buckets.low, ...buckets.mid, ...buckets.high];
                        if (allAvailable.length > 0) {
                            track = allAvailable[Math.floor(Math.random() * allAvailable.length)];
                        }
                    }

                    if (track) {
                        queue.push({ ...track, phase });
                    }
                }
            }
        }

        // Ensure BPM stays within range — sort adjacent tracks by BPM proximity
        this._smoothBPMTransitions(queue);

        return queue;
    }

    _smoothBPMTransitions(queue) {
        // Ensure no adjacent tracks have BPM jumps > 5
        for (let i = 1; i < queue.length; i++) {
            const prev = queue[i - 1];
            const curr = queue[i];
            const diff = Math.abs(prev.bpm - curr.bpm);

            if (diff > 5) {
                // Look ahead for a better candidate
                for (let j = i + 1; j < queue.length; j++) {
                    if (Math.abs(prev.bpm - queue[j].bpm) <= 5) {
                        // Swap for smoother transition
                        [queue[i], queue[j]] = [queue[j], queue[i]];
                        break;
                    }
                }
            }
        }
    }

    _advanceEnergyPhase() {
        this.tracksInPhase++;
        const config = this.phaseConfig[this.energyPhase];

        if (this.tracksInPhase >= config.tracks) {
            const prevPhase = this.energyPhase;
            this.energyPhase = config.nextPhase;
            this.tracksInPhase = 0;

            this._fireEvent('energyPhaseChange', {
                from: prevPhase,
                to: this.energyPhase,
                description: this._getPhaseDescription(this.energyPhase)
            });
        }
    }

    _getPhaseDescription(phase) {
        const descriptions = {
            build: 'Building foundation — percussive layers incoming',
            peak: 'Peak energy — deep bass & driving rhythms',
            release: 'Releasing tension — melodic elements rising',
            cooldown: 'Cooldown — atmospheric space'
        };
        return descriptions[phase] || '';
    }

    /* ═══════════════════════════════════════════
       FILTER / GENRE SELECTION
       Instead of switching channels, this filters
       which genres contribute to the blended queue.
       ═══════════════════════════════════════════ */

    async setFilter(filter) {
        const wasPlaying = this.isPlaying;
        this.activeFilter = filter;
        this.currentGenreKey = filter;

        // Rebuild queue with the new filter
        this.queue = this._buildEnergyQueue(filter);
        this.queueIndex = 0;
        this.isTrackMode = this.queue.length > 0;
        this.energyPhase = 'build';
        this.tracksInPhase = 0;

        const genreName = filter === 'all'
            ? 'All Genres'
            : (this.genrePools[filter]?.name || filter);

        this._fireEvent('channelChange', {
            channel: filter,
            name: genreName,
            genre: filter === 'all' ? 'Blended' : this.genrePools[filter]?.genre || filter,
            isTrackMode: this.isTrackMode
        });

        if (wasPlaying && this.queue.length > 0) {
            await this._crossfadeToSource(this.queue[0].url);
        } else if (this.queue.length > 0) {
            this._loadSource(this.activePlayer, this.queue[0].url);
            this._updateCurrentTrack();
        }

        return true;
    }

    // Legacy compatibility: switchChannel calls setFilter
    async switchChannel(channelKey) {
        return this.setFilter(channelKey);
    }

    /* ═══════════════════════════════════════════
       PLAYBACK CONTROLS
       ═══════════════════════════════════════════ */

    async play() {
        this._initAudioContext();

        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        // Build queue if empty
        if (this.queue.length === 0) {
            this.queue = this._buildEnergyQueue(this.activeFilter);
            this.queueIndex = 0;
            this.isTrackMode = this.queue.length > 0;
        }

        // Connect inactive player
        const inactiveKey = this.activePlayer === 'A' ? 'B' : 'A';
        this._connectPlayer(inactiveKey);

        const source = this._getCurrentSource();
        if (!source) {
            this._fireEvent('error', { type: 'noSource', message: 'No audio source available' });
            return false;
        }

        const activeAudio = this.players[this.activePlayer].audio;

        if (!activeAudio.src || !activeAudio.src.includes(source.replace(/https?:/, ''))) {
            this._loadSource(this.activePlayer, source);
        }

        try {
            await activeAudio.play();
            this.isPlaying = true;
            this._updateCurrentTrack();
            this._fireEvent('stateChange', { isPlaying: true, track: this.currentTrack });

            if (this.isTrackMode) {
                this._preloadNext();
            }

            return true;
        } catch (e) {
            console.warn('[RadioEngine] Playback failed:', e);
            this._fireEvent('error', { type: 'playback', message: e.message });
            return false;
        }
    }

    pause() {
        const activeAudio = this.players[this.activePlayer].audio;
        activeAudio.pause();
        this.isPlaying = false;
        this._fireEvent('stateChange', { isPlaying: false, track: this.currentTrack });
    }

    async togglePlay() {
        if (this.isPlaying) {
            this.pause();
            return false;
        } else {
            return await this.play();
        }
    }

    stop() {
        for (const key of ['A', 'B']) {
            this.players[key].audio.pause();
            this.players[key].audio.currentTime = 0;
        }
        this.isPlaying = false;
        this.isCrossfading = false;
        if (this.crossfadeRAF) cancelAnimationFrame(this.crossfadeRAF);
        clearTimeout(this.crossfadeTimer);
        this._fireEvent('stateChange', { isPlaying: false, track: null });
    }

    /* ═══════════════════════════════════════════
       TRACK NAVIGATION
       ═══════════════════════════════════════════ */

    async next() {
        if (!this.isTrackMode || this.queue.length === 0) return;

        this.queueIndex = (this.queueIndex + 1) % this.queue.length;
        this._advanceEnergyPhase();

        // Rebuild queue if we've looped
        if (this.queueIndex === 0) {
            this.queue = this._buildEnergyQueue(this.activeFilter);
        }

        if (this.isPlaying) {
            await this._crossfadeToSource(this._getCurrentSource());
        } else {
            this._loadSource(this.activePlayer, this._getCurrentSource());
            this._updateCurrentTrack();
        }
    }

    async previous() {
        if (!this.isTrackMode || this.queue.length === 0) return;

        const activeAudio = this.players[this.activePlayer].audio;
        if (activeAudio.currentTime > 3) {
            activeAudio.currentTime = 0;
            return;
        }

        this.queueIndex = (this.queueIndex - 1 + this.queue.length) % this.queue.length;

        if (this.isPlaying) {
            await this._crossfadeToSource(this._getCurrentSource());
        } else {
            this._loadSource(this.activePlayer, this._getCurrentSource());
            this._updateCurrentTrack();
        }
    }

    /* ═══════════════════════════════════════════
       GROOVE-PRESERVING CROSSFADE ENGINE
       
       Uses requestAnimationFrame for 60fps smoothness.
       Equal-power crossfade with bass emphasis during
       transition to maintain groove continuity.
       ═══════════════════════════════════════════ */

    async _crossfadeToSource(newSource) {
        if (!newSource || this.isCrossfading) return;
        this.isCrossfading = true;

        const outKey = this.activePlayer;
        const inKey = outKey === 'A' ? 'B' : 'A';

        this._connectPlayer(inKey);

        const outPlayer = this.players[outKey];
        const inPlayer = this.players[inKey];

        this._loadSource(inKey, newSource);

        try {
            await inPlayer.audio.play();
        } catch (e) {
            console.warn('[RadioEngine] Crossfade play failed:', e);
            this.isCrossfading = false;
            return;
        }

        const duration = this.crossfadeDuration * 1000; // ms
        const startTime = performance.now();

        // Temporarily boost bass during crossfade to keep low-end continuous
        const originalBassGain = this.bassBoost ? this.bassBoost.gain.value : 3;
        if (this.bassBoost) {
            this.bassBoost.gain.value = originalBassGain + 2; // +2dB during transition
        }

        const doFade = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Equal-power crossfade curve (preserves perceived volume)
            const fadeOut = Math.cos(progress * Math.PI / 2);
            const fadeIn = Math.sin(progress * Math.PI / 2);

            // Groove scoop: slight volume dip at midpoint for rhythmic blend
            const grooveDip = 1 - (Math.sin(progress * Math.PI) * 0.05);

            if (outPlayer.gain && inPlayer.gain) {
                outPlayer.gain.gain.value = fadeOut * grooveDip;
                inPlayer.gain.gain.value = fadeIn * grooveDip;
            } else {
                outPlayer.audio.volume = fadeOut * this.currentVolume * grooveDip;
                inPlayer.audio.volume = fadeIn * this.currentVolume * grooveDip;
            }

            if (progress < 1) {
                this.crossfadeRAF = requestAnimationFrame(doFade);
            } else {
                // Crossfade complete
                outPlayer.audio.pause();
                outPlayer.audio.currentTime = 0;
                if (outPlayer.gain) outPlayer.gain.gain.value = 0;

                // Restore bass boost
                if (this.bassBoost) {
                    this.bassBoost.gain.value = originalBassGain;
                }

                this.activePlayer = inKey;
                this.isCrossfading = false;

                this._updateCurrentTrack();
                this._fireEvent('stateChange', { isPlaying: true, track: this.currentTrack });

                if (this.isTrackMode) {
                    this._preloadNext();
                }
            }
        };

        this.crossfadeRAF = requestAnimationFrame(doFade);
    }

    _startCrossfadeToNext() {
        if (this.isCrossfading || !this.isTrackMode) return;

        const nextIndex = (this.queueIndex + 1) % this.queue.length;
        const nextTrack = this.queue[nextIndex];
        if (!nextTrack) return;

        this.queueIndex = nextIndex;
        this._advanceEnergyPhase();
        this._crossfadeToSource(nextTrack.url);
    }

    /* ═══════════════════════════════════════════
       PRELOADING
       ═══════════════════════════════════════════ */

    _preloadNext() {
        const nextSource = this._getNextSource();
        if (!nextSource) return;

        const inactiveKey = this.activePlayer === 'A' ? 'B' : 'A';
        const inactiveAudio = this.players[inactiveKey].audio;

        if (inactiveAudio.src !== nextSource) {
            inactiveAudio.src = nextSource;
            inactiveAudio.load();
        }
    }

    _getCurrentSource() {
        if (this.isTrackMode && this.queue.length > 0 && this.queueIndex >= 0) {
            return this.queue[this.queueIndex]?.url || this.fallbackStream;
        }
        return this.fallbackStream;
    }

    _getNextSource() {
        if (!this.isTrackMode || this.queue.length === 0) return null;
        const nextIndex = (this.queueIndex + 1) % this.queue.length;
        return this.queue[nextIndex]?.url || null;
    }

    /* ═══════════════════════════════════════════
       VOLUME & MUTE
       ═══════════════════════════════════════════ */

    setVolume(value) {
        this.currentVolume = Math.max(0, Math.min(1, value));
        if (this.masterGain) {
            this.masterGain.gain.value = this.currentVolume;
        } else {
            this.players[this.activePlayer].audio.volume = this.currentVolume;
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        for (const key of ['A', 'B']) {
            this.players[key].audio.muted = this.isMuted;
        }
        return this.isMuted;
    }

    /* ═══════════════════════════════════════════
       AUDIO ANALYSIS (for visualizers)
       ═══════════════════════════════════════════ */

    getFrequencyBands() {
        if (!this.analyser || !this.frequencyData) {
            return { low: 0, mid: 0, high: 0, overall: 0, sub: 0 };
        }

        this.analyser.getByteFrequencyData(this.frequencyData);
        const binCount = this.frequencyData.length;
        const subEnd = Math.floor(binCount * 0.06);   // sub-bass (~0-250Hz)
        const lowEnd = Math.floor(binCount * 0.15);    // low (~250-700Hz)
        const midEnd = Math.floor(binCount * 0.5);     // mid (~700-2300Hz)

        let subSum = 0, lowSum = 0, midSum = 0, highSum = 0;
        for (let i = 0; i < subEnd; i++) subSum += this.frequencyData[i];
        for (let i = subEnd; i < lowEnd; i++) lowSum += this.frequencyData[i];
        for (let i = lowEnd; i < midEnd; i++) midSum += this.frequencyData[i];
        for (let i = midEnd; i < binCount; i++) highSum += this.frequencyData[i];

        return {
            sub: subSum / (Math.max(1, subEnd) * 255),
            low: (subSum + lowSum) / (lowEnd * 255),
            mid: midSum / ((midEnd - lowEnd) * 255),
            high: highSum / ((binCount - midEnd) * 255),
            overall: (subSum + lowSum + midSum + highSum) / (binCount * 255)
        };
    }

    getTimeDomainData() {
        if (!this.analyser || !this.timeDomainData) return null;
        this.analyser.getByteTimeDomainData(this.timeDomainData);
        return this.timeDomainData;
    }

    getFrequencyData() {
        return this.frequencyData;
    }

    /* ═══════════════════════════════════════════
       INTERNAL HELPERS
       ═══════════════════════════════════════════ */

    _loadSource(playerKey, url) {
        if (!url) return;
        const audio = this.players[playerKey].audio;
        audio.src = url;
        audio.load();
    }

    _updateCurrentTrack() {
        if (this.isTrackMode && this.queue.length > 0 && this.queueIndex >= 0) {
            const track = this.queue[this.queueIndex];
            this.currentTrack = {
                ...track,
                index: this.queueIndex,
                phase: this.energyPhase,
                phaseDescription: this._getPhaseDescription(this.energyPhase)
            };
        } else {
            this.currentTrack = {
                title: 'Amaradio Live',
                artist: 'AI Radio',
                genre: 'Blended',
                isStream: true
            };
        }
        this._fireEvent('trackChange', this.currentTrack);
    }

    _fireEvent(name, data) {
        const callbackName = 'on' + name.charAt(0).toUpperCase() + name.slice(1);
        if (typeof this[callbackName] === 'function') {
            this[callbackName](data);
        }
    }

    /* ═══════════════════════════════════════════
       STATE GETTERS
       ═══════════════════════════════════════════ */

    get state() {
        return {
            isPlaying: this.isPlaying,
            isMuted: this.isMuted,
            isCrossfading: this.isCrossfading,
            isTrackMode: this.isTrackMode,
            currentTrack: this.currentTrack,
            activeFilter: this.activeFilter,
            energyPhase: this.energyPhase,
            queueIndex: this.queueIndex,
            queueLength: this.queue.length,
            volume: this.currentVolume,
            bpmRange: this.bpmRange
        };
    }

    get currentTime() {
        return this.players[this.activePlayer].audio.currentTime;
    }

    get duration() {
        return this.players[this.activePlayer].audio.duration || 0;
    }

    destroy() {
        this.stop();
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// Export for module usage or attach to window
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RadioEngine;
} else {
    window.RadioEngine = RadioEngine;
}
