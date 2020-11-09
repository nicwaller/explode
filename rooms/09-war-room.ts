import { Room, Client } from "colyseus";
import {Schema, type, MapSchema, ArraySchema} from "@colyseus/schema";

export class Sprite extends Schema {
    // axis-aligned rectangles make for very easy collision detection
    @type("int16")
    x = 0;
    @type("int16")
    y = 0;
    @type("int16")
    width = 0;
    @type("int16")
    height = 0;

    constructor(width: number, height: number) {
        super();
        this.width = width;
        this.height = height;
        // [this.width, this.height] = [width, height];
    }

    boundingBox() {
        return [this.x, this.y, this.x + this.width, this.y + this.height];
    }
}

export class Tank extends Sprite {
    @type("int16")
    money = 0;

    @type("float32")
    fireAngle = 3.1415 / 2; // in radians

    @type("uint16")
    firePower = 300;

    @type(["number"])
    colour = [0,0,0]

    constructor() {
        super(50, 30);
        this.respawn();
    }

    respawn() {
        this.money /= 2;
        this.x = Math.floor(Math.random() * 900);
        this.y = 0; // TODO: how to get arena/terrain height?
        this.firePower = 300;
        this.fireAngle = 3.1415 / 2; // in radians
    }
}

export class Shot extends Sprite {
    @type("float32")
    vx = 0.0;

    @type("float32")
    vy = 0.0;

    @type(["number"])
    colour = [0,0,0]

    constructor() {
        super(5, 5);
    }

    expire = false;
}

export class Arena extends Schema {
    terrainBuf: number[] = [];
    @type("string") terrain = ''
    @type("uint16") width = 1000;
    @type("uint16") height = 600;
    @type("float32") gravity = 200;
    @type("float32") wind = Math.floor(Math.random() * 200) - 100;
    @type("float32") viscosity = 0.3;
    @type({ map: Tank }) tanks = new MapSchema<Tank>();
    @type([ Shot ]) shots = new ArraySchema<Shot>()

    // something = "This attribute won't be sent to the client-side";

    generateTerrain() {
        this.terrainBuf.length = 0;
        for (let i = 0; i < this.width; i++) {
            this.terrainBuf.push(this.height - Math.round(i/4))
        }
        this.sendTerrain()
    }

    sendTerrain() {
        this.terrain = [...this.terrainBuf].join(',')
    }

    constructor() {
        super();
        this.generateTerrain();
    }

    createTank(sessionId: string) {
        const tank = new Tank();
        tank.colour = [
            Math.max(0, Math.min(255, Math.random() * 255)),
            Math.max(0, Math.min(255, Math.random() * 255)),
            Math.max(0, Math.min(255, Math.random() * 255)),
        ]
        this.tanks.set(sessionId, tank);
    }

    removeTank(sessionId: string) {
        this.tanks.delete(sessionId);
    }

    // noinspection JSUnusedLocalSymbols
    moveTank(sessionId: string, dx: number, dy: number) {
        const tank = this.tanks.get(sessionId);
        tank.x += dx;
        // tank.y += dy;
        tank.y = this.terrainBuf[tank.x + tank.width/2];
    }

    moveTankTurret(sessionId: string, delta: number) {
        const tank = this.tanks.get(sessionId);
        tank.fireAngle += delta;
    }

    changePower(sessionId: string, delta: number) {
        const tank = this.tanks.get(sessionId);
        // tank.firePower += delta;
        tank.firePower = Math.max(0, Math.min(tank.firePower + delta, 2000));
    }

    fire(sessionId: string) {
        const tank = this.tanks.get(sessionId);
        const shot = new Shot();

        const turretLength = tank.firePower / 10;
        const dX = Math.cos(tank.fireAngle) * turretLength;
        const dY = 0 - Math.sin(tank.fireAngle) * turretLength;

        shot.x = tank.x + tank.width/2 + dX;
        shot.y = tank.y - 1 + dY;
        shot.vx = Math.cos(tank.fireAngle) * tank.firePower;
        shot.vy = 0 - Math.sin(tank.fireAngle) * tank.firePower;
        shot.colour = [
            Math.max(0, Math.min(255, tank.colour[0])),
            Math.max(0, Math.min(255, tank.colour[1])),
            Math.max(0, Math.min(255, tank.colour[2])),
        ]
        // console.log(tank.colour[0], tank.colour[1], tank.colour[2]);
        // console.log(shot.colour[0], shot.colour[1], shot.colour[2]);
        this.shots.push(shot);
    }
}

export class WarRoom extends Room<Arena> {
    maxClients = 25;

    onCreate (options) {
        console.log("StateHandlerRoom created!", options);

        this.setState(new Arena());

        this.onMessage("move", (client, data: {dx: number, dy: number}) => {
            // console.log("StateHandlerRoom received message from", client.sessionId, ":", data);
            this.state.moveTank(client.sessionId, data.dx, data.dy);
        });
        this.onMessage("moveTurret", (client, delta: number) => {
            this.state.moveTankTurret(client.sessionId, delta);
        });
        this.onMessage("changePower", (client, delta: number) => {
            this.state.changePower(client.sessionId, delta);
        });
        this.onMessage("fire", (client) => {
            this.state.fire(client.sessionId);
        });

        const fps = 20;

        function detectCollisions(arena: Arena,
                                  shotVsTank: (shot: Shot, tank: Tank) => void,
                                  shotVsGround: (shot: Shot) => void) {
            for (const tank of arena.tanks.values()) {
                const tankBox = tank.boundingBox();
                for (const shot of arena.shots) {
                    const shotBox = shot.boundingBox();
                    if (shotBox[0] > tankBox[2]) {
                        continue;
                    }
                    if (shotBox[2] < tankBox[0]) {
                        continue;
                    }
                    if (shotBox[1] > tankBox[3]) {
                        continue;
                    }
                    if (shotBox[3] < tankBox[1]) {
                        continue;
                    }
                    shotVsTank(shot, tank);
                }
            }
            for (const shot of arena.shots) {
                if (shot.y > arena.terrainBuf[Math.round(shot.x)]) {
                    shotVsGround(shot);
                }
            }
        }

        function explode(arena: Arena, x: number, y: number, radius = 25) {
            const left = Math.round(Math.max(0, x - radius));
            const right = Math.round(Math.min(arena.width, x + radius));
            for (let i = left; i <= right; i++) {
                const angle = Math.acos((i-x) / radius)
                const bottomOfCircle = Math.round(y + Math.sin(angle) * radius);
                arena.terrainBuf[i] = Math.max(bottomOfCircle, arena.terrainBuf[i])
            }
        }

        this.clock.setInterval(() => {
            for (const tank of this.state.tanks.values()) {
                if (tank.height + tank.y < this.state.terrainBuf[tank.x]) {
                    tank.y += 25;
                } else if (tank.height + tank.y > this.state.terrainBuf[tank.x]) {
                    tank.y = this.state.terrainBuf[tank.x] - tank.height;
                }
            }
            for (let i = this.state.shots.length - 1; i >= 0; i--) {
                const shot = this.state.shots[i];
                // console.log(shot.x, shot.y);
                // console.log(shot.vx, shot.vy);
                shot.x += shot.vx / fps;
                shot.y += shot.vy / fps;
                shot.vx *= 1 - (this.state.viscosity / fps); // air resistance
                shot.vy *= 1 - (this.state.viscosity / fps); // air resistance
                shot.vx += this.state.wind / fps;
                shot.vy += this.state.gravity / fps; // gravity
                if (shot.x < 0) {
                    shot.x = this.state.width;
                    // shot.vx = 0;
                } else if (shot.x > this.state.width) {
                    shot.x = 0;
                    // shot.vx = 0;
                }
                if (shot.y > this.state.height) {
                    shot.expire = true;
                }
                if (shot.expire) {
                    this.state.shots.splice(i, 1);
                }
                detectCollisions(this.state, (shot, tank) => {
                    shot.expire = true;
                    explode(this.state,tank.x + tank.width/2, tank.y + tank.height/2, 60)
                    this.state.sendTerrain();
                    tank.respawn();
                }, (shot) => {
                    explode(this.state, shot.x + shot.width/2, shot.y + shot.height/2, 20);
                    this.state.sendTerrain();
                    shot.expire = true;
                });
            }
        }, 1000/fps);
    }

    onAuth(client, options, req) {
        return true;
    }

    onJoin (client: Client) {
        this.state.createTank(client.sessionId);
    }

    onLeave (client) {
        this.state.removeTank(client.sessionId);
    }

    onDispose () {
        console.log("Dispose StateHandlerRoom");
    }

}
