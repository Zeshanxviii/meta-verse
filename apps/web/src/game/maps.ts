export const TILE_SIZE = 48;

export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Zone extends MapRect {
  name: string;
  color: number;
  alpha: number;
}

export interface MapDef {
  id: string;
  bgColor: number;
  gridColor: number;
  gridAlpha: number;
  wallColor: number;
  walls: MapRect[];
  zones: Zone[];
  spawns: MapRect[];
}

export const MAPS: Record<string, MapDef> = {
  "town-square": {
    id: "town-square",
    bgColor: 0x0f0f23,
    gridColor: 0x1a1a3e,
    gridAlpha: 0.4,
    wallColor: 0x4a4a8a,
    walls: [
      // building walls
      { x: 50, y: 50, w: 20, h: 400 },
      { x: 50, y: 50, w: 600, h: 20 },
      { x: 630, y: 50, w: 20, h: 400 },
      { x: 50, y: 430, w: 600, h: 20 },
    ],
    zones: [
      { name: "Private Space", x: 80, y: 80, w: 200, h: 150, color: 0x6366f1, alpha: 0.15 },
      { name: "Living Room", x: 310, y: 80, w: 290, h: 150, color: 0xa855f7, alpha: 0.15 },
      { name: "Kitchen", x: 80, y: 260, w: 250, h: 140, color: 0xec4899, alpha: 0.15 },
      { name: "Garage", x: 360, y: 260, w: 240, h: 140, color: 0xf59e0b, alpha: 0.15 },
    ],
    spawns: [
      { x: 300, y: 200, w: 48, h: 48 },
    ],
  },

  forest: {
    id: "forest",
    bgColor: 0x0a1a0a,
    gridColor: 0x1a3a1a,
    gridAlpha: 0.4,
    wallColor: 0x3a6a3a,
    walls: [
      { x: 50, y: 50, w: 20, h: 500 },
      { x: 50, y: 50, w: 700, h: 20 },
      { x: 730, y: 50, w: 20, h: 500 },
      { x: 50, y: 530, w: 700, h: 20 },
    ],
    zones: [
      { name: "Clearing", x: 80, y: 80, w: 300, h: 200, color: 0x22c55e, alpha: 0.12 },
      { name: "Cabin", x: 420, y: 80, w: 280, h: 200, color: 0x92400e, alpha: 0.15 },
      { name: "Pond", x: 80, y: 320, w: 300, h: 180, color: 0x0ea5e9, alpha: 0.12 },
      { name: "Campfire", x: 420, y: 320, w: 280, h: 180, color: 0xf97316, alpha: 0.15 },
    ],
    spawns: [
      { x: 400, y: 300, w: 48, h: 48 },
    ],
  },

  beach: {
    id: "beach",
    bgColor: 0x0f1a2e,
    gridColor: 0x1a2e4a,
    gridAlpha: 0.4,
    wallColor: 0x4a7a9a,
    walls: [
      { x: 50, y: 50, w: 20, h: 500 },
      { x: 50, y: 50, w: 700, h: 20 },
      { x: 730, y: 50, w: 20, h: 500 },
      { x: 50, y: 530, w: 700, h: 20 },
    ],
    zones: [
      { name: "Boardwalk", x: 80, y: 80, w: 620, h: 100, color: 0x8b5cf6, alpha: 0.12 },
      { name: "Beach", x: 80, y: 210, w: 300, h: 200, color: 0xeab308, alpha: 0.12 },
      { name: "Pier", x: 420, y: 210, w: 280, h: 100, color: 0x92400e, alpha: 0.15 },
      { name: "Water", x: 420, y: 340, w: 280, h: 160, color: 0x0ea5e9, alpha: 0.15 },
    ],
    spawns: [
      { x: 400, y: 300, w: 48, h: 48 },
    ],
  },
};

export function getMap(roomId: string): MapDef {
  return MAPS[roomId] ?? MAPS["town-square"];
}
