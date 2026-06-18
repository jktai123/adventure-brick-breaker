import type { Ball, Paddle, Brick, DroppedItem, LaserBullet, Boss, BossProjectile } from './types';
import { particles } from './particles';
import { audio } from './audio';

export interface CollisionResult {
  hit: boolean;
  side?: 'left' | 'right' | 'top' | 'bottom';
}

// 偵測球與矩形的碰撞 (AABB vs Circle)
export function checkCircleRectCollision(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): CollisionResult {
  // 尋找矩形上最接近球心的點
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));

  // 計算球心到這個最近點的距離
  const distX = cx - closestX;
  const distY = cy - closestY;
  const distSquared = distX * distX + distY * distY;

  if (distSquared >= r * r) {
    return { hit: false };
  }

  // 確定碰撞发生在矩形的哪一邊
  let side: 'left' | 'right' | 'top' | 'bottom' = 'top';
  
  // 計算球心與矩形中心的相對位置
  const rectCenterX = rx + rw / 2;
  const rectCenterY = ry + rh / 2;
  const dx = cx - rectCenterX;
  const dy = cy - rectCenterY;

  // 根據相對角度決定碰在哪個邊面
  // 透過 normalized 的距離比較
  const wy = rw * dy;
  const hx = rh * dx;

  if (wy > hx) {
    if (wy > -hx) {
      side = 'bottom';
    } else {
      side = 'left';
    }
  } else {
    if (wy > -hx) {
      side = 'right';
    } else {
      side = 'top';
    }
  }

  return { hit: true, side };
}

// 處理球與邊界的碰撞
export function updateBallBoundaries(
  ball: Ball,
  canvasWidth: number,
  canvasHeight: number,
  onMiss: (ball: Ball) => void,
  shieldActive: boolean,
  deactivateShield: () => void
) {
  if (ball.isGlued) return;

  // 左右牆壁反彈
  if (ball.x - ball.radius <= 0) {
    ball.x = ball.radius;
    ball.vx = -ball.vx;
    audio.playHitPaddle(); // 牆壁播放普通撞擊音
  } else if (ball.x + ball.radius >= canvasWidth) {
    ball.x = canvasWidth - ball.radius;
    ball.vx = -ball.vx;
    audio.playHitPaddle();
  }

  // 天花板反彈
  if (ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.vy = -ball.vy;
    audio.playHitPaddle();
  }

  // 掉落底部
  if (ball.y + ball.radius >= canvasHeight) {
    if (shieldActive) {
      // 護盾阻擋
      ball.y = canvasHeight - ball.radius - 10;
      ball.vy = -Math.abs(ball.vy);
      deactivateShield();
      audio.playHitPaddle();
      particles.createPaddleSparkle(ball.x, canvasHeight - 5, '#00ffff', 20);
    } else {
      onMiss(ball);
    }
  }
}

// 處理球與擋板的碰撞
export function checkBallPaddleCollision(ball: Ball, paddle: Paddle) {
  if (ball.isGlued) return;

  const result = checkCircleRectCollision(
    ball.x,
    ball.y,
    ball.radius,
    paddle.x,
    paddle.y,
    paddle.width,
    paddle.height
  );

  if (result.hit) {
    audio.playHitPaddle();
    particles.createPaddleSparkle(ball.x, paddle.y, paddle.color, 10);

    if (paddle.stickyActive) {
      // 黏性擋板：黏住球
      ball.isGlued = true;
      ball.glueOffset = ball.x - (paddle.x + paddle.width / 2);
      ball.vx = 0;
      ball.vy = 0;
      return;
    }

    // 計算撞擊點在擋板上的相對比例（-0.5 到 0.5）
    const relativeIntersectX = ball.x - (paddle.x + paddle.width / 2);
    const normalizedIntersectX = relativeIntersectX / (paddle.width / 2);
    
    // 計算新的反射角 (最大反射角 60 度)
    const maxBounceAngle = (Math.PI / 3); // 60 degrees
    const bounceAngle = normalizedIntersectX * maxBounceAngle;

    // 更新球的速度方向，但保持當前速率
    const currentSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
    const speed = currentSpeed > 0 ? currentSpeed : ball.speed;

    ball.vx = speed * Math.sin(bounceAngle);
    ball.vy = -speed * Math.cos(bounceAngle);
    
    // 確保球往上跑且帶有足夠的向上速度
    if (ball.vy > -2) {
      ball.vy = -2;
    }

    // 稍微將球往上推，避免連續碰撞
    ball.y = paddle.y - ball.radius - 1;
  }
}

// 處理球與磚塊的碰撞
export function checkBallBrickCollision(
  ball: Ball,
  brick: Brick,
  onBrickHit: (brick: Brick, damage: number) => void
): boolean {
  if (ball.isGlued) return false;

  const result = checkCircleRectCollision(
    ball.x,
    ball.y,
    ball.radius,
    brick.x,
    brick.y,
    brick.width,
    brick.height
  );

  if (result.hit) {
    const damage = ball.isFireball ? ball.damage * 2 : ball.damage;
    onBrickHit(brick, damage);

    // 火球技能啟動時穿透普通磚塊不反彈（金屬磚塊仍反彈）
    if (ball.isFireball && brick.type !== 'METAL') {
      return true; // 擊中但不偏折
    }

    // 根據碰撞側邊調整球的速度與位置
    if (result.side === 'left') {
      ball.vx = -Math.abs(ball.vx);
      ball.x = brick.x - ball.radius;
    } else if (result.side === 'right') {
      ball.vx = Math.abs(ball.vx);
      ball.x = brick.x + brick.width + ball.radius;
    } else if (result.side === 'top') {
      ball.vy = -Math.abs(ball.vy);
      ball.y = brick.y - ball.radius;
    } else if (result.side === 'bottom') {
      ball.vy = Math.abs(ball.vy);
      ball.y = brick.y + brick.height + ball.radius;
    }

    return true;
  }

  return false;
}

// 處理球與 Boss 的碰撞
export function checkBallBossCollision(
  ball: Ball,
  boss: Boss,
  onBossHit: (boss: Boss, damage: number) => void
): boolean {
  if (ball.isGlued) return false;

  const result = checkCircleRectCollision(
    ball.x,
    ball.y,
    ball.radius,
    boss.x,
    boss.y,
    boss.width,
    boss.height
  );

  if (result.hit) {
    const damage = ball.isFireball ? ball.damage * 2 : ball.damage;
    onBossHit(boss, damage);

    // 反彈
    if (result.side === 'left') {
      ball.vx = -Math.abs(ball.vx);
      ball.x = boss.x - ball.radius;
    } else if (result.side === 'right') {
      ball.vx = Math.abs(ball.vx);
      ball.x = boss.x + boss.width + ball.radius;
    } else if (result.side === 'top') {
      ball.vy = -Math.abs(ball.vy);
      ball.y = boss.y - ball.radius;
    } else if (result.side === 'bottom') {
      ball.vy = Math.abs(ball.vy);
      ball.y = boss.y + boss.height + ball.radius;
    }

    return true;
  }

  return false;
}

// 偵測雷射子彈碰撞
export function updateLaserBullets(
  bullets: LaserBullet[],
  bricks: Brick[],
  boss: Boss | null,
  onBrickHit: (brick: Brick, damage: number) => void,
  onBossHit: (boss: Boss, damage: number) => void
) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.y += b.vy;

    // 超出畫面
    if (b.y < 0) {
      bullets.splice(i, 1);
      continue;
    }

    let bulletRemoved = false;

    // 與磚塊碰撞
    for (const brick of bricks) {
      if (
        b.x < brick.x + brick.width &&
        b.x + b.width > brick.x &&
        b.y < brick.y + brick.height &&
        b.y + b.height > brick.y
      ) {
        onBrickHit(brick, 1); // 雷射造成 1 點傷害
        bullets.splice(i, 1);
        bulletRemoved = true;
        break;
      }
    }

    if (bulletRemoved) continue;

    // 與 Boss 碰撞
    if (boss) {
      if (
        b.x < boss.x + boss.width &&
        b.x + b.width > boss.x &&
        b.y < boss.y + boss.height &&
        b.y + b.height > boss.y
      ) {
        onBossHit(boss, 1);
        bullets.splice(i, 1);
      }
    }
  }
}

// 偵測道具與擋板碰撞
export function updateDroppedItems(
  items: DroppedItem[],
  paddle: Paddle,
  canvasHeight: number,
  onCollect: (item: DroppedItem) => void
) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    item.y += item.vy;

    // 與擋板碰撞
    if (
      item.y + item.radius >= paddle.y &&
      item.y - item.radius <= paddle.y + paddle.height &&
      item.x + item.radius >= paddle.x &&
      item.x - item.radius <= paddle.x + paddle.width
    ) {
      onCollect(item);
      items.splice(i, 1);
      continue;
    }

    // 超出畫面
    if (item.y - item.radius > canvasHeight) {
      items.splice(i, 1);
    }
  }
}

// 偵測 Boss 彈幕與擋板碰撞
export function updateBossProjectiles(
  projectiles: BossProjectile[],
  paddle: Paddle,
  canvasHeight: number,
  onHitPlayer: (proj: BossProjectile) => void
) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    proj.x += proj.vx;
    proj.y += proj.vy;

    // 與擋板碰撞
    if (
      proj.y + proj.radius >= paddle.y &&
      proj.y - proj.radius <= paddle.y + paddle.height &&
      proj.x + proj.radius >= paddle.x &&
      proj.x - proj.radius <= paddle.x + paddle.width
    ) {
      onHitPlayer(proj);
      projectiles.splice(i, 1);
      continue;
    }

    // 超出畫面
    if (proj.y - proj.radius > canvasHeight || proj.x + proj.radius < 0 || proj.x - proj.radius > 800) {
      projectiles.splice(i, 1);
    }
  }
}
