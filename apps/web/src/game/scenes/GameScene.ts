import Phaser from "phaser";
import type { PlayerState, ChatMessage } from "shared-types";
import { getSocket } from "../../services/socket.js";
import { getStoredUser } from "../../services/auth.js";
import { voiceChat } from "../../services/voice.js";

interface OtherPlayer {
  graphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text | null;
  bubbleTimer: number;
  targetX: number;
  targetY: number;
}

export class GameScene extends Phaser.Scene {
  private roomId!: string;
  private localPlayer!: Phaser.GameObjects.Graphics;
  private localLabel!: Phaser.GameObjects.Text;
  private otherPlayers = new Map<string, OtherPlayer>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private floor!: Phaser.GameObjects.Graphics;
  private border!: Phaser.GameObjects.Graphics;
  private roomLabel!: Phaser.GameObjects.Text;
  private moveSpeed = 3;
  private socket = getSocket();
  private margin = 60;

  private chatLog!: Phaser.GameObjects.Text;
  private chatInput: HTMLInputElement | null = null;
  private isChatting = false;
  private messages: ChatMessage[] = [];
  private maxChatMessages = 8;
  private initialPlayers: PlayerState[] = [];
  private otherPlayerIds: string[] = [];

  constructor() {
    super({ key: "GameScene" });
  }

  init(data: { roomId: string; initialPlayers?: PlayerState[] }) {
    this.roomId = data.roomId;
    this.initialPlayers = data.initialPlayers ?? [];
  }

  create() {
    this.floor = this.add.graphics();
    this.border = this.add.graphics();
    this.roomLabel = this.add.text(0, 0, "", { fontSize: "14px", color: "#aaa", fontFamily: "Arial" });

    this.localPlayer = this.add.graphics();
    this.drawCharacter(this.localPlayer, 0x4fc3f7);

    this.localLabel = this.add.text(0, 0, "You", {
      fontSize: "12px",
      color: "#4fc3f7",
      fontFamily: "Arial",
    }).setOrigin(0.5);

    this.chatLog = this.add.text(12, 0, "", {
      fontSize: "13px",
      color: "#ffffff",
      fontFamily: "Arial",
      backgroundColor: "rgba(0,0,0,0.5)",
      padding: { x: 8, y: 4 },
      wordWrap: { width: 400 },
    }).setDepth(100);

    this.drawFloor();
    this.scale.on("resize", () => {
      this.drawFloor();
      this.layoutChatLog();
      this.repositionChatInput();
    });

    const w = this.scale.width;
    const h = this.scale.height;
    this.localPlayer.setPosition(w / 2, h / 2);
    this.localLabel.setPosition(w / 2, h / 2 - 30);
    this.layoutChatLog();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys("W,A,S,D") as unknown as { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };

    this.input.keyboard!.on("keydown-ESC", () => {
      if (this.isChatting) {
        this.closeChat();
      } else {
        this.leaveRoom();
      }
    });

    this.input.keyboard!.on("keydown-ENTER", () => {
      if (!this.isChatting) {
        this.openChat();
      }
    });

    this.setupSocketListeners();
    voiceChat.init();

    const myId = getStoredUser()?.id;
    for (const player of this.initialPlayers) {
      if (player.id !== myId) {
        this.addOtherPlayer(player);
        voiceChat.connectTo(player.id);
      }
    }

    this.createMicButton();
  }

  shutdown() {
    voiceChat.destroy();
    this.socket.off("player:joined");
    this.socket.off("player:moved");
    this.socket.off("player:left");
    this.socket.off("chat:message");
    this.scale.off("resize");
    this.removeChatInput();
  }

  private setupSocketListeners() {
    this.socket.on("player:joined", (player: PlayerState) => {
      this.addOtherPlayer(player);
      voiceChat.connectTo(player.id);
    });

    this.socket.on("player:moved", (data: { playerId: string; x: number; y: number }) => {
      const other = this.otherPlayers.get(data.playerId);
      if (other) {
        other.targetX = data.x;
        other.targetY = data.y;
      }
    });

    this.socket.on("player:left", (data: { playerId: string }) => {
      this.removeOtherPlayer(data.playerId);
    });

    this.socket.on("chat:message", (msg: ChatMessage) => {
      this.messages.push(msg);
      if (this.messages.length > this.maxChatMessages) this.messages.shift();
      this.updateChatLog();

      const other = this.otherPlayers.get(msg.senderId);
      if (other) {
        this.showBubble(other, msg.text);
      }
    });
  }

  update() {
    if (this.isChatting) return;

    const dx =
      (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) -
      (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0);
    const dy =
      (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) -
      (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0);

    if (dx !== 0 || dy !== 0) {
      const w = this.scale.width;
      const h = this.scale.height;
      const newX = Phaser.Math.Clamp(this.localPlayer.x + dx * this.moveSpeed, this.margin, w - this.margin);
      const newY = Phaser.Math.Clamp(this.localPlayer.y + dy * this.moveSpeed, this.margin, h - this.margin);

      this.localPlayer.setPosition(newX, newY);
      this.localLabel.setPosition(newX, newY - 30);

      this.socket.emit("player:move", { x: newX, y: newY });
    }

    const now = Date.now();
    this.otherPlayers.forEach((other) => {
      const gx = other.graphics.x + (other.targetX - other.graphics.x) * 0.15;
      const gy = other.graphics.y + (other.targetY - other.graphics.y) * 0.15;
      other.graphics.setPosition(gx, gy);
      other.label.setPosition(gx, gy - 30);

      if (other.bubble) {
        other.bubble.setPosition(gx, gy - 55);
        if (now - other.bubbleTimer > 5000) {
          other.bubble.destroy();
          other.bubble = null;
        }
      }
    });
  }

  private createMicButton() {
    const btn = this.add.text(10, 10, "🎤 Mic Off", {
      fontSize: "14px",
      color: "#ff5555",
      fontFamily: "Arial",
      backgroundColor: "rgba(0,0,0,0.5)",
      padding: { x: 8, y: 4 },
    }).setOrigin(0, 0).setInteractive({ useHandCursor: true }).setDepth(200);

    btn.on("pointerdown", async () => {
      const on = await voiceChat.toggle(this.otherPlayerIds);
      btn.setText(on ? "🎤 Mic On" : "🎤 Mic Off");
      btn.setColor(on ? "#4fc3f7" : "#ff5555");
    });
  }

  private addOtherPlayer(player: PlayerState) {
    if (this.otherPlayers.has(player.id)) return;

    const g = this.add.graphics();
    this.drawCharacter(g, 0xff8a65);

    const label = this.add.text(0, 0, player.displayName, {
      fontSize: "11px",
      color: "#ff8a65",
      fontFamily: "Arial",
    }).setOrigin(0.5);

    g.setPosition(player.x, player.y);
    label.setPosition(player.x, player.y - 30);

    this.otherPlayers.set(player.id, {
      graphics: g,
      label,
      bubble: null,
      bubbleTimer: 0,
      targetX: player.x,
      targetY: player.y,
    });
    this.otherPlayerIds.push(player.id);
  }

  private removeOtherPlayer(playerId: string) {
    const other = this.otherPlayers.get(playerId);
    if (!other) return;
    this.otherPlayerIds = this.otherPlayerIds.filter((id) => id !== playerId);
    other.graphics.destroy();
    other.label.destroy();
    if (other.bubble) other.bubble.destroy();
    this.otherPlayers.delete(playerId);
  }

  private showBubble(other: OtherPlayer, text: string) {
    if (other.bubble) other.bubble.destroy();
    other.bubble = this.add.text(0, 0, text, {
      fontSize: "12px",
      color: "#fff",
      fontFamily: "Arial",
      backgroundColor: "rgba(0,0,0,0.7)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(50);
    other.bubble.setPosition(other.graphics.x, other.graphics.y - 55);
    other.bubbleTimer = Date.now();
  }

  private openChat() {
    this.isChatting = true;
    if (!this.chatInput) {
      this.chatInput = document.createElement("input");
      this.chatInput.type = "text";
      this.chatInput.placeholder = "Type a message...";
      this.chatInput.style.cssText = `
        position: fixed;
        z-index: 1000;
        padding: 8px 12px;
        font-size: 14px;
        border: 1px solid #4fc3f7;
        border-radius: 6px;
        background: rgba(0,0,0,0.8);
        color: #fff;
        outline: none;
        font-family: Arial;
      `;
      document.body.appendChild(this.chatInput);

      this.chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const text = this.chatInput!.value.trim();
          if (text) {
            this.socket.emit("chat:message", text);
          }
          this.closeChat();
        }
        if (e.key === "Escape") {
          this.closeChat();
        }
        e.stopPropagation();
      });
    }
    this.repositionChatInput();
    this.chatInput.style.display = "block";
    this.chatInput.value = "";
    setTimeout(() => this.chatInput?.focus(), 50);
  }

  private closeChat() {
    this.isChatting = false;
    if (this.chatInput) {
      this.chatInput.style.display = "none";
      this.chatInput.blur();
    }
  }

  private removeChatInput() {
    if (this.chatInput) {
      this.chatInput.remove();
      this.chatInput = null;
    }
  }

  private repositionChatInput() {
    if (!this.chatInput) return;
    const w = this.scale.width;
    const h = this.scale.height;
    const inputW = Math.min(400, w - 40);
    this.chatInput.style.left = `${(w - inputW) / 2}px`;
    this.chatInput.style.top = `${h - 50}px`;
    this.chatInput.style.width = `${inputW}px`;
  }

  private layoutChatLog() {
    const h = this.scale.height;
    this.chatLog.setY(h - 100);
  }

  private updateChatLog() {
    const text = this.messages.slice(-this.maxChatMessages).map(
      (m) => `${m.senderName}: ${m.text}`
    ).join("\n");
    this.chatLog.setText(text);
  }

  private drawCharacter(g: Phaser.GameObjects.Graphics, color: number) {
    g.fillStyle(color, 1);
    g.fillRoundedRect(-16, -16, 32, 32, 6);
    g.fillStyle(0xffffff, 0.3);
    g.fillRoundedRect(-12, -12, 24, 10, 4);
  }

  private drawFloor() {
    this.floor.clear();
    this.border.clear();
    const w = this.scale.width;
    const h = this.scale.height;

    this.floor.fillStyle(0x0f0f23, 1);
    this.floor.fillRect(0, 0, w, h);

    this.floor.lineStyle(1, 0x1a1a3e, 0.5);
    for (let x = 0; x < w; x += 48) {
      this.floor.moveTo(x, 0);
      this.floor.lineTo(x, h);
    }
    for (let y = 0; y < h; y += 48) {
      this.floor.moveTo(0, y);
      this.floor.lineTo(w, y);
    }
    this.floor.strokePath();

    this.border.lineStyle(3, 0x4a4a8a, 1);
    this.border.strokeRect(this.margin, this.margin, w - this.margin * 2, h - this.margin * 2);

    this.roomLabel.setText(`Room: ${this.roomId}  |  Enter to chat, ESC to leave`);
    this.roomLabel.setPosition(w / 2, 15);

    if (this.localPlayer) {
      this.localPlayer.x = Phaser.Math.Clamp(this.localPlayer.x, this.margin, w - this.margin);
      this.localPlayer.y = Phaser.Math.Clamp(this.localPlayer.y, this.margin, h - this.margin);
      this.localLabel.setPosition(this.localPlayer.x, this.localPlayer.y - 30);
    }
  }

  private leaveRoom() {
    this.socket.off("player:joined");
    this.socket.off("player:moved");
    this.socket.off("player:left");
    this.socket.off("chat:message");
    this.scale.off("resize");
    this.removeChatInput();
    this.scene.start("RoomSelectScene");
  }
}
