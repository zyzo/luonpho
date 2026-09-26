const LOOP_SECONDS = 180;
const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function randomSequence(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function trafficScore() {
  const random = randomSequence(761982);
  const events = [];
  const add = (type, time, extra = {}) => events.push({
    type, time, seed: Math.floor(random() * 0xffffffff), ...extra,
  });

  for (let time = 0.15; time < LOOP_SECONDS; time += 1.6 + random() * 2.5) {
    add('vehicle', time);
  }
  for (let time = 0.7; time < LOOP_SECONDS; time += 0.8 + random() * 2.1) {
    add('horn', time);
    // Junctions briefly fill up with answering horns from the other side.
    const junction = Math.sin((time / LOOP_SECONDS) * TAU * 3 - 0.7);
    if (junction > 0.5 && random() > 0.3) add('horn', time + 0.18 + random() * 0.6, { distant: true });
  }
  for (let time = 5.5; time < LOOP_SECONDS; time += 6 + random() * 9) add('kitchen', time);
  for (let time = 12; time < LOOP_SECONDS; time += 20 + random() * 21) add('bell', time);
  [24.2, 69.7, 126.1, 164.8].forEach((time) => add('dog', time));
  return events.filter((event) => event.time < LOOP_SECONDS).sort((a, b) => a.time - b.time);
}

/** A recording-free street mix. Call start() directly from a user gesture. */
export class StreetAudio {
  constructor() {
    this.isStarted = false;
    this.muted = false;
    this.volume = 0.7;
    this.paused = false;
    this.context = null;
    this._disposed = false;
    this._startPromise = null;
    this._events = trafficScore();
    this._voices = new Set();
    this._bedNodes = [];
    this._scheduled = new Set();
    this._cycle = 0;
    this._lastTime = null;
    this._sceneTime = 0;
    this._speed = 1;
    this._intensity = 1;
  }

  async start() {
    if (this._disposed) return false;
    if (this.context) {
      await this.context.resume();
      if (this._startPromise) await this._startPromise;
      return this.isStarted;
    }
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return false;
    // Resume before yielding so browsers retain the initiating user activation.
    this.context = new AudioContextClass({ latencyHint: 'interactive' });
    const resumed = this.context.resume();
    this._startPromise = (async () => {
      this._build();
      await resumed;
      if (this._disposed) return false;
      this.isStarted = true;
      this._applyMaster(0.45);
      this.update(this._sceneTime, this._speed, this._intensity);
      return true;
    })();
    try {
      return await this._startPromise;
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      this._startPromise = null;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this._applyMaster();
  }

  setVolume(volume) {
    if (Number.isFinite(volume)) this.volume = clamp(volume, 0, 1);
    this._applyMaster();
  }

  setPaused(paused) {
    const next = Boolean(paused);
    if (next === this.paused) return;
    this.paused = next;
    this._lastTime = null;
    this._scheduled.clear();
    if (next) this._stopVoices();
    this._applyMaster(0.12);
  }

  _applyMaster(timeConstant = 0.06) {
    if (!this._master || this._disposed) return;
    const now = this.context.currentTime;
    const target = this.muted || this.paused ? 0 : this.volume * 0.86;
    this._master.gain.cancelScheduledValues(now);
    this._master.gain.setTargetAtTime(target, now, timeConstant);
  }

  _build() {
    const context = this.context;
    this._mix = context.createGain();
    this._mix.gain.value = 0.8;
    this._compressor = context.createDynamicsCompressor();
    this._compressor.threshold.value = -20;
    this._compressor.knee.value = 18;
    this._compressor.ratio.value = 5;
    this._compressor.attack.value = 0.006;
    this._compressor.release.value = 0.28;
    this._master = context.createGain();
    this._master.gain.value = 0;
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 35;
    highpass.Q.value = 0.5;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 7200;
    lowpass.Q.value = 0.5;
    this._mix.connect(highpass).connect(lowpass).connect(this._compressor).connect(this._master).connect(context.destination);
    this._bedNodes.push(this._mix, highpass, lowpass, this._compressor, this._master);

    this._noise = this._noiseBuffer(7, 11023);
    this._crowd = this._crowdBuffer();
    this._hornWave = this._wave([0, 0.7, 1, 0.61, 0.4, 0.2, 0.19, 0.1, 0.06, 0.035]);
    this._engineWave = this._wave([0, 1, 0.7, 0.42, 0.32, 0.21, 0.17, 0.11, 0.09, 0.065, 0.04]);

    const convolver = context.createConvolver();
    convolver.buffer = this._reflectionBuffer();
    const wet = context.createGain();
    wet.gain.value = 0.12;
    const reflectionFilter = context.createBiquadFilter();
    reflectionFilter.type = 'lowpass';
    reflectionFilter.frequency.value = 2200;
    convolver.connect(reflectionFilter).connect(wet).connect(this._mix);
    this._reflections = convolver;
    this._bedNodes.push(convolver, reflectionFilter, wet);

    this._road = this._noiseBed({ pan: -0.15, highpass: 120, lowpass: 1450, gain: 0.15, rate: 0.71 });
    this._wind = this._noiseBed({ pan: 0.2, highpass: 470, lowpass: 3600, gain: 0.052, rate: 1.12 });
    this._frying = this._noiseBed({ pan: 0.73, highpass: 1600, lowpass: 5300, gain: 0.022, rate: 0.93 });
    this._engines = [-0.8, -0.32, 0.25, 0.76].map((pan, index) => this._engineBed(pan, index));

    const crowdSource = context.createBufferSource();
    crowdSource.buffer = this._crowd;
    crowdSource.loop = true;
    const crowdFilter = context.createBiquadFilter();
    crowdFilter.type = 'lowpass';
    crowdFilter.frequency.value = 2100;
    const crowdGain = context.createGain();
    crowdGain.gain.value = 0.52;
    crowdSource.connect(crowdFilter).connect(crowdGain).connect(this._mix);
    crowdGain.connect(this._reflections);
    crowdSource.start();
    this._crowdGain = crowdGain;
    this._bedNodes.push(crowdSource, crowdFilter, crowdGain);
  }

  _wave(harmonics) {
    const real = new Float32Array(harmonics.length);
    return this.context.createPeriodicWave(real, Float32Array.from(harmonics));
  }

  _noiseBuffer(seconds, seed) {
    const context = this.context;
    const buffer = context.createBuffer(2, Math.ceil(seconds * context.sampleRate), context.sampleRate);
    const random = randomSequence(seed);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let b0 = 0; let b1 = 0; let b2 = 0;
      for (let index = 0; index < data.length; index++) {
        const white = random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        data[index] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
      }
      this._seamless(data, Math.floor(context.sampleRate * 0.08));
    }
    return buffer;
  }

  _seamless(data, width) {
    // Ease the two endpoints to a common value to suppress clicks in looping beds.
    const start = data[0];
    const end = data[data.length - 1];
    const midpoint = (start + end) * 0.5;
    for (let index = 0; index < width; index++) {
      const weight = 0.5 + 0.5 * Math.cos((index / width) * Math.PI);
      data[index] += (midpoint - start) * weight;
      data[data.length - 1 - index] += (midpoint - end) * weight;
    }
  }

  _crowdBuffer() {
    const context = this.context;
    const rate = context.sampleRate;
    const buffer = context.createBuffer(2, rate * 18, rate);
    const random = randomSequence(99720);
    const vowels = [[440, 1100, 2400], [340, 1800, 2700], [630, 1200, 2450], [390, 850, 2150]];
    // Overlapping, low-level formant murmur has speech cadence but contains no words.
    for (let speaker = 0; speaker < 9; speaker++) {
      const pan = random() * 1.8 - 0.9;
      const left = Math.cos((pan + 1) * Math.PI / 4) * 0.072;
      const right = Math.sin((pan + 1) * Math.PI / 4) * 0.072;
      const outputL = buffer.getChannelData(0);
      const outputR = buffer.getChannelData(1);
      let phase = random();
      let syllable = 0;
      let syllableLength = 1;
      let fundamental = 130;
      let level = 0;
      let glottal = 0;
      let x1 = 0; let x2 = 0;
      const bands = Array.from({ length: 3 }, () => ({ b: 0, a1: 0, a2: 0, y1: 0, y2: 0 }));
      for (let index = 0; index < buffer.length; index++) {
        if (syllable <= 0) {
          syllableLength = Math.floor(rate * (0.09 + random() * 0.24));
          syllable = syllableLength;
          fundamental = (speaker % 3 === 0 ? 150 : 85) + random() * 75;
          level = random() > 0.24 ? 0.35 + random() * 0.65 : 0;
          const vowel = vowels[Math.floor(random() * vowels.length)];
          for (let bandIndex = 0; bandIndex < bands.length; bandIndex++) {
            const band = bands[bandIndex];
            const omega = TAU * vowel[bandIndex] * (0.92 + random() * 0.16) / rate;
            const alpha = Math.sin(omega) / (2 * (bandIndex === 0 ? 3 : 5));
            band.b = alpha / (1 + alpha);
            band.a1 = -2 * Math.cos(omega) / (1 + alpha);
            band.a2 = (1 - alpha) / (1 + alpha);
          }
        }
        const envelope = Math.sin(Math.PI * (1 - syllable / syllableLength));
        phase = (phase + fundamental / rate) % 1;
        const pulse = phase < 0.25 ? Math.sin(phase * TAU * 2) : 0;
        glottal += 0.22 * (pulse - glottal);
        const source = glottal * 0.8 + (random() * 2 - 1) * 0.13;
        let voiced = 0;
        for (let bandIndex = 0; bandIndex < bands.length; bandIndex++) {
          const band = bands[bandIndex];
          const sample = band.b * (source - x2) - band.a1 * band.y1 - band.a2 * band.y2;
          band.y2 = band.y1;
          band.y1 = sample;
          voiced += sample * (bandIndex === 0 ? 1.6 : 1);
        }
        x2 = x1;
        x1 = source;
        const sample = voiced * envelope * level;
        outputL[index] += sample * left;
        outputR[index] += sample * right;
        syllable--;
      }
    }
    for (let channel = 0; channel < 2; channel++) this._seamless(buffer.getChannelData(channel), Math.floor(rate * 0.15));
    return buffer;
  }

  _reflectionBuffer() {
    const context = this.context;
    const buffer = context.createBuffer(2, Math.floor(context.sampleRate * 0.68), context.sampleRate);
    const random = randomSequence(7192);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index++) {
        const time = index / context.sampleRate;
        data[index] = time < 0.028 ? 0 : (random() * 2 - 1) * Math.exp(-time * 11) * 0.25;
      }
      [0.047, 0.083, 0.131].forEach((time, index) => {
        data[Math.floor((time + channel * 0.003) * context.sampleRate)] += 0.2 / (index + 1);
      });
    }
    return buffer;
  }

  _noiseBed({ pan, highpass, lowpass, gain, rate }) {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this._noise;
    source.loop = true;
    source.playbackRate.value = rate;
    const high = context.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = highpass;
    const low = context.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = lowpass;
    const volume = context.createGain();
    volume.gain.value = gain;
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    source.connect(high).connect(low).connect(volume).connect(panner).connect(this._mix);
    source.start(0, (pan + 1) * 2);
    this._bedNodes.push(source, high, low, volume, panner);
    return { source, volume, low };
  }

  _engineBed(pan, index) {
    const context = this.context;
    const fundamental = 43 + index * 17;
    const oscillators = [0, 1].map((offset) => {
      const oscillator = context.createOscillator();
      oscillator.setPeriodicWave(this._engineWave);
      oscillator.frequency.value = fundamental * (offset ? 1.013 : 1);
      return oscillator;
    });
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 360 + index * 75;
    filter.Q.value = 0.45;
    const volume = context.createGain();
    volume.gain.value = 0.023;
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    oscillators.forEach((oscillator) => {
      oscillator.connect(filter);
      oscillator.start();
    });
    filter.connect(volume).connect(panner).connect(this._mix);
    this._bedNodes.push(...oscillators, filter, volume, panner);
    return { oscillators, filter, volume, fundamental };
  }

  update(loopTimeSeconds, speedNormalized = 1, intensity = 1) {
    if (!Number.isFinite(loopTimeSeconds)) return;
    const time = ((loopTimeSeconds % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
    this._sceneTime = time;
    this._speed = Number.isFinite(speedNormalized) ? clamp(speedNormalized, 0, 2) : 1;
    this._intensity = Number.isFinite(intensity) ? clamp(intensity, 0, 2) : 1;
    if (!this.isStarted || this._disposed || this.paused || this.context.state !== 'running') return;

    if (this._lastTime !== null) {
      const difference = time - this._lastTime;
      if (difference < -LOOP_SECONDS / 2 && this._lastTime > LOOP_SECONDS - 3 && time < 3) {
        this._cycle++;
        for (const key of this._scheduled) if (Number(key.split(':')[0]) < this._cycle) this._scheduled.delete(key);
      } else if (difference < -0.1 || difference > 2) {
        this._cycle++;
        this._scheduled.clear();
        this._stopVoices();
      }
    }
    this._lastTime = time;
    const now = this.context.currentTime;
    const phase = time / LOOP_SECONDS * TAU;
    const activity = 0.8 + this._intensity * 0.2;
    this._mix.gain.setTargetAtTime(0.8 * activity, now, 0.4);
    this._road.volume.gain.setTargetAtTime(0.11 + this._speed * 0.035, now, 0.6);
    this._wind.volume.gain.setTargetAtTime(0.021 + this._speed * 0.033, now, 0.6);
    this._frying.volume.gain.setTargetAtTime(0.015 + (1 + Math.sin(phase * 5 + 1.2)) * 0.01, now, 1);
    this._crowdGain.gain.setTargetAtTime(0.44 + (1 + Math.sin(phase * 3 - 0.6)) * 0.08, now, 1);
    this._engines.forEach((engine, index) => {
      const rev = 1 + Math.sin(phase * (5 + index * 2) + index) * 0.12 + this._speed * 0.09;
      engine.oscillators.forEach((oscillator, offset) => {
        oscillator.frequency.setTargetAtTime(engine.fundamental * rev * (offset ? 1.013 : 1), now, 0.35);
      });
      engine.volume.gain.setTargetAtTime(0.016 + (1 + Math.sin(phase * (3 + index) + index * 2)) * 0.009, now, 0.6);
    });

    // A short horizon tolerates animation-frame jitter without queuing a whole scene.
    const horizon = 0.28;
    for (let index = 0; index < this._events.length; index++) {
      const event = this._events[index];
      let distance = event.time - time;
      let cycle = this._cycle;
      if (distance < -LOOP_SECONDS / 2) {
        distance += LOOP_SECONDS;
        cycle++;
      }
      if (distance < -0.09 || distance > horizon) continue;
      const key = `${cycle}:${index}`;
      if (this._scheduled.has(key)) continue;
      this._scheduled.add(key);
      this[`_${event.type}`](event, now + Math.max(0.008, distance));
    }
  }

  _voice(start, duration, pan = 0, reflection = false) {
    if (this._voices.size >= 48 || this._disposed) return null;
    const context = this.context;
    const gain = context.createGain();
    gain.gain.value = 0;
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    gain.connect(panner).connect(this._mix);
    if (reflection) panner.connect(this._reflections);
    const voice = { nodes: [gain, panner], sources: [], gain, panner, start, end: start + duration + 0.04, ended: false };
    this._voices.add(voice);
    return voice;
  }

  _node(voice, node) {
    voice.nodes.push(node);
    return node;
  }

  _source(voice, source, offset = 0) {
    voice.nodes.push(source);
    voice.sources.push(source);
    if (voice.sources.length === 1) source.onended = () => this._release(voice);
    if (source.buffer) source.start(voice.start, offset);
    else source.start(voice.start);
    source.stop(voice.end);
    return source;
  }

  _release(voice) {
    if (voice.ended) return;
    voice.ended = true;
    voice.sources.forEach((source) => {
      source.onended = null;
      try { source.stop(); } catch { /* A naturally ended source needs no further stop. */ }
    });
    voice.nodes.forEach((node) => node.disconnect());
    this._voices.delete(voice);
  }

  _stopVoices() {
    for (const voice of this._voices) this._release(voice);
  }

  _horn(event, start) {
    const random = randomSequence(event.seed);
    const kind = random();
    const car = kind > 0.73;
    const truck = kind > 0.965;
    const fundamental = truck ? 175 + random() * 35 : car ? 330 + random() * 45 : 390 + random() * 150;
    const pan = random() * 1.7 - 0.85;
    const distant = event.distant || random() > 0.65;
    const level = (distant ? 0.026 : 0.067) * (0.8 + random() * 0.4);
    const count = random() > 0.25 ? 2 + Math.floor(random() * 3) : 1;
    let offset = 0;
    for (let honk = 0; honk < count; honk++) {
      const duration = honk === count - 1 && random() > 0.7 ? 0.4 + random() * 0.5 : 0.075 + random() * 0.17;
      const time = start + offset;
      const voice = this._voice(time, duration + 0.055, pan, true);
      if (!voice) return;
      const filter = this._node(voice, this.context.createBiquadFilter());
      filter.type = 'lowpass';
      filter.frequency.value = distant ? 1600 : 3200;
      filter.Q.value = 0.6;
      filter.connect(voice.gain);
      const frequencies = car || truck ? [fundamental, fundamental * (truck ? 1.29 : 1.255)] : [fundamental];
      for (const frequency of frequencies) {
        const oscillator = this.context.createOscillator();
        oscillator.setPeriodicWave(this._hornWave);
        oscillator.frequency.setValueAtTime(frequency * 0.973, time);
        oscillator.frequency.linearRampToValueAtTime(frequency, time + 0.021);
        oscillator.frequency.linearRampToValueAtTime(frequency * (0.987 - random() * 0.009), time + duration);
        oscillator.detune.value = (random() - 0.5) * 9;
        oscillator.connect(filter);
        this._source(voice, oscillator);
      }
      const volume = level / Math.sqrt(frequencies.length);
      voice.gain.gain.setValueAtTime(0, time);
      voice.gain.gain.linearRampToValueAtTime(volume, time + 0.014);
      voice.gain.gain.setValueAtTime(volume * 0.91, time + duration * 0.65);
      voice.gain.gain.linearRampToValueAtTime(volume * 0.75, time + duration);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.045);
      voice.panner.pan.linearRampToValueAtTime(clamp(pan + (pan < 0 ? 0.12 : -0.12), -1, 1), time + duration);
      offset += duration + 0.085 + random() * 0.12;
    }
  }

  _vehicle(event, start) {
    const random = randomSequence(event.seed);
    const duration = 3.7 + random() * 4.5;
    const direction = random() > 0.5 ? 1 : -1;
    const close = random() > 0.47;
    const fundamental = 47 + random() * 47;
    const voice = this._voice(start, duration, direction * -0.86);
    if (!voice) return;
    const filter = this._node(voice, this.context.createBiquadFilter());
    filter.type = 'lowpass';
    filter.Q.value = 0.58;
    filter.frequency.setValueAtTime(250, start);
    filter.frequency.exponentialRampToValueAtTime(close ? 1750 : 800, start + duration * 0.44);
    filter.frequency.exponentialRampToValueAtTime(210, start + duration);
    filter.connect(voice.gain);
    for (let index = 0; index < 2; index++) {
      const oscillator = this.context.createOscillator();
      oscillator.setPeriodicWave(this._engineWave);
      const base = fundamental * (index ? 1.012 : 1);
      oscillator.frequency.setValueAtTime(base * 0.91, start);
      oscillator.frequency.exponentialRampToValueAtTime(base * 1.27, start + duration * 0.38);
      oscillator.frequency.exponentialRampToValueAtTime(base * 1.06, start + duration * 0.58);
      oscillator.frequency.exponentialRampToValueAtTime(base * 0.81, start + duration);
      oscillator.connect(filter);
      this._source(voice, oscillator);
    }
    const noise = this.context.createBufferSource();
    noise.buffer = this._noise;
    noise.loop = true;
    noise.playbackRate.value = 0.7 + random() * 0.5;
    const tireHigh = this._node(voice, this.context.createBiquadFilter());
    tireHigh.type = 'highpass';
    tireHigh.frequency.value = 650;
    const tireGain = this._node(voice, this.context.createGain());
    tireGain.gain.value = close ? 0.65 : 0.28;
    noise.connect(tireHigh).connect(tireGain).connect(filter);
    this._source(voice, noise, random() * 4);

    const level = (close ? 0.064 : 0.035) * (0.8 + random() * 0.4);
    voice.gain.gain.setValueAtTime(0, start);
    voice.gain.gain.linearRampToValueAtTime(level * 0.3, start + duration * 0.2);
    voice.gain.gain.linearRampToValueAtTime(level, start + duration * 0.46);
    voice.gain.gain.linearRampToValueAtTime(level * 0.65, start + duration * 0.6);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    voice.panner.pan.setValueAtTime(direction * -0.86, start);
    voice.panner.pan.linearRampToValueAtTime(direction * -0.4, start + duration * 0.33);
    voice.panner.pan.linearRampToValueAtTime(direction * 0.5, start + duration * 0.62);
    voice.panner.pan.linearRampToValueAtTime(direction * 0.92, start + duration);
  }

  _bell(event, start) {
    const random = randomSequence(event.seed);
    const fundamental = 1250 + random() * 600;
    const pan = random() > 0.5 ? -0.62 : 0.6;
    [0, 0.145, 0.34].forEach((offset, strike) => {
      const voice = this._voice(start + offset, 0.75, pan, true);
      if (!voice) return;
      [1, 2.71, 4.08].forEach((ratio, index) => {
        const oscillator = this.context.createOscillator();
        oscillator.frequency.value = fundamental * ratio;
        const partialGain = this._node(voice, this.context.createGain());
        partialGain.gain.setValueAtTime([1, 0.35, 0.12][index], voice.start);
        partialGain.gain.exponentialRampToValueAtTime(0.0001, voice.start + [0.7, 0.24, 0.12][index]);
        oscillator.connect(partialGain).connect(voice.gain);
        this._source(voice, oscillator);
      });
      voice.gain.gain.setValueAtTime(0, voice.start);
      voice.gain.gain.linearRampToValueAtTime(strike === 1 ? 0.018 : 0.027, voice.start + 0.003);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, voice.start + 0.72);
    });
  }

  _kitchen(event, start) {
    const random = randomSequence(event.seed);
    const hits = 2 + Math.floor(random() * 3);
    for (let hit = 0; hit < hits; hit++) {
      const time = start + hit * (0.12 + random() * 0.13);
      const duration = 0.18 + random() * 0.16;
      const voice = this._voice(time, duration, 0.65, true);
      if (!voice) return;
      const noise = this.context.createBufferSource();
      noise.buffer = this._noise;
      const filter = this._node(voice, this.context.createBiquadFilter());
      filter.type = 'bandpass';
      filter.frequency.value = 1800 + random() * 1400;
      filter.Q.value = 1.8;
      noise.connect(filter).connect(voice.gain);
      this._source(voice, noise, random() * 4);
      const oscillator = this.context.createOscillator();
      oscillator.frequency.value = 670 + random() * 150;
      const clang = this._node(voice, this.context.createGain());
      clang.gain.value = 0.11;
      oscillator.connect(clang).connect(voice.gain);
      this._source(voice, oscillator);
      voice.gain.gain.setValueAtTime(0, time);
      voice.gain.gain.linearRampToValueAtTime(0.035, time + 0.002);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    }
  }

  _dog(event, start) {
    const random = randomSequence(event.seed);
    const count = random() > 0.6 ? 3 : 2;
    const pan = -0.7 + random() * 0.3;
    for (let bark = 0; bark < count; bark++) {
      const time = start + bark * (0.32 + random() * 0.08);
      const duration = 0.19 + random() * 0.06;
      const voice = this._voice(time, duration, pan, true);
      if (!voice) return;
      const filter = this._node(voice, this.context.createBiquadFilter());
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(740, time);
      filter.frequency.exponentialRampToValueAtTime(360, time + duration);
      filter.Q.value = 1.2;
      filter.connect(voice.gain);
      const oscillator = this.context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(190 + random() * 25, time);
      oscillator.frequency.exponentialRampToValueAtTime(95, time + duration);
      oscillator.connect(filter);
      this._source(voice, oscillator);
      const noise = this.context.createBufferSource();
      noise.buffer = this._noise;
      const noiseGain = this._node(voice, this.context.createGain());
      noiseGain.gain.value = 1.3;
      noise.connect(noiseGain).connect(filter);
      this._source(voice, noise, random() * 4);
      voice.gain.gain.setValueAtTime(0, time);
      voice.gain.gain.linearRampToValueAtTime(0.05, time + 0.018);
      voice.gain.gain.linearRampToValueAtTime(0.021, time + 0.065);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.isStarted = false;
    this._stopVoices();
    this._bedNodes.forEach((node) => {
      if (typeof node.stop === 'function') {
        try { node.stop(); } catch { /* Already stopped during teardown. */ }
      }
      node.disconnect();
    });
    this._bedNodes.length = 0;
    this._scheduled.clear();
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this._noise = null;
    this._crowd = null;
  }
}

export default StreetAudio;
