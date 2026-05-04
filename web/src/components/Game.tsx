import { useRef, useEffect, useCallback } from "react";
import * as BABYLON from "@babylonjs/core";

interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
}

// --- Pin layout: standard triangle, 10 pins ---
// Row 0 (front): pin 0
// Row 1: pins 1,2
// Row 2: pins 3,4,5
// Row 3: pins 6,7,8,9
const PIN_SPACING = 0.9;
const PIN_Z_START = -18;

function getPinPositions(): BABYLON.Vector3[] {
  const positions: BABYLON.Vector3[] = [];
  let id = 0;
  for (let row = 0; row < 4; row++) {
    const count = row + 1;
    const offsetX = -(count - 1) * PIN_SPACING * 0.5;
    for (let col = 0; col < count; col++) {
      positions[id] = new BABYLON.Vector3(
        offsetX + col * PIN_SPACING,
        0,
        PIN_Z_START - row * PIN_SPACING,
      );
      id++;
    }
  }
  return positions;
}

const PIN_POSITIONS = getPinPositions();
const LANE_WIDTH = 5;
const LANE_LENGTH = 25;
const BALL_RADIUS = 0.35;
const PIN_RADIUS = 0.15;
const PIN_HEIGHT = 0.9;
const BALL_SPEED = 25;
const KNOCK_DISTANCE = 0.55;
const TOTAL_FRAMES = 10;

interface PinState {
  mesh: BABYLON.Mesh;
  knocked: boolean;
  fallAngle: number;
  fallAxis: BABYLON.Vector3;
  originalPos: BABYLON.Vector3;
}

interface FrameScore {
  throws: number[];
  pinsDown: number[];
}

function computeTotalScore(frames: FrameScore[]): number {
  let total = 0;
  // Flatten all throws for bonus lookups
  const allThrows: number[] = [];
  for (const f of frames) {
    for (const t of f.throws) {
      allThrows.push(t);
    }
  }

  let throwIdx = 0;
  for (let f = 0; f < 10; f++) {
    const frame = frames[f];
    if (!frame) break;

    if (f < 9) {
      // Normal frame
      if (frame.throws[0] === 10) {
        // Strike
        const b1 = allThrows[throwIdx + 1] ?? 0;
        const b2 = allThrows[throwIdx + 2] ?? 0;
        total += 10 + b1 + b2;
        throwIdx += 1;
      } else if ((frame.throws[0] ?? 0) + (frame.throws[1] ?? 0) === 10) {
        // Spare
        const b1 = allThrows[throwIdx + 2] ?? 0;
        total += 10 + b1;
        throwIdx += 2;
      } else {
        total += (frame.throws[0] ?? 0) + (frame.throws[1] ?? 0);
        throwIdx += 2;
      }
    } else {
      // 10th frame: just sum all throws (up to 3)
      for (const t of frame.throws) {
        total += t;
      }
      throwIdx += frame.throws.length;
    }
  }
  return total;
}

type ThrowPhase = "aiming" | "power" | "rolling" | "settling" | "done";

export function Game({ onScore, onGameOver }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<BABYLON.Engine | null>(null);
  const onScoreRef = useRef(onScore);
  const onGameOverRef = useRef(onGameOver);
  onScoreRef.current = onScore;
  onGameOverRef.current = onGameOver;

  const cleanup = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true });
    engineRef.current = engine;
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.06, 0.09, 0.16, 1);

    // Camera
    const camera = new BABYLON.ArcRotateCamera(
      "cam",
      Math.PI,
      Math.PI / 4,
      20,
      new BABYLON.Vector3(0, 0, -8),
      scene,
    );
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 30;
    camera.attachControl(canvas, false);

    // Lights
    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 0.6;
    const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-1, -2, -1), scene);
    dir.intensity = 0.8;
    dir.position = new BABYLON.Vector3(5, 10, 5);

    // Lane floor
    const lane = BABYLON.MeshBuilder.CreateBox("lane", {
      width: LANE_WIDTH,
      height: 0.2,
      depth: LANE_LENGTH,
    }, scene);
    lane.position.y = -0.1;
    lane.position.z = -LANE_LENGTH / 2 + 5;
    const laneMat = new BABYLON.StandardMaterial("laneMat", scene);
    laneMat.diffuseColor = new BABYLON.Color3(0.76, 0.6, 0.42);
    laneMat.specularColor = new BABYLON.Color3(0.3, 0.25, 0.15);
    lane.material = laneMat;

    // Gutters
    for (const side of [-1, 1]) {
      const gutter = BABYLON.MeshBuilder.CreateBox("gutter", {
        width: 0.5,
        height: 0.15,
        depth: LANE_LENGTH,
      }, scene);
      gutter.position.x = side * (LANE_WIDTH / 2 + 0.25);
      gutter.position.y = -0.05;
      gutter.position.z = -LANE_LENGTH / 2 + 5;
      const gutterMat = new BABYLON.StandardMaterial("gutterMat", scene);
      gutterMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.35);
      gutter.material = gutterMat;
    }

    // Back wall
    const backWall = BABYLON.MeshBuilder.CreateBox("backWall", {
      width: LANE_WIDTH + 1,
      height: 2,
      depth: 0.3,
    }, scene);
    backWall.position.z = PIN_Z_START - 3.5;
    backWall.position.y = 1;
    const wallMat = new BABYLON.StandardMaterial("wallMat", scene);
    wallMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.25);
    backWall.material = wallMat;

    // Pin material
    const pinMat = new BABYLON.StandardMaterial("pinMat", scene);
    pinMat.diffuseColor = new BABYLON.Color3(0.95, 0.95, 0.9);
    pinMat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);

    const pinRedMat = new BABYLON.StandardMaterial("pinRedMat", scene);
    pinRedMat.diffuseColor = new BABYLON.Color3(0.85, 0.15, 0.15);

    // Create pins
    function createPins(): PinState[] {
      const pins: PinState[] = [];
      for (let i = 0; i < 10; i++) {
        const pos = PIN_POSITIONS[i]!;
        // Pin body (cylinder)
        const body = BABYLON.MeshBuilder.CreateCylinder(`pin${i}`, {
          height: PIN_HEIGHT,
          diameterTop: PIN_RADIUS * 1.2,
          diameterBottom: PIN_RADIUS * 2.2,
          tessellation: 12,
        }, scene);
        body.position = pos.clone();
        body.position.y = PIN_HEIGHT / 2;
        body.material = pinMat;

        // Red stripe
        const stripe = BABYLON.MeshBuilder.CreateCylinder(`stripe${i}`, {
          height: 0.12,
          diameter: PIN_RADIUS * 2.3,
          tessellation: 12,
        }, scene);
        stripe.parent = body;
        stripe.position.y = 0.15;
        stripe.material = pinRedMat;

        pins.push({
          mesh: body,
          knocked: false,
          fallAngle: 0,
          fallAxis: BABYLON.Vector3.Right(),
          originalPos: pos.clone(),
        });
      }
      return pins;
    }

    let pins = createPins();

    // Ball
    const ball = BABYLON.MeshBuilder.CreateSphere("ball", { diameter: BALL_RADIUS * 2, segments: 16 }, scene);
    const ballMat = new BABYLON.StandardMaterial("ballMat", scene);
    ballMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.6);
    ballMat.specularColor = new BABYLON.Color3(0.4, 0.4, 0.6);
    ball.material = ballMat;

    // Finger holes
    for (let h = 0; h < 3; h++) {
      const hole = BABYLON.MeshBuilder.CreateCylinder(`hole${h}`, {
        height: 0.08,
        diameter: 0.08,
        tessellation: 8,
      }, scene);
      hole.parent = ball;
      const angle = (h - 1) * 0.3;
      hole.position.set(Math.sin(angle) * 0.2, BALL_RADIUS - 0.02, Math.cos(angle) * 0.2);
      const holeMat = new BABYLON.StandardMaterial(`holeMat${h}`, scene);
      holeMat.diffuseColor = new BABYLON.Color3(0.02, 0.02, 0.1);
      hole.material = holeMat;
    }

    // Aiming arrow
    const arrow = BABYLON.MeshBuilder.CreateBox("arrow", { width: 0.08, height: 0.02, depth: 2 }, scene);
    const arrowMat = new BABYLON.StandardMaterial("arrowMat", scene);
    arrowMat.diffuseColor = new BABYLON.Color3(1, 0.3, 0.3);
    arrowMat.emissiveColor = new BABYLON.Color3(0.5, 0.1, 0.1);
    arrow.material = arrowMat;

    // Power meter (HUD-like bar on lane)
    const powerBar = BABYLON.MeshBuilder.CreateBox("powerBar", { width: 0.3, height: 0.02, depth: 3 }, scene);
    powerBar.position.set(LANE_WIDTH / 2 + 0.8, 0.1, 3);
    const powerBarMat = new BABYLON.StandardMaterial("powerBarMat", scene);
    powerBarMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    powerBarMat.alpha = 0.5;
    powerBar.material = powerBarMat;

    const powerFill = BABYLON.MeshBuilder.CreateBox("powerFill", { width: 0.28, height: 0.03, depth: 0.1 }, scene);
    powerFill.position.set(LANE_WIDTH / 2 + 0.8, 0.12, 1.5);
    const powerFillMat = new BABYLON.StandardMaterial("powerFillMat", scene);
    powerFillMat.diffuseColor = new BABYLON.Color3(0.2, 0.9, 0.2);
    powerFillMat.emissiveColor = new BABYLON.Color3(0.1, 0.4, 0.1);
    powerFill.material = powerFillMat;

    // Game state
    let throwPhase: ThrowPhase = "aiming";
    let aimX = 0;
    let aimDir = 1;
    let power = 0;
    let powerDir = 1;
    const ballStartZ = 5;
    let ballZ = ballStartZ;
    let ballX = 0;
    let ballVx = 0;
    let settleTimer = 0;

    let currentFrame = 0;
    let currentThrow = 0; // 0 or 1 (or 0,1,2 in 10th frame)
    let standingBeforeThrow: boolean[] = new Array(10).fill(true) as boolean[];
    const frames: FrameScore[] = [];
    for (let i = 0; i < 10; i++) {
      frames.push({ throws: [], pinsDown: [] });
    }

    function resetBallPosition() {
      ballZ = ballStartZ;
      ballX = 0;
      ballVx = 0;
      ball.position.set(0, BALL_RADIUS, ballStartZ);
      ball.isVisible = true;
    }

    function resetAllPins() {
      // Remove old pin meshes
      for (const p of pins) {
        p.mesh.dispose();
      }
      pins = createPins();
      standingBeforeThrow = new Array(10).fill(true) as boolean[];
    }

    function resetStandingPins() {
      // Only reset pins that are still standing
      for (let i = 0; i < pins.length; i++) {
        const p = pins[i]!;
        if (!p.knocked) {
          // Already standing, just ensure position
          p.mesh.position = p.originalPos.clone();
          p.mesh.position.y = PIN_HEIGHT / 2;
          p.mesh.rotation = BABYLON.Vector3.Zero();
          p.fallAngle = 0;
        }
      }
      // Track which pins are standing before this throw
      standingBeforeThrow = pins.map(p => !p.knocked);
    }

    function hideKnockedPins() {
      for (const p of pins) {
        if (p.knocked) {
          p.mesh.isVisible = false;
        }
      }
    }

    function updateScore() {
      const total = computeTotalScore(frames);
      onScoreRef.current(total);
    }

    function startAiming() {
      throwPhase = "aiming";
      aimX = 0;
      aimDir = 1;
      power = 0;
      powerDir = 1;
      resetBallPosition();

      // Camera behind ball
      camera.target = new BABYLON.Vector3(0, 0, -5);
      camera.alpha = Math.PI;
      camera.beta = Math.PI / 4;
      camera.radius = 18;

      arrow.isVisible = true;
      powerBar.isVisible = false;
      powerFill.isVisible = false;
    }

    function startPower() {
      throwPhase = "power";
      power = 0;
      powerDir = 1;
      arrow.isVisible = false;
      powerBar.isVisible = true;
      powerFill.isVisible = true;
    }

    function throwBall() {
      throwPhase = "rolling";
      ballX = aimX;
      ballZ = ballStartZ;
      ballVx = aimX * -0.3; // Slight curve based on aim offset
      ball.position.x = ballX;
      ball.position.z = ballZ;

      powerBar.isVisible = false;
      powerFill.isVisible = false;

      // Camera follows ball
      camera.target = new BABYLON.Vector3(0, 0, -8);
    }

    function handleThrowComplete() {
      // Count newly knocked pins
      let newlyKnocked = 0;
      for (let i = 0; i < pins.length; i++) {
        if (pins[i]!.knocked && standingBeforeThrow[i]) {
          newlyKnocked++;
        }
      }

      const frame = frames[currentFrame]!;
      frame.throws.push(newlyKnocked);
      frame.pinsDown.push(newlyKnocked);
      updateScore();

      const isStrike = currentThrow === 0 && newlyKnocked === 10;
      const totalDown = frame.throws.reduce((a, b) => a + b, 0);
      const isSpare = currentThrow === 1 && totalDown >= 10;

      if (currentFrame < 9) {
        // Normal frames
        if (isStrike || currentThrow === 1) {
          // Frame done
          currentFrame++;
          currentThrow = 0;
          if (currentFrame >= TOTAL_FRAMES) {
            onGameOverRef.current();
            return;
          }
          resetAllPins();
          startAiming();
        } else {
          // Second throw
          currentThrow = 1;
          hideKnockedPins();
          resetStandingPins();
          startAiming();
        }
      } else {
        // 10th frame
        if (currentThrow === 0) {
          if (isStrike) {
            // Reset all pins for 2nd throw in 10th
            currentThrow = 1;
            resetAllPins();
            startAiming();
          } else {
            currentThrow = 1;
            hideKnockedPins();
            resetStandingPins();
            startAiming();
          }
        } else if (currentThrow === 1) {
          const firstThrow = frame.throws[0] ?? 0;
          if (firstThrow === 10) {
            // First was strike
            if (newlyKnocked === 10) {
              // Second is also strike, reset pins
              currentThrow = 2;
              resetAllPins();
              startAiming();
            } else {
              // Second is not strike, keep standing
              currentThrow = 2;
              hideKnockedPins();
              resetStandingPins();
              startAiming();
            }
          } else if (isSpare) {
            // Spare: reset all pins for 3rd throw
            currentThrow = 2;
            resetAllPins();
            startAiming();
          } else {
            // No spare, game over
            onGameOverRef.current();
            return;
          }
        } else {
          // 3rd throw done, game over
          onGameOverRef.current();
          return;
        }
      }
    }

    // Input
    const inputAction = () => {
      if (throwPhase === "aiming") {
        startPower();
      } else if (throwPhase === "power") {
        throwBall();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        inputAction();
      } else if (e.key === "ArrowLeft" && throwPhase === "aiming") {
        aimX = Math.max(-LANE_WIDTH / 2 + 0.5, aimX - 0.2);
      } else if (e.key === "ArrowRight" && throwPhase === "aiming") {
        aimX = Math.min(LANE_WIDTH / 2 - 0.5, aimX + 0.2);
      }
    };

    const handlePointerDown = () => {
      inputAction();
    };

    window.addEventListener("keydown", handleKeyDown);
    canvas.addEventListener("pointerdown", handlePointerDown);

    // Main loop
    startAiming();

    scene.registerBeforeRender(() => {
      const dt = engine.getDeltaTime() / 1000;

      if (throwPhase === "aiming") {
        // Auto-oscillate aim
        aimX += aimDir * 2.5 * dt;
        if (aimX > LANE_WIDTH / 2 - 0.5) {
          aimX = LANE_WIDTH / 2 - 0.5;
          aimDir = -1;
        } else if (aimX < -LANE_WIDTH / 2 + 0.5) {
          aimX = -LANE_WIDTH / 2 + 0.5;
          aimDir = 1;
        }
        ball.position.x = aimX;
        ball.position.z = ballStartZ;
        ball.position.y = BALL_RADIUS;

        // Arrow
        arrow.position.set(aimX, 0.05, ballStartZ - 1.5);
        arrow.isVisible = true;
      }

      if (throwPhase === "power") {
        power += powerDir * 1.5 * dt;
        if (power >= 1) {
          power = 1;
          powerDir = -1;
        } else if (power <= 0) {
          power = 0;
          powerDir = 1;
        }
        // Update power fill
        const fillDepth = power * 2.8;
        powerFill.scaling.z = Math.max(0.01, fillDepth / 0.1);
        powerFill.position.z = 1.5 + (fillDepth - 2.8) / 2;

        // Color: green -> yellow -> red
        if (power < 0.5) {
          powerFillMat.diffuseColor = new BABYLON.Color3(0.2 + power, 0.9, 0.2);
        } else {
          powerFillMat.diffuseColor = new BABYLON.Color3(0.9, 1.2 - power, 0.2);
        }
      }

      if (throwPhase === "rolling") {
        const speed = BALL_SPEED * (0.4 + power * 0.6);
        ballZ -= speed * dt;
        ballX += ballVx * dt;

        // Clamp to lane
        ballX = Math.max(-LANE_WIDTH / 2 + BALL_RADIUS, Math.min(LANE_WIDTH / 2 - BALL_RADIUS, ballX));

        ball.position.x = ballX;
        ball.position.z = ballZ;
        ball.position.y = BALL_RADIUS;

        // Roll rotation
        ball.rotation.x -= speed * dt / BALL_RADIUS;

        // Check pin collisions
        let hitAny = false;
        for (let i = 0; i < pins.length; i++) {
          const p = pins[i]!;
          if (p.knocked) continue;
          const dx = ballX - p.originalPos.x;
          const dz = ballZ - p.originalPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < KNOCK_DISTANCE) {
            p.knocked = true;
            hitAny = true;
            // Determine fall direction away from ball
            const fallDirX = dx !== 0 ? -dx : (Math.random() - 0.5);
            const fallDirZ = dz !== 0 ? -dz : -1;
            p.fallAxis = new BABYLON.Vector3(fallDirZ, 0, -fallDirX).normalize();
            p.fallAngle = 0;

            // Chain reaction: knock nearby standing pins
            for (let j = 0; j < pins.length; j++) {
              if (j === i || pins[j]!.knocked) continue;
              const px = p.originalPos.x - pins[j]!.originalPos.x;
              const pz = p.originalPos.z - pins[j]!.originalPos.z;
              const pinDist = Math.sqrt(px * px + pz * pz);
              if (pinDist < PIN_SPACING * 1.1) {
                // Check if this pin is roughly behind the hit pin relative to ball direction
                const dot = px * dx + pz * dz;
                if (dot < 0) {
                  pins[j]!.knocked = true;
                  pins[j]!.fallAxis = new BABYLON.Vector3(-pz, 0, px).normalize();
                  pins[j]!.fallAngle = 0;
                }
              }
            }
          }
        }

        if (hitAny) {
          // Slow ball slightly on hit
          ballVx *= 0.7;
        }

        // Ball passed pins or off lane
        if (ballZ < PIN_Z_START - 5) {
          throwPhase = "settling";
          settleTimer = 0;
          ball.isVisible = false;
        }
      }

      if (throwPhase === "settling") {
        settleTimer += dt;
        if (settleTimer > 1.2) {
          throwPhase = "done";
          handleThrowComplete();
        }
      }

      // Animate falling pins
      for (const p of pins) {
        if (p.knocked && p.fallAngle < Math.PI / 2) {
          p.fallAngle = Math.min(Math.PI / 2, p.fallAngle + dt * 5);
          // Rotate around base
          const quat = BABYLON.Quaternion.RotationAxis(p.fallAxis, p.fallAngle);
          p.mesh.rotationQuaternion = quat;
          // Adjust position so it tips from base
          p.mesh.position.y = p.originalPos.y + PIN_HEIGHT / 2 * Math.cos(p.fallAngle);
          const tipOffset = PIN_HEIGHT / 2 * Math.sin(p.fallAngle);
          const cross = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), p.fallAxis).normalize();
          p.mesh.position.x = p.originalPos.x + cross.x * tipOffset;
          p.mesh.position.z = p.originalPos.z + cross.z * tipOffset;
        }
      }
    });

    engine.runRenderLoop(() => scene.render());
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", onResize);
      engine.dispose();
    };
  }, [cleanup]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", outline: "none" }}
      tabIndex={0}
    />
  );
}
