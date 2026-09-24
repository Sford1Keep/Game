import Phaser from 'phaser';

import type { WorldStore } from '../game-core/world.js';

/**
 * Рендер-слой: читает game-core (`WorldStore`) и рисует плейсхолдеры — квадрат
 * на игрока + id подписью (арт не нужен, TECH-SPEC 9.2). Мировые координаты
 * переводятся в пиксели; ось Y совпадает с серверной.
 */

const VIEW_W = 960;
const VIEW_H = 600;
const PX_PER_UNIT = 40;

export class InstanceScene extends Phaser.Scene {
  /**
   * Phaser сам конструирует сцены по классу, поэтому world передаётся через
   * статическое поле — единственная точка касания бутстрапа и сцены.
   */
  static world: WorldStore | undefined;

  private gfx!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private readonly floatingDamage = new Set<Phaser.GameObjects.Text>();

  constructor() {
    super('instance');
  }

  // Phaser вызывает create()/update() на сцене; create не объявлен в типе Scene.
  create(): void {
    this.gfx = this.add.graphics();
    this.hud = this.add.text(8, 8, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#9ad0ff',
    });
  }

  override update(): void {
    const world = InstanceScene.world;
    if (world === undefined) {
      return;
    }

    this.gfx.clear();
    this.gfx.fillStyle(0x101018, 1).fillRect(0, 0, VIEW_W, VIEW_H);

    const drawBar = (x: number, y: number, hp: number, maxHp: number, color: number): void => {
      const ratio = Math.max(0, Math.min(1, maxHp > 0 ? hp / maxHp : 0));
      this.gfx.fillStyle(0x301820, 1).fillRect(x - 14, y - 20, 28, 4);
      this.gfx.fillStyle(color, 1).fillRect(x - 14, y - 20, 28 * ratio, 4);
    };
    const roster = world.roster();
    roster.forEach((player, index) => {
      const x = VIEW_W / 2 + player.position.x * PX_PER_UNIT;
      const y = VIEW_H / 2 + player.position.y * PX_PER_UNIT + (index % 5) * 4;
      const isLocal = player.id === world.localId;
      this.gfx.fillStyle(isLocal ? 0x41d67a : 0xffb347, 1).fillRect(x - 12, y - 12, 24, 24);
      drawBar(x, y, player.hp, player.maxHp, 0x49d66f);
    });
    world.mobRoster().forEach((mob) => {
      const x = VIEW_W / 2 + mob.position.x * PX_PER_UNIT;
      const y = VIEW_H / 2 + mob.position.y * PX_PER_UNIT;
      const vulnerable = mob.statuses.includes('vulnerable');
      this.gfx.fillStyle(vulnerable ? 0xff4f70 : 0xb34dff, 1).fillRect(x - 10, y - 10, 20, 20);
      drawBar(x, y, mob.hp, mob.maxHp, vulnerable ? 0xffd166 : 0x49d66f);
    });
    world.drainDamage().forEach((event) => {
      const entity = [...roster, ...world.mobRoster()].find((value) => value.id === event.targetId);
      if (entity === undefined) return;
      const x = VIEW_W / 2 + entity.position.x * PX_PER_UNIT;
      const y = VIEW_H / 2 + entity.position.y * PX_PER_UNIT - 28;
      const text = this.add
        .text(x, y, `-${event.amount}`, { color: '#ff7070', fontSize: '16px' })
        .setOrigin(0.5);
      this.floatingDamage.add(text);
      this.tweens.add({
        targets: text,
        y: y - 24,
        alpha: 0,
        duration: 700,
        onComplete: () => {
          text.destroy();
          this.floatingDamage.delete(text);
        },
      });
    });

    this.hud.setText(
      roster
        .map(
          (p) => `${p.id === world.localId ? '>' : ' '} ${p.id} (${p.position.x}, ${p.position.y})`,
        )
        .join('\n'),
    );
  }
}

export const createGame = (world: WorldStore, parent: string): Phaser.Game => {
  InstanceScene.world = world;
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#101018',
    scene: [InstanceScene],
  });
};
