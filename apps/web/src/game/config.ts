import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { RoomSelectScene } from "./scenes/RoomSelectScene.js";
import { GameScene } from "./scenes/GameScene.js";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#1a1a2e",
  scene: [BootScene, RoomSelectScene, GameScene],
  scale: {
    mode: Phaser.Scale.ScaleModes.RESIZE,
  },
  antialias: false,
  pixelArt: false,
  roundPixels: false,
  autoRound: false,
};

export type LogoutFn = () => void;
