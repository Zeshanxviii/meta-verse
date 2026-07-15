import Phaser from "phaser";
import type { PlayerState, ChatMessage } from "shared-types";
import { getSocket } from "../../services/socket.js";
import { getStoredUser } from "../../services/auth.js";
import { voiceChat } from "../../services/voice.js";
import { FONT_KEY } from "../fonts.js";
import { getMap, TILE_SIZE, type MapDef, type Zone, type Furniture } from "../maps.js";

interface OtherPlayer {
  graphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.BitmapText;
  bubble: Phaser.GameObjects.BitmapText | null;
  bubbleTimer: number;
  targetX: number;
  targetY: number;
}

export class GameScene extends Phaser.Scene {
  private roomId!: string;
  private localPlayer!: Phaser.GameObjects.Graphics;
  private localLabel!: Phaser.GameObjects.BitmapText;
  private otherPlayers = new Map<string, OtherPlayer>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private floor!: Phaser.GameObjects.Graphics;
  private zonesGfx!: Phaser.GameObjects.Graphics;
  private furnitureGfx!: Phaser.GameObjects.Graphics;
  private zoneLabels: Phaser.GameObjects.BitmapText[] = [];
  private roomLabel!: Phaser.GameObjects.BitmapText;
  private moveSpeed = 3;
  private socket = getSocket();
  private mapDef!: MapDef;
  private currentZone: Zone | null = null;
  private zoneInfoLabel!: Phaser.GameObjects.BitmapText;
  private playersInZones = new Map<string, string[]>(); // zoneId -> playerIds
  private lastCollisionTime = 0;

  private chatLog!: Phaser.GameObjects.BitmapText;
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
    this.zonesGfx = this.add.graphics();
    this.furnitureGfx = this.add.graphics();
    this.roomLabel = this.add.bitmapText(0, 0, FONT_KEY, "", 18);
    this.zoneInfoLabel = this.add.bitmapText(0, 0, FONT_KEY, "", 14).setOrigin(0, 0).setDepth(150).setAlpha(0);

    this.localPlayer = this.add.graphics();
    this.drawCharacter(this.localPlayer, 0x4fc3f7);

    this.localLabel = this.add.bitmapText(0, 0, FONT_KEY, "You", 14).setOrigin(0.5);

    this.chatLog = this.add.bitmapText(12, 0, FONT_KEY, "", 16).setDepth(100);

    this.drawFloor();
    this.scale.on("resize", () => {
      this.drawFloor();
      this.layoutChatLog();
      this.repositionChatInput();
      // Redraw player with new scale
      this.localPlayer.clear();
      this.drawCharacter(this.localPlayer, 0x4fc3f7);
      // Redraw other players with new scale
      this.otherPlayers.forEach((other) => {
        other.graphics.clear();
        this.drawCharacter(other.graphics, 0xff8a65);
      });
    });

    const w = this.scale.width;
    const h = this.scale.height;
    const scale = this.getScaleFactor();
    const offset = this.getMapOffset();

    // Scale label offset
    this.localLabel.setPosition(0, -30 * scale);

    // Use map spawn point so player doesn't start inside a wall
    const spawn = this.mapDef.spawns[0];
    let spawnX = spawn ? offset.x + (spawn.x + spawn.w / 2) * scale : w / 2;
    let spawnY = spawn ? offset.y + (spawn.y + spawn.h / 2) * scale : h / 2;

    // Safety check: if spawn overlaps a wall or furniture, nudge to nearest clear spot
    if (this.checkWallCollision(spawnX, spawnY) || this.checkFurnitureCollision(spawnX, spawnY)) {
      const safe = this.findSafePositionNear(spawnX, spawnY);
      spawnX = safe.x;
      spawnY = safe.y;
    }

    this.localPlayer.setPosition(spawnX, spawnY);
    this.localLabel.setPosition(spawnX, spawnY - 30 * scale);
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
    this.otherPlayers.clear();
    this.otherPlayerIds = [];
    for (const lbl of this.zoneLabels) lbl.destroy();
    this.zoneLabels = [];
  }

  private setupSocketListeners() {
    this.socket.on("player:joined", (player: PlayerState) => {
      this.addOtherPlayer(player);
      voiceChat.connectTo(player.id);
    });

    this.socket.on("player:moved", (data: { playerId: string; x: number; y: number }) => {
      const other = this.otherPlayers.get(data.playerId);
      if (other) {
        const scale = this.getScaleFactor();
        const offset = this.getMapOffset();
        other.targetX = offset.x + data.x * scale;
        other.targetY = offset.y + data.y * scale;
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

    const scale = this.getScaleFactor();
    const offset = this.getMapOffset();
    const originalWidth = 700;
    const originalHeight = 500;

    const dx =
      (this.cursors.right.isDown || this.wasd.D.isDown ? 1 : 0) -
      (this.cursors.left.isDown || this.wasd.A.isDown ? 1 : 0);
    const dy =
      (this.cursors.down.isDown || this.wasd.S.isDown ? 1 : 0) -
      (this.cursors.up.isDown || this.wasd.W.isDown ? 1 : 0);

    if (dx !== 0 || dy !== 0) {
      // Constrain movement to map area
      const mapLeft = offset.x;
      const mapRight = offset.x + originalWidth * scale;
      const mapTop = offset.y;
      const mapBottom = offset.y + originalHeight * scale;
      
      let newX = Phaser.Math.Clamp(this.localPlayer.x + dx * this.moveSpeed, mapLeft, mapRight);
      let newY = Phaser.Math.Clamp(this.localPlayer.y + dy * this.moveSpeed, mapTop, mapBottom);

      // Check collision with walls
      if (this.checkWallCollision(newX, newY)) {
        // Try to move only in X direction
        if (!this.checkWallCollision(newX, this.localPlayer.y)) {
          newY = this.localPlayer.y;
        }
        // Try to move only in Y direction
        else if (!this.checkWallCollision(this.localPlayer.x, newY)) {
          newX = this.localPlayer.x;
        }
        // Can't move in either direction
        else {
          newX = this.localPlayer.x;
          newY = this.localPlayer.y;
        }
        this.showCollisionFeedback();
      }

      // Check collision with furniture
      if (this.checkFurnitureCollision(newX, newY)) {
        // Try to move only in X direction
        if (!this.checkFurnitureCollision(newX, this.localPlayer.y)) {
          newY = this.localPlayer.y;
        }
        // Try to move only in Y direction
        else if (!this.checkFurnitureCollision(this.localPlayer.x, newY)) {
          newX = this.localPlayer.x;
        }
        // Can't move in either direction
        else {
          newX = this.localPlayer.x;
          newY = this.localPlayer.y;
        }
        this.showCollisionFeedback();
      }

      // Check zone restrictions before moving
      const targetZone = this.getZoneAtPosition(newX, newY);
      if (targetZone && !this.canEnterZone(targetZone)) {
        // Prevent movement into restricted zone
        newX = this.localPlayer.x;
        newY = this.localPlayer.y;
      }

      this.localPlayer.setPosition(newX, newY);
      this.localLabel.setPosition(newX, newY - 30 * scale);

      // Send coordinates relative to map (not screen) to server
      this.socket.emit("player:move", { x: (newX - offset.x) / scale, y: (newY - offset.y) / scale, currentZone: this.currentZone?.name });

      // Update current zone and handle zone events
      this.handleZoneChange(newX, newY);
    }

    const now = Date.now();
    this.otherPlayers.forEach((other) => {
      const gx = other.graphics.x + (other.targetX - other.graphics.x) * 0.15;
      const gy = other.graphics.y + (other.targetY - other.graphics.y) * 0.15;
      other.graphics.setPosition(gx, gy);
      other.label.setPosition(gx, gy - 30 * scale);

      if (other.bubble) {
        other.bubble.setPosition(gx, gy - 55 * scale);
        if (now - other.bubbleTimer > 5000) {
          other.bubble.destroy();
          other.bubble = null;
        }
      }
    });
  }

  private createMicButton() {
    const micBtn = this.add.bitmapText(10, 10, FONT_KEY, "Mic Off", 16).setOrigin(0, 0).setInteractive({ useHandCursor: true }).setDepth(200);
    const spkBtn = this.add.bitmapText(110, 10, FONT_KEY, "Speaker On", 16).setOrigin(0, 0).setInteractive({ useHandCursor: true }).setDepth(200);

    micBtn.on("pointerdown", async () => {
      const on = await voiceChat.toggleMic(this.otherPlayerIds);
      micBtn.setText(on ? "Mic On" : "Mic Off");
    });

    spkBtn.on("pointerdown", async () => {
      const on = voiceChat.toggleSpeaker();
      spkBtn.setText(on ? "Speaker On" : "Speaker Off");
    });
  }

  private addOtherPlayer(player: PlayerState) {
    if (this.otherPlayers.has(player.id)) return;

    const g = this.add.graphics();
    this.drawCharacter(g, 0xff8a65);

    const label = this.add.bitmapText(0, 0, FONT_KEY, player.displayName, 13).setOrigin(0.5);

    const scale = this.getScaleFactor();
    const offset = this.getMapOffset();
    const scaledX = offset.x + player.x * scale;
    const scaledY = offset.y + player.y * scale;

    g.setPosition(scaledX, scaledY);
    label.setPosition(scaledX, scaledY - 30 * scale);

    this.otherPlayers.set(player.id, {
      graphics: g,
      label,
      bubble: null,
      bubbleTimer: 0,
      targetX: scaledX,
      targetY: scaledY,
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
    voiceChat.removePeer(playerId);
  }

  private showBubble(other: OtherPlayer, text: string) {
    if (other.bubble) other.bubble.destroy();
    other.bubble = this.add.bitmapText(0, 0, FONT_KEY, text, 14).setOrigin(0.5).setDepth(50);
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
        font-family: monospace;
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
    const scale = this.getScaleFactor();
    g.fillStyle(color, 1);
    g.fillRoundedRect(-16 * scale, -16 * scale, 32 * scale, 32 * scale, 6 * scale);
    g.fillStyle(0xffffff, 0.3);
    g.fillRoundedRect(-12 * scale, -12 * scale, 24 * scale, 10 * scale, 4 * scale);
  }

  private drawFloor() {
    const w = this.scale.width;
    const h = this.scale.height;
    this.mapDef = getMap(this.roomId);

    this.floor.clear();
    this.floor.fillStyle(this.mapDef.bgColor, 1);
    this.floor.fillRect(0, 0, w, h);

    // Scale map elements to fit viewport
    const originalWidth = 700; // Base width from map definitions
    const originalHeight = 500; // Base height from map definitions
    const scaleX = w / originalWidth;
    const scaleY = h / originalHeight;
    const scale = Math.min(scaleX, scaleY); // Maintain aspect ratio

    // Calculate offset to center the map
    const offsetX = (w - originalWidth * scale) / 2;
    const offsetY = (h - originalHeight * scale) / 2;

    // Draw floor pattern
    const pattern = this.mapDef.floorPattern || 'grid';
    const scaledTileSize = TILE_SIZE * scale;
    if (pattern === 'grid') {
      this.floor.lineStyle(1, this.mapDef.gridColor, this.mapDef.gridAlpha);
      for (let x = offsetX; x < offsetX + originalWidth * scale; x += scaledTileSize) {
        this.floor.moveTo(x, offsetY);
        this.floor.lineTo(x, offsetY + originalHeight * scale);
      }
      for (let y = offsetY; y < offsetY + originalHeight * scale; y += scaledTileSize) {
        this.floor.moveTo(offsetX, y);
        this.floor.lineTo(offsetX + originalWidth * scale, y);
      }
      this.floor.strokePath();
    } else if (pattern === 'carpet') {
      // Carpet pattern - subtle texture
      this.floor.lineStyle(1, this.mapDef.gridColor, 0.15);
      for (let x = offsetX; x < offsetX + originalWidth * scale; x += scaledTileSize * 2) {
        for (let y = offsetY; y < offsetY + originalHeight * scale; y += scaledTileSize * 2) {
          this.floor.strokeRect(x, y, scaledTileSize * 2, scaledTileSize * 2);
        }
      }
    } else if (pattern === 'wood') {
      // Wood floor pattern
      this.floor.lineStyle(1, this.mapDef.gridColor, 0.3);
      for (let y = offsetY; y < offsetY + originalHeight * scale; y += scaledTileSize) {
        this.floor.moveTo(offsetX, y);
        this.floor.lineTo(offsetX + originalWidth * scale, y);
      }
      for (let x = offsetX; x < offsetX + originalWidth * scale; x += scaledTileSize * 3) {
        this.floor.moveTo(x, offsetY);
        this.floor.lineTo(x, offsetY + originalHeight * scale);
      }
      this.floor.strokePath();
    } else if (pattern === 'tiles') {
      // Tile pattern
      this.floor.lineStyle(2, this.mapDef.gridColor, 0.4);
      for (let x = offsetX; x < offsetX + originalWidth * scale; x += scaledTileSize * 2) {
        this.floor.moveTo(x, offsetY);
        this.floor.lineTo(x, offsetY + originalHeight * scale);
      }
      for (let y = offsetY; y < offsetY + originalHeight * scale; y += scaledTileSize * 2) {
        this.floor.moveTo(offsetX, y);
        this.floor.lineTo(offsetX + originalWidth * scale, y);
      }
      this.floor.strokePath();
    }

    this.zonesGfx.clear();
    for (const zn of this.mapDef.zones) {
      const scaledX = offsetX + zn.x * scale;
      const scaledY = offsetY + zn.y * scale;
      const scaledW = zn.w * scale;
      const scaledH = zn.h * scale;
      this.zonesGfx.fillStyle(zn.color, zn.alpha);
      this.zonesGfx.fillRect(scaledX, scaledY, scaledW, scaledH);
      this.zonesGfx.lineStyle(2, zn.color, 0.5);
      this.zonesGfx.strokeRect(scaledX, scaledY, scaledW, scaledH);
    }

    // Draw walls
    for (const wall of this.mapDef.walls) {
      const scaledX = offsetX + wall.x * scale;
      const scaledY = offsetY + wall.y * scale;
      const scaledW = wall.w * scale;
      const scaledH = wall.h * scale;
      this.zonesGfx.fillStyle(this.mapDef.wallColor, 0.9);
      this.zonesGfx.fillRect(scaledX, scaledY, scaledW, scaledH);
      // Add 3D effect
      this.zonesGfx.fillStyle(0x000000, 0.3);
      this.zonesGfx.fillRect(scaledX + 2 * scale, scaledY + scaledH - 4 * scale, scaledW - 4 * scale, 4 * scale);
    }

    // Draw furniture
    this.furnitureGfx.clear();
    if (this.mapDef.furniture) {
      for (const item of this.mapDef.furniture) {
        this.drawFurniture(item, scale, offsetX, offsetY);
      }
    }

    for (const lbl of this.zoneLabels) lbl.destroy();
    this.zoneLabels = [];
    for (const zn of this.mapDef.zones) {
      const scaledX = offsetX + zn.x * scale;
      const scaledY = offsetY + zn.y * scale;
      const scaledW = zn.w * scale;
      const scaledH = zn.h * scale;
      const lbl = this.add.bitmapText(scaledX + scaledW / 2, scaledY + scaledH / 2, FONT_KEY, zn.name, 13)
        .setOrigin(0.5).setTint(zn.color).setAlpha(0.7);
      this.zoneLabels.push(lbl);
    }

    this.roomLabel.setText(`Room: ${this.roomId}  |  Enter to chat, ESC to leave`);
    this.roomLabel.setPosition(w / 2, 15);

    if (this.localPlayer) {
      const originalWidth = 700;
      const originalHeight = 500;
      const offset = this.getMapOffset();
      const mapLeft = offset.x;
      const mapRight = offset.x + originalWidth * scale;
      const mapTop = offset.y;
      const mapBottom = offset.y + originalHeight * scale;
      
      this.localPlayer.x = Phaser.Math.Clamp(this.localPlayer.x, mapLeft, mapRight);
      this.localPlayer.y = Phaser.Math.Clamp(this.localPlayer.y, mapTop, mapBottom);
      this.localLabel.setPosition(this.localPlayer.x, this.localPlayer.y - 30 * scale);
    }
  }

  private drawFurniture(item: Furniture, scale: number, offsetX: number, offsetY: number) {
    const g = this.furnitureGfx;
    const x = offsetX + item.x * scale;
    const y = offsetY + item.y * scale;
    const w = item.w * scale;
    const h = item.h * scale;
    
    switch (item.type) {
      case 'desk':
        g.fillStyle(item.color, 0.8);
        g.fillRect(x, y, w, h);
        g.lineStyle(2, 0x000000, 0.3);
        g.strokeRect(x, y, w, h);
        // Add desk details
        g.fillStyle(0x000000, 0.2);
        g.fillRect(x + 2 * scale, y + 2 * scale, w - 4 * scale, 2 * scale);
        break;
        
      case 'chair':
        g.fillStyle(item.color, 0.7);
        g.fillRoundedRect(x, y, w, h, 3 * scale);
        g.lineStyle(1, 0x000000, 0.3);
        g.strokeRoundedRect(x, y, w, h, 3 * scale);
        // Chair back
        g.fillStyle(item.color, 0.9);
        g.fillRect(x + 2 * scale, y - 3 * scale, w - 4 * scale, 3 * scale);
        break;
        
      case 'table':
        g.fillStyle(item.color, 0.8);
        g.fillRect(x, y, w, h);
        g.lineStyle(2, 0x000000, 0.3);
        g.strokeRect(x, y, w, h);
        // Table surface
        g.fillStyle(0x000000, 0.1);
        g.fillRect(x + 3 * scale, y + 3 * scale, w - 6 * scale, h - 6 * scale);
        break;
        
      case 'plant':
        g.fillStyle(0x4a5568, 0.6); // Pot
        g.fillRoundedRect(x, y + h * 0.4, w, h * 0.6, 2 * scale);
        g.fillStyle(item.color, 0.8); // Plant
        g.fillCircle(x + w / 2, y + h * 0.3, w * 0.4);
        g.fillStyle(item.color, 0.6);
        g.fillCircle(x + w / 2 - 3 * scale, y + h * 0.35, w * 0.25);
        g.fillCircle(x + w / 2 + 3 * scale, y + h * 0.35, w * 0.25);
        break;
        
      case 'whiteboard':
        g.fillStyle(0xffffff, 0.9);
        g.fillRect(x, y, w, h);
        g.lineStyle(3, 0x8b5a2b, 0.8); // Frame
        g.strokeRect(x, y, w, h);
        // Tray at bottom
        g.fillStyle(0x8b5a2b, 0.8);
        g.fillRect(x, y + h - 5 * scale, w, 5 * scale);
        break;
        
      case 'bookshelf':
        g.fillStyle(item.color, 0.8);
        g.fillRect(x, y, w, h);
        g.lineStyle(1, 0x000000, 0.3);
        g.strokeRect(x, y, w, h);
        // Books
        const bookColors = [0xe53e3e, 0x3182ce, 0x38a169, 0xd69e2e, 0x805ad5];
        for (let i = 0; i < w - 4 * scale; i += 4 * scale) {
          g.fillStyle(bookColors[Math.floor(i / (4 * scale)) % bookColors.length], 0.7);
          g.fillRect(x + 2 * scale + i, y + 2 * scale, 3 * scale, h - 4 * scale);
        }
        break;
        
      case 'sofa':
        g.fillStyle(item.color, 0.7);
        g.fillRoundedRect(x, y, w, h, 5 * scale);
        g.lineStyle(2, 0x000000, 0.2);
        g.strokeRoundedRect(x, y, w, h, 5 * scale);
        // Back cushion
        g.fillStyle(item.color, 0.9);
        g.fillRoundedRect(x + 5 * scale, y - 3 * scale, w - 10 * scale, 8 * scale, 3 * scale);
        // Seat cushions
        g.fillStyle(item.color, 0.6);
        g.fillRoundedRect(x + 5 * scale, y + 5 * scale, (w - 10 * scale) / 2 - 2 * scale, h - 10 * scale, 2 * scale);
        g.fillRoundedRect(x + w / 2 + 3 * scale, y + 5 * scale, (w - 10 * scale) / 2 - 2 * scale, h - 10 * scale, 2 * scale);
        break;
        
      case 'computer':
        g.fillStyle(item.color, 0.8);
        g.fillRect(x, y, w, h);
        g.fillStyle(0x4fc3f7, 0.6); // Screen
        g.fillRect(x + 2 * scale, y + 2 * scale, w - 4 * scale, h - 4 * scale);
        g.fillStyle(0x000000, 0.3); // Stand
        g.fillRect(x + w / 2 - 2 * scale, y + h, 4 * scale, 3 * scale);
        break;
    }
  }

  private leaveRoom() {
    this.socket.emit("room:leave");
    this.socket.off("player:joined");
    this.socket.off("player:moved");
    this.socket.off("player:left");
    this.socket.off("chat:message");
    this.scale.off("resize");
    this.removeChatInput();
    this.scene.start("RoomSelectScene");
  }

  private getScaleFactor(): number {
    const originalWidth = 700;
    const originalHeight = 500;
    const scaleX = this.scale.width / originalWidth;
    const scaleY = this.scale.height / originalHeight;
    return Math.min(scaleX, scaleY);
  }

  private getMapOffset(): { x: number; y: number } {
    const originalWidth = 700;
    const originalHeight = 500;
    const scale = this.getScaleFactor();
    const offsetX = (this.scale.width - originalWidth * scale) / 2;
    const offsetY = (this.scale.height - originalHeight * scale) / 2;
    return { x: offsetX, y: offsetY };
  }

  private getZoneAtPosition(x: number, y: number): Zone | null {
    const scale = this.getScaleFactor();
    const offset = this.getMapOffset();
    for (const zone of this.mapDef.zones) {
      const scaledX = offset.x + zone.x * scale;
      const scaledY = offset.y + zone.y * scale;
      const scaledW = zone.w * scale;
      const scaledH = zone.h * scale;
      if (x >= scaledX && x <= scaledX + scaledW && y >= scaledY && y <= scaledY + scaledH) {
        return zone;
      }
    }
    return null;
  }

  private checkWallCollision(x: number, y: number): boolean {
    const scale = this.getScaleFactor();
    const offset = this.getMapOffset();
    const playerSize = 16 * scale; // Scale player size
    for (const wall of this.mapDef.walls) {
      const scaledX = offset.x + wall.x * scale;
      const scaledY = offset.y + wall.y * scale;
      const scaledW = wall.w * scale;
      const scaledH = wall.h * scale;
      // Check if player bounding box intersects with wall
      if (x + playerSize > scaledX && 
          x - playerSize < scaledX + scaledW &&
          y + playerSize > scaledY && 
          y - playerSize < scaledY + scaledH) {
        return true;
      }
    }
    return false;
  }

  private checkFurnitureCollision(x: number, y: number): boolean {
    const scale = this.getScaleFactor();
    const offset = this.getMapOffset();
    const playerSize = 16 * scale; // Scale player size
    if (!this.mapDef.furniture) return false;
    
    for (const item of this.mapDef.furniture) {
      const scaledX = offset.x + item.x * scale;
      const scaledY = offset.y + item.y * scale;
      const scaledW = item.w * scale;
      const scaledH = item.h * scale;
      // Check if player bounding box intersects with furniture
      if (x + playerSize > scaledX && 
          x - playerSize < scaledX + scaledW &&
          y + playerSize > scaledY && 
          y - playerSize < scaledY + scaledH) {
        return true;
      }
    }
    return false;
  }

  private findSafePositionNear(x: number, y: number): { x: number; y: number } {
    const scale = this.getScaleFactor();
    const step = 16 * scale;
    for (let radius = step; radius < 200 * scale; radius += step) {
      const candidates = [
        { x: x + radius, y },
        { x: x - radius, y },
        { x, y: y + radius },
        { x, y: y - radius },
        { x: x + radius, y: y + radius },
        { x: x + radius, y: y - radius },
        { x: x - radius, y: y + radius },
        { x: x - radius, y: y - radius },
      ];
      for (const pos of candidates) {
        if (!this.checkWallCollision(pos.x, pos.y) && !this.checkFurnitureCollision(pos.x, pos.y)) {
          return pos;
        }
      }
    }
    return { x, y };
  }

  private showCollisionFeedback() {
    const now = Date.now();
    if (now - this.lastCollisionTime < 200) return; // Debounce feedback
    this.lastCollisionTime = now;

    // Flash player character red
    this.localPlayer.clear();
    this.drawCharacter(this.localPlayer, 0xff4444);
    
    // Reset after 100ms
    this.time.delayedCall(100, () => {
      this.localPlayer.clear();
      this.drawCharacter(this.localPlayer, 0x4fc3f7);
    });
  }

  private canEnterZone(zone: Zone): boolean {
    // Check occupancy limits
    if (zone.maxOccupancy !== undefined) {
      const playersInZone = this.playersInZones.get(zone.zoneId || zone.name) || [];
      if (playersInZone.length >= zone.maxOccupancy) {
        this.showZoneMessage(`${zone.name} is full (${playersInZone.length}/${zone.maxOccupancy})`);
        return false;
      }
    }

    // Private zones are accessible to all, but provide audio isolation
    // Movement is not restricted, only voice chat is isolated by zoneId
    return true;
  }

  private handleZoneChange(x: number, y: number) {
    const newZone = this.getZoneAtPosition(x, y);
    const myId = getStoredUser()?.id;

    // Left previous zone
    if (this.currentZone && (!newZone || newZone.name !== this.currentZone.name)) {
      const zoneKey = this.currentZone.zoneId || this.currentZone.name;
      const players = this.playersInZones.get(zoneKey) || [];
      const updatedPlayers = players.filter(id => id !== myId);
      
      if (updatedPlayers.length > 0) {
        this.playersInZones.set(zoneKey, updatedPlayers);
      } else {
        this.playersInZones.delete(zoneKey);
      }

      // Handle voice chat disconnection for private zones
      if (this.currentZone.type === 'private' && this.currentZone.proximityChat) {
        this.handlePrivateZoneLeave(this.currentZone);
      }
    }

    // Entered new zone
    if (newZone && (!this.currentZone || newZone.name !== this.currentZone.name)) {
      const zoneKey = newZone.zoneId || newZone.name;
      const players = this.playersInZones.get(zoneKey) || [];
      if (!players.includes(myId || '')) {
        players.push(myId || '');
        this.playersInZones.set(zoneKey, players);
      }

      // Show zone info
      this.showZoneInfo(newZone);

      // Handle voice chat for private zones
      if (newZone.type === 'private' && newZone.proximityChat) {
        this.handlePrivateZoneEnter(newZone);
      }

      // Handle study zone behavior
      if (newZone.type === 'study') {
        this.handleStudyZoneEnter(newZone);
      }
    }

    this.currentZone = newZone;
  }

  private showZoneInfo(zone: Zone) {
    let info = `📍 ${zone.name}`;
    
    if (zone.type === 'private') {
      info += ` (Private)`;
      if (zone.maxOccupancy) {
        const current = this.playersInZones.get(zone.zoneId || zone.name)?.length || 0;
        info += ` - ${current}/${zone.maxOccupancy}`;
      }
    } else if (zone.type === 'study') {
      info += ` (Study Zone)`;
      if (zone.maxOccupancy) {
        const current = this.playersInZones.get(zone.name)?.length || 0;
        info += ` - ${current}/${zone.maxOccupancy}`;
      }
    } else if (zone.type === 'meeting') {
      info += ` (Meeting Area)`;
      if (zone.maxOccupancy) {
        const current = this.playersInZones.get(zone.name)?.length || 0;
        info += ` - ${current}/${zone.maxOccupancy}`;
      }
    }

    this.zoneInfoLabel.setText(info);
    this.zoneInfoLabel.setPosition(10, 40);
    this.zoneInfoLabel.setAlpha(1);

    // Fade out after 3 seconds
    this.time.delayedCall(3000, () => {
      this.zoneInfoLabel.setAlpha(0);
    });
  }

  private showZoneMessage(message: string) {
    this.zoneInfoLabel.setText(`⚠️ ${message}`);
    this.zoneInfoLabel.setPosition(10, 40);
    this.zoneInfoLabel.setAlpha(1);

    // Fade out after 2 seconds
    this.time.delayedCall(2000, () => {
      this.zoneInfoLabel.setAlpha(0);
    });
  }

  private handlePrivateZoneEnter(zone: Zone) {
    // Connect to voice chat with players in the same private zone
    const zoneKey = zone.zoneId || zone.name;
    const playersInZone = this.playersInZones.get(zoneKey) || [];
    const myId = getStoredUser()?.id;

    // Disconnect from players not in this zone
    for (const playerId of this.otherPlayerIds) {
      if (!playersInZone.includes(playerId)) {
        voiceChat.removePeer(playerId);
      }
    }

    // Connect to players in this zone
    for (const playerId of playersInZone) {
      if (playerId !== myId) {
        voiceChat.connectTo(playerId);
      }
    }
  }

  private handlePrivateZoneLeave(_zone: Zone) {
    // Reconnect to all players when leaving private zone
    for (const playerId of this.otherPlayerIds) {
      voiceChat.connectTo(playerId);
    }
  }

  private handleStudyZoneEnter(zone: Zone) {
    // Study zone behavior - could be extended with study-specific features
    // For now, just show a quiet indicator
    this.zoneInfoLabel.setText(`📚 ${zone.name} - Quiet zone`);
    this.zoneInfoLabel.setPosition(10, 40);
    this.zoneInfoLabel.setAlpha(1);

    this.time.delayedCall(3000, () => {
      this.zoneInfoLabel.setAlpha(0);
    });
  }
}
