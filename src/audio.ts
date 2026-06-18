class AudioManager {
  private ctx: AudioContext | null = null;
  private masterVolume: GainNode | null = null;

  constructor() {
    // 延遲初始化，直到使用者點擊以符合瀏覽器安全性政策
  }

  private init() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      this.ctx = new AudioContextClass();
      this.masterVolume = this.ctx.createGain();
      this.masterVolume.gain.setValueAtTime(0.3, this.ctx.currentTime); // 預設主音量 30%
      this.masterVolume.connect(this.ctx.destination);
    }
  }

  public resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainStart = 1,
    gainEnd = 0.001
  ) {
    this.resume();
    if (!this.ctx || !this.masterVolume) return;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, this.ctx.currentTime + duration);

    gainNode.gain.setValueAtTime(gainStart, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(gainEnd, this.ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.masterVolume);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  public playHitPaddle() {
    // 短促的清脆回音
    this.playTone(300, 150, 0.08, 'triangle', 0.8);
  }

  public playHitBrick(type: string) {
    let freq = 440;
    let duration = 0.1;
    let oscType: OscillatorType = 'sine';

    switch (type) {
      case 'WOOD':
        freq = 220;
        duration = 0.15;
        oscType = 'triangle';
        break;
      case 'VINE':
        freq = 330;
        duration = 0.12;
        oscType = 'triangle';
        break;
      case 'ICE':
        freq = 880;
        duration = 0.2;
        oscType = 'sine';
        break;
      case 'METAL':
        freq = 1200;
        duration = 0.05;
        oscType = 'sawtooth';
        break;
      default:
        freq = 440;
        duration = 0.08;
    }

    this.playTone(freq, freq * 0.8, duration, oscType, 0.6);
  }

  public playBreakBrick() {
    // 模擬磚塊碎裂（噪聲加上低沉爆破）
    this.resume();
    if (!this.ctx || !this.masterVolume) return;

    const bufferSize = this.ctx.sampleRate * 0.15; // 0.15 秒的噪聲
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.7, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterVolume);

    noise.start();
    noise.stop(this.ctx.currentTime + 0.15);

    // 額外加上一個低頻撞擊音
    this.playTone(150, 60, 0.15, 'triangle', 0.8);
  }

  public playPowerup() {
    // 快速上升的琶音 (琶音: C4, E4, G4, C5)
    const playStep = (freq: number, delay: number) => {
      setTimeout(() => {
        this.playTone(freq, freq * 1.2, 0.15, 'sine', 0.5);
      }, delay * 1000);
    };

    playStep(261.63, 0);      // C4
    playStep(329.63, 0.05);   // E4
    playStep(392.00, 0.10);   // G4
    playStep(523.25, 0.15);   // C5
  }

  public playShoot() {
    // 雷射射擊聲（高頻到低頻的掃頻）
    this.playTone(880, 220, 0.12, 'sawtooth', 0.3);
  }

  public playPlayerHurt() {
    // 沉重、警告意味的聲音
    this.playTone(180, 80, 0.3, 'sawtooth', 0.9);
  }

  public playBossHurt() {
    // 巨獸受傷聲
    this.playTone(120, 40, 0.4, 'triangle', 1.0);
    // 搭配爆破雜音
    setTimeout(() => this.playBreakBrick(), 50);
  }

  public playBossCast() {
    // Boss 施法聲
    this.playTone(300, 600, 0.25, 'sine', 0.4);
  }

  public playVictory() {
    this.resume();
    if (!this.ctx) return;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C 大調
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, freq, 0.4, 'sine', 0.6);
      }, idx * 80);
    });
  }

  public playGameOver() {
    this.resume();
    if (!this.ctx) return;
    const notes = [392.00, 349.23, 311.13, 246.94]; // 下行小調/不和諧音
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, freq * 0.9, 0.5, 'sawtooth', 0.6);
      }, idx * 150);
    });
  }
}

export const audio = new AudioManager();
export default audio;
