/* ═══════════════════════════════════════════
   AMARADIO — DJ Persona System v2.0
   Production-ready AI radio host
   
   • Energy-aware scripting (numeric 0.0–1.0)
   • Genre-matched persona moods
   • Try/catch error isolation on all TTS
   • Sponsor slot integration
   • Zero dead-air pre-buffering
   ═══════════════════════════════════════════ */

/* ─── PERSONA ─── */
class Persona {
    constructor(name, voiceId, stylePrompt) {
        this.name = name;
        this.voiceId = voiceId;
        this.stylePrompt = stylePrompt;
        this.pitch = 1.0;
        this.rate = 0.92;
    }
}

/* ─── SCRIPT GENERATOR ─── */
class ScriptGenerator {
    constructor(persona) {
        this.persona = persona;
        this.lastIntroIndex = -1;

        // Monetizable sponsor slots
        this.sponsors = [
            'Neon Dust Clothing',
            'Hyper-Coffee',
            'Quantum Socks',
            'Midnight Pixel Studios',
            'Deep Frequency Audio',
            'Ghost Protocol VPN'
        ];

        // Station ID drops
        this.stationIDs = [
            `You're locked into ${this.persona.name}. Underground AI radio.`,
            `This is ${this.persona.name}. The signal never stops.`,
            `${this.persona.name}. Where the algorithm meets the groove.`,
            `AI curated. Human approved. This is ${this.persona.name}.`,
            `Stay connected. ${this.persona.name} keeps the frequency alive.`
        ];

        // ─── Genre-matched persona energy ───
        // High-energy intros for Amapiano
        this.amapiano_intros = [
            "The bass is about to shake different.",
            "Yanos don't stop.",
            "Log drums incoming. Brace yourself.",
            "This one's for the dance floor.",
            "We're turning the energy all the way up."
        ];

        // Editorial/Cool intros for AfroTech
        this.afrotech_intros = [
            "The frequency shifts.",
            "Something deeper incoming.",
            "Let the algorithm choose.",
            "This is the sound of tomorrow.",
            "Precision engineered for the future."
        ];

        // Deep/Minimal intros for Private School Piano
        this.piano_intros = [
            "Close your eyes for this one.",
            "Let it breathe.",
            "This is where the soul lives.",
            "Soft keys, heavy feelings.",
            "Private school energy. You know the vibe."
        ];

        // Time-based greetings
        this.timeGreetings = {
            morning: 'Good morning, night owls and early risers.',
            afternoon: 'Afternoon frequency check. Still here, still streaming.',
            evening: 'Evening session activated. The best music lives after dark.',
            night: 'Late night transmissions. This is when the real ones tune in.'
        };
    }

    /* ─── ENERGY-AWARE TRANSITION (from Python blueprint) ─── */
    generateTransition(nextTrack, energyPhase) {
        const sponsor = this.sponsors[Math.floor(Math.random() * this.sponsors.length)];
        const energy = typeof nextTrack.energy === 'number' ? nextTrack.energy : 0.5;

        // Energy-aware intro (direct from Python logic)
        let intro;
        if (energy > 0.8) {
            intro = "We're not slowing down.";
        } else if (energy < 0.4) {
            intro = "Let's shift the mood.";
        } else {
            intro = "Stay locked in.";
        }

        // Genre-matched flavor (override intro with genre-specific vibe)
        const genreKey = nextTrack.genreKey || '';
        const genreIntros = this._getGenreIntros(genreKey);
        if (genreIntros.length > 0 && Math.random() < 0.65) {
            // 65% chance to use genre-specific intro instead of energy-generic
            let idx;
            do {
                idx = Math.floor(Math.random() * genreIntros.length);
            } while (idx === this.lastIntroIndex && genreIntros.length > 1);
            this.lastIntroIndex = idx;
            intro = genreIntros[idx];
        }

        return `${intro} Coming up next: ${nextTrack.title}. Powered by ${sponsor}.`;
    }

    _getGenreIntros(genreKey) {
        switch (genreKey) {
            case 'amapiano': return this.amapiano_intros;
            case 'afrotech': return this.afrotech_intros;
            case 'piano': return this.piano_intros;
            default: return [];
        }
    }

    generateStationID() {
        return this.stationIDs[Math.floor(Math.random() * this.stationIDs.length)];
    }

    generateTimeGreeting() {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return this.timeGreetings.morning;
        if (hour >= 12 && hour < 17) return this.timeGreetings.afternoon;
        if (hour >= 17 && hour < 21) return this.timeGreetings.evening;
        return this.timeGreetings.night;
    }
}

/* ─── VOICE SYNTHESIZER (with error isolation) ─── */
class VoiceSynthesizer {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voices = [];
        this.selectedVoice = null;
        this.isReady = false;

        this._loadVoices();
        if (this.synth && this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this._loadVoices();
        }
    }

    _loadVoices() {
        try {
            this.voices = this.synth.getVoices();
            this.isReady = this.voices.length > 0;

            const preferred = [
                'Google UK English Male', 'Daniel', 'Google US English',
                'Alex', 'Samantha', 'Microsoft David', 'Microsoft Mark'
            ];

            for (const name of preferred) {
                const v = this.voices.find(v => v.name.includes(name) && v.lang.startsWith('en'));
                if (v) { this.selectedVoice = v; break; }
            }

            if (!this.selectedVoice) {
                this.selectedVoice = this.voices.find(v => v.lang.startsWith('en')) || this.voices[0];
            }
        } catch (e) {
            console.warn('[VoiceSynth] Failed to load voices:', e);
            this.isReady = false;
        }
    }

    speak(text, persona, onStart, onEnd) {
        // ─── TRY/CATCH: never let TTS crash the stream ───
        try {
            if (!this.synth || !this.isReady) {
                console.warn('[VoiceSynth] Speech synthesis not available');
                if (onEnd) onEnd();
                return null;
            }

            this.synth.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.voice = this.selectedVoice;
            utterance.pitch = persona.pitch;
            utterance.rate = persona.rate;
            utterance.volume = 1;

            utterance.onstart = () => { if (onStart) onStart(); };
            utterance.onend = () => { if (onEnd) onEnd(); };
            utterance.onerror = (e) => {
                console.warn('[VoiceSynth] TTS generation failed:', e);
                if (onEnd) onEnd(); // never stall — always call onEnd
            };

            this.synth.speak(utterance);
            return utterance;
        } catch (e) {
            console.warn('[VoiceSynth] TTS generation failed:', e);
            if (onEnd) onEnd(); // failsafe — stream continues
            return null;
        }
    }

    cancel() {
        try { if (this.synth) this.synth.cancel(); }
        catch (e) { /* silently fail */ }
    }
}

/* ─── AUDIO INJECTOR (volume ducking) ─── */
class AudioInjector {
    constructor(radioEngine) {
        this.engine = radioEngine;
        this.queue = [];
        this.isSpeaking = false;
        this.duckLevel = 0.25;
        this.duckDuration = 0.5;
        this.unduckDuration = 0.8;
        this._originalVolume = 1;
    }

    queueText(text) {
        this.queue.push(text);
    }

    clearQueue() {
        this.queue = [];
    }

    get isQueued() {
        return this.queue.length > 0;
    }

    playNext(persona, voiceSynth, onComplete) {
        if (this.queue.length === 0 || this.isSpeaking) {
            if (onComplete) onComplete();
            return;
        }

        const text = this.queue.shift();
        this.isSpeaking = true;

        this._duckMusic();

        try {
            voiceSynth.speak(text, persona,
                () => { /* onStart */ },
                () => {
                    this._unduckMusic();
                    this.isSpeaking = false;
                    if (onComplete) onComplete();
                }
            );
        } catch (e) {
            console.warn('[AudioInjector] Playback failed:', e);
            this._unduckMusic();
            this.isSpeaking = false;
            if (onComplete) onComplete();
        }
    }

    _duckMusic() {
        if (!this.engine) return;
        this._originalVolume = this.engine.currentVolume;

        try {
            if (this.engine.masterGain) {
                const gain = this.engine.masterGain.gain;
                const ctx = this.engine.audioContext;
                if (ctx) {
                    gain.cancelScheduledValues(ctx.currentTime);
                    gain.setValueAtTime(gain.value, ctx.currentTime);
                    gain.linearRampToValueAtTime(
                        this._originalVolume * this.duckLevel,
                        ctx.currentTime + this.duckDuration
                    );
                }
            } else {
                this.engine.setVolume(this._originalVolume * this.duckLevel);
            }
        } catch (e) {
            console.warn('[AudioInjector] Duck failed:', e);
        }
    }

    _unduckMusic() {
        if (!this.engine) return;

        try {
            if (this.engine.masterGain) {
                const gain = this.engine.masterGain.gain;
                const ctx = this.engine.audioContext;
                if (ctx) {
                    gain.cancelScheduledValues(ctx.currentTime);
                    gain.setValueAtTime(gain.value, ctx.currentTime);
                    gain.linearRampToValueAtTime(
                        this._originalVolume,
                        ctx.currentTime + this.unduckDuration
                    );
                }
            } else {
                this.engine.setVolume(this._originalVolume);
            }
        } catch (e) {
            console.warn('[AudioInjector] Unduck failed:', e);
        }
    }
}

/* ─── STREAM CONTROLLER (orchestrator) ─── */
class StreamController {
    constructor(scriptGen, voiceSynth, injector) {
        this.scriptGen = scriptGen;
        this.voiceSynth = voiceSynth;
        this.injector = injector;
        this.enabled = true;
        this.hasSpokenIntro = false;
        this.transitionsCount = 0;
        this.stationIDInterval = 4;
        this.isPrepared = false;
    }

    // Called at 80% track duration — pre-buffers the DJ voice
    prepareTransition(nextTrack, energyPhase) {
        if (!this.enabled || this.isPrepared) return;

        try {
            let script = this.scriptGen.generateTransition(nextTrack, energyPhase);

            // Station ID every N transitions
            if (this.transitionsCount > 0 && this.transitionsCount % this.stationIDInterval === 0) {
                script = this.scriptGen.generateStationID() + ' ' + script;
            }

            this.injector.queueText(script);
            this.isPrepared = true;
        } catch (e) {
            console.warn('[StreamController] Transition prep failed:', e);
            // Stream continues — zero impact on playback
        }
    }

    // Called during crossfade — plays the pre-buffered voice
    executeTransition() {
        if (!this.enabled) return;

        try {
            this.injector.playNext(
                this.scriptGen.persona,
                this.voiceSynth,
                () => {
                    this.transitionsCount++;
                    this.isPrepared = false;
                }
            );
        } catch (e) {
            console.warn('[StreamController] Transition exec failed:', e);
            this.isPrepared = false;
            // Stream continues
        }
    }

    // Intro greeting on first play
    speakIntro() {
        if (!this.enabled || this.hasSpokenIntro) return;

        try {
            const greeting = this.scriptGen.generateTimeGreeting();
            const intro = `${greeting} Welcome to Amaradio. The underground frequency. Let the algorithm guide your vibe.`;

            this.injector.queueText(intro);
            this.injector.playNext(
                this.scriptGen.persona,
                this.voiceSynth,
                () => { this.hasSpokenIntro = true; }
            );
        } catch (e) {
            console.warn('[StreamController] Intro failed:', e);
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.voiceSynth.cancel();
            this.injector.clearQueue();
        }
        return this.enabled;
    }
}

/* ─── EXPORT ─── */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Persona, ScriptGenerator, VoiceSynthesizer, AudioInjector, StreamController };
} else {
    window.Persona = Persona;
    window.ScriptGenerator = ScriptGenerator;
    window.VoiceSynthesizer = VoiceSynthesizer;
    window.AudioInjector = AudioInjector;
    window.StreamController = StreamController;
}
