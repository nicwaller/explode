import { Room, Client } from "colyseus";
import { Schema, MapSchema, ArraySchema } from "@colyseus/schema";
export declare class Sprite extends Schema {
    x: number;
    y: number;
    width: number;
    height: number;
    constructor(width: number, height: number);
    boundingBox(): number[];
}
export declare class Tank extends Sprite {
    money: number;
    fireAngle: number;
    firePower: number;
    colour: number[];
    constructor();
    respawn(): void;
}
export declare class Shot extends Sprite {
    vx: number;
    vy: number;
    colour: number[];
    constructor();
    expire: boolean;
}
export declare class Arena extends Schema {
    terrainBuf: number[];
    terrain: string;
    width: number;
    height: number;
    gravity: number;
    wind: number;
    viscosity: number;
    tanks: MapSchema<Tank>;
    shots: ArraySchema<Shot>;
    generateTerrain(): void;
    sendTerrain(): void;
    constructor();
    createTank(sessionId: string): void;
    removeTank(sessionId: string): void;
    moveTank(sessionId: string, dx: number, dy: number): void;
    moveTankTurret(sessionId: string, delta: number): void;
    changePower(sessionId: string, delta: number): void;
    fire(sessionId: string): void;
}
export declare class WarRoom extends Room<Arena> {
    maxClients: number;
    onCreate(options: any): void;
    onAuth(client: any, options: any, req: any): boolean;
    onJoin(client: Client): void;
    onLeave(client: any): void;
    onDispose(): void;
}
