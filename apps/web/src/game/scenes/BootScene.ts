import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    this.load.bitmapFont("gamefont", "/bitmap/bitmap.png", "/bitmap/bitmap.xml");
  }

  create() {
    this.textures.get("gamefont").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.scene.start("RoomSelectScene");
  }
}
