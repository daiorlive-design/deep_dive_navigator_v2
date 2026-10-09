// ==========================================
// MOTOR DE ÁUDIO — música de fundo e efeitos sonoros
// Tudo é gerado em tempo real com a Web Audio API: nenhum arquivo de
// música é baixado, então não há questões de direitos autorais.
// ==========================================
const Sound = (() => {
    let ctx = null;
    let masterBus, musicBus, sfxBus;
    let musicOn = false;
    let sfxOn = true;
    let volume = 0.4;
    let ducked = false;
    let trackIndex = 0;
    let stopCurrentTrack = null;
    const noiseCache = {};

    const TRACKS = [
        { id: 'lantern', name: 'Lantern Drift', description: 'Slow ambient pads', start: startLanternDrift },
        { id: 'campfire', name: 'Campfire Lo-fi', description: 'Soft, steady beats', start: startCampfireLofi },
        { id: 'ocean', name: 'Ocean Waves', description: 'Brown noise, like distant surf', start: startOceanWaves }
    ];

    // --- Infraestrutura ---
    function ensureCtx() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
            masterBus = ctx.createDynamicsCompressor();
            masterBus.connect(ctx.destination);
            musicBus = ctx.createGain();
            musicBus.gain.value = musicLevel();
            musicBus.connect(masterBus);
            sfxBus = ctx.createGain();
            sfxBus.gain.value = 0.45;
            sfxBus.connect(masterBus);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function musicLevel() {
        return volume * 0.55 * (ducked ? 0.3 : 1);
    }

    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function noiseBuffer(type) {
        if (noiseCache[type]) return noiseCache[type];
        const len = ctx.sampleRate * 3;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
            const white = Math.random() * 2 - 1;
            if (type === 'brown') {
                last = (last + 0.02 * white) / 1.02;
                data[i] = last * 3.5;
            } else {
                data[i] = white;
            }
        }
        noiseCache[type] = buf;
        return buf;
    }

    // Nota simples com envelope (usada por efeitos e música)
    function tone(dest, freq, start, dur, opts = {}) {
        const { type = 'sine', gain = 0.2, attack = 0.005, endFreq = null, detune = 0 } = opts;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = type;
        osc.detune.value = detune;
        osc.frequency.setValueAtTime(freq, start);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
        env.gain.setValueAtTime(0.0001, start);
        env.gain.exponentialRampToValueAtTime(gain, start + attack);
        env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(env).connect(dest);
        osc.start(start);
        osc.stop(start + dur + 0.05);
    }

    function noiseHit(dest, start, dur, { gain = 0.1, filter = 'highpass', freq = 6000, q = 1 } = {}) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer('white');
        const f = ctx.createBiquadFilter();
        f.type = filter;
        f.frequency.value = freq;
        f.Q.value = q;
        const env = ctx.createGain();
        env.gain.setValueAtTime(gain, start);
        env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        src.connect(f).connect(env).connect(dest);
        src.start(start, Math.random() * 2);
        src.stop(start + dur + 0.02);
    }

    // Agendador com antecedência: aguenta abas em segundo plano (timers lentos)
    function startScheduler(stepDur, onStep) {
        let next = ctx.currentTime + 0.15;
        let step = 0;
        const tick = () => {
            while (next < ctx.currentTime + 1.5) {
                onStep(step++, next);
                next += stepDur;
            }
        };
        tick();
        const id = setInterval(tick, 200);
        return () => clearInterval(id);
    }

    // Saída própria de cada faixa, para poder fazer fade-out ao trocar
    function trackOutput() {
        const out = ctx.createGain();
        out.gain.setValueAtTime(0.0001, ctx.currentTime);
        out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.5);
        out.connect(musicBus);
        return out;
    }

    function fadeOutAndDisconnect(out, cleanup) {
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
        setTimeout(() => {
            if (cleanup) cleanup();
            out.disconnect();
        }, 1700);
    }

    // --- Faixa 1: Lantern Drift (pads ambientes + sininhos com eco) ---
    function startLanternDrift() {
        const out = trackOutput();
        const padFilter = ctx.createBiquadFilter();
        padFilter.type = 'lowpass';
        padFilter.frequency.value = 900;
        padFilter.connect(out);

        const delay = ctx.createDelay();
        delay.delayTime.value = 0.45;
        const feedback = ctx.createGain();
        feedback.gain.value = 0.35;
        const delayTone = ctx.createBiquadFilter();
        delayTone.type = 'lowpass';
        delayTone.frequency.value = 2500;
        delay.connect(delayTone).connect(feedback).connect(delay);
        delayTone.connect(out);
        const bells = ctx.createGain();
        bells.gain.value = 1;
        bells.connect(out);
        bells.connect(delay);

        const chords = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]];
        const pentatonic = [72, 74, 76, 79, 81, 84];
        const BAR = 8;

        const stop = startScheduler(BAR, (step, t) => {
            chords[step % chords.length].forEach(note => {
                [-7, 7].forEach(detune => {
                    const osc = ctx.createOscillator();
                    const env = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.value = mtof(note);
                    osc.detune.value = detune;
                    env.gain.setValueAtTime(0.0001, t);
                    env.gain.exponentialRampToValueAtTime(0.035, t + 2.5);
                    env.gain.setValueAtTime(0.035, t + BAR - 1);
                    env.gain.exponentialRampToValueAtTime(0.0001, t + BAR + 1.5);
                    osc.connect(env).connect(padFilter);
                    osc.start(t);
                    osc.stop(t + BAR + 1.6);
                });
            });
            for (let i = 0; i < 3; i++) {
                const when = t + 1 + Math.random() * (BAR - 2);
                const note = pentatonic[Math.floor(Math.random() * pentatonic.length)];
                tone(bells, mtof(note), when, 2.8, { gain: 0.04, attack: 0.01 });
            }
        });
        return () => fadeOutAndDisconnect(out, stop);
    }

    // --- Faixa 2: Campfire Lo-fi (batida suave, 75 BPM) ---
    function startCampfireLofi() {
        const out = trackOutput();
        const keysFilter = ctx.createBiquadFilter();
        keysFilter.type = 'lowpass';
        keysFilter.frequency.value = 1300;
        keysFilter.connect(out);

        const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]];
        const melodyNotes = [72, 74, 76, 79, 81];
        const SIXTEENTH = 60 / 75 / 4;

        const stop = startScheduler(SIXTEENTH, (step, t) => {
            const inBar = step % 16;
            const bar = Math.floor(step / 16);
            const swing = inBar % 2 === 1 ? SIXTEENTH * 0.18 : 0;
            const when = t + swing;

            if (inBar === 0) {
                const chord = chords[bar % chords.length];
                chord.forEach(note => {
                    tone(keysFilter, mtof(note), when, 3.2, { type: 'triangle', gain: 0.045, attack: 0.03 });
                    tone(keysFilter, mtof(note + 12), when, 1.6, { type: 'sine', gain: 0.012, attack: 0.02 });
                });
                tone(out, mtof(chord[0] - 12), when, 1.8, { type: 'sine', gain: 0.14, attack: 0.02 });
            }
            if (inBar === 8) {
                const chord = chords[bar % chords.length];
                tone(out, mtof(chord[0] - 12), when, 1.2, { type: 'sine', gain: 0.1, attack: 0.02 });
            }
            // bumbo
            if (inBar === 0 || inBar === 10) {
                tone(out, 120, when, 0.35, { gain: 0.45, attack: 0.003, endFreq: 42 });
            }
            // caixa abafada
            if (inBar === 4 || inBar === 12) {
                noiseHit(out, when, 0.16, { gain: 0.07, filter: 'bandpass', freq: 1700, q: 0.8 });
            }
            // chimbal
            if (inBar % 2 === 0) {
                noiseHit(out, when, 0.045, { gain: inBar % 4 === 0 ? 0.035 : 0.022, filter: 'highpass', freq: 7000 });
            }
            // melodia ocasional
            if (inBar % 2 === 0 && Math.random() < 0.12) {
                const note = melodyNotes[Math.floor(Math.random() * melodyNotes.length)];
                tone(keysFilter, mtof(note), when, 0.9, { type: 'triangle', gain: 0.035, attack: 0.01 });
            }
        });
        return () => fadeOutAndDisconnect(out, stop);
    }

    // --- Faixa 3: Ocean Waves (ruído marrom com ondas lentas) ---
    function startOceanWaves() {
        const out = trackOutput();
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer('brown');
        src.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;

        const swell = ctx.createGain();
        swell.gain.value = 0.55;

        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.09;
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.value = 0.3;
        lfo.connect(lfoDepth).connect(swell.gain);

        const lfoFilterDepth = ctx.createGain();
        lfoFilterDepth.gain.value = 250;
        lfo.connect(lfoFilterDepth).connect(filter.frequency);

        src.connect(filter).connect(swell).connect(out);
        src.start();
        lfo.start();
        return () => fadeOutAndDisconnect(out, () => { src.stop(); lfo.stop(); });
    }

    function startTrack() {
        if (stopCurrentTrack) stopCurrentTrack();
        stopCurrentTrack = TRACKS[trackIndex].start();
    }

    function stopTrack() {
        if (stopCurrentTrack) stopCurrentTrack();
        stopCurrentTrack = null;
    }

    // --- Efeitos sonoros ---
    const SFX = {
        click(t) {
            tone(sfxBus, 880, t, 0.07, { type: 'triangle', gain: 0.12, endFreq: 620 });
        },
        toggle(t) {
            tone(sfxBus, 620, t, 0.06, { type: 'triangle', gain: 0.12 });
            tone(sfxBus, 930, t + 0.05, 0.08, { type: 'triangle', gain: 0.1 });
        },
        correct(t) {
            [659, 784, 1047].forEach((f, i) => tone(sfxBus, f, t + i * 0.08, 0.3, { type: 'triangle', gain: 0.18 }));
        },
        wrong(t) {
            tone(sfxBus, 247, t, 0.22, { type: 'triangle', gain: 0.2, endFreq: 200 });
            tone(sfxBus, 185, t + 0.16, 0.35, { type: 'triangle', gain: 0.18, endFreq: 150 });
        },
        error(t) {
            tone(sfxBus, 330, t, 0.12, { type: 'triangle', gain: 0.14 });
            tone(sfxBus, 262, t + 0.1, 0.18, { type: 'triangle', gain: 0.14 });
        },
        coins(t) {
            [1319, 1760, 2093].forEach((f, i) => tone(sfxBus, f, t + i * 0.06, 0.25, { gain: 0.1 }));
        },
        success(t) {
            [523, 784].forEach((f, i) => tone(sfxBus, f, t + i * 0.1, 0.35, { type: 'triangle', gain: 0.16 }));
        },
        start(t) {
            [392, 523, 659, 784].forEach((f, i) => tone(sfxBus, f, t + i * 0.07, 0.5, { type: 'triangle', gain: 0.13 }));
        },
        levelup(t) {
            [523, 659, 784, 1047].forEach((f, i) => tone(sfxBus, f, t + i * 0.1, 0.3, { type: 'square', gain: 0.06 }));
            [523, 659, 784, 1047].forEach(f => tone(sfxBus, f, t + 0.45, 1.1, { type: 'triangle', gain: 0.09 }));
        },
        complete(t) {
            const melody = [523, 523, 523, 659, 784, 659, 784, 1047];
            const times = [0, 0.12, 0.24, 0.36, 0.6, 0.84, 0.96, 1.2];
            melody.forEach((f, i) => tone(sfxBus, f, t + times[i], 0.3, { type: 'square', gain: 0.05 }));
            [523, 659, 784, 1047].forEach(f => tone(sfxBus, f, t + 1.2, 1.6, { type: 'triangle', gain: 0.09 }));
        }
    };

    // --- API pública ---
    return {
        tracks: TRACKS.map(({ id, name, description }) => ({ id, name, description })),

        play(name) {
            if (!sfxOn || !SFX[name] || !ensureCtx()) return;
            SFX[name](ctx.currentTime + 0.01);
        },

        // Chamado no primeiro gesto do usuário (navegadores bloqueiam áudio antes disso)
        unlock() {
            if (ctx && ctx.state === 'suspended') ctx.resume();
        },

        setMusic(on) {
            musicOn = on;
            if (on) {
                if (!ensureCtx()) return;
                if (!stopCurrentTrack) startTrack();
            } else if (ctx) {
                stopTrack();
            }
        },

        setTrack(index) {
            trackIndex = Math.max(0, Math.min(TRACKS.length - 1, index));
            if (musicOn && ensureCtx()) startTrack();
        },

        setVolume(v) {
            volume = Math.max(0, Math.min(1, v));
            if (musicBus) musicBus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.1);
        },

        setSfx(on) {
            sfxOn = on;
        },

        // Abaixa a música enquanto o texto é lido em voz alta
        duck(on) {
            ducked = on;
            if (musicBus) musicBus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.2);
        }
    };
})();
