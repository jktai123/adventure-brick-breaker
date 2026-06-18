import type { Particle } from './types';

class ParticleSystem {
  private particles: Particle[] = [];

  constructor() {}

  public clear() {
    this.particles = [];
  }

  public addParticle(particle: Particle) {
    this.particles.push(particle);
  }

  // 1. 磚塊碎裂粒子
  public createBrickExplosion(x: number, y: number, color: string, count = 15) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1, // 稍微向上噴灑
        color,
        size: 3 + Math.random() * 4,
        alpha: 1.0,
        decay: 0.02 + Math.random() * 0.02,
        gravity: 0.1, // 有重力會往下掉
      });
    }
  }

  // 2. 球尾跡粒子
  public createBallTrail(x: number, y: number, color: string, radius: number) {
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      color,
      size: radius * (0.6 + Math.random() * 0.4),
      alpha: 0.5,
      decay: 0.04,
    });
  }

  // 3. 擋板碰撞火花
  public createPaddleSparkle(x: number, y: number, color: string, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI * (0.2 + Math.random() * 0.6); // 往上噴射
      const speed = 2 + Math.random() * 5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 2 + Math.random() * 3,
        alpha: 1.0,
        decay: 0.03 + Math.random() * 0.02,
        gravity: 0.05,
      });
    }
  }

  // 4. Boss 受擊噴濺
  public createBossHit(x: number, y: number, color: string, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        size: 3 + Math.random() * 3,
        alpha: 1.0,
        decay: 0.03 + Math.random() * 0.02,
        gravity: 0.08,
      });
    }
  }

  // 5. 烈焰隕石技能粒子
  public createMeteorFire(x: number, y: number, radius: number) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;
    
    // 橘色、紅色或黃色粒子
    const colors = ['#ff3300', '#ff9900', '#ffcc00'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    this.particles.push({
      x: px,
      y: py,
      vx: (Math.random() - 0.5) * 1,
      vy: -1 - Math.random() * 2, // 向上飄
      color,
      size: 2 + Math.random() * 4,
      alpha: 0.8,
      decay: 0.03,
    });
  }

  // 6. 海洋氣泡粒子
  public createOceanBubbles(x: number, y: number, width: number, chance = 0.1) {
    if (Math.random() > chance) return;
    const px = x + Math.random() * width;
    this.particles.push({
      x: px,
      y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -0.5 - Math.random() * 1.5, // 向上飄
      color: 'rgba(173, 216, 230, 0.4)', // 淺藍透明
      size: 2 + Math.random() * 5,
      alpha: 0.6,
      decay: 0.005 + Math.random() * 0.005,
    });
  }

  // 更新所有粒子狀態
  public update(timeScale = 1.0) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * timeScale;
      p.y += p.vy * timeScale;
      if (p.gravity) {
        p.y += p.gravity * timeScale;
      }
      p.alpha -= p.decay * timeScale;

      if (p.alpha <= 0 || p.size <= 0.1) {
        this.particles.splice(i, 1);
      }
    }
  }

  // 繪製所有粒子
  public draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      
      // 尾跡與技能粒子加點發光效果
      if (p.color.startsWith('#ff') || p.color.includes('rgba(173')) {
        ctx.shadowBlur = p.size;
        ctx.shadowColor = p.color;
      } else {
        ctx.shadowBlur = 0;
      }
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export const particles = new ParticleSystem();
export default particles;
