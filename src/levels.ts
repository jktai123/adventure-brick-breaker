import type { LevelConfig, Brick, BrickType, Boss } from './types';
import { particles } from './particles';
import { audio } from './audio';

export const LEVELS: LevelConfig[] = [
  {
    theme: 'FOREST',
    name: '迷霧森林 (Mist Forest)',
    description: '茂密的古老森林。這裡的藤蔓會吸收能量，樹妖守護著這片土地。',
    brickRows: 5,
    brickCols: 9,
    bossName: '樹妖長老 (Ancient Treant)',
    bossMaxHp: 80,
    backgroundColor: '#0a1c0a',
    primaryColor: '#2e8b57',
  },
  {
    theme: 'DESERT',
    name: '炙熱沙丘 (Scorching Dunes)',
    description: '狂風呼嘯的流砂地帶。流砂會帶著磚塊飄移，小心仙人掌的反彈刺針。',
    brickRows: 6,
    brickCols: 10,
    bossName: '狂沙死神 (Desert Scorpion)',
    bossMaxHp: 120,
    backgroundColor: '#1c140a',
    primaryColor: '#d2b48c',
  },
  {
    theme: 'OCEAN',
    name: '深淵之海 (Abyssal Ocean)',
    description: '深邃冰冷的海洋。冰塊會凍結彈珠，珊瑚會在水流中緩慢再生。',
    brickRows: 6,
    brickCols: 10,
    bossName: '深淵巨妖 (Kraken)',
    bossMaxHp: 160,
    backgroundColor: '#051120',
    primaryColor: '#1e90ff',
  },
];

// 生成關卡磚塊
export function generateBricks(levelIndex: number, canvasWidth: number): Brick[] {
  const config = LEVELS[levelIndex];
  const bricks: Brick[] = [];
  const padding = 10;
  const topOffset = 80;
  const brickWidth = (canvasWidth - padding * (config.brickCols + 1)) / config.brickCols;
  const brickHeight = 25;

  for (let row = 0; row < config.brickRows; row++) {
    for (let col = 0; col < config.brickCols; col++) {
      const x = padding + col * (brickWidth + padding);
      const y = topOffset + row * (brickHeight + padding);
      
      let type: BrickType = 'NORMAL';
      let hp = 1;
      let color = '#2e8b57';
      let goldValue = 2;

      const id = `brick_${row}_${col}`;

      if (config.theme === 'FOREST') {
        if (row === 0) {
          type = 'VINE';
          hp = 3;
          color = '#228b22'; // 深森林綠
          goldValue = 6;
        } else if (row === 1 || row === 2) {
          type = 'WOOD';
          hp = 2;
          color = '#8b5a2b'; // 木褐色
          goldValue = 4;
        } else {
          type = 'NORMAL';
          hp = 1;
          color = '#3cb371'; // 嫩綠色
          goldValue = 2;
        }
      } else if (config.theme === 'DESERT') {
        // 沙漠特色：流砂磚塊、仙人掌磚塊、金屬磚塊
        if ((row === 1 || row === 3) && (col === 2 || col === 5 || col === 7)) {
          type = 'SAND_DRIFT';
          hp = 1;
          color = '#e0b034'; // 琥珀流砂
          goldValue = 5;
        } else if (row === 0 && (col === 0 || col === config.brickCols - 1)) {
          type = 'METAL';
          hp = 99; // 不可破壞
          color = '#708090'; // 鋼鐵灰
          goldValue = 0;
        } else if (row === 2 && col % 3 === 1) {
          type = 'CACTUS';
          hp = 1;
          color = '#556b2f'; // 仙人掌綠
          goldValue = 4;
        } else {
          type = 'NORMAL';
          hp = 1;
          color = '#edc9af'; // 沙色
          goldValue = 2;
        }
      } else if (config.theme === 'OCEAN') {
        // 海洋特色：冰結磚塊、泡泡磚塊、珊瑚磚塊
        if (row === 0 || row === 1) {
          type = 'ICE';
          hp = 2;
          color = '#add8e6'; // 冰晶藍
          goldValue = 5;
        } else if (row === 2 && (col === 1 || col === 4 || col === 8)) {
          type = 'CORAL';
          hp = 2;
          color = '#ff7f50'; // 珊瑚橘粉
          goldValue = 6;
        } else if (row === 3 && col % 3 === 0) {
          type = 'BUBBLE';
          hp = 1;
          color = '#e0ffff'; // 泡泡亮藍
          goldValue = 3;
        } else {
          type = 'NORMAL';
          hp = 1;
          color = '#4682b4'; // 鋼青藍
          goldValue = 2;
        }
      }

      bricks.push({
        id,
        x,
        y,
        width: brickWidth,
        height: brickHeight,
        type,
        hp,
        maxHp: hp,
        color,
        goldValue,
        
        // 沙漠飄移初始化
        driftSpeed: type === 'SAND_DRIFT' ? 0.3 + Math.random() * 0.4 : 0,
        driftRange: type === 'SAND_DRIFT' ? 40 : 0,
        driftDirection: Math.random() > 0.5 ? 1 : -1,
        startX: x,
        
        // 珊瑚修復計時
        lastHurtTime: Date.now()
      });
    }
  }

  return bricks;
}

// 建立關卡 Boss
export function spawnBoss(levelIndex: number, canvasWidth: number): Boss {
  const config = LEVELS[levelIndex];
  return {
    x: canvasWidth / 2 - 100,
    y: 70,
    width: 200,
    height: 60,
    hp: config.bossMaxHp,
    maxHp: config.bossMaxHp,
    name: config.bossName,
    state: 'IDLE',
    stateTimer: 0,
    actionTimer: 0,
    color: config.theme === 'FOREST' ? '#1b4d3e' : config.theme === 'DESERT' ? '#b8860b' : '#191970',
    theme: config.theme,
    projectiles: [],
    inkOverlayAlpha: 0
  };
}

// 更新 Boss 行為
export function updateBossAI(
  boss: Boss,
  canvasWidth: number,
  paddleX: number,
  paddleWidth: number,
  deltaTime: number // 毫秒
) {
  // Boss 緩慢地左右移動
  const speed = boss.theme === 'FOREST' ? 1.0 : boss.theme === 'DESERT' ? 1.5 : 0.8;
  const t = Date.now() / 1000;
  const centerRange = (canvasWidth - boss.width) / 2;
  boss.x = centerRange + Math.sin(t * speed) * centerRange * 0.8;

  // 狀態計時器
  if (boss.stateTimer > 0) {
    boss.stateTimer -= deltaTime;
    if (boss.stateTimer <= 0) {
      boss.state = 'IDLE';
    }
  }

  // 降低墨汁覆蓋率 (海洋 Boss 專用屬性遞減)
  if (boss.inkOverlayAlpha !== undefined && boss.inkOverlayAlpha > 0) {
    boss.inkOverlayAlpha -= deltaTime / 6000; // 6秒內退去
    if (boss.inkOverlayAlpha < 0) boss.inkOverlayAlpha = 0;
  }

  // Boss 行動技能冷卻
  boss.actionTimer += deltaTime;
  const attackInterval = boss.theme === 'FOREST' ? 3000 : boss.theme === 'DESERT' ? 2500 : 3500;

  if (boss.actionTimer >= attackInterval) {
    boss.actionTimer = 0;
    boss.state = 'ATTACKING';
    boss.stateTimer = 800; // 攻擊姿勢維持 0.8 秒
    audio.playBossCast();

    // 根據關卡發動不同技能
    if (boss.theme === 'FOREST') {
      // 樹妖：向下扇形發射 3 顆落葉
      const projCount = 3;
      for (let i = 0; i < projCount; i++) {
        const angle = Math.PI / 2 + (i - 1) * 0.25; // 90度左右偏差
        const projSpeed = 3.5;
        boss.projectiles.push({
          id: `leaf_${Date.now()}_${i}`,
          x: boss.x + boss.width / 2,
          y: boss.y + boss.height,
          vx: Math.cos(angle) * projSpeed,
          vy: Math.sin(angle) * projSpeed,
          radius: 8,
          type: 'LEAF',
          color: '#32cd32'
        });
      }
      particles.createBossHit(boss.x + boss.width / 2, boss.y + boss.height, '#228b22', 15);
    } else if (boss.theme === 'DESERT') {
      // 沙漠死神：朝玩家當前位置發射沙刺彈幕
      const targetX = paddleX + paddleWidth / 2;
      const bossCenterX = boss.x + boss.width / 2;
      const bossCenterY = boss.y + boss.height;
      const dx = targetX - bossCenterX;
      const dy = 550 - bossCenterY; // 玩家擋板大約 y = 550
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const projSpeed = 5;
      boss.projectiles.push({
        id: `thorn_${Date.now()}`,
        x: bossCenterX,
        y: bossCenterY,
        vx: (dx / dist) * projSpeed,
        vy: (dy / dist) * projSpeed,
        radius: 6,
        type: 'THORN',
        color: '#ffd700'
      });
      particles.createBossHit(bossCenterX, bossCenterY, '#daa520', 10);
    } else if (boss.theme === 'OCEAN') {
      // 克拉肯：發射一顆巨型墨汁彈
      const targetX = paddleX + paddleWidth / 2;
      const bossCenterX = boss.x + boss.width / 2;
      const bossCenterY = boss.y + boss.height;
      const dx = targetX - bossCenterX;
      const dy = 550 - bossCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const projSpeed = 4;
      boss.projectiles.push({
        id: `ink_${Date.now()}`,
        x: bossCenterX,
        y: bossCenterY,
        vx: (dx / dist) * projSpeed,
        vy: (dy / dist) * projSpeed,
        radius: 12,
        type: 'INK_BLOB',
        color: '#111111'
      });
      particles.createBossHit(bossCenterX, bossCenterY, '#000080', 12);
    }
  }
}
