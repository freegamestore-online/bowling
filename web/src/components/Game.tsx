import { useRef, useEffect, useCallback } from "react";
import * as BABYLON from "@babylonjs/core";

interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
}

// --- Pin layout: standard triangle, 10 pins ---
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
const PIN_CHAIN_DISTANCE = PIN_SPACING * 1.2;
const TOTAL_FRAMES = 10;

interface PinState {
  mesh: BABYLON.Mesh;
  knocked: boolean;
  fallAngle: number;
  fallAxis: BABYLON.Vector3;
  originalPos: BABYLON.Vector3;
  knockDelay: number;
}

interface FrameScore {
  throws: number[];
  pinsDown: number[];
}

function computeTotalScore(frames: FrameScore[]): number {
  let total = 0;
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
      if (frame.throws[0] === 10) {
        const b1 = allThrows[throwIdx + 1] ?? 0;
        const b2 = allThrows[throwIdx + 2] ?? 0;
        total += 10 + b1 + b2;
        throwIdx += 1;
      } else if ((frame.throws[0] ?? 0) + (frame.throws[1] ?? 0) === 10) {
        const b1 = allThrows[throwIdx + 2] ?? 0;
        total += 10 + b1;
        throwIdx += 2;
      } else {
        total += (frame.throws[0] ?? 0) + (frame.throws[1] ?? 0);
        throwIdx += 2;
      }
    } else {
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

    const engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    engineRef.current = engine;
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.06, 0.09, 0.16, 1);

    // ---- Camera: fixed behind ball, no user rotation ----
    const camera = new BABYLON.FreeCamera(
      "cam",
      new BABYLON.Vector3(0, 6, 12),
      scene,
    );
    camera.setTarget(new BABYLON.Vector3(0, 0, -10));
    // Do NOT attach controls -- we control the camera ourselves

    // ---- Lighting ----
    const hemi = new BABYLON.HemisphericLight(
      "hemi",
      new BABYLON.Vector3(0, 1, 0),
      scene,
    );
    hemi.intensity = 0.7;
    hemi.groundColor = new BABYLON.Color3(0.15, 0.12, 0.1);

    const dir = new BABYLON.DirectionalLight(
      "dir",
      new BABYLON.Vector3(-0.5, -2, -1).normalize(),
      scene,
    );
    dir.intensity = 0.9;
    dir.position = new BABYLON.Vector3(5, 12, 5);

    // Subtle point light near pins for visibility
    const pinSpot = new BABYLON.PointLight(
      "pinSpot",
      new BABYLON.Vector3(0, 5, PIN_Z_START),
      scene,
    );
    pinSpot.intensity = 0.5;
    pinSpot.diffuse = new BABYLON.Color3(1, 0.95, 0.85);

    // ---- Lane floor ----
    const lane = BABYLON.MeshBuilder.CreateBox(
      "lane",
      { width: LANE_WIDTH, height: 0.2, depth: LANE_LENGTH },
      scene,
    );
    lane.position.y = -0.1;
    lane.position.z = -LANE_LENGTH / 2 + 5;
    const laneMat = new BABYLON.StandardMaterial("laneMat", scene);
    laneMat.diffuseColor = new BABYLON.Color3(0.76, 0.6, 0.42);
    laneMat.specularColor = new BABYLON.Color3(0.4, 0.35, 0.2);
    laneMat.specularPower = 64;
    lane.material = laneMat;

    // Lane arrows (decorative guide marks)
    for (let i = -1; i <= 1; i++) {
      const guide = BABYLON.MeshBuilder.CreateBox(
        `guide${i}`,
        { width: 0.06, height: 0.01, depth: 1.5 },
        scene,
      );
      guide.position.set(i * 0.8, 0.01, 1);
      const gMat = new BABYLON.StandardMaterial(`gMat${i}`, scene);
      gMat.diffuseColor = new BABYLON.Color3(0.55, 0.4, 0.25);
      gMat.alpha = 0.5;
      guide.material = gMat;
    }

    // ---- Gutters ----
    for (const side of [-1, 1]) {
      const gutter = BABYLON.MeshBuilder.CreateBox(
        "gutter",
        { width: 0.5, height: 0.15, depth: LANE_LENGTH },
        scene,
      );
      gutter.position.x = side * (LANE_WIDTH / 2 + 0.25);
      gutter.position.y = -0.05;
      gutter.position.z = -LANE_LENGTH / 2 + 5;
      const gutterMat = new BABYLON.StandardMaterial("gutterMat", scene);
      gutterMat.diffuseColor = new BABYLON.Color3(0.25, 0.25, 0.3);
      gutter.material = gutterMat;
    }

    // ---- Back wall ----
    const backWall = BABYLON.MeshBuilder.CreateBox(
      "backWall",
      { width: LANE_WIDTH + 1, height: 2, depth: 0.3 },
      scene,
    );
    backWall.position.z = PIN_Z_START - 3.5;
    backWall.position.y = 1;
    const wallMat = new BABYLON.StandardMaterial("wallMat", scene);
    wallMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.25);
    backWall.material = wallMat;

    // ---- Pin materials ----
    const pinMat = new BABYLON.StandardMaterial("pinMat", scene);
    pinMat.diffuseColor = new BABYLON.Color3(0.97, 0.97, 0.92);
    pinMat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.6);
    pinMat.specularPower = 32;

    const pinRedMat = new BABYLON.StandardMaterial("pinRedMat", scene);
    pinRedMat.diffuseColor = new BABYLON.Color3(0.85, 0.15, 0.15);

    // ---- Create pins ----
    function createPins(): PinState[] {
      const pins: PinState[] = [];
      for (let i = 0; i < 10; i++) {
        const pos = PIN_POSITIONS[i]!;
        const body = BABYLON.MeshBuilder.CreateCylinder(
          `pin${i}`,
          {
            height: PIN_HEIGHT,
            diameterTop: PIN_RADIUS * 1.2,
            diameterBottom: PIN_RADIUS * 2.2,
            tessellation: 12,
          },
          scene,
        );
        body.position = pos.clone();
        body.position.y = PIN_HEIGHT / 2;
        body.material = pinMat;

        // Red stripe
        const stripe = BABYLON.MeshBuilder.CreateCylinder(
          `stripe${i}`,
          { height: 0.12, diameter: PIN_RADIUS * 2.3, tessellation: 12 },
          scene,
        );
        stripe.parent = body;
        stripe.position.y = 0.15;
        stripe.material = pinRedMat;

        pins.push({
          mesh: body,
          knocked: false,
          fallAngle: 0,
          fallAxis: BABYLON.Vector3.Right(),
          originalPos: pos.clone(),
          knockDelay: 0,
        });
      }
      return pins;
    }

    let pins = createPins();

    // ---- Ball ----
    const ball = BABYLON.MeshBuilder.CreateSphere(
      "ball",
      { diameter: BALL_RADIUS * 2, segments: 24 },
      scene,
    );
    const ballMat = new BABYLON.StandardMaterial("ballMat", scene);
    ballMat.diffuseColor = new BABYLON.Color3(0.15, 0.08, 0.55);
    ballMat.specularColor = new BABYLON.Color3(0.6, 0.6, 0.8);
    ballMat.specularPower = 64;
    ball.material = ballMat;

    // Finger holes
    for (let h = 0; h < 3; h++) {
      const hole = BABYLON.MeshBuilder.CreateCylinder(
        `hole${h}`,
        { height: 0.08, diameter: 0.09, tessellation: 8 },
        scene,
      );
      hole.parent = ball;
      const angle = (h - 1) * 0.3;
      hole.position.set(
        Math.sin(angle) * 0.2,
        BALL_RADIUS - 0.02,
        Math.cos(angle) * 0.2,
      );
      const holeMat = new BABYLON.StandardMaterial(`holeMat${h}`, scene);
      holeMat.diffuseColor = new BABYLON.Color3(0.02, 0.02, 0.08);
      hole.material = holeMat;
    }

    // ---- Aiming arrow (3D indicator on lane) ----
    const arrow = BABYLON.MeshBuilder.CreateBox(
      "arrow",
      { width: 0.1, height: 0.02, depth: 2.5 },
      scene,
    );
    const arrowMat = new BABYLON.StandardMaterial("arrowMat", scene);
    arrowMat.diffuseColor = new BABYLON.Color3(1, 0.35, 0.35);
    arrowMat.emissiveColor = new BABYLON.Color3(0.6, 0.15, 0.15);
    arrowMat.alpha = 0.8;
    arrow.material = arrowMat;

    // Arrow head (triangle)
    const arrowHead = BABYLON.MeshBuilder.CreateCylinder(
      "arrowHead",
      { height: 0.02, diameterTop: 0, diameterBottom: 0.5, tessellation: 3 },
      scene,
    );
    arrowHead.parent = arrow;
    arrowHead.position.z = -1.5;
    arrowHead.rotation.y = Math.PI;
    arrowHead.material = arrowMat;

    // ---- HUD: 2D overlay using AdvancedDynamicTexture ----
    // We use simple DOM elements instead for maximum compatibility
    // Create HUD container
    const hudDiv = document.createElement("div");
    hudDiv.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10;";
    canvas.parentElement!.appendChild(hudDiv);

    // Phase label
    const phaseLabel = document.createElement("div");
    phaseLabel.style.cssText =
      "position:absolute;top:12px;left:50%;transform:translateX(-50%);" +
      "font-family:Fraunces,serif;font-size:22px;font-weight:700;" +
      "color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.7);text-align:center;" +
      "padding:6px 18px;border-radius:12px;background:rgba(0,0,0,0.35);" +
      "backdrop-filter:blur(4px);transition:opacity 0.3s;";
    hudDiv.appendChild(phaseLabel);


    // Instructions (fade out)
    const instrLabel = document.createElement("div");
    instrLabel.style.cssText =
      "position:absolute;bottom:24px;left:50%;transform:translateX(-50%);" +
      "font-family:Manrope,sans-serif;font-size:14px;font-weight:500;" +
      "color:rgba(255,255,255,0.85);text-shadow:0 1px 4px rgba(0,0,0,0.6);" +
      "text-align:center;padding:8px 20px;border-radius:10px;" +
      "background:rgba(0,0,0,0.35);backdrop-filter:blur(4px);" +
      "transition:opacity 0.5s;";
    hudDiv.appendChild(instrLabel);

    // Power meter (screen overlay bar)
    const powerContainer = document.createElement("div");
    powerContainer.style.cssText =
      "position:absolute;left:16px;top:50%;transform:translateY(-50%);" +
      "width:28px;height:200px;border-radius:14px;overflow:hidden;" +
      "background:rgba(0,0,0,0.4);border:2px solid rgba(255,255,255,0.25);" +
      "backdrop-filter:blur(4px);display:none;";
    hudDiv.appendChild(powerContainer);

    const powerFillDiv = document.createElement("div");
    powerFillDiv.style.cssText =
      "position:absolute;bottom:0;left:0;width:100%;height:0%;" +
      "border-radius:0 0 12px 12px;transition:background 0.1s;";
    powerContainer.appendChild(powerFillDiv);

    const powerLabel = document.createElement("div");
    powerLabel.style.cssText =
      "position:absolute;bottom:-24px;left:50%;transform:translateX(-50%);" +
      "font-family:Manrope,sans-serif;font-size:11px;font-weight:600;" +
      "color:rgba(255,255,255,0.7);white-space:nowrap;";
    powerLabel.textContent = "POWER";
    powerContainer.appendChild(powerLabel);

    // Strike/spare overlay
    const bigLabel = document.createElement("div");
    bigLabel.style.cssText =
      "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);" +
      "font-family:Fraunces,serif;font-size:48px;font-weight:900;" +
      "color:#ffd700;text-shadow:0 0 20px rgba(255,215,0,0.6),0 4px 12px rgba(0,0,0,0.5);" +
      "pointer-events:none;transition:transform 0.3s ease-out,opacity 0.5s;opacity:0;";
    hudDiv.appendChild(bigLabel);

    function showBigLabel(text: string) {
      bigLabel.textContent = text;
      bigLabel.style.transform = "translate(-50%,-50%) scale(1)";
      bigLabel.style.opacity = "1";
      setTimeout(() => {
        bigLabel.style.transform = "translate(-50%,-50%) scale(1.2)";
        bigLabel.style.opacity = "0";
      }, 800);
    }

    // Remove old 3D power bar meshes - we use DOM now
    // (We don't create 3D power bars at all)

    // ---- Game state ----
    let throwPhase: ThrowPhase = "aiming";
    let aimX = 0;
    let power = 0;
    let powerDir = 1;
    const ballStartZ = 5;
    let ballZ = ballStartZ;
    let ballX = 0;
    let ballVx = 0;
    let settleTimer = 0;
    let instrFadeTimer = 0;
    let showInstr = true;
    let currentFrame = 0;
    let currentThrow = 0;
    let standingBeforeThrow: boolean[] = new Array(10).fill(true) as boolean[];
    const frames: FrameScore[] = [];
    for (let i = 0; i < 10; i++) {
      frames.push({ throws: [], pinsDown: [] });
    }

    function updateHUD() {
      if (throwPhase === "aiming") {
        phaseLabel.textContent = "AIM";
        phaseLabel.style.opacity = "1";
        if (showInstr) {
          instrLabel.textContent = "Drag left/right or use arrow keys to aim. Tap / Space to set.";
          instrLabel.style.opacity = "1";
        }
        powerContainer.style.display = "none";
      } else if (throwPhase === "power") {
        phaseLabel.textContent = "SET POWER";
        phaseLabel.style.opacity = "1";
        if (showInstr) {
          instrLabel.textContent = "Tap / Space to throw!";
          instrLabel.style.opacity = "1";
        }
        powerContainer.style.display = "block";
      } else if (throwPhase === "rolling") {
        phaseLabel.textContent = "";
        phaseLabel.style.opacity = "0";
        instrLabel.style.opacity = "0";
        powerContainer.style.display = "none";
      } else if (throwPhase === "settling") {
        phaseLabel.textContent = "";
        phaseLabel.style.opacity = "0";
        instrLabel.style.opacity = "0";
        powerContainer.style.display = "none";
      }
    }

    function resetBallPosition() {
      ballZ = ballStartZ;
      ballX = 0;
      ballVx = 0;
      ball.position.set(0, BALL_RADIUS, ballStartZ);
      ball.rotation = BABYLON.Vector3.Zero();
      ball.isVisible = true;
    }

    function resetAllPins() {
      for (const p of pins) {
        p.mesh.dispose();
      }
      pins = createPins();
      standingBeforeThrow = new Array(10).fill(true) as boolean[];
    }

    function resetStandingPins() {
      for (let i = 0; i < pins.length; i++) {
        const p = pins[i]!;
        if (!p.knocked) {
          p.mesh.position = p.originalPos.clone();
          p.mesh.position.y = PIN_HEIGHT / 2;
          p.mesh.rotation = BABYLON.Vector3.Zero();
          p.mesh.rotationQuaternion = null;
          p.fallAngle = 0;
        }
      }
      standingBeforeThrow = pins.map((p) => !p.knocked);
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
      power = 0;
      powerDir = 1;
      resetBallPosition();

      // Camera behind ball looking down the lane
      camera.position = new BABYLON.Vector3(0, 6, 12);
      camera.setTarget(new BABYLON.Vector3(0, 0, -10));

      arrow.isVisible = true;
      updateHUD();
    }

    function startPower() {
      throwPhase = "power";
      power = 0;
      powerDir = 1;
      arrow.isVisible = false;
      updateHUD();
    }

    function throwBall() {
      throwPhase = "rolling";
      ballX = aimX;
      ballZ = ballStartZ;
      ballVx = aimX * -0.3;
      ball.position.x = ballX;
      ball.position.z = ballZ;

      // Fade out instructions after first throw
      instrFadeTimer = 3;
      updateHUD();
    }

    function handleThrowComplete() {
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

      if (isStrike) showBigLabel("STRIKE!");
      else if (isSpare) showBigLabel("SPARE!");

      if (currentFrame < 9) {
        if (isStrike || currentThrow === 1) {
          currentFrame++;
          currentThrow = 0;
          if (currentFrame >= TOTAL_FRAMES) {
            onGameOverRef.current();
            return;
          }
          resetAllPins();
          startAiming();
        } else {
          currentThrow = 1;
          hideKnockedPins();
          resetStandingPins();
          startAiming();
        }
      } else {
        // 10th frame
        if (currentThrow === 0) {
          if (isStrike) {
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
            if (newlyKnocked === 10) {
              currentThrow = 2;
              resetAllPins();
              startAiming();
            } else {
              currentThrow = 2;
              hideKnockedPins();
              resetStandingPins();
              startAiming();
            }
          } else if (isSpare) {
            currentThrow = 2;
            resetAllPins();
            startAiming();
          } else {
            onGameOverRef.current();
            return;
          }
        } else {
          onGameOverRef.current();
          return;
        }
      }
    }

    // ---- Input handling ----
    // Touch/pointer: drag to aim, release to lock aim -> power, tap again to throw
    // Keyboard: arrows to aim, space/enter to advance phase

    let pointerDown = false;
    let pointerStartX = 0;
    let aimXAtPointerStart = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (throwPhase === "aiming") {
          startPower();
        } else if (throwPhase === "power") {
          throwBall();
        }
      } else if (e.key === "ArrowLeft" && throwPhase === "aiming") {
        aimX = Math.max(-LANE_WIDTH / 2 + 0.5, aimX - 0.15);
      } else if (e.key === "ArrowRight" && throwPhase === "aiming") {
        aimX = Math.min(LANE_WIDTH / 2 - 0.5, aimX + 0.15);
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (throwPhase === "aiming") {
        pointerDown = true;
        pointerStartX = e.clientX;
        aimXAtPointerStart = aimX;
      } else if (throwPhase === "power") {
        throwBall();
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!pointerDown || throwPhase !== "aiming") return;
      const dx = (e.clientX - pointerStartX) * 0.015;
      aimX = Math.max(
        -LANE_WIDTH / 2 + 0.5,
        Math.min(LANE_WIDTH / 2 - 0.5, aimXAtPointerStart + dx),
      );
    };

    const handlePointerUp = () => {
      if (pointerDown && throwPhase === "aiming") {
        pointerDown = false;
        // Always advance to power on pointer up (tap or drag-release)
        startPower();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);

    // ---- Main loop ----
    startAiming();

    scene.registerBeforeRender(() => {
      const dt = engine.getDeltaTime() / 1000;

      // Fade out instructions after a few throws
      if (showInstr) {
        if (instrFadeTimer > 0) {
          instrFadeTimer -= dt;
          if (instrFadeTimer <= 0) {
            showInstr = false;
            instrLabel.style.opacity = "0";
          }
        }
      }

      if (throwPhase === "aiming") {
        // Position ball at aim point (no auto-oscillation -- user controls aim)
        ball.position.x = aimX;
        ball.position.z = ballStartZ;
        ball.position.y = BALL_RADIUS;

        // Arrow
        arrow.position.set(aimX, 0.05, ballStartZ - 1.8);
        arrow.isVisible = true;
      }

      if (throwPhase === "power") {
        power += powerDir * 1.2 * dt;
        if (power >= 1) {
          power = 1;
          powerDir = -1;
        } else if (power <= 0) {
          power = 0;
          powerDir = 1;
        }

        // Update DOM power bar
        const pct = Math.round(power * 100);
        powerFillDiv.style.height = `${pct}%`;

        // Color: green -> yellow -> red
        const r = Math.round(power < 0.5 ? 50 + power * 360 : 230);
        const g = Math.round(power < 0.5 ? 200 : 200 - (power - 0.5) * 360);
        const b = 50;
        powerFillDiv.style.background = `rgb(${r},${g},${b})`;
      }

      if (throwPhase === "rolling") {
        const speed = BALL_SPEED * (0.4 + power * 0.6);
        ballZ -= speed * dt;
        ballX += ballVx * dt;

        // Clamp to lane
        ballX = Math.max(
          -LANE_WIDTH / 2 + BALL_RADIUS,
          Math.min(LANE_WIDTH / 2 - BALL_RADIUS, ballX),
        );

        ball.position.x = ballX;
        ball.position.z = ballZ;
        ball.position.y = BALL_RADIUS;

        // Roll rotation
        ball.rotation.x -= speed * dt / BALL_RADIUS;

        // Smooth camera follow: ease toward ball
        const targetCamZ = Math.max(ballZ + 8, 4);
        camera.position.z += (targetCamZ - camera.position.z) * 3 * dt;
        camera.position.y += (4 - camera.position.y) * 2 * dt;
        camera.setTarget(
          new BABYLON.Vector3(
            ballX * 0.3,
            0,
            Math.min(ballZ - 6, PIN_Z_START),
          ),
        );

        // Pin collisions
        let hitAny = false;
        for (let i = 0; i < pins.length; i++) {
          const p = pins[i]!;
          if (p.knocked) continue;
          const dx = ballX - p.originalPos.x;
          const dz = ballZ - p.originalPos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < KNOCK_DISTANCE) {
            p.knocked = true;
            p.knockDelay = 0;
            hitAny = true;
            const fallDirX = dx !== 0 ? -dx : Math.random() - 0.5;
            const fallDirZ = dz !== 0 ? -dz : -1;
            p.fallAxis = new BABYLON.Vector3(
              fallDirZ,
              0,
              -fallDirX,
            ).normalize();
            p.fallAngle = 0;

            // Chain reaction: knock nearby standing pins
            for (let j = 0; j < pins.length; j++) {
              if (j === i || pins[j]!.knocked) continue;
              const px = p.originalPos.x - pins[j]!.originalPos.x;
              const pz = p.originalPos.z - pins[j]!.originalPos.z;
              const pinDist = Math.sqrt(px * px + pz * pz);
              if (pinDist < PIN_CHAIN_DISTANCE) {
                // Pin is close enough -- check it's roughly in the ball's travel direction
                const dot = px * dx + pz * dz;
                if (dot < 0.1) {
                  // Knock with a small delay for cascade effect
                  pins[j]!.knocked = true;
                  pins[j]!.knockDelay = 0.08 + Math.random() * 0.06;
                  const rndX = px + (Math.random() - 0.5) * 0.2;
                  const rndZ = pz + (Math.random() - 0.5) * 0.2;
                  pins[j]!.fallAxis = new BABYLON.Vector3(
                    -rndZ,
                    0,
                    rndX,
                  ).normalize();
                  pins[j]!.fallAngle = 0;
                }
              }
            }
          }
        }

        if (hitAny) {
          ballVx *= 0.7;
        }

        // Ball passed pins
        if (ballZ < PIN_Z_START - 5) {
          throwPhase = "settling";
          settleTimer = 0;
          ball.isVisible = false;
          updateHUD();
        }
      }

      if (throwPhase === "settling") {
        settleTimer += dt;
        if (settleTimer > 1.4) {
          throwPhase = "done";
          handleThrowComplete();
        }
      }

      // Animate falling pins
      for (const p of pins) {
        if (!p.knocked) continue;

        // Handle knock delay for chain reactions
        if (p.knockDelay > 0) {
          p.knockDelay -= dt;
          continue;
        }

        if (p.fallAngle < Math.PI / 2) {
          p.fallAngle = Math.min(Math.PI / 2, p.fallAngle + dt * 6);
          const quat = BABYLON.Quaternion.RotationAxis(
            p.fallAxis,
            p.fallAngle,
          );
          p.mesh.rotationQuaternion = quat;
          // Tip from base
          p.mesh.position.y =
            p.originalPos.y + (PIN_HEIGHT / 2) * Math.cos(p.fallAngle);
          const tipOffset = (PIN_HEIGHT / 2) * Math.sin(p.fallAngle);
          const cross = BABYLON.Vector3.Cross(
            BABYLON.Vector3.Up(),
            p.fallAxis,
          ).normalize();
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
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("resize", onResize);
      // Clean up HUD
      hudDiv.remove();
      engine.dispose();
    };
  }, [cleanup]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        outline: "none",
        touchAction: "none",
      }}
      tabIndex={0}
    />
  );
}
