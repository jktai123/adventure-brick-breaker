export type GameStatus = 'START' | 'LEVEL_SELECT' | 'PLAYING' | 'SHOP' | 'GAME_OVER' | 'VICTORY';

export type LevelTheme = 'FOREST' | 'DESERT' | 'OCEAN';

export interface Vector2D {
  x: number;
  y: number;
}

export interface Ball {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speed: number;
  baseSpeed: number;
  damage: number;
  color: string;
  trailColor: string;
  isFireball: boolean; // 烈焰隕石技能狀態：可穿透磚塊且傷害加倍
  isSticky: boolean;   // 是否處於黏性狀態
  isGlued: boolean;    // 是否目前黏在擋板上
  glueOffset: number;  // 黏在擋板上的 x 軸相對偏移量
}

export interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  color: string;
  shieldActive: boolean; // 沙漠盾牌，可防漏球一次
  stickyActive: boolean; // 是否啟用黏性
  laserActive: boolean;  // 是否啟用雷射射擊
  laserTimer: number;    // 雷射剩餘時間
  laserCooldown: number; // 射擊冷卻
}

export type BrickType =
  | 'NORMAL'       // 普通磚塊 (1 HP)
  | 'WOOD'         // 木磚塊 (2 HP)
  | 'VINE'         // 藤蔓磚塊 (3 HP, 森林特色，打中會帶有綠葉粒子)
  | 'SAND_DRIFT'   // 流砂磚塊 (1 HP, 沙漠特色，左右緩慢飄移)
  | 'CACTUS'       // 仙人掌磚塊 (1 HP, 沙漠特色，被擊中時朝下方發射刺)
  | 'ICE'          // 冰結磚塊 (2 HP, 海洋特色，球擊中後球速減慢 30% 持續 3 秒)
  | 'BUBBLE'       // 泡泡磚塊 (1 HP, 海洋特色，打破時釋放向上飄的氣泡，可彈起球)
  | 'CORAL'        // 珊瑚磚塊 (2 HP, 海洋特色，如果沒被打碎，每 10 秒回復 1 HP)
  | 'METAL';       // 金屬磚塊 (不可破壞，或 99 HP)

export interface Brick {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: BrickType;
  hp: number;
  maxHp: number;
  color: string;
  goldValue: number;
  
  // 流砂磚塊屬性
  driftSpeed?: number;
  driftRange?: number;
  driftDirection?: number; // 1 or -1
  startX?: number;
  
  // 珊瑚磚塊屬性
  lastHurtTime?: number;
}

export interface BossProjectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type: 'LEAF' | 'THORN' | 'INK_BLOB';
  color: string;
}

export interface LaserBullet {
  id: string;
  x: number;
  y: number;
  vy: number;
  width: number;
  height: number;
  color: string;
}

export interface Boss {
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  name: string;
  state: 'IDLE' | 'ATTACKING' | 'HURT';
  stateTimer: number;
  actionTimer: number;
  projectiles: BossProjectile[];
  color: string;
  theme: LevelTheme;
  inkOverlayAlpha?: number; // 海洋Boss墨汁遮罩透明度
}

export type ItemType =
  | 'MULTIBALL'   // 分裂成 3 顆球
  | 'EXPAND'      // 擋板變寬 1.5 倍
  | 'LASER'       // 擋板可按空白鍵發射雷射
  | 'SHIELD'      // 底層防漏球護盾
  | 'STICKY'      // 擋板黏球
  | 'HEAL'        // 回復 1 HP
  | 'GOLD'        // 獲得額外 10 金幣
  | 'MANA';       // 回復 20 MP

export interface DroppedItem {
  id: string;
  x: number;
  y: number;
  vy: number;
  type: ItemType;
  radius: number;
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
  gravity?: number;
}

export interface UpgradeOption {
  id: string;
  name: string;
  cost: number;
  level: number;
  maxLevel: number;
  description: string;
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  gold: number;
  score: number;
  mp: number;
  maxMp: number;
  levelIndex: number; // 0: 森林, 1: 沙漠, 2: 海洋
  skills: {
    fireMeteor: {
      cost: number;
      cooldown: number; // 毫秒
      currentCooldown: number;
    };
    timeSlow: {
      cost: number;
      cooldown: number;
      currentCooldown: number;
      activeTimer: number; // 技能啟動持續時間
    };
  };
  upgrades: {
    hp: number;         // 升級次數
    paddleWidth: number;
    ballDamage: number;
    goldBonus: number;
  };
}

export interface LevelConfig {
  theme: LevelTheme;
  name: string;
  description: string;
  brickRows: number;
  brickCols: number;
  bossName: string;
  bossMaxHp: number;
  backgroundColor: string;
  primaryColor: string;
}
