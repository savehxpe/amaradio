/* ═══════════════════════════════════════════
   AMARADIO — DJ Persona System v1.0
   AI-powered radio host with voice transitions
   
   Architecture (from blueprint):
   • Persona — character identity & voice config
   • ScriptGenerator — dynamic transition text
   • VoiceSynthesizer — TTS with caching
   • AudioInjector — volume ducking & speech queue
   • StreamController — orchestrates the flow
   ═══════════════════════════════════════════ */

/* ─── PERSONA ─── */
class Persona {
    constructor(name, voiceId, stylePrompt) {
        this.name = name;
        this.voiceId = voiceId;       // Web Speech API voice name or index
        this.stylePrompt = stylePrompt;
        this.pitch = 1.0;
        this.rate = 0.95;             // slightly slow for radio host vibe
    }
}

/* ─── SCRIPT GENERATOR ─── */
class ScriptGenerator {
    constructor(persona) {
        this.persona = persona;
        this.lastFormatIndex = -1;

        // Fictional sponsors that fit the underground aesthetic
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

        // Track transition templates — {title}, {artist}, {genre}, {sponsor}
        this.transitionFormats = [
            `That was a vibe. Coming up, we've got {title} by {artist}. Stay locked.`,
            `Alright, let that one resonate. Next up, {artist} brings the energy with {title}.`,
            `The algorithm chose well. Now flowing into {title}. {artist} on the frequency.`,
            `{genre} energy. {artist} with {title}, coming at you right now.`,
            `Deep in the mix. {title} by {artist}. Brought to you by {sponsor}.`,
            `Feel that transition. {artist}. {title}. {genre} precision.`,
            `The groove continues. {title} drops next, courtesy of {artist}. Let's go.`,
            `AI recommendation: {title} by {artist}. Trust the algorithm.`,
            `Switching gears. {artist} takes the wheel with {title}. {sponsor} keeping us live.`,
            `That's the sound of the underground. Next, {title}. {artist}. Pure frequency.`
        ];

        // Energy phase commentary
        this.phaseComments = {
            build: [
                'Building the foundation. Percussive layers incoming.',
                'We\'re warming up. Let the rhythm settle in.',
                'The groove is building. Stay with it.'
            ],
            peak: [
                'Peak energy right now. This is where we hit different.',
                'Maximum frequency. Deep bass territory.',
                'The algorithm says full power. Here we go.'
            ],
            release: [
                'Bringing it down gently. Let the melody breathe.',
                'Release phase. Smooth transition ahead.',
                'Easing back. The groove finds its pocket.'
            ],
            cooldown: [
                'Cooldown moment. Take a breath. We ride again soon.',
                'Atmospheric space. Let this one wash over you.',
                'The calm before the next build. Enjoy the stillness.'
            ]
        };

        // Time-based greetings
        this.timeGreetings = {
            morning: 'Good morning, night owls and early risers.',
            afternoon: 'Afternoon frequency check. Still here, still streaming.',
            evening: 'Evening session activated. The best music lives after dark.',
            night: 'Late night transmissions. This is when the real ones tune in.'
        };
    }

    generateTransition(nextTrack, energyPhase) {
        // Pick a format that's different from the last one
        let formatIndex;
        do {
            formatIndex = Math.floor(Math.random() * this.transitionFormats.length);
        } while (formatIndex === this.lastFormatIndex && this.transitionFormats.length > 1);
        this.lastFormatIndex = formatIndex;

        const template = this.transitionFormats[formatIndex];
        const sponsor = this.sponsors[Math.floor(Math.random() * this.sponsors.length)];

        let text = template
            .replace('{title}', nextTrack.title || 'the next track')
            .replace('{artist}', nextTrack.artist || 'the artist')
            .replace('{genre}', nextTrack.genreName || nextTrack.genre || 'Underground')
            .replace('{sponsor}', sponsor);

        // Occasionally add energy phase commentary (30% chance)
        if (energyPhase && this.phaseComments[energyPhase] && Math.random() < 0.3) {
            const comments = this.phaseComments[energyPhase];
            text += ' ' + comments[Math.floor(Math.random() * comments.length)];
        }

        return text;
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

/* ─── VOICE SYNTHESIZER ─── */
class VoiceSynthesizer {
    constructor() {
        this.synth = window.speechSynthesis;
        this.cache = new Map();
        this.voices = [];
        this.selectedVoice = null;
        this.isReady = false;

        // Load voices (async in some browsers)
        this._loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this._loadVoices();
        }
    }

    _loadVoices() {
        this.voices = this.synth.getVoices();
        this.isReady = this.voices.length > 0;

        // Prefer a deep, English voice for the DJ persona
        const preferred = [
            'Google UK English Male',
            'Daniel',
            'Google US English',
            'Alex',
            'Samantha',
            'Microsoft David',
            'Microsoft Mark'
        ];

        for (const name of preferred) {
            const v = this.voices.find(v =>
                v.name.includes(name) && v.lang.startsWith('en')
            );
            if (v) {
                this.selectedVoice = v;
                break;
            }
        }

        // Fallback: pick any English voice
        if (!this.selectedVoice) {
            this.selectedVoice = this.voices.find(v => v.lang.startsWith('en')) || this.voices[0];
        }
    }

    speak(text, persona, onStart, onEnd) {
        if (!this.synth || !this.isReady) {
            console.warn('[VoiceSynth] Speech synthesis not available');
            if (onEnd) onEnd();
            return null;
        }

        // Cancel any ongoing speech
        this.synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.selectedVoice;
        utterance.pitch = persona.pitch;
        utterance.rate = persona.rate;
        utterance.volume = 1;

        utterance.onstart = () => {
            if (onStart) onStart();
        };

        utterance.onend = () => {
            if (onEnd) onEnd();
        };

        utterance.onerror = (e) => {
            console.warn('[VoiceSynth] Speech error:', e);
            if (onEnd) onEnd();
        };

        this.synth.speak(utterance);
        return utterance;
    }

    cancel() {
        if (this.synth) this.synth.cancel();
    }
}

/* ─── AUDIO INJECTOR (volume ducking) ─── */
class AudioInjector {
    constructor(radioEngine) {
        this.engine = radioEngine;
        this.queue = [];
        this.isSpeaking = false;
        this.duckLevel = 0.25;       // music volume during DJ speech
        this.duckDuration = 0.5;     // seconds to fade music down
        this.unduckDuration = 0.8;   // seconds to bring music back
        this._originalVolume = 1;
    }

    queueText(text) {
        this.queue.push(text);
    }

    playNext(persona, voiceSynth, onComplete) {
        if (this.queue.length === 0 || this.isSpeaking) {
            if (onComplete) onComplete();
            return;
        }

        const text = this.queue.shift();
        this.isSpeaking = true;

        // Duck the music
        this._duckMusic();

        // Speak the text
        voiceSynth.speak(
            text,
            persona,
            () => {
                // onStart — speaking has begun
            },
            () => {
                // onEnd — speaking finished
                this._unduckMusic();
                this.isSpeaking = false;
                if (onComplete) onComplete();
            }
        );
    }

    _duckMusic() {
        if (!this.engine) return;
        this._originalVolume = this.engine.currentVolume;

        if (this.engine.masterGain) {
            // Smooth volume duck using Web Audio API
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
            // Fallback
            this.engine.setVolume(this._originalVolume * this.duckLevel);
        }
    }

    _unduckMusic() {
        if (!this.engine) return;

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
        this.stationIDInterval = 4;    // drop station ID every N transitions
        this.isPrepared = false;       // whether next transition is pre-generated
    }

    // Called when a track is nearing its end (~10s before)
    prepareTransition(nextTrack, energyPhase) {
        if (!this.enabled || this.isPrepared) return;

        // Generate the script
        let script = this.scriptGen.generateTransition(nextTrack, energyPhase);

        // Every N transitions, add a station ID
        if (this.transitionsCount > 0 && this.transitionsCount % this.stationIDInterval === 0) {
            script = this.scriptGen.generateStationID() + ' ' + script;
        }

        // Queue it
        this.injector.queueText(script);
        this.isPrepared = true;
    }

    // Called during crossfade overlap
    executeTransition() {
        if (!this.enabled) return;

        this.injector.playNext(
            this.scriptGen.persona,
            this.voiceSynth,
            () => {
                this.transitionsCount++;
                this.isPrepared = false;
            }
        );
    }

    // Intro greeting when user first presses play
    speakIntro() {
        if (!this.enabled || this.hasSpokenIntro) return;

        const greeting = this.scriptGen.generateTimeGreeting();
        const intro = `${greeting} Welcome to Amaradio. The underground AI radio network. Let the algorithm guide your frequency.`;

        this.injector.queueText(intro);
        this.injector.playNext(
            this.scriptGen.persona,
            this.voiceSynth,
            () => {
                this.hasSpokenIntro = true;
            }
        );
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.voiceSynth.cancel();
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
