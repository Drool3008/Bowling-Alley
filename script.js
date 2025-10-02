import * as THREE from "https://unpkg.com/three@0.158.0/build/three.module.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";

// ===================== CONFIG =====================
const CONFIG = {
  BALL_R: 0.12,
  PIN_H: 0.38,
  SIDE: 0.3048,
  ROW_SPACING: 0.3048 * Math.sqrt(3) / 2,
  PIN_BASE_Z: 11,
  BALL_SPAWN_Z: -1,
  FOUL_LINE_Z: 0,
  PHYS_STEP: 1/120,
  BALL_MIN_SPEED: 5,
  BALL_MAX_SPEED: 20,
  AUTO_RESET_DELAY: 2.0,
  ALLEY_END_Z: 12
};

// ================= SCENE / RENDERER ==============
const container = document.getElementById('container');
const scene = new THREE.Scene();

  
  if (e.key === 'f' || e.key === 'F') {
    console.log('🚨 FORCE GAME RESET');
    // Reset everything
    frameIndex = 0;
    rollIndex = 0;
    gameState = 'READY';
    frames.length = 0;
    for (let i = 0; i < 10; i++) {
      frames.push({ rolls: [] });
    }
    setupPins();
    resetBallForNewRoll();
    updateUI();
    console.log('✅ Complete game reset');
  }ne();
scene.background = new THREE.Color(0x0b0f14);

const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 200);
camera.position.set(0, 3.8, -8);
camera.lookAt(0, 1, CONFIG.PIN_BASE_Z);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Lights
scene.add(new THREE.HemisphereLight(0xbfeaff, 0x202033, 0.8));
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(-4, 10, -4);
scene.add(dir);

// ==================== PHYSICS ====================
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.defaultContactMaterial.contactEquationStiffness = 1e7;

// Materials & contacts
const matLANE = new CANNON.Material('lane');
const matBALL = new CANNON.Material('ball');
const matPIN = new CANNON.Material('pin');

world.addContactMaterial(new CANNON.ContactMaterial(matLANE, matBALL, { friction: 0.02, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(matLANE, matPIN, { friction: 0.10, restitution: 0.03 }));
world.addContactMaterial(new CANNON.ContactMaterial(matBALL, matPIN, { friction: 0.12, restitution: 0.12 }));
world.addContactMaterial(new CANNON.ContactMaterial(matPIN, matPIN, { friction: 0.30, restitution: 0.02 }));

// Lane visual
const laneMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 20),
  new THREE.MeshStandardMaterial({ color: 0x705438 })
);
laneMesh.rotation.x = -Math.PI/2;
laneMesh.position.z = 8;
scene.add(laneMesh);

// Lane collider
const laneBody = new CANNON.Body({ mass: 0, material: matLANE });
laneBody.addShape(new CANNON.Plane());
laneBody.quaternion.setFromEuler(-Math.PI/2, 0, 0);
laneBody.position.set(0, 0, 8);
world.addBody(laneBody);

// ================== GAME STATE ===================
let pins = [];
let ball = null;
let aimAngle = 0;
let charging = false;
let power = 0;
let waitingForSettle = false;
let settleTimer = 0;
let autoResetTimer = 0;
let foulThisRoll = false;
let rampMode = false;
let gameState = 'READY';

// Bowling game state
let frames = Array.from({length: 10}, () => ({ rolls: [] }));
let frameIndex = 0;
let rollIndex = 0;
let pinsStandingAtStart = 10;

// UI elements
const frameNoEl = document.getElementById('frameNo');
const rollNoEl = document.getElementById('rollNo');
const scoreboardEl = document.getElementById('scoreboard');
const messageEl = document.getElementById('message');
const powerFill = document.getElementById('powerFill');

// ================== HELPERS ======================
function showMessage(txt, t = 2200) {
  messageEl.textContent = txt;
  if (t) setTimeout(() => { 
    if (messageEl.textContent === txt) messageEl.textContent = ''; 
  }, t);
}

function createPin(x, z) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, CONFIG.PIN_H, 18),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.08, roughness: 0.6 })
  );
  mesh.castShadow = true;
  scene.add(mesh);

  const body = new CANNON.Body({ mass: 1, material: matPIN });
  const cyl = new CANNON.Cylinder(0.06, 0.06, CONFIG.PIN_H, 18);
  const q = new CANNON.Quaternion();
  q.setFromEuler(Math.PI/2, 0, 0);
  body.addShape(cyl, new CANNON.Vec3(0, 0, 0), q);
  body.angularDamping = 0.35;
  body.linearDamping = 0.01;
  body.position.set(x, CONFIG.PIN_H/2, z);
  world.addBody(body);

  mesh.position.copy(body.position);
  mesh.quaternion.copy(body.quaternion);

  return { mesh, body, standing: true };
}

function setupPins() {
  console.log('🎳 SETTING UP PINS');
  
  // Remove existing pins completely
  for (const pin of pins) {
    if (pin.mesh) {
      scene.remove(pin.mesh);
      pin.mesh.geometry.dispose();
      pin.mesh.material.dispose();
    }
    if (pin.body) {
      world.removeBody(pin.body);
    }
  }
  pins.length = 0;
  
  // Create fresh pins in triangular formation
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col <= row; col++) {
      const x = (col - row / 2) * CONFIG.PIN_SPACING;
      const z = CONFIG.PIN_BASE_Z - row * CONFIG.PIN_ROW_SPACING;
      const pin = createPin(x, z);
      pins.push(pin);
    }
  }
  
  // Update pin count
  pinsStandingAtStart = pins.length;
  console.log(`✅ Set up ${pins.length} fresh pins`);
}

function removeKnockedPins() {
  console.log('🎳 REMOVING KNOCKED DOWN PINS FOR ROLL 2 🎳');
  const remainingPins = [];
  let removedCount = 0;
  
  console.log(`Starting with ${pins.length} pins to evaluate...`);
  
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    const isDown = isPinDown(pin);
    
    console.log(`🎳 Pin ${i + 1}: ${isDown ? 'REMOVING (knocked down) ❌' : 'KEEPING (still standing) ✅'}`);
    
    if (isDown) {
      // Remove knocked down pin
      scene.remove(pin.mesh);
      world.removeBody(pin.body);
      removedCount++;
    } else {
      // Keep standing pin
      remainingPins.push(pin);
    }
  }
  
  // Update pins array
  pins.length = 0; // Clear original array
  pins.push(...remainingPins); // Add remaining pins
  pinsStandingAtStart = pins.length;
  
  console.log(`🎳 PIN CLEANUP COMPLETE:`);
  console.log(`   - Removed: ${removedCount} pins`);
  console.log(`   - Remaining: ${pins.length} pins`);
  
  if (pins.length === 0) {
    console.warn('⚠️ WARNING: NO PINS LEFT FOR ROLL 2! All pins detected as down.');
    console.log('🎳 This might have been a strike - setting up fresh pins');
    setupPins();
  }
}

function isPinDown(pin) {
  const up = new THREE.Vector3(0, 1, 0);
  up.applyQuaternion(pin.mesh.quaternion);
  
  const angle = up.angleTo(new THREE.Vector3(0, 1, 0));
  const angleDegrees = THREE.MathUtils.radToDeg(angle);
  
  // Much more lenient detection: 15 degrees tilt OR below 90% height OR moved significantly
  const tiltedDown = angleDegrees > 15;
  const fallenDown = pin.mesh.position.y < CONFIG.PIN_H * 0.9;
  
  // Check if pin has moved significantly from original position
  const originalZ = CONFIG.PIN_BASE_Z;
  const movedSignificantly = Math.abs(pin.mesh.position.z - originalZ) > 0.5 || 
                             Math.abs(pin.mesh.position.x) > 0.3;
  
  const isDown = tiltedDown || fallenDown || movedSignificantly;
  
  if (isDown) {
    console.log(`Pin DOWN - angle: ${angleDegrees.toFixed(1)}°, height: ${pin.mesh.position.y.toFixed(3)}, moved: ${movedSignificantly}`);
  }
  
  return isDown;
}

function countStandingPins() {
  let standing = 0;
  let down = 0;
  
  console.log('=== DETAILED PIN STATUS CHECK ===');
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i];
    const isDown = isPinDown(pin);
    const up = new THREE.Vector3(0, 1, 0);
    up.applyQuaternion(pin.mesh.quaternion);
    const angle = THREE.MathUtils.radToDeg(up.angleTo(new THREE.Vector3(0, 1, 0)));
    
    console.log(`Pin ${i + 1}: 
      - Position: x=${pin.mesh.position.x.toFixed(2)}, y=${pin.mesh.position.y.toFixed(2)}, z=${pin.mesh.position.z.toFixed(2)}
      - Angle: ${angle.toFixed(1)}°
      - Status: ${isDown ? 'DOWN ❌' : 'STANDING ✅'}`);
    
    if (isDown) {
      down++;
    } else {
      standing++;
    }
  }
  
  console.log(`FINAL COUNT: ${standing} standing, ${down} down (total: ${pins.length})`);
  console.log('=====================================');
  return standing;
}

function createBall() {
  if (ball) {
    scene.remove(ball.mesh);
    world.removeBody(ball.body);
  }
  
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(CONFIG.BALL_R, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0x1f8bff, metalness: 0.25 })
  );
  mesh.castShadow = true;
  scene.add(mesh);

  const body = new CANNON.Body({ mass: 6, material: matBALL });
  body.addShape(new CANNON.Sphere(CONFIG.BALL_R));
  body.linearDamping = 0.05;
  body.angularDamping = 0.05;
  body.position.set(0, CONFIG.BALL_R + 0.02, CONFIG.BALL_SPAWN_Z);
  world.addBody(body);

  ball = { mesh, body, thrown: false };
}

function resetBallForNewRoll() {
  console.log('🎳 RESETTING BALL FOR NEW ROLL');
  
  // Always create a completely fresh ball to avoid physics state issues
  if (ball) {
    console.log('Removing old ball...');
    scene.remove(ball.mesh);
    world.removeBody(ball.body);
  }
  
  console.log('Creating fresh ball...');
  createBall();
  
  // Reset all game control state
  charging = false;
  power = 0;
  gameState = 'READY';
  
  // Reset settlement flags
  waitingForSettle = false;
  settleTimer = 0;
  autoResetTimer = 0;
  
  updatePowerUI();
  
  console.log(`✅ Fresh ball created at position: x=${ball.body.position.x}, y=${ball.body.position.y}, z=${ball.body.position.z}`);
}

// ============== SCORING SYSTEM ==============
function calculateFrameScores(frames) {
  const scores = [];
  let cumulative = 0;
  
  for (let i = 0; i < 10; i++) {
    const frame = frames[i] || { rolls: [] };
    
    if (i < 9) { // Frames 1-9
      const r1 = frame.rolls[0];
      const r2 = frame.rolls[1];
      
      if (r1 === undefined) {
        scores.push(null);
        continue;
      }
      
      if (r1 === 10) { // Strike
        const nextFrame = frames[i + 1] || { rolls: [] };
        const next1 = nextFrame.rolls[0];
        let next2 = nextFrame.rolls[1];
        
        if (next1 === 10 && next2 === undefined && i < 8) {
          const frameAfterNext = frames[i + 2] || { rolls: [] };
          next2 = frameAfterNext.rolls[0];
        }
        
        if (next1 !== undefined && next2 !== undefined) {
          cumulative += 10 + next1 + next2;
          scores.push(cumulative);
        } else {
          scores.push(null);
        }
      } else if (r2 !== undefined) {
        if (r1 + r2 === 10) { // Spare
          const nextFrame = frames[i + 1] || { rolls: [] };
          const next1 = nextFrame.rolls[0];
          
          if (next1 !== undefined) {
            cumulative += 10 + next1;
            scores.push(cumulative);
          } else {
            scores.push(null);
          }
        } else { // Open frame
          cumulative += r1 + r2;
          scores.push(cumulative);
        }
      } else {
        scores.push(null);
      }
    } else { // 10th frame
      const r1 = frame.rolls[0];
      const r2 = frame.rolls[1];
      const r3 = frame.rolls[2];
      
      if (r1 === undefined) {
        scores.push(null);
        continue;
      }
      
      if (r1 === 10) { // Strike in 10th
        if (r2 !== undefined && r3 !== undefined) {
          cumulative += r1 + r2 + r3;
          scores.push(cumulative);
        } else {
          scores.push(null);
        }
      } else if (r2 !== undefined) {
        if (r1 + r2 === 10) { // Spare in 10th
          if (r3 !== undefined) {
            cumulative += r1 + r2 + r3;
            scores.push(cumulative);
          } else {
            scores.push(null);
          }
        } else { // Open in 10th
          cumulative += r1 + r2;
          scores.push(cumulative);
        }
      } else {
        scores.push(null);
      }
    }
  }
  
  return scores;
}

// ============== GAME FLOW ==============
function throwBall(releaseZ) {
  if (!ball || ball.thrown || gameState !== 'READY') return;

  console.log('Throwing ball...');

  if (!rampMode && releaseZ > CONFIG.FOUL_LINE_Z) {
    foulThisRoll = true;
    showMessage('FOUL — this roll will not count', 2000);
  } else {
    foulThisRoll = false;
  }

  pinsStandingAtStart = countStandingPins();
  console.log(`Roll started with ${pinsStandingAtStart} pins standing`);

  const dir = new THREE.Vector3(Math.sin(aimAngle), 0, 1).normalize();
  const speed = CONFIG.BALL_MIN_SPEED + power * (CONFIG.BALL_MAX_SPEED - CONFIG.BALL_MIN_SPEED);
  ball.body.wakeUp();
  ball.body.velocity.set(dir.x * speed, 0, dir.z * speed);
  ball.body.angularVelocity.set(0, aimAngle * 2.0, 0);

  ball.thrown = true;
  gameState = 'ROLLING';
  waitingForSettle = true;
  settleTimer = 0;
  autoResetTimer = 0;
  
  console.log('Ball thrown, waiting for settlement...');
}

function finishRoll() {
  if (gameState === 'SETTLING' || gameState === 'COMPLETE') {
    console.log('Roll already finished, ignoring duplicate call');
    return;
  }
  
  const pinsNowStanding = countStandingPins();
  const pinsKnocked = Math.max(0, pinsStandingAtStart - pinsNowStanding);
  let scored = foulThisRoll ? 0 : pinsKnocked;
  
  console.log(`🎳 ROLL COMPLETED:`);
  console.log(`   Started with: ${pinsStandingAtStart} pins`);
  console.log(`   Now standing: ${pinsNowStanding} pins`);
  console.log(`   Pins knocked: ${pinsKnocked}`);
  console.log(`   Raw score: ${scored} ${foulThisRoll ? '(FOUL)' : ''}`);
  
  // Ensure valid score range
  scored = Math.max(0, Math.min(pinsStandingAtStart, scored));
  console.log(`   Final score: ${scored}`);
  
  const currentFrame = frames[frameIndex];
  if (!currentFrame) {
    console.error(`No frame found at index ${frameIndex}!`);
    return;
  }
  
  currentFrame.rolls.push(scored);
  console.log(`Added score ${scored} to frame ${frameIndex + 1}, rolls:`, currentFrame.rolls);
  
  // Reset settlement flags immediately
  foulThisRoll = false;
  waitingForSettle = false;
  settleTimer = 0;
  autoResetTimer = 0;
  gameState = 'SETTLING';
  
  if (ball) {
    ball.body.velocity.set(0, 0, 0);
    ball.body.angularVelocity.set(0, 0, 0);
  }
  
  // Handle next roll setup immediately
  setupNextRoll(scored, currentFrame);
}

function setupNextRoll(scored, currentFrame) {
  console.log(`🎮 SETTING UP NEXT ROLL - Frame ${frameIndex + 1}, Scored: ${scored}`);
  
  const isTenth = frameIndex === 9;
  const rollCount = currentFrame.rolls.length;
  
  if (!isTenth) {
    // Frames 1-9
    if (rollCount === 1 && scored === 10) {
      // Strike - move to next frame
      console.log('✨ STRIKE! Moving to next frame');
      frameIndex++;
      rollIndex = 0;
      setupPins();
    } else if (rollCount === 1) {
      // First roll - prepare for second roll
      console.log('➡️ First roll complete, preparing for second roll');
      rollIndex = 1;
      removeKnockedPins();
    } else {
      // Frame complete - move to next frame
      console.log('✅ Frame complete, moving to next frame');
      frameIndex++;
      rollIndex = 0;
      setupPins();
    }
  } else {
    // 10th frame
    console.log('🔟 10th Frame Logic');
    const r1 = currentFrame.rolls[0];
    const r2 = currentFrame.rolls[1];
    
    if (rollCount === 1) {
      if (r1 === 10) {
        console.log('✨ Strike in 10th! Setting up bonus roll');
        rollIndex = 1;
        setupPins();
      } else {
        console.log('➡️ 10th frame first roll, second roll needed');
        rollIndex = 1;
        removeKnockedPins();
      }
    } else if (rollCount === 2) {
      if (r1 === 10 || r1 + r2 === 10) {
        console.log('🎯 Strike or Spare in 10th! Setting up bonus roll');
        rollIndex = 2;
        if (r1 + r2 === 10 && r1 !== 10) {
          setupPins(); // Fresh pins for spare bonus
        }
      } else {
        console.log('🏁 Game Over - No bonus needed');
        endGame();
        return;
      }
    } else {
      console.log('� Game Over - 10th frame complete');
      endGame();
      return;
    }
  }
  
  // Always reset ball, update pin count, and refresh UI
  console.log(`🎮 Setting up for Frame ${frameIndex + 1}, Roll ${rollIndex + 1}`);
  resetBallForNewRoll();
  updateUI();
  console.log(`✅ Setup complete - Game State: ${gameState}`);
}

function endGame() {
  gameState = 'COMPLETE';
  const finalScore = calculateFrameScores(frames)[9] || 0;
  showMessage(`🎳 Game Complete! Final Score: ${finalScore}`, 10000);
  console.log(`🏁 GAME ENDED - Final Score: ${finalScore}`);
  updateUI();
}

function checkForSettle(dt) {
  if (!waitingForSettle || !ball || !ball.thrown || gameState !== 'ROLLING') return;
  
  const ballVel = ball.body.velocity.length();
  let maxPinVel = 0;
  for (const pin of pins) {
    const pinVel = pin.body.velocity.length();
    maxPinVel = Math.max(maxPinVel, pinVel);
  }

  console.log(`Settlement check - Ball vel: ${ballVel.toFixed(2)}, Max pin vel: ${maxPinVel.toFixed(2)}`);

  const ballSettled = ballVel < 0.8;
  const pinsSettled = maxPinVel < 0.3;
  const ballPastPins = ball.body.position.z > CONFIG.PIN_BASE_Z;
  
  // Much simpler settlement - just check if ball is slow and past pins
  if (ballSettled && (pinsSettled || ballPastPins)) {
    console.log('✅ Ball and pins settled, finishing roll immediately');
    finishRoll();
  }
}

// =================== INPUT & CONTROLS ===================
window.addEventListener('mousemove', (ev) => {
  if (gameState === 'READY') {
    const t = ev.clientX / innerWidth;
    aimAngle = (t - 0.5) * 0.6;
  }
});

window.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  if (gameState !== 'READY' || !ball || ball.thrown) return;
  
  charging = true;
  power = 0;
  updatePowerUI();
});

window.addEventListener('pointerup', (ev) => {
  if (ev.button !== 0) return;
  if (!charging || gameState !== 'READY') return;
  
  charging = false;
  const releaseZ = ball.body.position.z;
  throwBall(releaseZ);
  updatePowerUI();
});

document.getElementById('rampMode')?.addEventListener('change', (e) => {
  rampMode = e.target.checked;
  showMessage(rampMode ? 'Ramp mode ON — foul exempt' : 'Ramp mode OFF', 1400);
});

document.getElementById('resetGameBtn')?.addEventListener('click', () => {
  frames = Array.from({length: 10}, () => ({ rolls: [] }));
  frameIndex = 0;
  rollIndex = 0;
  gameState = 'READY';
  waitingForSettle = false;
  settleTimer = 0;
  autoResetTimer = 0;
  foulThisRoll = false;
  
  setupPins();
  resetBallForNewRoll();
  updateUI();
  showMessage('Game reset - Ready to bowl!');
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (gameState === 'ROLLING' && waitingForSettle) {
      console.log('Manual roll finish triggered');
      finishRoll();
    }
  }
  
  if (e.key === 'd' || e.key === 'D') {
    console.log('=== MANUAL PIN DEBUG ===');
    countStandingPins();
  }
  
  if (e.key === 's' || e.key === 'S') {
    console.log('⏩ SKIP TO NEXT ROLL');
    if (gameState === 'ROLLING' || gameState === 'SETTLING') {
      // Force finish current roll with 0 score
      const currentFrame = frames[frameIndex] || { rolls: [] };
      currentFrame.rolls.push(0);
      setupNextRoll(0, currentFrame);
    } else {
      console.log('Nothing to skip - game is ready or complete');
    }
  }
  
  if (e.key === 'r' || e.key === 'R') {
    console.log('🔄 EMERGENCY BALL RESET');
    
    if (ball) {
      // Remove existing ball and create fresh one
      scene.remove(ball.mesh);
      world.removeBody(ball.body);
    }
    
    // Create completely fresh ball
    createBall();
    
    // Force reset all states
    gameState = 'READY';
    waitingForSettle = false;
    settleTimer = 0;
    autoResetTimer = 0;
    charging = false;
    power = 0;
    
    updatePowerUI();
    console.log('✅ Emergency reset complete - fresh ball created');
  }
  
  if (e.key === 'g' || e.key === 'G') {
    console.log('=== GAME STATE DEBUG ===');
    console.log(`Game State: ${gameState}`);
    console.log(`Frame: ${frameIndex + 1}/10, Roll: ${rollIndex + 1}`);
    console.log(`Current Frame Rolls:`, frames[frameIndex]?.rolls || 'none');
    console.log(`Waiting for settle: ${waitingForSettle}`);
    console.log(`Ball thrown: ${ball?.thrown || false}`);
    if (ball) {
      console.log(`Ball physics pos: x=${ball.body.position.x.toFixed(2)}, y=${ball.body.position.y.toFixed(2)}, z=${ball.body.position.z.toFixed(2)}`);
      console.log(`Ball visual pos: x=${ball.mesh.position.x.toFixed(2)}, y=${ball.mesh.position.y.toFixed(2)}, z=${ball.mesh.position.z.toFixed(2)}`);
      console.log(`Ball velocity: ${ball.body.velocity.length().toFixed(2)}`);
      console.log(`Expected start pos: x=0, y=${(CONFIG.BALL_R + 0.02).toFixed(2)}, z=${CONFIG.BALL_SPAWN_Z}`);
    }
    console.log('========================');
  }
  
  if (e.key === 'c' || e.key === 'C') {
    console.log('🏁 MANUAL GAME COMPLETION');
    gameState = 'COMPLETE';
    const finalScore = calculateFrameScores(frames)[9] || 0;
    showMessage(`🎳 Game Manually Completed! Score: ${finalScore}`, 5000);
    updateUI();
  }
  
  // Test mode - force scores for debugging
  if (e.key >= '0' && e.key <= '9' && gameState === 'ROLLING') {
    const testScore = parseInt(e.key);
    console.log(`🧪 TEST MODE: Forcing score to ${testScore}`);
    
    // Override the counting function temporarily
    const originalCount = countStandingPins;
    window.countStandingPins = () => {
      console.log(`🧪 Test mode override: returning ${10 - testScore} standing pins`);
      return 10 - testScore;
    };
    
    finishRoll();
    
    // Restore original function
    setTimeout(() => {
      window.countStandingPins = originalCount;
    }, 100);
  }
});

// ==================== UI =======================
function formatRollDisplay(frame, frameIndex) {
  const r1 = frame.rolls[0];
  const r2 = frame.rolls[1];
  const r3 = frame.rolls[2];
  
  if (frameIndex < 9) {
    if (r1 === undefined) return ['', ''];
    if (r1 === 10) return ['X', ''];
    if (r2 === undefined) return [String(r1), ''];
    if (r1 + r2 === 10) return [String(r1), '/'];
    return [String(r1), String(r2)];
  } else {
    let a = '';
    let b = '';
    let c = '';
    
    if (r1 !== undefined) {
      a = r1 === 10 ? 'X' : String(r1);
    }
    
    if (r2 !== undefined) {
      if (r1 === 10) {
        b = r2 === 10 ? 'X' : String(r2);
      } else {
        b = (r1 + r2 === 10) ? '/' : String(r2);
      }
    }
    
    if (r3 !== undefined) {
      if ((r1 === 10 && r2 + r3 === 10 && r2 !== 10) || (r1 !== 10 && r1 + r2 === 10 && r3 !== 10)) {
        c = '/';
      } else {
        c = r3 === 10 ? 'X' : String(r3);
      }
    }
    
    return [a, b, c];
  }
}

function updateUI() {
  if (frameNoEl) frameNoEl.textContent = Math.min(frameIndex + 1, 10);
  if (rollNoEl) rollNoEl.textContent = rollIndex + 1;
  
  const scores = calculateFrameScores(frames);
  
  if (scoreboardEl) {
    scoreboardEl.innerHTML = '';

    for (let i = 0; i < 10; i++) {
      const frame = frames[i] || { rolls: [] };
      
      const card = document.createElement('div');
      card.className = 'frameCard';

      const title = document.createElement('div');
      title.style.fontSize = '12px';
      title.style.color = '#9fb3d9';
      title.textContent = 'Frame ' + (i + 1);
      card.appendChild(title);

      const rollsDiv = document.createElement('div');
      rollsDiv.className = 'rolls';

      const formatted = formatRollDisplay(frame, i);
      const slots = (i < 9) ? 2 : 3;
      for (let s = 0; s < slots; s++) {
        const d = document.createElement('div');
        d.textContent = formatted[s] || '';
        d.style.width = '18px';
        d.style.textAlign = 'center';
        rollsDiv.appendChild(d);
      }
      card.appendChild(rollsDiv);

      const cum = document.createElement('div');
      cum.className = 'cum';
      cum.textContent = (scores[i] === null ? '—' : scores[i]);
      card.appendChild(cum);

      scoreboardEl.appendChild(card);
    }
  }
}

function updatePowerUI() { 
  if (powerFill) {
    powerFill.style.width = Math.round(power * 100) + '%';
  }
}

// ============== ANIMATION LOOP ==============
let last = performance.now() / 1000;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() / 1000;
  const dt = Math.min(now - last, 1/30);
  last = now;

  world.step(CONFIG.PHYS_STEP, dt, 10);

  if (charging && gameState === 'READY' && !ball.thrown) {
    power = Math.min(1, power + dt * 0.8);
    updatePowerUI();
  }

  if (ball) {
    ball.mesh.position.copy(ball.body.position);
    ball.mesh.quaternion.copy(ball.body.quaternion);
  }
  for (const pin of pins) {
    pin.mesh.position.copy(pin.body.position);
    pin.mesh.quaternion.copy(pin.body.quaternion);
  }

  if (gameState === 'ROLLING') {
    checkForSettle(dt);
  }

  if (ball && ball.thrown && gameState === 'ROLLING') {
    const target = new THREE.Vector3(
      ball.mesh.position.x * 0.3, 
      Math.max(2.5, ball.mesh.position.y + 2), 
      ball.mesh.position.z - 3
    );
    camera.position.lerp(target, 0.03);
    camera.lookAt(ball.mesh.position.x, 1, ball.mesh.position.z + 2);
  } else {
    const defaultCam = new THREE.Vector3(0, 3.8, -8);
    camera.position.lerp(defaultCam, 0.05);
    camera.lookAt(0, 1, CONFIG.PIN_BASE_Z);
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ================== INITIALIZATION ===================
function init() {
  setupPins();
  createBall();
  
  // Add a visual marker at ball starting position for debugging
  const startMarker = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.15, 16),
    new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 })
  );
  startMarker.rotation.x = -Math.PI/2;
  startMarker.position.set(0, 0.01, CONFIG.BALL_SPAWN_Z);
  scene.add(startMarker);
  
  updateUI();
  animate();
  showMessage('🎳 Ready! R=reset ball, F=finish, G=game state, D=pins, C=complete, 0-9=test', 6000);
}

init();