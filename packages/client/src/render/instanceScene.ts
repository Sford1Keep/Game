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

    const roster = world.roster();
    roster.forEach((player, index) => {
      const x = VIEW_W / 2 + player.position.x * PX_PER_UNIT;
      const y = VIEW_H / 2 + player.position.y * PX_PER_UNIT + (index % 5) * 4;
      const isLocal = player.id === world.localId;
      this.gfx.fillStyle(isLocal ? 0x41d67a : 0xffb347, 1).fillRect(x - 12, y - 12, 24, 24);
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
