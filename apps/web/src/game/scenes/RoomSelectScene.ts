import Phaser from "phaser";
import type { Room } from "shared-types";
import { connectSocket, getSocket } from "../../services/socket.js";
import { clearAuth } from "../../services/auth.js";
import { FONT_KEY } from "../fonts.js";

export class RoomSelectScene extends Phaser.Scene {
  private rooms: Room[] = [];
  private container!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "RoomSelectScene" });
  }

  create() {
    this.container = this.add.container(0, 0);
    this.rooms = [];
    this.buildUI();

    this.scale.on("resize", () => this.buildUI());

    const socket = connectSocket();

    socket.on("connect", () => {
      socket.emit("rooms:list");
    });

    socket.on("rooms:list", (rooms: Room[]) => {
      this.rooms = rooms;
      this.buildUI();
    });

    socket.on("room:joined", (data: { roomId: string; players: unknown[] }) => {
      socket.off("rooms:list");
      socket.off("room:joined");
      this.scale.off("resize");
      this.scene.start("GameScene", { roomId: data.roomId, initialPlayers: data.players });
    });

    socket.on("connect_error", (err: Error) => {
      this.buildError(err.message);
    });
  }

  shutdown() {
    const socket = getSocket();
    socket.off("rooms:list");
    socket.off("room:joined");
    socket.off("connect_error");
  }

  private buildUI() {
    this.container.removeAll(true);
    const w = this.scale.width;
    const h = this.scale.height;

    const title = this.add.bitmapText(w / 2, h * 0.08, FONT_KEY, "Select a Room", 36).setOrigin(0.5);
    const subtitle = this.add.bitmapText(w / 2, h * 0.14, FONT_KEY, "Choose a world to enter", 22).setOrigin(0.5);
    this.container.add([title, subtitle]);

    this.rooms.forEach((room, i) => {
      const cardY = h * 0.22 + i * h * 0.11;
      const cardW = Math.min(400, w * 0.8);
      const cardH = Math.min(70, h * 0.09);

      const bg = this.add.graphics();
      bg.fillStyle(0x16213e, 1);
      bg.fillRoundedRect(w / 2 - cardW / 2, cardY - cardH / 2, cardW, cardH, 12);

      const name = this.add.bitmapText(w / 2, cardY - cardH * 0.15, FONT_KEY, room.name, 26).setOrigin(0.5);
      const info = this.add.bitmapText(w / 2, cardY + cardH * 0.25, FONT_KEY, `${room.description} . ${room.playerCount} online`, 16).setOrigin(0.5);

      const hitArea = this.add.zone(w / 2, cardY, cardW, cardH).setInteractive({ useHandCursor: true });

      hitArea.on("pointerover", () => {
        bg.clear();
        bg.fillStyle(0x1a3a5c, 1);
        bg.fillRoundedRect(w / 2 - cardW / 2, cardY - cardH / 2, cardW, cardH, 12);
      });
      hitArea.on("pointerout", () => {
        bg.clear();
        bg.fillStyle(0x16213e, 1);
        bg.fillRoundedRect(w / 2 - cardW / 2, cardY - cardH / 2, cardW, cardH, 12);
      });
      hitArea.on("pointerdown", () => {
        getSocket().emit("room:join", room.id);
      });

      this.container.add([bg, name, info, hitArea]);
    });

    const signOut = this.add.bitmapText(w - 10, h - 10, FONT_KEY, "Sign Out", 18).setOrigin(1, 1).setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        getSocket().disconnect();
        clearAuth();
        window.location.reload();
      });

    this.container.add(signOut);
  }

  private buildError(msg: string) {
    const w = this.scale.width;
    const h = this.scale.height;
    const err = this.add.bitmapText(w / 2, h - 40, FONT_KEY, `Connection error: ${msg}`, 18).setOrigin(0.5);
    this.container.add(err);
  }
}
