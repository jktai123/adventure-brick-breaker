import './style.css';
import type { GameStatus, Ball, Paddle, Brick, DroppedItem, LaserBullet, Boss, PlayerStats, ItemType, BossProjectile } from './types';
import { audio } from './audio';
import { particles } from './particles';
import {
  checkBallPaddleCollision,
  checkBallBrickCollision,
  checkBallBossCollision,
  updateBallBoundaries,
  updateLaserBullets,
  updateDroppedItems,
  updateBossProjectiles
} from './engine';
import { LEVELS, generateBricks, spawnBoss, updateBossAI } from './levels';

// 遊戲全域變數
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

let status: GameStatus = 'START';
let balls: Ball[] = [];
let paddle: Paddle;
let bricks: Brick[] = [];
let boss: Boss | null = null;
let droppedItems: DroppedItem[] = [];
let laserBullets: LaserBullet[] = [];

// 玩家屬性
let playerStats: PlayerStats = {
  hp: 3,
  maxHp: 3,
  gold: 0,
  score: 0,
  mp: 100,
  maxMp: 100,
  levelIndex: 0,
  skills: {
    fireMeteor: { cost: 40, cooldown: 8000, currentCooldown: 0 },
    timeSlow: { cost: 30, cooldown: 12000, currentCooldown: 0, activeTimer: 0 }
  },
  upgrades: {
    hp: 0,
    paddleWidth: 0,
    ballDamage: 0,
    goldBonus: 0
  }
};

// 操控變數
const keysPressed: { [key: string]: boolean } = {};
let mouseX = 400; // 預設中間

// 特效變數
let screenShakeTimer = 0;
let screenShakeIntensity = 0;
let lastTime = 0;

// 初始化遊戲
window.addEventListener('load', () => {
  canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  
  // 設定 Canvas 解晰度
  canvas.width = 800;
  canvas.height = 600;

  initInput();
  initUI();
  
  // 開始動畫迴圈
  requestAnimationFrame(gameLoop);
  
  // 顯示初始畫面
  switchStatus('START');
});

// 初始化輸入監聽
function initInput() {
  window.addEventListener('keydown', (e) => {
    keysPressed[e.key] = true;
    keysPressed[e.code] = true;
    
    // 空白鍵發射球或雷射
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault(); // 防止滾動網頁
      fireGluedBall();
    }
    
    // 技能快捷鍵
    if (e.key === '1') useFireMeteor();
    if (e.key === '2') useTimeSlow();
  });

  window.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
    keysPressed[e.code] = false;
  });

  // 滑鼠/觸控控制
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    // 依據比例換算 Canvas 內座標
    mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
  });

  canvas.addEventListener('click', () => {
    audio.resume();
    if (status === 'PLAYING') {
      fireGluedBall();
    }
  });
}

// 釋放被黏住的球
function fireGluedBall() {
  let firedAny = false;
  for (const ball of balls) {
    if (ball.isGlued) {
      ball.isGlued = false;
      const angle = (Math.random() - 0.5) * 0.4; // 隨機小角度偏折
      ball.vx = ball.speed * Math.sin(angle);
      ball.vy = -ball.speed * Math.cos(angle);
      firedAny = true;
    }
  }
  if (firedAny) {
    audio.playHitPaddle();
  }
}

// 初始化 UI 按鈕
function initUI() {
  document.getElementById('btnStart')?.addEventListener('click', () => {
    audio.resume();
    switchStatus('LEVEL_SELECT');
  });

  // 關卡選擇
  const levelButtons = document.querySelectorAll('.level-card');
  levelButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-level') || '0');
      playerStats.levelIndex = idx;
      startLevel();
    });
  });

  // 技能按鈕
  document.getElementById('skillMeteor')?.addEventListener('click', () => {
    useFireMeteor();
  });
  document.getElementById('skillTimeSlow')?.addEventListener('click', () => {
    useTimeSlow();
  });

  // 商店按鈕
  document.getElementById('btnShopBack')?.addEventListener('click', () => {
    switchStatus('LEVEL_SELECT');
  });

  // 商店升級項目
  document.getElementById('buyHp')?.addEventListener('click', () => buyUpgrade('hp'));
  document.getElementById('buyWidth')?.addEventListener('click', () => buyUpgrade('paddleWidth'));
  document.getElementById('buyDamage')?.addEventListener('click', () => buyUpgrade('ballDamage'));
  document.getElementById('buyGold')?.addEventListener('click', () => buyUpgrade('goldBonus'));

  // 結算畫面
  document.getElementById('btnOverRestart')?.addEventListener('click', () => {
    resetPlayer();
    switchStatus('LEVEL_SELECT');
  });
  document.getElementById('btnVicNext')?.addEventListener('click', () => {
    switchStatus('SHOP');
  });
}

// 重設玩家所有數值
function resetPlayer() {
  playerStats = {
    hp: 3,
    maxHp: 3,
    gold: 0,
    score: 0,
    mp: 100,
    maxMp: 100,
    levelIndex: 0,
    skills: {
      fireMeteor: { cost: 40, cooldown: 8000, currentCooldown: 0 },
      timeSlow: { cost: 30, cooldown: 12000, currentCooldown: 0, activeTimer: 0 }
    },
    upgrades: {
      hp: 0,
      paddleWidth: 0,
      ballDamage: 0,
      goldBonus: 0
    }
  };
  updateUI();
}

// 切換遊戲狀態
function switchStatus(newStatus: GameStatus) {
  status = newStatus;
  
  // 隱藏所有面板
  document.getElementById('screenStart')?.classList.add('hidden');
  document.getElementById('screenLevelSelect')?.classList.add('hidden');
  document.getElementById('screenShop')?.classList.add('hidden');
  document.getElementById('screenGameOver')?.classList.add('hidden');
  document.getElementById('screenVictory')?.classList.add('hidden');
  document.getElementById('gameOverlayUI')?.classList.add('hidden');

  if (newStatus === 'START') {
    document.getElementById('screenStart')?.classList.remove('hidden');
  } else if (newStatus === 'LEVEL_SELECT') {
    document.getElementById('screenLevelSelect')?.classList.remove('hidden');
    // 解鎖按鈕視覺控制
    const cards = document.querySelectorAll('.level-card');
    cards.forEach((card, idx) => {
      if (idx === 0) {
        card.classList.remove('locked');
      } else {
        // 解鎖條件：玩家累積的分數或直接讓玩家自由選擇
        card.classList.remove('locked');
      }
    });
  } else if (newStatus === 'SHOP') {
    document.getElementById('screenShop')?.classList.remove('hidden');
    updateShopUI();
  } else if (newStatus === 'GAME_OVER') {
    document.getElementById('screenGameOver')?.classList.remove('hidden');
    document.getElementById('overScore')!.innerText = `最終分數: ${playerStats.score}`;
    audio.playGameOver();
  } else if (newStatus === 'VICTORY') {
    document.getElementById('screenVictory')?.classList.remove('hidden');
    document.getElementById('vicScore')!.innerText = `通關分數: ${playerStats.score}`;
    audio.playVictory();
  } else if (newStatus === 'PLAYING') {
    document.getElementById('gameOverlayUI')?.classList.remove('hidden');
  }
}

// 開始關卡
function startLevel() {
  const config = LEVELS[playerStats.levelIndex];
  
  // 1. 初始化擋板
  const pWidth = 100 + playerStats.upgrades.paddleWidth * 20;
  paddle = {
    x: canvas.width / 2 - pWidth / 2,
    y: canvas.height - 40,
    width: pWidth,
    height: 15,
    speed: 8,
    color: config.primaryColor,
    shieldActive: false,
    stickyActive: false,
    laserActive: false,
    laserTimer: 0,
    laserCooldown: 0
  };

  // 2. 初始化第一顆球
  balls = [createBaseBall(canvas.width / 2, paddle.y - 12)];

  // 3. 生成磚塊
  bricks = generateBricks(playerStats.levelIndex, canvas.width);
  
  // 4. 重置 Boss、道具、粒子與子彈
  boss = null;
  droppedItems = [];
  laserBullets = [];
  particles.clear();
  
  // 重置技能冷卻與持續
  playerStats.skills.timeSlow.activeTimer = 0;
  playerStats.skills.fireMeteor.currentCooldown = 0;
  playerStats.skills.timeSlow.currentCooldown = 0;
  playerStats.mp = playerStats.maxMp; // 進入關卡補滿 MP

  updateUI();
  switchStatus('PLAYING');
}

// 建立一顆基礎彈珠
function createBaseBall(x: number, y: number): Ball {
  const baseDmg = 1 + playerStats.upgrades.ballDamage;
  const config = LEVELS[playerStats.levelIndex];
  return {
    id: `ball_${Date.now()}_${Math.random()}`,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 8,
    speed: 5.5,
    baseSpeed: 5.5,
    damage: baseDmg,
    color: '#ffffff',
    trailColor: config.primaryColor,
    isFireball: false,
    isSticky: false,
    isGlued: true,
    glueOffset: 0
  };
}

// 使用「烈焰流星」主動技能
function useFireMeteor() {
  if (status !== 'PLAYING') return;
  const skill = playerStats.skills.fireMeteor;
  if (skill.currentCooldown > 0) return;
  if (playerStats.mp < skill.cost) return;

  // 扣除 MP
  playerStats.mp -= skill.cost;
  skill.currentCooldown = skill.cooldown;

  // 召喚 3 顆隕石大火球
  audio.playPowerup();
  triggerScreenShake(8, 300);

  for (let i = 0; i < 3; i++) {
    const rx = canvas.width * (0.25 + i * 0.25);
    const ry = 100;
    const fireball: Ball = {
      id: `meteor_${Date.now()}_${i}`,
      x: rx,
      y: ry,
      vx: (Math.random() - 0.5) * 3,
      vy: 4 + Math.random() * 2,
      radius: 12,
      speed: 6.5,
      baseSpeed: 6.5,
      damage: (1 + playerStats.upgrades.ballDamage) * 2,
      color: '#ff4500',
      trailColor: '#ff8c00',
      isFireball: true,
      isSticky: false,
      isGlued: false,
      glueOffset: 0
    };
    balls.push(fireball);
  }

  // 5秒後把所有火球標記移除(或讓它們自然掉落)
  setTimeout(() => {
    balls.forEach((b) => {
      if (b.isFireball) {
        b.isFireball = false;
        b.color = '#ffffff';
        b.radius = 8;
      }
    });
  }, 5000);

  updateUI();
}

// 使用「時空減速」主動技能
function useTimeSlow() {
  if (status !== 'PLAYING') return;
  const skill = playerStats.skills.timeSlow;
  if (skill.currentCooldown > 0) return;
  if (playerStats.mp < skill.cost) return;

  // 扣除 MP
  playerStats.mp -= skill.cost;
  skill.currentCooldown = skill.cooldown;
  skill.activeTimer = 5000; // 持續 5 秒

  audio.playPowerup();
  triggerScreenShake(4, 200);

  updateUI();
}

// 觸發畫面抖動
function triggerScreenShake(intensity: number, duration: number) {
  screenShakeIntensity = intensity;
  screenShakeTimer = duration;
}

// 商店升級購買邏輯
function buyUpgrade(type: 'hp' | 'paddleWidth' | 'ballDamage' | 'goldBonus') {
  let cost = 0;
  const currentLvl = playerStats.upgrades[type];
  
  if (type === 'hp') {
    cost = 15 + currentLvl * 15;
  } else if (type === 'paddleWidth') {
    cost = 20 + currentLvl * 15;
  } else if (type === 'ballDamage') {
    cost = 30 + currentLvl * 25;
  } else if (type === 'goldBonus') {
    cost = 25 + currentLvl * 20;
  }

  if (playerStats.gold >= cost) {
    playerStats.gold -= cost;
    playerStats.upgrades[type]++;
    
    if (type === 'hp') {
      playerStats.maxHp++;
      playerStats.hp = playerStats.maxHp; // 升級順便補滿血
    }

    audio.playPowerup();
    updateShopUI();
    updateUI();
  } else {
    audio.playPlayerHurt(); // 錢不夠的警告音
  }
}

// 更新商店 UI 價格與等級
function updateShopUI() {
  document.getElementById('shopGold')!.innerText = playerStats.gold.toString();

  const hpCost = 15 + playerStats.upgrades.hp * 15;
  const widthCost = 20 + playerStats.upgrades.paddleWidth * 15;
  const dmgCost = 30 + playerStats.upgrades.ballDamage * 25;
  const goldCost = 25 + playerStats.upgrades.goldBonus * 20;

  document.getElementById('hpCost')!.innerText = `${hpCost} 金幣`;
  document.getElementById('hpLevel')!.innerText = `Lv. ${playerStats.upgrades.hp}`;
  
  document.getElementById('widthCost')!.innerText = `${widthCost} 金幣`;
  document.getElementById('widthLevel')!.innerText = `Lv. ${playerStats.upgrades.paddleWidth}`;

  document.getElementById('dmgCost')!.innerText = `${dmgCost} 金幣`;
  document.getElementById('dmgLevel')!.innerText = `Lv. ${playerStats.upgrades.ballDamage}`;

  document.getElementById('goldCost')!.innerText = `${goldCost} 金幣`;
  document.getElementById('goldLevel')!.innerText = `Lv. ${playerStats.upgrades.goldBonus}`;
}

// 更新頂端戰鬥 UI
function updateUI() {
  // HP UI 更新
  const hpContainer = document.getElementById('uiHp');
  if (hpContainer) {
    hpContainer.innerHTML = '';
    for (let i = 0; i < playerStats.maxHp; i++) {
      const heart = document.createElement('span');
      heart.className = i < playerStats.hp ? 'heart full' : 'heart empty';
      heart.innerText = '❤';
      hpContainer.appendChild(heart);
    }
  }

  // MP 條更新
  const mpFill = document.getElementById('uiMpFill');
  if (mpFill) {
    const pct = Math.min(100, Math.max(0, (playerStats.mp / playerStats.maxMp) * 100));
    mpFill.style.width = `${pct}%`;
  }
  const mpText = document.getElementById('uiMpText');
  if (mpText) {
    mpText.innerText = `${Math.floor(playerStats.mp)}/${playerStats.maxMp}`;
  }

  // 金幣與得分
  const goldEl = document.getElementById('uiGold');
  if (goldEl) goldEl.innerText = playerStats.gold.toString();
  const scoreEl = document.getElementById('uiScore');
  if (scoreEl) scoreEl.innerText = playerStats.score.toString();

  // 關卡主題顯示
  const lvlNameEl = document.getElementById('uiLevelName');
  if (lvlNameEl) lvlNameEl.innerText = LEVELS[playerStats.levelIndex].name;

  // 技能 CD 面板
  const mCd = playerStats.skills.fireMeteor.currentCooldown;
  const mBtn = document.getElementById('skillMeteor');
  if (mBtn) {
    if (mCd > 0) {
      mBtn.classList.add('disabled');
      mBtn.querySelector('.cooldown')!.innerHTML = `${Math.ceil(mCd / 1000)}s`;
    } else if (playerStats.mp < playerStats.skills.fireMeteor.cost) {
      mBtn.classList.add('disabled');
      mBtn.querySelector('.cooldown')!.innerHTML = 'MP不足';
    } else {
      mBtn.classList.remove('disabled');
      mBtn.querySelector('.cooldown')!.innerHTML = '';
    }
  }

  const sCd = playerStats.skills.timeSlow.currentCooldown;
  const sBtn = document.getElementById('skillTimeSlow');
  if (sBtn) {
    if (sCd > 0) {
      sBtn.classList.add('disabled');
      sBtn.querySelector('.cooldown')!.innerHTML = `${Math.ceil(sCd / 1000)}s`;
    } else if (playerStats.mp < playerStats.skills.timeSlow.cost) {
      sBtn.classList.add('disabled');
      sBtn.querySelector('.cooldown')!.innerHTML = 'MP不足';
    } else {
      sBtn.classList.remove('disabled');
      sBtn.querySelector('.cooldown')!.innerHTML = '';
    }
  }
}

// 磚塊受傷邏輯
function handleBrickHurt(brick: Brick, dmg: number) {
  if (brick.type === 'METAL') {
    audio.playHitBrick('METAL');
    particles.createBrickExplosion(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color, 4);
    return;
  }

  brick.hp -= dmg;
  brick.lastHurtTime = Date.now();
  
  if (brick.hp <= 0) {
    // 磚塊碎裂
    audio.playBreakBrick();
    particles.createBrickExplosion(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color, 12);
    
    // 得分與金幣計算
    const goldBonusPct = 1 + playerStats.upgrades.goldBonus * 0.5; // 每升一級金幣+50%
    const earnedGold = Math.round(brick.goldValue * goldBonusPct);
    playerStats.gold += earnedGold;
    playerStats.score += brick.goldValue * 10;

    // 回復 MP
    playerStats.mp = Math.min(playerStats.maxMp, playerStats.mp + 2);

    // 隨機掉落道具 (15% 機率)
    if (Math.random() < 0.15) {
      spawnItem(brick.x + brick.width / 2, brick.y + brick.height);
    }

    // 仙人掌磚塊機制：向下方發射尖刺
    if (brick.type === 'CACTUS' && boss) {
      boss.projectiles.push({
        id: `cactus_thorn_${Date.now()}_${Math.random()}`,
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height,
        vx: 0,
        vy: 3,
        radius: 5,
        type: 'THORN',
        color: '#2e8b57'
      });
    }

    // 移除磚塊
    bricks = bricks.filter((b) => b.id !== brick.id);
    updateUI();
  } else {
    // 僅扣血
    audio.playHitBrick(brick.type);
    particles.createBrickExplosion(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color, 5);
  }

  // 擊中會微幅震動
  triggerScreenShake(2, 100);
}

// Boss 受傷邏輯
function handleBossHurt(b: Boss, dmg: number) {
  b.hp -= dmg;
  b.state = 'HURT';
  b.stateTimer = 400; // 受傷閃爍 0.4 秒
  
  audio.playBossHurt();
  particles.createBossHit(b.x + b.width / 2, b.y + b.height / 2, b.color, 20);
  triggerScreenShake(6, 250);

  playerStats.score += dmg * 5;

  if (b.hp <= 0) {
    // 通關
    triggerScreenShake(12, 1000);
    // 噴灑大量金幣
    playerStats.gold += 50 + playerStats.levelIndex * 30;
    playerStats.score += 1000;
    
    setTimeout(() => {
      switchStatus('VICTORY');
    }, 1500);
  }
}

// 產生掉落道具
function spawnItem(x: number, y: number) {
  // 機率分佈
  const rand = Math.random();
  let type: ItemType = 'GOLD';

  if (rand < 0.15) type = 'MULTIBALL';
  else if (rand < 0.30) type = 'EXPAND';
  else if (rand < 0.45) type = 'MANA';
  else if (rand < 0.55) type = 'STICKY';
  else if (rand < 0.65) type = 'SHIELD';
  else if (rand < 0.75) type = 'LASER';
  else if (rand < 0.85) type = 'HEAL';
  else type = 'GOLD';

  let color = '#ffffff';
  switch (type) {
    case 'MULTIBALL': color = '#00ffff'; break;
    case 'EXPAND': color = '#32cd32'; break;
    case 'LASER': color = '#ff00ff'; break;
    case 'SHIELD': color = '#ffd700'; break;
    case 'STICKY': color = '#ffa500'; break;
    case 'HEAL': color = '#ff4500'; break;
    case 'GOLD': color = '#ffd700'; break;
    case 'MANA': color = '#1e90ff'; break;
  }

  droppedItems.push({
    id: `item_${Date.now()}_${Math.random()}`,
    x,
    y,
    vy: 2.0,
    type,
    radius: 10,
    color
  });
}

// 收集掉落道具效果
function handleCollectItem(item: DroppedItem) {
  audio.playPowerup();
  
  particles.createPaddleSparkle(paddle.x + paddle.width / 2, paddle.y, item.color, 15);

  switch (item.type) {
    case 'GOLD':
      playerStats.gold += 15;
      break;
    case 'MANA':
      playerStats.mp = Math.min(playerStats.maxMp, playerStats.mp + 30);
      break;
    case 'HEAL':
      playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + 1);
      break;
    case 'SHIELD':
      paddle.shieldActive = true;
      break;
    case 'EXPAND':
      // 寬度加倍，持續 8 秒
      if (paddle.width < 250) {
        const prevWidth = paddle.width;
        paddle.width *= 1.5;
        paddle.x -= (paddle.width - prevWidth) / 2; // 置中修正
        setTimeout(() => {
          paddle.width = 100 + playerStats.upgrades.paddleWidth * 20;
        }, 8000);
      }
      break;
    case 'STICKY':
      paddle.stickyActive = true;
      setTimeout(() => {
        paddle.stickyActive = false;
        // 把黏住的球全部丟出去
        fireGluedBall();
      }, 8000);
      break;
    case 'LASER':
      paddle.laserActive = true;
      paddle.laserTimer = 7000; // 持續 7 秒
      break;
    case 'MULTIBALL':
      // 取得畫面上隨機一顆球複製兩顆
      if (balls.length > 0) {
        const src = balls[0];
        const angleOffset = 0.3;
        const b1 = createBaseBall(src.x, src.y);
        b1.isGlued = false;
        b1.vx = src.vx * Math.cos(angleOffset) - src.vy * Math.sin(angleOffset);
        b1.vy = src.vx * Math.sin(angleOffset) + src.vy * Math.cos(angleOffset);
        
        const b2 = createBaseBall(src.x, src.y);
        b2.isGlued = false;
        b2.vx = src.vx * Math.cos(-angleOffset) - src.vy * Math.sin(-angleOffset);
        b2.vy = src.vx * Math.sin(-angleOffset) + src.vy * Math.cos(-angleOffset);

        balls.push(b1, b2);
      }
      break;
  }
  updateUI();
}

// 玩家漏球
function handleBallMiss(ball: Ball) {
  balls = balls.filter((b) => b.id !== ball.id);
  
  if (balls.length === 0) {
    // 失去一滴血
    playerStats.hp--;
    audio.playPlayerHurt();
    triggerScreenShake(10, 400);

    if (playerStats.hp <= 0) {
      switchStatus('GAME_OVER');
    } else {
      // 重新發一顆球
      balls.push(createBaseBall(paddle.x + paddle.width / 2, paddle.y - 12));
      updateUI();
    }
  }
}

// 玩家被 Boss 彈幕擊中
function handlePlayerHit(proj: BossProjectile) {
  playerStats.hp--;
  audio.playPlayerHurt();
  triggerScreenShake(10, 400);

  // 畫面邊緣噴灑受擊粒子
  particles.createPaddleSparkle(paddle.x + paddle.width / 2, paddle.y, proj.color, 12);

  // 特殊海洋墨汁遮罩
  if (proj.type === 'INK_BLOB' && boss) {
    boss.inkOverlayAlpha = 0.85; // 幾乎全黑
  }

  if (playerStats.hp <= 0) {
    switchStatus('GAME_OVER');
  }
  updateUI();
}

// 遊戲主迴圈
function gameLoop(timestamp: number) {
  if (!lastTime) lastTime = timestamp;
  let elapsed = timestamp - lastTime;
  lastTime = timestamp;

  // 限制單幀最高時間避免 lag 導致大穿透
  if (elapsed > 100) elapsed = 100;

  if (status === 'PLAYING') {
    update(elapsed);
    render();
  } else {
    // 其他畫面只繪製底圖/粒子
    drawStaticBackground();
  }

  requestAnimationFrame(gameLoop);
}

// 主動更新物理
function update(deltaTime: number) {
  // 時空減速倍率
  let timeScale = 1.0;
  if (playerStats.skills.timeSlow.activeTimer > 0) {
    playerStats.skills.timeSlow.activeTimer -= deltaTime;
    timeScale = 0.3; // 球、粒子、彈幕移動速度減為 30%
  }

  // 技能冷卻遞減
  if (playerStats.skills.fireMeteor.currentCooldown > 0) {
    playerStats.skills.fireMeteor.currentCooldown -= deltaTime;
    if (playerStats.skills.fireMeteor.currentCooldown < 0) {
      playerStats.skills.fireMeteor.currentCooldown = 0;
    }
  }
  if (playerStats.skills.timeSlow.currentCooldown > 0) {
    playerStats.skills.timeSlow.currentCooldown -= deltaTime;
    if (playerStats.skills.timeSlow.currentCooldown < 0) {
      playerStats.skills.timeSlow.currentCooldown = 0;
    }
  }

  // 自動緩慢回復 MP (每秒 2 點，如果時空減速中不回復以平衡難度)
  if (playerStats.skills.timeSlow.activeTimer <= 0) {
    playerStats.mp = Math.min(playerStats.maxMp, playerStats.mp + (deltaTime / 1000) * 2.5);
  }

  // 更新擋板位置 (鍵盤 A/D, Left/Right)
  let moveDir = 0;
  if (keysPressed['ArrowLeft'] || keysPressed['a'] || keysPressed['KeyA']) {
    moveDir = -1;
  } else if (keysPressed['ArrowRight'] || keysPressed['d'] || keysPressed['KeyD']) {
    moveDir = 1;
  }

  if (moveDir !== 0) {
    paddle.x += moveDir * paddle.speed;
  } else {
    // 支援滑鼠平滑跟隨
    const targetX = mouseX - paddle.width / 2;
    paddle.x += (targetX - paddle.x) * 0.25; // 平滑插值
  }

  // 擋板邊界侷限
  paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));

  // 雷射發射邏輯
  if (paddle.laserActive) {
    paddle.laserTimer -= deltaTime;
    if (paddle.laserTimer <= 0) {
      paddle.laserActive = false;
    }

    paddle.laserCooldown -= deltaTime;
    // 每 250ms 自動或按空白鍵射擊
    if (paddle.laserCooldown <= 0 && (keysPressed['Space'] || keysPressed[' '])) {
      paddle.laserCooldown = 250;
      audio.playShoot();
      laserBullets.push({
        id: `bullet_l_${Date.now()}`,
        x: paddle.x + 10,
        y: paddle.y - 10,
        vy: -7,
        width: 4,
        height: 12,
        color: '#ff00ff'
      });
      laserBullets.push({
        id: `bullet_r_${Date.now()}`,
        x: paddle.x + paddle.width - 14,
        y: paddle.y - 10,
        vy: -7,
        width: 4,
        height: 12,
        color: '#ff00ff'
      });
    }
  }

  // 更新球的物理
  for (const ball of balls) {
    if (ball.isGlued) {
      // 黏在擋板上
      ball.x = paddle.x + paddle.width / 2 + ball.glueOffset;
      ball.y = paddle.y - ball.radius - 1;
    } else {
      // 正常運動 (隨技能縮放速度)
      ball.x += ball.vx * timeScale;
      ball.y += ball.vy * timeScale;
      
      // 尾跡特效
      particles.createBallTrail(ball.x, ball.y, ball.trailColor, ball.radius);
      
      // 烈焰隕石噴射尾部火焰
      if (ball.isFireball) {
        particles.createMeteorFire(ball.x, ball.y, ball.radius);
      }
    }

    // 球與邊緣碰撞
    updateBallBoundaries(
      ball,
      canvas.width,
      canvas.height,
      handleBallMiss,
      paddle.shieldActive,
      () => { paddle.shieldActive = false; updateUI(); }
    );

    // 球與擋板碰撞
    checkBallPaddleCollision(ball, paddle);

    // 球與磚塊碰撞
    for (const brick of bricks) {
      const hit = checkBallBrickCollision(ball, brick, handleBrickHurt);
      if (hit) break; // 避免單幀多重碰撞干擾
    }

    // 球與 Boss 碰撞
    if (boss) {
      checkBallBossCollision(ball, boss, handleBossHurt);
    }
  }

  // 海洋關卡氣泡隨機生成
  if (LEVELS[playerStats.levelIndex].theme === 'OCEAN') {
    particles.createOceanBubbles(0, canvas.height, canvas.width, 0.15);
  }

  // 流砂磚塊移動邏輯
  for (const brick of bricks) {
    if (brick.type === 'SAND_DRIFT' && brick.driftSpeed && brick.driftRange && brick.startX !== undefined) {
      brick.x += (brick.driftSpeed * (brick.driftDirection || 1)) * timeScale;
      // 超出範圍反彈
      if (Math.abs(brick.x - brick.startX) > brick.driftRange) {
        brick.driftDirection = -(brick.driftDirection || 1);
      }
    }

    // 珊瑚自我修復機制
    if (brick.type === 'CORAL' && brick.lastHurtTime && brick.hp < brick.maxHp) {
      const elapsedSinceHurt = Date.now() - brick.lastHurtTime;
      if (elapsedSinceHurt > 8000) { // 8 秒沒挨打，補 1 滴血
        brick.hp = Math.min(brick.maxHp, brick.hp + 1);
        brick.lastHurtTime = Date.now(); // 重置計時
        particles.createBrickExplosion(brick.x + brick.width / 2, brick.y + brick.height / 2, '#ffa07a', 6);
      }
    }
  }

  // 更新雷射子彈
  updateLaserBullets(laserBullets, bricks, boss, handleBrickHurt, handleBossHurt);

  // 更新掉落道具
  updateDroppedItems(droppedItems, paddle, canvas.height, handleCollectItem);

  // 當普通磚塊全部打完，且尚未召喚 Boss 時：召喚 Boss
  if (bricks.filter(b => b.type !== 'METAL').length === 0 && !boss) {
    boss = spawnBoss(playerStats.levelIndex, canvas.width);
    audio.playVictory(); // 宣告 Boss 登場
  }

  // 更新 Boss AI 與彈幕
  if (boss) {
    updateBossAI(boss, canvas.width, paddle.x, paddle.width, deltaTime * timeScale);
    updateBossProjectiles(boss.projectiles, paddle, canvas.height, handlePlayerHit);
  }

  // 更新粒子系統
  particles.update(timeScale);

  // 螢幕震動遞減
  if (screenShakeTimer > 0) {
    screenShakeTimer -= deltaTime;
  }

  // 定期更新 UI
  updateUI();
}

// 靜態背景繪製
function drawStaticBackground() {
  const config = LEVELS[playerStats.levelIndex];
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGrad.addColorStop(0, config.backgroundColor);
  bgGrad.addColorStop(1, '#020205');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// 主渲染迴圈
function render() {
  ctx.save();

  // 螢幕震動位移
  if (screenShakeTimer > 0) {
    const dx = (Math.random() - 0.5) * screenShakeIntensity;
    const dy = (Math.random() - 0.5) * screenShakeIntensity;
    ctx.translate(dx, dy);
  }

  // 繪製背景
  drawStaticBackground();

  // 1. 繪製磚塊
  for (const brick of bricks) {
    ctx.save();
    
    // 霓虹發光感
    ctx.shadowBlur = brick.type === 'METAL' ? 3 : 8;
    ctx.shadowColor = brick.color;

    // 磚塊漸層
    const brickGrad = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.height);
    brickGrad.addColorStop(0, brick.color);
    brickGrad.addColorStop(1, '#111111');
    ctx.fillStyle = brickGrad;

    // 圓角矩形
    drawRoundRect(ctx, brick.x, brick.y, brick.width, brick.height, 4);
    ctx.fill();

    // 磚塊邊框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // HP 標記 (非單擊碎磚塊顯示血量線)
    if (brick.maxHp > 1 && brick.hp > 0 && brick.type !== 'METAL') {
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${brick.hp}/${brick.maxHp}`, brick.x + brick.width / 2, brick.y + brick.height / 2 + 4);
    }
    
    ctx.restore();
  }

  // 2. 繪製雷射子彈
  for (const b of laserBullets) {
    ctx.save();
    ctx.fillStyle = b.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = b.color;
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.restore();
  }

  // 3. 繪製掉落道具
  for (const item of droppedItems) {
    ctx.save();
    
    // 外發光
    ctx.shadowBlur = 12;
    ctx.shadowColor = item.color;
    
    // 圓形膠囊
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
    ctx.fill();

    // 繪製白邊
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 道具內部文字符號
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let label = '?';
    if (item.type === 'MULTIBALL') label = '3B';
    else if (item.type === 'EXPAND') label = '↔';
    else if (item.type === 'LASER') label = '⚡';
    else if (item.type === 'SHIELD') label = '🛡';
    else if (item.type === 'STICKY') label = '★';
    else if (item.type === 'HEAL') label = '❤';
    else if (item.type === 'GOLD') label = '$';
    else if (item.type === 'MANA') label = 'MP';

    ctx.fillText(label, item.x, item.y);
    
    ctx.restore();
  }

  // 4. 繪製 Boss
  if (boss) {
    ctx.save();
    
    // 受傷閃紅
    if (boss.state === 'HURT') {
      ctx.fillStyle = '#ff3333';
      ctx.shadowColor = '#ff0000';
    } else {
      ctx.fillStyle = boss.color;
      ctx.shadowColor = boss.color;
    }
    
    ctx.shadowBlur = boss.state === 'ATTACKING' ? 25 : 15;

    // 漸層繪製 Boss 身體
    const bossGrad = ctx.createLinearGradient(boss.x, boss.y, boss.x, boss.y + boss.height);
    bossGrad.addColorStop(0, '#ffffff');
    bossGrad.addColorStop(0.3, boss.color);
    bossGrad.addColorStop(1, '#050505');
    ctx.fillStyle = bossGrad;

    drawRoundRect(ctx, boss.x, boss.y, boss.width, boss.height, 10);
    ctx.fill();

    // 繪製 Boss 血條
    const barWidth = boss.width;
    const barHeight = 6;
    const barX = boss.x;
    const barY = boss.y - 15;
    
    // 血條外框
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    // 紅色血量條
    const hpPct = boss.hp / boss.maxHp;
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(barX, barY, barWidth * hpPct, barHeight);

    // Boss 名字
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${boss.name}`, boss.x + boss.width / 2, boss.y - 22);

    ctx.restore();

    // 繪製 Boss 彈幕
    for (const proj of boss.projectiles) {
      ctx.save();
      ctx.fillStyle = proj.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = proj.color;

      ctx.beginPath();
      if (proj.type === 'LEAF') {
        // 樹葉形狀
        ctx.ellipse(proj.x, proj.y, proj.radius * 1.4, proj.radius * 0.7, Math.PI / 4, 0, Math.PI * 2);
      } else if (proj.type === 'THORN') {
        // 尖刺形狀
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
      } else {
        // 墨汁團
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
    }
  }

  // 5. 繪製擋板 (Paddle)
  ctx.save();
  ctx.shadowBlur = 15;
  ctx.shadowColor = paddle.color;

  // 擋板霓虹漸層
  const paddleGrad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x + paddle.width, paddle.y);
  paddleGrad.addColorStop(0, '#ffffff');
  paddleGrad.addColorStop(0.3, paddle.color);
  paddleGrad.addColorStop(0.7, paddle.color);
  paddleGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = paddleGrad;

  drawRoundRect(ctx, paddle.x, paddle.y, paddle.width, paddle.height, paddle.height / 2);
  ctx.fill();

  // 若護盾開啟，繪製底層炫光護盾
  if (paddle.shieldActive) {
    ctx.save();
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00ffff';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height, canvas.height - paddle.y - 8, Math.PI, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  // 若黏性開啟，繪製橙色發光小顆粒
  if (paddle.stickyActive) {
    ctx.strokeStyle = '#ffa500';
    ctx.lineWidth = 2;
    ctx.strokeRect(paddle.x - 2, paddle.y - 2, paddle.width + 4, paddle.height + 4);
  }

  // 若雷射開啟，繪製擋板兩側槍管
  if (paddle.laserActive) {
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(paddle.x, paddle.y - 6, 6, 8);
    ctx.fillRect(paddle.x + paddle.width - 6, paddle.y - 6, 6, 8);
  }

  ctx.restore();

  // 6. 繪製彈珠 (Balls)
  for (const ball of balls) {
    ctx.save();
    ctx.fillStyle = ball.color;
    ctx.shadowBlur = ball.isFireball ? 20 : 10;
    ctx.shadowColor = ball.isFireball ? '#ff4500' : ball.color;

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 球心亮點
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, ball.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // 7. 繪製粒子
  particles.draw(ctx);

  // 8. 繪製時空減速藍色結界邊緣
  if (playerStats.skills.timeSlow.activeTimer > 0) {
    ctx.save();
    const borderGrad = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      canvas.width / 3,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width / 2
    );
    borderGrad.addColorStop(0, 'rgba(30, 144, 255, 0)');
    borderGrad.addColorStop(1, 'rgba(30, 144, 255, 0.45)');
    ctx.fillStyle = borderGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 顯示時空減速浮動字樣
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'italic bold 18px Outfit, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('時空領域 (Time Slow) ⚡', canvas.width - 20, canvas.height - 60);
    ctx.restore();
  }

  // 9. 繪製海洋關卡墨汁遮罩
  if (boss && boss.inkOverlayAlpha !== undefined && boss.inkOverlayAlpha > 0) {
    ctx.save();
    ctx.fillStyle = `rgba(10, 10, 15, ${boss.inkOverlayAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 繪製一些粗糙的墨點
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.beginPath();
    ctx.arc(200, 150, 120, 0, Math.PI * 2);
    ctx.arc(600, 400, 140, 0, Math.PI * 2);
    ctx.arc(400, 300, 80, 0, Math.PI * 2);
    ctx.fill();

    // 警告提示
    ctx.fillStyle = '#ff4500';
    ctx.font = 'bold 20px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('墨汁遮蔽！畫面受阻！', canvas.width / 2, canvas.height - 80);

    ctx.restore();
  }

  ctx.restore();
}

// 繪製圓角矩形輔助函式
function drawRoundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  c.beginPath();
  c.moveTo(x + radius, y);
  c.lineTo(x + width - radius, y);
  c.quadraticCurveTo(x + width, y, x + width, y + radius);
  c.lineTo(x + width, y + height - radius);
  c.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  c.lineTo(x + radius, y + height - radius);
  c.quadraticCurveTo(x, y + height, x, y + height - radius);
  c.lineTo(x, y + radius);
  c.quadraticCurveTo(x, y, x + radius, y);
  c.closePath();
}
