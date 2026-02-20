/* ═══════════════════════════════════════════
   AMARADIO — RadioEngine v1.0
   Modular Streaming Audio Architecture
   
   Features:
   • Dual-player crossfade system
   • Genre-based channel switching
   • Track queue with preloading
   • Web Audio API normalization
   • Seamless transitions
   ═══════════════════════════════════════════ */

class RadioEngine {
    constructor(options = {}) {
        // ─── Configuration ───
        this.crossfadeDuration = options.crossfadeDuration || 3; // seconds
        this.preloadAhead = options.preloadAhead || 10; // seconds before end to preload
        this.defaultVolume = options.defaultVolume || 1;

        // ─── Audio Context & Nodes ───
        this.audioContext = null;
        this.analyser = null;
        this.compressor = null;
        this.masterGain = null;

        // ─── Dual Player System (A/B for crossfade) ───
        this.players = {
            A: { audio: null, source: null, gain: null, connected: false },
            B: { audio: null, source: null, gain: null, connected: false }
        };
        this.activePlayer = 'A';
        this.isCrossfading = false;
        this.crossfadeTimer = null;

        // ─── Frequency Analysis Data ───
        this.frequencyData = null;
        this.timeDomainData = null;

        // ─── Playback State ───
        this.isPlaying = false;
        this.isMuted = false;
        this.currentVolume = this.defaultVolume;

        // ─── Channel / Genre System ───
        this.channels = {};
        this.currentChannel = null;
        this.currentChannelKey = null;

        // ─── Track Queue ───
        this.queue = [];
        this.queueIndex = -1;
        this.currentTrack = null;
        this.isTrackMode = false; // false = stream mode, true = track queue mode
        this.shuffled = false;

        // ─── Event Callbacks ───
        this.onTrackChange = null;
        this.onStateChange = null;
        this.onChannelChange = null;
        this.onTimeUpdate = null;
        this.onError = null;

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

            // ─── Dynamics Compressor for level normalization ───
            this.compressor = this.audioContext.createDynamicsCompressor();
            this.compressor.threshold.value = -24;   // dB above which compression starts
            this.compressor.knee.value = 30;          // smooth transition range
            this.compressor.ratio.value = 4;          // compression ratio
            this.compressor.attack.value = 0.005;     // fast attack for transients
            this.compressor.release.value = 0.15;     // moderate release

            // ─── Master Gain ───
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.currentVolume;

            // ─── Analyser for visualizations ───
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;

            // ─── Signal Chain: player gain → compressor → analyser → master → output ───
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
            player.gain.connect(this.compressor);
            player.connected = true;
        } catch (e) {
            console.warn(`[RadioEngine] Failed to connect player ${key}:`, e);
        }
    }

    _setupEventListeners() {
        for (const key of ['A', 'B']) {
            const audio = this.players[key].audio;

            // Track ended — play next
            audio.addEventListener('ended', () => {
                if (key === this.activePlayer && this.isTrackMode) {
                    this.next();
                }
            });

            // Time update — check for preload trigger & fire callback
            audio.addEventListener('timeupdate', () => {
                if (key === this.activePlayer) {
                    this._fireEvent('timeUpdate', {
                        currentTime: audio.currentTime,
                        duration: audio.duration || 0
                    });

                    // Preload / crossfade trigger
                    if (this.isTrackMode && audio.duration && !this.isCrossfading) {
                        const remaining = audio.duration - audio.currentTime;
                        if (remaining <= this.crossfadeDuration + 1 && remaining > 0) {
                            this._startCrossfadeToNext();
                        }
                    }
                }
            });

            // Error handling
            audio.addEventListener('error', (e) => {
                console.warn(`[RadioEngine] Player ${key} error:`, e);
                this._fireEvent('error', {
                    type: 'playback',
                    player: key,
                    message: `Player ${key} failed to load audio`
                });
                // Try next track on error
                if (key === this.activePlayer && this.isTrackMode) {
                    setTimeout(() => this.next(), 500);
                }
            });

            // Can play through — ready
            audio.addEventListener('canplaythrough', () => {
                // Track is preloaded and ready
            });
        }
    }

    /* ═══════════════════════════════════════════
       CHANNEL / GENRE REGISTRATION
       ═══════════════════════════════════════════ */

    registerChannel(key, config) {
        this.channels[key] = {
            name: config.name || key,
            genre: config.genre || key,
            color: config.color || '#6c0df2',
            icon: config.icon || 'radio',
            stream: config.stream || null,       // URL for live stream mode
            tracks: config.tracks || [],          // Array of track objects
            description: config.description || '',
            artwork: config.artwork || null
        };
        return this;
    }

    getChannels() {
        return Object.entries(this.channels).map(([key, ch]) => ({
            key,
            ...ch,
            isActive: key === this.currentChannelKey
        }));
    }

    /* ═══════════════════════════════════════════
       CHANNEL SWITCHING
       ═══════════════════════════════════════════ */

    async switchChannel(channelKey) {
        const channel = this.channels[channelKey];
        if (!channel) {
            console.warn(`[RadioEngine] Channel "${channelKey}" not found`);
            return false;
        }

        const wasPlaying = this.isPlaying;
        this.currentChannelKey = channelKey;
        this.currentChannel = channel;

        // Determine mode
        if (channel.tracks && channel.tracks.length > 0) {
            this.isTrackMode = true;
            this.queue = this.shuffled ? this._shuffleArray([...channel.tracks]) : [...channel.tracks];
            this.queueIndex = 0;
        } else if (channel.stream) {
            this.isTrackMode = false;
            this.queue = [];
            this.queueIndex = -1;
        }

        this._fireEvent('channelChange', {
            channel: channelKey,
            name: channel.name,
            genre: channel.genre,
            isTrackMode: this.isTrackMode
        });

        if (wasPlaying) {
            // Crossfade to new channel
            await this._crossfadeToSource(this._getCurrentSource());
        } else {
            // Just load without playing
            this._loadSource(this.activePlayer, this._getCurrentSource());
            this._updateCurrentTrack();
        }

        return true;
    }

    _getCurrentSource() {
        if (this.isTrackMode && this.queue.length > 0) {
            return this.queue[this.queueIndex]?.url || null;
        }
        return this.currentChannel?.stream || null;
    }

    _getNextSource() {
        if (!this.isTrackMode || this.queue.length === 0) return null;
        const nextIndex = (this.queueIndex + 1) % this.queue.length;
        return this.queue[nextIndex]?.url || null;
    }

    /* ═══════════════════════════════════════════
       PLAYBACK CONTROLS
       ═══════════════════════════════════════════ */

    async play() {
        this._initAudioContext();

        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        // If no channel selected, pick first available
        if (!this.currentChannel && Object.keys(this.channels).length > 0) {
            const firstKey = Object.keys(this.channels)[0];
            await this.switchChannel(firstKey);
        }

        const source = this._getCurrentSource();
        if (!source) {
            this._fireEvent('error', { type: 'noSource', message: 'No audio source available' });
            return false;
        }

        // Connect inactive player if needed
        const inactiveKey = this.activePlayer === 'A' ? 'B' : 'A';
        this._connectPlayer(inactiveKey);

        const activeAudio = this.players[this.activePlayer].audio;

        // Load source if not already loaded
        if (!activeAudio.src || !activeAudio.src.includes(source.replace(/https?:/, ''))) {
            this._loadSource(this.activePlayer, source);
        }

        try {
            await activeAudio.play();
            this.isPlaying = true;
            this._updateCurrentTrack();
            this._fireEvent('stateChange', { isPlaying: true, track: this.currentTrack });

            // Preload next in track mode
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
        clearTimeout(this.crossfadeTimer);
        this._fireEvent('stateChange', { isPlaying: false, track: null });
    }

    /* ═══════════════════════════════════════════
       TRACK NAVIGATION
       ═══════════════════════════════════════════ */

    async next() {
        if (!this.isTrackMode || this.queue.length === 0) return;

        this.queueIndex = (this.queueIndex + 1) % this.queue.length;

        if (this.isPlaying) {
            await this._crossfadeToSource(this._getCurrentSource());
        } else {
            this._loadSource(this.activePlayer, this._getCurrentSource());
            this._updateCurrentTrack();
        }
    }

    async previous() {
        if (!this.isTrackMode || this.queue.length === 0) return;

        // If more than 3 seconds in, restart track; otherwise go previous
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

    toggleShuffle() {
        this.shuffled = !this.shuffled;
        if (this.shuffled && this.isTrackMode) {
            const current = this.queue[this.queueIndex];
            this.queue = this._shuffleArray([...this.queue]);
            // Keep current track in position
            const idx = this.queue.findIndex(t => t.url === current?.url);
            if (idx > 0) {
                [this.queue[0], this.queue[idx]] = [this.queue[idx], this.queue[0]];
            }
            this.queueIndex = 0;
        }
        return this.shuffled;
    }

    /* ═══════════════════════════════════════════
       CROSSFADE ENGINE
       ═══════════════════════════════════════════ */

    async _crossfadeToSource(newSource) {
        if (!newSource || this.isCrossfading) return;
        this.isCrossfading = true;

        const outKey = this.activePlayer;
        const inKey = outKey === 'A' ? 'B' : 'A';

        // Ensure incoming player is connected
        this._connectPlayer(inKey);

        const outPlayer = this.players[outKey];
        const inPlayer = this.players[inKey];

        // Load new source into incoming player
        this._loadSource(inKey, newSource);

        try {
            await inPlayer.audio.play();
        } catch (e) {
            console.warn('[RadioEngine] Crossfade play failed:', e);
            this.isCrossfading = false;
            return;
        }

        const duration = this.crossfadeDuration;
        const steps = 60; // steps at ~60fps
        const stepTime = (duration * 1000) / steps;
        let step = 0;

        // Perform crossfade with gain nodes (Web Audio API) or volume (fallback)
        const doFade = () => {
            step++;
            const progress = Math.min(step / steps, 1);

            // Equal-power crossfade curve
            const fadeOut = Math.cos(progress * Math.PI / 2);
            const fadeIn = Math.sin(progress * Math.PI / 2);

            if (outPlayer.gain && inPlayer.gain) {
                // Web Audio API gain nodes
                outPlayer.gain.gain.value = fadeOut;
                inPlayer.gain.gain.value = fadeIn;
            } else {
                // Fallback to volume
                outPlayer.audio.volume = fadeOut * this.currentVolume;
                inPlayer.audio.volume = fadeIn * this.currentVolume;
            }

            if (progress < 1) {
                this.crossfadeTimer = setTimeout(doFade, stepTime);
            } else {
                // Crossfade complete
                outPlayer.audio.pause();
                outPlayer.audio.currentTime = 0;
                if (outPlayer.gain) outPlayer.gain.gain.value = 0;

                this.activePlayer = inKey;
                this.isCrossfading = false;

                this._updateCurrentTrack();
                this._fireEvent('stateChange', { isPlaying: true, track: this.currentTrack });

                // Preload next
                if (this.isTrackMode) {
                    this._preloadNext();
                }
            }
        };

        doFade();
    }

    _startCrossfadeToNext() {
        if (this.isCrossfading || !this.isTrackMode) return;

        const nextIndex = (this.queueIndex + 1) % this.queue.length;
        const nextTrack = this.queue[nextIndex];
        if (!nextTrack) return;

        this.queueIndex = nextIndex;
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

        // Only preload if different source
        if (inactiveAudio.src !== nextSource) {
            inactiveAudio.src = nextSource;
            inactiveAudio.load();
        }
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
            return { low: 0, mid: 0, high: 0, overall: 0 };
        }

        this.analyser.getByteFrequencyData(this.frequencyData);
        const binCount = this.frequencyData.length;
        const lowEnd = Math.floor(binCount * 0.15);
        const midEnd = Math.floor(binCount * 0.5);

        let lowSum = 0, midSum = 0, highSum = 0;
        for (let i = 0; i < lowEnd; i++) lowSum += this.frequencyData[i];
        for (let i = lowEnd; i < midEnd; i++) midSum += this.frequencyData[i];
        for (let i = midEnd; i < binCount; i++) highSum += this.frequencyData[i];

        return {
            low: lowSum / (lowEnd * 255),
            mid: midSum / ((midEnd - lowEnd) * 255),
            high: highSum / ((binCount - midEnd) * 255),
            overall: (lowSum + midSum + highSum) / (binCount * 255)
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
            this.currentTrack = { ...this.queue[this.queueIndex], index: this.queueIndex };
        } else if (this.currentChannel) {
            this.currentTrack = {
                title: this.currentChannel.name,
                artist: 'Amaradio Live',
                genre: this.currentChannel.genre,
                artwork: this.currentChannel.artwork,
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

    _shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
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
            currentChannel: this.currentChannelKey,
            queueIndex: this.queueIndex,
            queueLength: this.queue.length,
            volume: this.currentVolume,
            shuffled: this.shuffled
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
