import * as THREE from "https://unpkg.com/three@0.158.0/build/three.module.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";

// ===================== CONFIG =====================
const CONFIG = {
  BALL_R: 0.18, // Reverted back to 0.18 to fix alignment
  PIN_H: 0.38,
  PIN_SPACING: 0.3048,
  PIN_ROW_SPACING: 0.3048 * Math.sqrt(3) / 2,
  PIN_BASE_Z: 11,
  BALL_SPAWN_Z: -1,
  FOUL_LINE_Z: 0,
  PHYS_STEP: 1/120,
  BALL_MIN_SPEED: 5,
  BALL_MAX_SPEED: 20
};

// ================= LANE SELECTION ==============
let selectedLane = 3; // Default to center lane (lane 3 of 5)
let gameStarted = false;
let justSelectedLane = false; // Flag to prevent immediate auto-throw
const totalLanes = 5;
const laneSpacing = 2.2;

// ================= SCENE / RENDERER ==============
const container = document.getElementById('container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 200);
camera.position.set(0, 3.8, -8);
camera.lookAt(0, 1, CONFIG.PIN_BASE_Z);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Lights
const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);

// ================= BOWLING ALLEY DECORATIVE LIGHTING ==============
// Create overhead lane lights like in real bowling alleys
const createBowlingAlleyLights = () => {
  const lights = [];
  
  // Main lane lighting - bright white lights overhead
  for (let i = 0; i < 5; i++) {
    const laneLight = new THREE.SpotLight(0xffffff, 1.2, 30, Math.PI / 6, 0.3);
    laneLight.position.set(0, 8, -3 + (i * 3.5));
    laneLight.target.position.set(0, 0, -3 + (i * 3.5));
    scene.add(laneLight);
    scene.add(laneLight.target);
    
    // Visual representation of the light fixtures
    const lightGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.2, 8);
    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0x444444 });
    const lightFixture = new THREE.Mesh(lightGeometry, lightMaterial);
    lightFixture.position.copy(laneLight.position);
    lightFixture.position.y -= 0.3;
    scene.add(lightFixture);
    
    // Glowing light bulb effect
    const bulbGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const bulbMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffff88,
      transparent: true,
      opacity: 0.8
    });
    const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
    bulb.position.copy(laneLight.position);
    bulb.position.y -= 0.2;
    scene.add(bulb);
    
    lights.push({ light: laneLight, fixture: lightFixture, bulb: bulb });
  }
  
  // Pin area special lighting - brighter at the pins
  const pinAreaLight = new THREE.SpotLight(0xffffff, 1.5, 20, Math.PI / 4, 0.2);
  pinAreaLight.position.set(0, 10, CONFIG.PIN_BASE_Z);
  pinAreaLight.target.position.set(0, 0, CONFIG.PIN_BASE_Z);
  scene.add(pinAreaLight);
  scene.add(pinAreaLight.target);
  
  // Pin area light fixture
  const pinLightGeometry = new THREE.CylinderGeometry(0.4, 0.5, 0.3, 8);
  const pinLightMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
  const pinLightFixture = new THREE.Mesh(pinLightGeometry, pinLightMaterial);
  pinLightFixture.position.set(0, 9.5, CONFIG.PIN_BASE_Z);
  scene.add(pinLightFixture);
  
  // Side decorative lights - colorful accent lighting
  const sideColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const colorIndex = Math.floor(Math.random() * sideColors.length);
      const sideLight = new THREE.PointLight(sideColors[colorIndex], 0.5, 15);
      sideLight.position.set(side * 4, 6, -2 + (i * 6));
      scene.add(sideLight);
      
      // Decorative light orbs
      const orbGeometry = new THREE.SphereGeometry(0.2, 12, 12);
      const orbMaterial = new THREE.MeshBasicMaterial({ 
        color: sideColors[colorIndex],
        transparent: true,
        opacity: 0.7
      });
      const orb = new THREE.Mesh(orbGeometry, orbMaterial);
      orb.position.copy(sideLight.position);
      scene.add(orb);
    }
  }
  
  // Ceiling light strips - like neon lighting in bowling alleys
  for (let i = 0; i < 3; i++) {
    const stripGeometry = new THREE.BoxGeometry(8, 0.1, 0.3);
    const stripMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00ffff,
      transparent: true,
      opacity: 0.6
    });
    const lightStrip = new THREE.Mesh(stripGeometry, stripMaterial);
    lightStrip.position.set(0, 9, -4 + (i * 8));
    scene.add(lightStrip);
    
    // Add glow effect to strips
    const stripLight = new THREE.RectAreaLight(0x00ffff, 0.3, 8, 0.3);
    stripLight.position.copy(lightStrip.position);
    stripLight.lookAt(0, 0, lightStrip.position.z);
    scene.add(stripLight);
  }
  
  return lights;
};

// ================= LANE SELECTION MODAL ==============
function createLaneSelectionModal() {
  // Create modal overlay
  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'laneSelectionModal';
  modalOverlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    font-family: Arial, sans-serif;
  `;
  
  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
    padding: 40px;
    border-radius: 20px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    border: 2px solid #60a5fa;
    max-width: 500px;
    width: 90%;
  `;
  
  // Title
  const title = document.createElement('h2');
  title.textContent = '🎳 Select Your Bowling Lane';
  title.style.cssText = `
    color: #60a5fa;
    margin: 0 0 30px 0;
    font-size: 28px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
  `;
  modalContent.appendChild(title);
  
  // Instruction
  const instruction = document.createElement('p');
  instruction.textContent = 'Choose which lane you want to play on:';
  instruction.style.cssText = `
    color: #dbeafe;
    margin: 0 0 25px 0;
    font-size: 18px;
  `;
  modalContent.appendChild(instruction);
  
  // Lane buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.cssText = `
    display: flex;
    gap: 15px;
    justify-content: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
  `;
  
  // Create lane buttons (1-5, left to right)
  for (let i = 1; i <= totalLanes; i++) {
    const laneButton = document.createElement('button');
    laneButton.textContent = `Lane ${i}`;
    laneButton.style.cssText = `
      background: ${i === selectedLane ? 'linear-gradient(90deg, #60a5fa 0%, #2563eb 100%)' : 'linear-gradient(90deg, #475569 0%, #64748b 100%)'};
      color: white;
      border: none;
      border-radius: 12px;
      padding: 15px 20px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
      min-width: 80px;
    `;
    
    laneButton.addEventListener('mouseenter', () => {
      if (i !== selectedLane) {
        laneButton.style.background = 'linear-gradient(90deg, #64748b 0%, #475569 100%)';
      }
    });
    
    laneButton.addEventListener('mouseleave', () => {
      if (i !== selectedLane) {
        laneButton.style.background = 'linear-gradient(90deg, #475569 0%, #64748b 100%)';
      }
    });
    
    laneButton.addEventListener('click', () => {
      // Update selection
      selectedLane = i;
      
      // Update button styles
      buttonsContainer.querySelectorAll('button').forEach((btn, index) => {
        if (index + 1 === selectedLane) {
          btn.style.background = 'linear-gradient(90deg, #60a5fa 0%, #2563eb 100%)';
        } else {
          btn.style.background = 'linear-gradient(90deg, #475569 0%, #64748b 100%)';
        }
      });
    });
    
    buttonsContainer.appendChild(laneButton);
  }
  
  modalContent.appendChild(buttonsContainer);
  
  // Start game button
  const startButton = document.createElement('button');
  startButton.textContent = '🎮 Start Game';
  startButton.style.cssText = `
    background: linear-gradient(90deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 15px 30px;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
    margin-top: 10px;
  `;
  
  startButton.addEventListener('mouseenter', () => {
    startButton.style.background = 'linear-gradient(90deg, #059669 0%, #047857 100%)';
    startButton.style.transform = 'scale(1.05)';
  });
  
  startButton.addEventListener('mouseleave', () => {
    startButton.style.background = 'linear-gradient(90deg, #10b981 0%, #059669 100%)';
    startButton.style.transform = 'scale(1)';
  });
  
  startButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startGameWithSelectedLane();
    document.body.removeChild(modalOverlay);
  });
  
  modalContent.appendChild(startButton);
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);
}

// Start game with selected lane
function startGameWithSelectedLane() {
  gameStarted = true;
  justSelectedLane = true; // Prevent immediate auto-throw
  console.log(`🎳 Starting game on Lane ${selectedLane}`);
  
  // Calculate lane X position (lanes numbered 1-5 from left to right)
  const selectedLaneX = (selectedLane - Math.ceil(totalLanes / 2)) * laneSpacing;
  
  // Update camera position for selected lane
  camera.position.set(selectedLaneX, 3.8, -8);
  camera.lookAt(selectedLaneX, 1, CONFIG.PIN_BASE_Z);
  
  // Initialize game on selected lane
  initializeGameOnLane(selectedLaneX);
  
  // Clear the flag after a short delay to allow normal interaction
  setTimeout(() => {
    justSelectedLane = false;
    console.log('✅ Ready for player input');
  }, 500);
}

// Initialize game components for selected lane
function initializeGameOnLane(laneX) {
  // Update CONFIG for selected lane
  CONFIG.SELECTED_LANE_X = laneX;
  
  // Start the game
  init();
}

// ================= SIMPLE CLOSED CUBE ROOM ==============
const createSimpleCubeRoom = () => {
  // Room dimensions - larger to accommodate multiple lanes
  const roomSize = 40; // Increased from 30 to fit 5 lanes
  const roomHeight = 15;
  
  // Remove the dark brown floor - let the lane be the only floor surface
  
  // Simple ceiling
  const ceilingGeometry = new THREE.PlaneGeometry(roomSize, roomSize);
  const ceilingMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = roomHeight;
  scene.add(ceiling);
  
  // Back wall
  const backWallGeometry = new THREE.PlaneGeometry(roomSize, roomHeight);
  const backWallMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const backWall = new THREE.Mesh(backWallGeometry, backWallMaterial);
  backWall.position.set(0, roomHeight/2, roomSize/2);
  scene.add(backWall);
  
  // Front wall
  const frontWallGeometry = new THREE.PlaneGeometry(roomSize, roomHeight);
  const frontWallMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const frontWall = new THREE.Mesh(frontWallGeometry, frontWallMaterial);
  frontWall.position.set(0, roomHeight/2, -roomSize/2);
  frontWall.rotation.y = Math.PI;
  scene.add(frontWall);
  
  // Left wall
  const leftWallGeometry = new THREE.PlaneGeometry(roomSize, roomHeight);
  const leftWallMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const leftWall = new THREE.Mesh(leftWallGeometry, leftWallMaterial);
  leftWall.position.set(-roomSize/2, roomHeight/2, 0);
  leftWall.rotation.y = Math.PI / 2;
  scene.add(leftWall);
  
  // Right wall
  const rightWallGeometry = new THREE.PlaneGeometry(roomSize, roomHeight);
  const rightWallMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
  const rightWall = new THREE.Mesh(rightWallGeometry, rightWallMaterial);
  rightWall.position.set(roomSize/2, roomHeight/2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  scene.add(rightWall);
};

// Create multiple bowling lanes
const createMultipleLanes = () => {
  const laneWidth = 1.8;
  const laneLength = 18;
  const laneSpacing = 2.2; // Space between lanes
  const numLanes = 5; // Total number of lanes
  
  for (let i = 0; i < numLanes; i++) {
    // Calculate X position for each lane (center lane at index 2)
    const laneX = (i - Math.floor(numLanes / 2)) * laneSpacing;
    const isActiveLane = i === Math.floor(numLanes / 2); // Center lane is active
    
    // Lane surface - brighter for active lane
    const laneGeometry = new THREE.PlaneGeometry(laneWidth, laneLength);
    const laneColor = isActiveLane ? 0x8B4513 : 0x654321; // Brighter brown for active lane
    const laneMaterial = new THREE.MeshLambertMaterial({ color: laneColor });
    const lane = new THREE.Mesh(laneGeometry, laneMaterial);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(laneX, 0.005, 2);
    scene.add(lane);
    
    // Lane gutters
    const gutterGeometry = new THREE.BoxGeometry(0.2, 0.1, laneLength);
    const gutterMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
    
    // Left gutter
    const leftGutter = new THREE.Mesh(gutterGeometry, gutterMaterial);
    leftGutter.position.set(laneX - laneWidth/2 - 0.1, 0.05, 2);
    scene.add(leftGutter);
    
    // Right gutter
    const rightGutter = new THREE.Mesh(gutterGeometry, gutterMaterial);
    rightGutter.position.set(laneX + laneWidth/2 + 0.1, 0.05, 2);
    scene.add(rightGutter);
    
    // Foul line for each lane
    const foulLineGeometry = new THREE.PlaneGeometry(laneWidth, 0.05);
    const foulLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const foulLine = new THREE.Mesh(foulLineGeometry, foulLineMaterial);
    foulLine.rotation.x = -Math.PI / 2;
    foulLine.position.set(laneX, 0.01, CONFIG.FOUL_LINE_Z);
    scene.add(foulLine);
    
    // Add decorative pins for non-active lanes
    if (!isActiveLane) {
      createDecorativePins(laneX);
    }
    
    // Lane number signs
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = isActiveLane ? '#FFD700' : '#666666'; // Gold for active lane
    ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = isActiveLane ? '#000000' : '#FFFFFF';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, 32, 20);
    
    const texture = new THREE.CanvasTexture(canvas);
    const signMaterial = new THREE.MeshBasicMaterial({ map: texture });
    const signGeometry = new THREE.PlaneGeometry(0.4, 0.2);
    const laneSign = new THREE.Mesh(signGeometry, signMaterial);
    laneSign.position.set(laneX, 1.2, -6);
    scene.add(laneSign);
  }
};

// Create decorative pins for non-active lanes
const createDecorativePins = (laneX) => {
  const PIN_SETUP_BASE_Z = CONFIG.PIN_BASE_Z - 3;
  
  // Create decorative pins in reversed formation (1-2-3-4)
  for (let row = 0; row < 4; row++) {
    const pinsInRow = row + 1;
    for (let col = 0; col < pinsInRow; col++) {
      const x = laneX + (col - (pinsInRow - 1) / 2) * CONFIG.PIN_SPACING;
      const z = PIN_SETUP_BASE_Z + row * CONFIG.PIN_ROW_SPACING;
      
      const pinGeometry = new THREE.CylinderGeometry(0.04, 0.06, CONFIG.PIN_H, 8);
      const pinMaterial = new THREE.MeshLambertMaterial({ color: 0xdddddd });
      const decorativePin = new THREE.Mesh(pinGeometry, pinMaterial);
      decorativePin.position.set(x, CONFIG.PIN_H / 2, z);
      scene.add(decorativePin);
    }
  }
};

// Initialize the simple cube room and multiple lanes
createSimpleCubeRoom();
createMultipleLanes();

// ================= PHYSICS ==============
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.NaiveBroadphase();

// Ground
const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(groundShape);
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);

const groundGeometry = new THREE.PlaneGeometry(20, 30);
const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// Green starting position ring
const ringGeometry = new THREE.RingGeometry(CONFIG.BALL_R + 0.02, CONFIG.BALL_R + 0.05, 16);
const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
const startingRing = new THREE.Mesh(ringGeometry, ringMaterial);
startingRing.position.set(0, 0.01, CONFIG.BALL_SPAWN_Z);
startingRing.rotation.x = -Math.PI / 2;
scene.add(startingRing);

// ================= GAME STATE ==============
let ball = null;
let pins = [];
let gameState = 'READY'; // 'READY', 'ROLLING', 'SETTLING', 'COMPLETE'
let frames = [];
let frameIndex = 0;
let rollIndex = 0;
let pinsStandingAtStart = 0;
let waitingForSettle = false;
let aimAngle = 0;

// Power bar system
let powerCharging = false;
let currentPower = 0;
let powerDirection = 1;
const POWER_SPEED = 0.8; // Reduced from 2.0 for slower, more readable power charging
let lastPowerUpdateTime = 0; // For throttling text updates

// Initialize frames
for (let i = 0; i < 10; i++) {
  frames.push({ rolls: [] });
}

// ================= FUNCTIONS ==============
function createPin(x, z) {
  // Physics
  const shape = new CANNON.Cylinder(0.03, 0.06, CONFIG.PIN_H, 8);
  const body = new CANNON.Body({ mass: 0.5 });
  body.addShape(shape);
  body.position.set(x, CONFIG.PIN_H / 2, z);
  world.addBody(body);
  
  // Visual
  const geometry = new THREE.CylinderGeometry(0.03, 0.06, CONFIG.PIN_H, 8);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  scene.add(mesh);
  
  return { body, mesh };
}

function createBall() {
  console.log('🎾 Creating new ball');
  
  // Get selected lane X position
  const laneX = CONFIG.SELECTED_LANE_X || 0;
  
  // Physics
  const shape = new CANNON.Sphere(CONFIG.BALL_R);
  const body = new CANNON.Body({ mass: 5 });
  body.addShape(shape);
  body.position.set(laneX, CONFIG.BALL_R + 0.02, CONFIG.BALL_SPAWN_Z);
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  world.addBody(body);
  
  // Visual
  const geometry = new THREE.SphereGeometry(CONFIG.BALL_R, 16, 16);
  const material = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  scene.add(mesh);
  
  ball = { body, mesh, thrown: false };
  console.log(`✅ Ball created on Lane ${selectedLane} at position x=${laneX}`);
}

function setupPins() {
  console.log('🎳 SETTING UP PINS');
  
  // Clear existing pins
  for (const pin of pins) {
    scene.remove(pin.mesh);
    world.removeBody(pin.body);
    pin.mesh.geometry.dispose();
    pin.mesh.material.dispose();
  }
  pins.length = 0;
  
  // Get selected lane X position
  const laneX = CONFIG.SELECTED_LANE_X || 0;
  
  // Create new pins in reversed triangle formation (1-2-3-4 from front to back)
  // Move the entire setup forward by reducing the base Z position
  const PIN_SETUP_BASE_Z = CONFIG.PIN_BASE_Z - 3; // Move pins 3 units forward
  
  for (let row = 0; row < 4; row++) {
    const pinsInRow = row + 1; // Row 0 has 1 pin, row 1 has 2 pins, etc.
    for (let col = 0; col < pinsInRow; col++) {
      const x = laneX + (col - (pinsInRow - 1) / 2) * CONFIG.PIN_SPACING;
      const z = PIN_SETUP_BASE_Z + row * CONFIG.PIN_ROW_SPACING; // Use the moved forward base position
      const pin = createPin(x, z);
      pins.push(pin);
    }
  }
  
  pinsStandingAtStart = pins.length;
  console.log(`✅ Set up ${pins.length} pins on Lane ${selectedLane} at x=${laneX}`);
}

function isPinDown(pin) {
  if (!pin || !pin.body) return true;
  
  const pos = pin.body.position;
  const quat = pin.body.quaternion;
  
  // Check if pin fell over
  const upVector = new THREE.Vector3(0, 1, 0);
  upVector.applyQuaternion(new THREE.Quaternion(quat.x, quat.y, quat.z, quat.w));
  const tiltAngle = Math.acos(upVector.y) * (180 / Math.PI);
  
  // Very sensitive - 15 degrees
  return tiltAngle > 15 || pos.y < 0.1;
}

function countStandingPins() {
  let count = 0;
  for (const pin of pins) {
    if (!isPinDown(pin)) count++;
  }
  return count;
}

function removeKnockedPins() {
  console.log('🧹 REMOVING KNOCKED PINS');
  
  const initialCount = pins.length;
  
  // Remove knocked pins
  for (let i = pins.length - 1; i >= 0; i--) {
    const pin = pins[i];
    if (isPinDown(pin)) {
      scene.remove(pin.mesh);
      world.removeBody(pin.body);
      pin.mesh.geometry.dispose();
      pin.mesh.material.dispose();
      pins.splice(i, 1);
    }
  }
  
  const removed = initialCount - pins.length;
  console.log(`Removed ${removed} pins, ${pins.length} remaining`);
  
  pinsStandingAtStart = pins.length;
}

function resetBallForNewRoll() {
  console.log('🔄 RESETTING BALL');
  
  // Remove old ball
  if (ball) {
    scene.remove(ball.mesh);
    world.removeBody(ball.body);
    ball.mesh.geometry.dispose();
    ball.mesh.material.dispose();
  }
  
  // Create fresh ball
  createBall();
  gameState = 'READY';
  waitingForSettle = false;
  
  // Reset power bar
  powerCharging = false;
  currentPower = 0;
  const powerBarElement = document.getElementById('powerBar');
  if (powerBarElement) {
    powerBarElement.style.display = 'none';
  }
  const powerFillElement = document.getElementById('powerFill');
  if (powerFillElement) {
    powerFillElement.style.width = '0%';
  }
  
  console.log('✅ Ball reset complete');
}

function finishRoll() {
  if (gameState === 'COMPLETE' || gameState === 'SETTLING') return;
  
  console.log('🏁 FINISHING ROLL');
  gameState = 'SETTLING';
  
  const pinsNowStanding = countStandingPins();
  const pinsKnocked = Math.max(0, pinsStandingAtStart - pinsNowStanding);
  const scored = Math.min(pinsStandingAtStart, pinsKnocked);
  
  console.log(`Started: ${pinsStandingAtStart}, Standing: ${pinsNowStanding}, Knocked: ${pinsKnocked}, Score: ${scored}`);
  
  // Add score to frame
  const currentFrame = frames[frameIndex];
  currentFrame.rolls.push(scored);
  
  // Check for Strike or Spare and display message
  const rollCount = currentFrame.rolls.length;
  
  if (rollCount === 1 && scored === 10) {
    // Strike - all pins knocked down with first ball
    showMessage('🎯 STRIKE! All 10 pins knocked down with first ball!', 3000);
  } else if (rollCount === 2 && currentFrame.rolls[0] + currentFrame.rolls[1] === 10) {
    // Spare - all pins knocked down with second ball
    showMessage('🎳 SPARE! All 10 pins knocked down with two balls!', 3000);
  } else if (rollCount === 1) {
    // First roll, not a strike
    showMessage(`First roll: ${scored} pins knocked down`, 2000);
  } else {
    // Second roll, not a spare
    const total = currentFrame.rolls[0] + currentFrame.rolls[1];
    showMessage(`Second roll: ${scored} pins. Total: ${total} pins`, 2000);
  }
  
  setupNextRoll(scored);
}

function updatePowerBar(dt) {
  if (powerCharging) {
    currentPower += powerDirection * POWER_SPEED * dt;
    
    if (currentPower >= 1.0) {
      currentPower = 1.0;
      powerDirection = -1;
    } else if (currentPower <= 0.0) {
      currentPower = 0.0;
      powerDirection = 1;
    }
    
    // Update visual power bar every frame
    const powerFillElement = document.getElementById('powerFill');
    if (powerFillElement) {
      powerFillElement.style.width = (currentPower * 100) + '%';
    }
    
    // Throttle text updates to every 100ms for readability
    const now = Date.now();
    if (now - lastPowerUpdateTime >= 100) {
      const messageElement = document.getElementById('message');
      if (messageElement) {
        const powerPercent = Math.round(currentPower * 100);
        messageElement.textContent = `CHARGING POWER: ${powerPercent}% | Release to throw!`;
        messageElement.style.color = currentPower > 0.8 ? '#ff4444' : currentPower > 0.5 ? '#ffaa00' : '#00ff88';
      }
      lastPowerUpdateTime = now;
    }
  }
}

function showMessage(msg, duration = 3000) {
  // Update the message element in UI panel
  const messageElement = document.getElementById('message');
  if (messageElement) {
    messageElement.textContent = msg;
    messageElement.style.color = '#00ff00';
    setTimeout(() => {
      if (messageElement.textContent === msg) {
        messageElement.textContent = `State: ${gameState} | Score: ${calculateFrameScores(frames)[9] || 0}`;
        messageElement.style.color = '';
      }
    }, duration);
  }
  
  // Also create a prominent center screen message for strikes/spares
  if (msg.includes('STRIKE') || msg.includes('SPARE')) {
    showCenterMessage(msg, duration);
  }
  
  // ALWAYS show center message for debugging
  showCenterMessage(msg, duration);
  
  console.log('📢 MESSAGE:', msg);
}

function showCenterMessage(text, duration = 3000) {
  // Remove existing center message if any
  const existingMessage = document.getElementById('centerMessage');
  if (existingMessage) {
    existingMessage.remove();
  }
  
  // Create new center message element
  const messageDiv = document.createElement('div');
  messageDiv.id = 'centerMessage';
  messageDiv.textContent = text;
  messageDiv.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 15px 25px;
    border-radius: 10px;
    font-size: 20px;
    font-weight: bold;
    z-index: 1000;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    animation: fadeInScale 0.5s ease-out;
  `;
  
  // Add animation CSS if not already added
  if (!document.getElementById('centerMessageStyles')) {
    const style = document.createElement('style');
    style.id = 'centerMessageStyles';
    style.textContent = `
      @keyframes fadeInScale {
        0% { opacity: 0; transform: translateX(-50%) scale(0.7); }
        100% { opacity: 1; transform: translateX(-50%) scale(1); }
      }
      @keyframes fadeOut {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(messageDiv);
  
  // Remove message after duration
  setTimeout(() => {
    if (messageDiv) {
      messageDiv.style.animation = 'fadeOut 0.5s ease-out forwards';
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 500);
    }
  }, duration);
}

function setupNextRoll(scored) {
  console.log(`🎮 SETTING UP NEXT ROLL - Frame ${frameIndex + 1}, Score: ${scored}`);
  console.log(`Current frame state:`, frames[frameIndex]);
  
  const currentFrame = frames[frameIndex];
  const rollCount = currentFrame.rolls.length;
  const isTenth = frameIndex === 9;
  
  console.log(`Roll count: ${rollCount}, Is 10th frame: ${isTenth}`);
  
  if (!isTenth) {
    // Frames 1-9
    if (rollCount === 1 && scored === 10) {
      // Strike - next frame
      console.log('✨ STRIKE! Next frame');
      frameIndex++;
      rollIndex = 0;
      console.log(`🔄 Advanced to frame ${frameIndex + 1}`);
      setupPins();
    } else if (rollCount === 1) {
      // Second roll
      console.log('➡️ Second roll');
      rollIndex = 1;
      removeKnockedPins();
    } else {
      // Frame complete
      console.log('✅ Frame complete');
      frameIndex++;
      rollIndex = 0;
      console.log(`🔄 Advanced to frame ${frameIndex + 1}`);
      setupPins();
    }
  } else {
    // 10th frame
    if (rollCount === 1) {
      if (scored === 10) {
        console.log('✨ Strike in 10th - bonus roll');
        rollIndex = 1;
        setupPins();
      } else {
        console.log('➡️ 10th frame second roll');
        rollIndex = 1;
        removeKnockedPins();
      }
    } else if (rollCount === 2) {
      const total = currentFrame.rolls[0] + currentFrame.rolls[1];
      if (currentFrame.rolls[0] === 10 || total === 10) {
        console.log('🎯 Bonus roll in 10th');
        rollIndex = 2;
        if (total === 10 && currentFrame.rolls[0] !== 10) {
          setupPins(); // Fresh pins for spare
        }
      } else {
        console.log('🏁 Game Over');
        gameState = 'COMPLETE';
        showMessage(`🎳 Game Complete! Final Score: ${calculateFrameScores(frames)[9] || 0}`, 10000);
        updateUI();
        return;
      }
    } else {
      console.log('🏁 Game Complete');
      gameState = 'COMPLETE';
      showMessage(`🎳 Game Complete! Final Score: ${calculateFrameScores(frames)[9] || 0}`, 10000);
      updateUI();
      return;
    }
  }
  
  // Check if game should end
  if (frameIndex >= 10) {
    console.log('🏁 All frames complete');
    gameState = 'COMPLETE';
    updateUI();
    return;
  }
  
  resetBallForNewRoll();
  updateUI();
}

function calculateFrameScores(frames) {
  const scores = [];
  
  for (let i = 0; i < 10; i++) {
    const frame = frames[i];
    if (!frame || frame.rolls.length === 0) {
      scores.push(0); // Start each frame at 0
      continue;
    }
    
    // Simple scoring - just sum the pins knocked in this frame
    const frameScore = frame.rolls.reduce((sum, roll) => sum + roll, 0);
    scores.push(frameScore);
  }
  
  return scores;
}

function updateUI() {
  const frameScores = calculateFrameScores(frames);
  const totalScore = frameScores.reduce((sum, score) => sum + score, 0); // Sum all frame scores
  
  console.log('📊 UPDATING UI:');
  console.log('Frames:', frames.map(f => f.rolls));
  console.log('Frame scores (individual):', frameScores);
  console.log('Total score:', totalScore);
  
  // Update existing HTML elements
  const frameNoElement = document.getElementById('frameNo');
  const rollNoElement = document.getElementById('rollNo');
  const messageElement = document.getElementById('message');
  const scoreboardElement = document.getElementById('scoreboard');
  
  if (frameNoElement) {
    frameNoElement.textContent = frameIndex + 1;
  }
  
  if (rollNoElement) {
    rollNoElement.textContent = rollIndex + 1;
  }
  
  if (messageElement) {
    messageElement.textContent = `State: ${gameState} | Score: ${totalScore}`;
  }
  
  // Create scoreboard with 2 rows of 5 frames each to fit screen
  if (scoreboardElement) {
    let html = '<div style="font-weight:700; margin-bottom:6px;">Bowling — Play (10 frames)</div>';
    
    // First row - Frames 1-5
    html += '<table style="width:100%;border-collapse:collapse;margin:5px 0;"><tr>';
    for (let i = 1; i <= 5; i++) {
      html += `<th style="border:1px solid #ccc;padding:4px;font-size:12px;">Frame ${i}</th>`;
    }
    html += '</tr><tr>';
    
    for (let i = 0; i < 5; i++) {
      const frame = frames[i];
      const score = frameScores[i] || 0;
      let rollsText = '';
      
      if (frame && frame.rolls.length > 0) {
        if (frame.rolls[0] === 10) {
          rollsText = 'X';
        } else if (frame.rolls.length === 2 && frame.rolls[0] + frame.rolls[1] === 10) {
          rollsText = `${frame.rolls[0]}/`;
        } else {
          rollsText = frame.rolls.map(r => r || '-').join(' ');
        }
      } else {
        rollsText = '-';
      }
      
      html += `<td style="border:1px solid #ccc;padding:4px;text-align:center;font-size:11px;">`;
      html += `<div>${rollsText}</div><div style="font-weight:bold;">${score}</div></td>`;
    }
    html += '</tr></table>';
    
    // Second row - Frames 6-10
    html += '<table style="width:100%;border-collapse:collapse;margin:5px 0;"><tr>';
    for (let i = 6; i <= 10; i++) {
      html += `<th style="border:1px solid #ccc;padding:4px;font-size:12px;">Frame ${i}</th>`;
    }
    html += '</tr><tr>';
    
    for (let i = 5; i < 10; i++) {
      const frame = frames[i];
      const score = frameScores[i] || 0;
      let rollsText = '';
      
      if (frame && frame.rolls.length > 0) {
        if (i < 9) {
          if (frame.rolls[0] === 10) {
            rollsText = 'X';
          } else if (frame.rolls.length === 2 && frame.rolls[0] + frame.rolls[1] === 10) {
            rollsText = `${frame.rolls[0]}/`;
          } else {
            rollsText = frame.rolls.map(r => r || '-').join(' ');
          }
        } else {
          // 10th frame special handling
          rollsText = frame.rolls.map((r, idx) => {
            if (r === 10) return 'X';
            if (idx > 0 && frame.rolls[idx - 1] + r === 10) return '/';
            return r || '-';
          }).join(' ');
        }
      } else {
        rollsText = '-';
      }
      
      html += `<td style="border:1px solid #ccc;padding:4px;text-align:center;font-size:11px;">`;
      html += `<div>${rollsText}</div><div style="font-weight:bold;">${score}</div></td>`;
    }
    
    html += '</tr></table>';
    scoreboardElement.innerHTML = html;
  }
}

function checkSettlement() {
  if (!waitingForSettle || !ball || gameState !== 'ROLLING') return;
  
  const ballVel = ball.body.velocity.length();
  let maxPinVel = 0;
  for (const pin of pins) {
    maxPinVel = Math.max(maxPinVel, pin.body.velocity.length());
  }
  
  const ballStopped = ballVel < 1.0;
  const pinsStopped = maxPinVel < 0.5;
  const ballPastPins = ball.body.position.z > CONFIG.PIN_BASE_Z;
  
  if ((ballStopped && pinsStopped) || ballPastPins) {
    console.log('⏹️ Settlement detected');
    finishRoll();
  }
}

// Check for gutter ball (crossing black gutters on sides)
function checkGutterBall() {
  if (!ball || !ball.thrown || gameState !== 'ROLLING') return;
  
  const ballX = ball.body.position.x;
  const ballZ = ball.body.position.z;
  const laneWidth = 1.8;
  const gutterBoundary = laneWidth / 2; // 0.9 units from lane center
  
  // Get the selected lane X position
  const selectedLaneX = CONFIG.SELECTED_LANE_X || 0;
  
  // Calculate ball's position relative to the selected lane center
  const ballXRelativeToLane = ballX - selectedLaneX;
  
  // Only check for gutter after ball has passed the pin area or had time to hit pins
  const ballPassedPins = ballZ > CONFIG.PIN_BASE_Z - 2; // Allow ball to reach pin area first
  
  // Check if ball crossed into the gutters relative to the selected lane
  if (ballPassedPins && Math.abs(ballXRelativeToLane) > gutterBoundary) {
    const side = ballXRelativeToLane > 0 ? 'right' : 'left';
    console.log(`🎳 GUTTER BALL! Ball went into ${side} gutter after pin interaction (Lane ${selectedLane})`);
    console.log(`Ball X: ${ballX.toFixed(2)}, Lane X: ${selectedLaneX.toFixed(2)}, Relative: ${ballXRelativeToLane.toFixed(2)}, Boundary: ±${gutterBoundary}`);
    
    // Show gutter ball message
    showCenterMessage(`🎳 GUTTER BALL! Ball went into the ${side} gutter`, 2000);
    
    // Force finish roll with current pin count (not 0)
    finishRollWithGutter();
  }
}

// Finish roll with gutter ball (count pins that were hit before gutter)
function finishRollWithGutter() {
  if (gameState === 'COMPLETE' || gameState === 'SETTLING') return;
  
  console.log('🎳 FINISHING ROLL - GUTTER BALL (counting pins hit)');
  gameState = 'SETTLING';
  
  // Count pins that were actually knocked down before gutter
  const pinsNowStanding = countStandingPins();
  const pinsKnocked = Math.max(0, pinsStandingAtStart - pinsNowStanding);
  const scored = Math.min(pinsStandingAtStart, pinsKnocked);
  
  console.log(`Gutter ball - but ${scored} pins were knocked down first`);
  
  // Add actual score to frame (not 0 if pins were hit)
  const currentFrame = frames[frameIndex];
  currentFrame.rolls.push(scored);
  
  // Show appropriate message
  if (scored > 0) {
    showMessage(`GUTTER BALL! But ${scored} pins were knocked down first`, 3000);
  } else {
    showMessage('GUTTER BALL! 0 pins knocked down', 2000);
  }
  
  setupNextRoll(scored);
}

// ================= CONTROLS ==============
window.addEventListener('mousemove', (e) => {
  if (gameState === 'READY') {
    const t = e.clientX / innerWidth;
    // Simple direct aiming - no offsets, just raw mouse position
    aimAngle = (t - 0.5) * 1.2; // Increased range for better control
    
    // Visual feedback for aiming - rotate ball
    if (ball && ball.mesh) {
      ball.mesh.rotation.y = aimAngle * 2;
    }
    
    // Update message to show aiming
    const messageElement = document.getElementById('message');
    if (messageElement && !powerCharging) {
      let aimDirection;
      let aimColor;
      
      if (aimAngle > 0.1) {
        aimDirection = `RIGHT (${(aimAngle * 50).toFixed(0)}°)`;
        aimColor = '#ff8888';
      } else if (aimAngle < -0.1) {
        aimDirection = `LEFT (${(-aimAngle * 50).toFixed(0)}°)`;
        aimColor = '#88ff88';
      } else {
        aimDirection = 'CENTER (0°)';
        aimColor = '#88ffff';
      }
      
      messageElement.textContent = `Aim: ${aimDirection} | Hold mouse to charge power`;
      messageElement.style.color = aimColor;
    }
  }
});

window.addEventListener('mousedown', (e) => {
  console.log(`🎯 MOUSEDOWN - gameState: ${gameState}, ball: ${!!ball}, ball.thrown: ${ball?.thrown}, powerCharging: ${powerCharging}, justSelectedLane: ${justSelectedLane}`);
  
  if (gameState === 'READY' && ball && !ball.thrown && !powerCharging && !justSelectedLane) {
    console.log('🎯 POWER CHARGING STARTED');
    powerCharging = true;
    currentPower = 0;
    powerDirection = 1;
    
    // Show power bar
    const powerBarElement = document.getElementById('powerBar');
    if (powerBarElement) {
      powerBarElement.style.display = 'block';
    }
  } else {
    console.log('❌ Power charging blocked - conditions not met');
  }
});

window.addEventListener('mouseup', (e) => {
  if (gameState === 'READY' && ball && !ball.thrown && powerCharging) {
    console.log(`🎯 THROWING BALL - Power: ${(currentPower * 100).toFixed(1)}%, Angle: ${aimAngle.toFixed(2)}`);
    
    // Calculate throw parameters with corrected physics
    const power = CONFIG.BALL_MIN_SPEED + (currentPower * (CONFIG.BALL_MAX_SPEED - CONFIG.BALL_MIN_SPEED));
    
    // Add compensation for leftward bias - shift left by subtracting negative offset
    const compensatedAngle = aimAngle - 0.6; // Subtract 0.6 to shift left (about 30 degrees)
    const vx = compensatedAngle * power * 0.4;
    const vz = power;
    
    console.log(`Original angle: ${aimAngle.toFixed(2)}, Compensated: ${compensatedAngle.toFixed(2)}`);
    console.log(`Calculated velocities: vx=${vx.toFixed(2)}, vz=${vz.toFixed(2)}`);
    
    // Throw ball
    ball.body.velocity.set(vx, 0, vz);
    ball.body.angularVelocity.set(0, 0, -power * 2);
    ball.thrown = true;
    
    // Update game state
    gameState = 'ROLLING';
    waitingForSettle = true;
    powerCharging = false;
    
    // Hide power bar
    const powerBarElement = document.getElementById('powerBar');
    if (powerBarElement) {
      powerBarElement.style.display = 'none';
    }
    
    console.log(`Ball thrown with compensated angle, velocity (${vx.toFixed(2)}, 0, ${vz.toFixed(2)})`);
  }
});

window.addEventListener('click', () => {
  // This is kept for fallback, but mousedown/mouseup handle the main interaction
  if (gameState === 'READY' && ball && !ball.thrown && !powerCharging && !justSelectedLane) {
    // Quick throw with random power if click without holding
    const power = CONFIG.BALL_MIN_SPEED + Math.random() * (CONFIG.BALL_MAX_SPEED - CONFIG.BALL_MIN_SPEED);
    const compensatedAngle = aimAngle - 0.6; // Same negative compensation
    const vx = compensatedAngle * power * 0.4;
    const vz = power;
    
    ball.body.velocity.set(vx, 0, vz);
    ball.body.angularVelocity.set(0, 0, -power * 2);
    ball.thrown = true;
    
    gameState = 'ROLLING';
    waitingForSettle = true;
    
    console.log(`Quick throw - power ${power.toFixed(1)}, compensated angle ${compensatedAngle.toFixed(2)}`);
  }
});

// Debug keys
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    console.log('🔄 EMERGENCY RESET');
    resetBallForNewRoll();
  }
  
  if (e.key === 's' || e.key === 'S') {
    console.log('⏭️ SKIP ROLL');
    if (gameState === 'ROLLING') {
      finishRoll();
    }
  }
  
  if (e.key === 'f' || e.key === 'F') {
    console.log('🚨 FULL RESET');
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
  }
  
  if (e.key === 'g' || e.key === 'G') {
    console.log('📍 POSITION CHECK');
    if (ball) {
      console.log(`Ball: (${ball.body.position.x.toFixed(2)}, ${ball.body.position.y.toFixed(2)}, ${ball.body.position.z.toFixed(2)})`);
      console.log(`Expected: (0, ${CONFIG.BALL_R + 0.02}, ${CONFIG.BALL_SPAWN_Z})`);
    }
    console.log(`Current aim angle: ${aimAngle.toFixed(3)} radians (${(aimAngle * 180/Math.PI).toFixed(1)}°)`);
    console.log(`Window size: ${innerWidth} x ${innerHeight}`);
  }
  
  // Quick aim offset adjustment keys
  if (e.key === '1') {
    console.log('🎯 Testing: No offset');
    // Temporary override - just for this test
    window.testAimOffset = 0;
  }
  if (e.key === '2') {
    console.log('🎯 Testing: Small right offset');
    window.testAimOffset = 0.05;
  }
  if (e.key === '3') {
    console.log('🎯 Testing: Medium right offset');
    window.testAimOffset = 0.1;
  }
  if (e.key === '4') {
    console.log('🎯 Testing: Large right offset');
    window.testAimOffset = 0.2;
  }
});

// ================= ANIMATION LOOP ==============
let lastTime = 0;

function animate(time) {
  const dt = Math.min((time - lastTime) / 1000, 1/30);
  lastTime = time;
  
  // Physics step
  world.step(CONFIG.PHYS_STEP);
  
  // Update power bar
  updatePowerBar(dt);
  
  // Update visuals
  if (ball) {
    ball.mesh.position.copy(ball.body.position);
    ball.mesh.quaternion.copy(ball.body.quaternion);
  }
  
  for (const pin of pins) {
    pin.mesh.position.copy(pin.body.position);
    pin.mesh.quaternion.copy(pin.body.quaternion);
  }
  
  // Check for settlement
  checkSettlement();
  
  // Check for gutter ball
  checkGutterBall();
  
  // Camera follows ball
  if (ball && ball.thrown && gameState === 'ROLLING') {
    const ballPos = ball.body.position;
    camera.position.x = ballPos.x;
    camera.position.z = ballPos.z - 8;
    camera.lookAt(ballPos.x, 1, ballPos.z + 5);
  } else {
    // Return camera to selected lane position
    const selectedLaneX = CONFIG.SELECTED_LANE_X || 0;
    camera.position.set(selectedLaneX, 3.8, -8);
    camera.lookAt(selectedLaneX, 1, CONFIG.PIN_BASE_Z);
  }
  
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ================= INITIALIZATION ==============
function init() {
  console.log('🎳 INITIALIZING BOWLING GAME');
  
  setupPins();
  createBall();
  updateUI();
  
  // Test message system immediately
  showMessage('🎳 Game Ready! Roll to see strike/spare messages!', 5000);
  
  // Add reset button functionality
  const resetBtn = document.getElementById('resetGameBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      console.log('🔄 GAME RESET VIA BUTTON');
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
    });
  }
  
  animate(0);
  
  console.log('✅ Game initialized');
}

// Start the game with lane selection
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createLaneSelectionModal();
    });
  } else {
    createLaneSelectionModal();
  }
}