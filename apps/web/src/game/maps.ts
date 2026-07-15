export const TILE_SIZE = 48;

export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ZoneType = 'general' | 'private' | 'study' | 'meeting';

export interface Zone extends MapRect {
  name: string;
  color: number;
  alpha: number;
  type: ZoneType;
  zoneId?: string; // For private areas - same ID = same private space
  maxOccupancy?: number; // Maximum number of players allowed
  proximityChat?: boolean; // Enable proximity-based chat
}

export type FurnitureType = 'desk' | 'chair' | 'table' | 'plant' | 'door' | 'whiteboard' | 'bookshelf' | 'sofa' | 'computer';

export interface Furniture extends MapRect {
  type: FurnitureType;
  color: number;
  rotation?: number; // 0, 90, 180, 270 degrees
  label?: string;
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
  furniture?: Furniture[];
  floorPattern?: 'grid' | 'wood' | 'carpet' | 'tiles';
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
      { name: "Private Space", x: 80, y: 80, w: 200, h: 150, color: 0x6366f1, alpha: 0.15, type: 'private', zoneId: 'private-1', maxOccupancy: 4, proximityChat: true },
      { name: "Living Room", x: 310, y: 80, w: 290, h: 150, color: 0xa855f7, alpha: 0.15, type: 'general' },
      { name: "Kitchen", x: 80, y: 260, w: 250, h: 140, color: 0xec4899, alpha: 0.15, type: 'general' },
      { name: "Garage", x: 360, y: 260, w: 240, h: 140, color: 0xf59e0b, alpha: 0.15, type: 'general' },
    ],
    spawns: [
      { x: 300, y: 200, w: 48, h: 48 },
    ],
    floorPattern: 'grid',
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
      { name: "Clearing", x: 80, y: 80, w: 300, h: 200, color: 0x22c55e, alpha: 0.12, type: 'general' },
      { name: "Cabin", x: 420, y: 80, w: 280, h: 200, color: 0x92400e, alpha: 0.15, type: 'private', zoneId: 'cabin-1', maxOccupancy: 6, proximityChat: true },
      { name: "Pond", x: 80, y: 320, w: 300, h: 180, color: 0x0ea5e9, alpha: 0.12, type: 'general' },
      { name: "Campfire", x: 420, y: 320, w: 280, h: 180, color: 0xf97316, alpha: 0.15, type: 'meeting', maxOccupancy: 10 },
    ],
    spawns: [
      { x: 400, y: 300, w: 48, h: 48 },
    ],
    floorPattern: 'grid',
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
      { name: "Boardwalk", x: 80, y: 80, w: 620, h: 100, color: 0x8b5cf6, alpha: 0.12, type: 'general' },
      { name: "Beach", x: 80, y: 210, w: 300, h: 200, color: 0xeab308, alpha: 0.12, type: 'general' },
      { name: "Pier", x: 420, y: 210, w: 280, h: 100, color: 0x92400e, alpha: 0.15, type: 'private', zoneId: 'pier-1', maxOccupancy: 8, proximityChat: true },
      { name: "Water", x: 420, y: 340, w: 280, h: 160, color: 0x0ea5e9, alpha: 0.15, type: 'general' },
    ],
    spawns: [
      { x: 400, y: 300, w: 48, h: 48 },
    ],
    floorPattern: 'tiles',
  },

  office: {
    id: "office",
    bgColor: 0x2d3748,
    gridColor: 0x4a5568,
    gridAlpha: 0.3,
    wallColor: 0x1a202c,
      walls: [
        // Outer walls
        { x: 40, y: 40, w: 720, h: 20 },
        { x: 40, y: 40, w: 20, h: 520 },
        { x: 40, y: 540, w: 720, h: 20 },
        { x: 740, y: 40, w: 20, h: 520 },
        
        // Private area walls (top section) — each has a doorway gap at center
        { x: 180, y: 40, w: 15, h: 200 },
        { x: 320, y: 40, w: 15, h: 200 },
        { x: 460, y: 40, w: 15, h: 200 },
        { x: 600, y: 40, w: 15, h: 200 },
        
        // Horizontal divider — 48px doorways under each private place
        { x: 40, y: 240, w: 56, h: 15 },     // x:40-96
                                              // door: x:96-144 (48px, PP1 entry)
        { x: 144, y: 240, w: 90, h: 15 },    // x:144-234
                                              // door: x:234-282 (48px, PP2 entry)
        { x: 282, y: 240, w: 92, h: 15 },    // x:282-374
                                              // door: x:374-422 (48px, PP3 entry)
        { x: 422, y: 240, w: 92, h: 15 },    // x:422-514
                                              // door: x:514-562 (48px, PP4 entry)
        { x: 562, y: 240, w: 178, h: 15 },   // x:562-740
        
        // Study area divider — 48px doorway at y:380-428
        { x: 350, y: 240, w: 15, h: 140 },   // y:240-380
                                              // door: y:380-428 (48px)
        { x: 350, y: 428, w: 15, h: 132 },   // y:428-560
        
        // Meeting room back wall — 48px doorway at y:380-428
        { x: 600, y: 240, w: 15, h: 140 },   // y:240-380
                                              // door: y:380-428 (48px)
        { x: 600, y: 428, w: 15, h: 132 },   // y:428-560
      ],
    zones: [
      { name: "Private Place 1", x: 60, y: 60, w: 110, h: 170, color: 0x667eea, alpha: 0.15, type: 'private', zoneId: 'private-1', maxOccupancy: 2, proximityChat: true },
      { name: "Private Place 2", x: 200, y: 60, w: 110, h: 170, color: 0x667eea, alpha: 0.15, type: 'private', zoneId: 'private-2', maxOccupancy: 2, proximityChat: true },
      { name: "Private Place 3", x: 340, y: 60, w: 110, h: 170, color: 0x667eea, alpha: 0.15, type: 'private', zoneId: 'private-3', maxOccupancy: 2, proximityChat: true },
      { name: "Private Place 4", x: 480, y: 60, w: 110, h: 170, color: 0x667eea, alpha: 0.15, type: 'private', zoneId: 'private-4', maxOccupancy: 2, proximityChat: true },
      { name: "Study Area", x: 60, y: 260, w: 280, h: 290, color: 0x48bb78, alpha: 0.12, type: 'study', maxOccupancy: 12, proximityChat: false },
      { name: "Meeting Area", x: 370, y: 260, w: 220, h: 290, color: 0xed8936, alpha: 0.12, type: 'meeting', maxOccupancy: 20, proximityChat: true },
      { name: "Lounge", x: 620, y: 260, w: 110, h: 290, color: 0x9f7aea, alpha: 0.12, type: 'general' },
    ],
    spawns: [
      { x: 200, y: 400, w: 48, h: 48 },
    ],
    floorPattern: 'carpet',
    furniture: [
      // Private Place 1 furniture
      { type: 'desk', x: 70, y: 70, w: 40, h: 25, color: 0x8b5a2b },
      { type: 'chair', x: 85, y: 100, w: 15, h: 15, color: 0x4a5568 },
      { type: 'computer', x: 75, y: 75, w: 20, h: 15, color: 0x2d3748 },
      
      // Private Place 2 furniture
      { type: 'desk', x: 210, y: 70, w: 40, h: 25, color: 0x8b5a2b },
      { type: 'chair', x: 225, y: 100, w: 15, h: 15, color: 0x4a5568 },
      { type: 'computer', x: 215, y: 75, w: 20, h: 15, color: 0x2d3748 },
      
      // Private Place 3 furniture
      { type: 'desk', x: 350, y: 70, w: 40, h: 25, color: 0x8b5a2b },
      { type: 'chair', x: 365, y: 100, w: 15, h: 15, color: 0x4a5568 },
      { type: 'computer', x: 355, y: 75, w: 20, h: 15, color: 0x2d3748 },
      
      // Private Place 4 furniture
      { type: 'desk', x: 490, y: 70, w: 40, h: 25, color: 0x8b5a2b },
      { type: 'chair', x: 505, y: 100, w: 15, h: 15, color: 0x4a5568 },
      { type: 'computer', x: 495, y: 75, w: 20, h: 15, color: 0x2d3748 },
      
      // Study Area furniture — compact tables, clear right corridor for walking
      { type: 'table', x: 90, y: 270, w: 60, h: 30, color: 0x8b5a2b },
      { type: 'chair', x: 155, y: 275, w: 15, h: 15, color: 0x4a5568 },
      { type: 'chair', x: 90, y: 310, w: 15, h: 15, color: 0x4a5568 },
      
      { type: 'table', x: 180, y: 270, w: 60, h: 30, color: 0x8b5a2b },
      { type: 'chair', x: 245, y: 275, w: 15, h: 15, color: 0x4a5568 },
      { type: 'chair', x: 180, y: 310, w: 15, h: 15, color: 0x4a5568 },
      
      { type: 'table', x: 90, y: 370, w: 60, h: 30, color: 0x8b5a2b },
      { type: 'chair', x: 155, y: 375, w: 15, h: 15, color: 0x4a5568 },
      { type: 'chair', x: 90, y: 410, w: 15, h: 15, color: 0x4a5568 },
      
      { type: 'table', x: 180, y: 370, w: 60, h: 30, color: 0x8b5a2b },
      { type: 'chair', x: 245, y: 375, w: 15, h: 15, color: 0x4a5568 },
      { type: 'chair', x: 180, y: 410, w: 15, h: 15, color: 0x4a5568 },
      
      { type: 'bookshelf', x: 65, y: 270, w: 20, h: 50, color: 0x5a4a3a },
      { type: 'plant', x: 290, y: 480, w: 20, h: 20, color: 0x48bb78 },
      
      // Meeting Area furniture — smaller table so players can walk alongside it
      { type: 'table', x: 410, y: 320, w: 120, h: 60, color: 0x8b5a2b },
      { type: 'chair', x: 405, y: 300, w: 15, h: 15, color: 0x4a5568 },
      { type: 'chair', x: 445, y: 300, w: 15, h: 15, color: 0x4a5568 },
      { type: 'chair', x: 485, y: 300, w: 15, h: 15, color: 0x4a5568 },
      { type: 'chair', x: 405, y: 390, w: 15, h: 15, color: 0x4a5568 },
      { type: 'chair', x: 445, y: 390, w: 15, h: 15, color: 0x4a5568 },
      { type: 'chair', x: 485, y: 390, w: 15, h: 15, color: 0x4a5568 },
      { type: 'whiteboard', x: 380, y: 270, w: 180, h: 28, color: 0xffffff },
      
      // Lounge furniture — pushed right so players can walk on the left
      { type: 'sofa', x: 685, y: 280, w: 32, h: 28, color: 0x9f7aea },
      { type: 'table', x: 660, y: 340, w: 25, h: 20, color: 0x8b5a2b },
      { type: 'plant', x: 680, y: 260, w: 20, h: 20, color: 0x48bb78 },
      { type: 'plant', x: 685, y: 480, w: 20, h: 20, color: 0x48bb78 },
      
      // Decorative plants
      { type: 'plant', x: 60, y: 550, w: 20, h: 20, color: 0x48bb78 },
      { type: 'plant', x: 720, y: 550, w: 20, h: 20, color: 0x48bb78 },
    ],
  },
};

export function getMap(roomId: string): MapDef {
  return MAPS[roomId] ?? MAPS["town-square"];
}
