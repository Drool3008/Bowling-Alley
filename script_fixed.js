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
  BALL_MAX_SPEED: 20,
  SELECTED_LANE_X: 0
};

// ================= LANE SELECTION ==============
let selectedLane = 3; // Default to center lane (lane 3 of 5)
let gameStarted = false;
let justSelectedLane = false; // Flag to prevent immediate auto-throw
const totalLanes = 5;
const laneSpacing = 2.2;

// ================= DECORATIVE PIN SYSTEM ==============
let decorativePinsByLane = new Map(); // Store decorative pins for inactive lanes
let currentPhysicsLane = 3; // Track which lane has physics pins

// ================= LANE STATE MANAGEMENT ==============
let laneStates = new Map(); // Store game state for each lane
let currentLaneData = null; // Reference to current lane's state

// Initialize lane states for all lanes
function initializeLaneStates() {
  for (let lane = 1; lane <= totalLanes; lane++) {
    laneStates.set(lane, {
      gameState: 'READY',
      frames: [],
      frameIndex: 0,
      rollIndex: 0,
      pinsStandingAtStart: 0,
      waitingForSettle: false,
      aimAngle: 0,
      powerCharging: false,
      currentPower: 0,
      totalScore: 0,
      isGameComplete: false
    });
    
    // Initialize frames for this lane
    const laneFrames = [];
    for (let i = 0; i < 10; i++) {
      laneFrames.push({ rolls: [] });
    }
    laneStates.get(lane).frames = laneFrames;
  }
  
  // Set current lane data to selected lane
  currentLaneData = laneStates.get(selectedLane);
  console.log(`🎳 Initialized states for ${totalLanes} lanes`);
}

// Save current game state to current lane
function saveCurrentLaneState() {
  if (currentLaneData) {
    currentLaneData.gameState = gameState;
    currentLaneData.frames = frames;
    currentLaneData.frameIndex = frameIndex;
    currentLaneData.rollIndex = rollIndex;
    currentLaneData.pinsStandingAtStart = pinsStandingAtStart;
    currentLaneData.waitingForSettle = waitingForSettle;
    currentLaneData.aimAngle = aimAngle;
    currentLaneData.powerCharging = powerCharging;
    currentLaneData.currentPower = currentPower;
    
    console.log(`💾 Saved state for Lane ${selectedLane}: Frame ${frameIndex + 1}, Roll ${rollIndex + 1}`);
  }
}

// Load game state from target lane
function loadLaneState(laneNumber) {
  const laneData = laneStates.get(laneNumber);
  if (laneData) {
    gameState = laneData.gameState;
    frames = laneData.frames;
    frameIndex = laneData.frameIndex;
    rollIndex = laneData.rollIndex;
    pinsStandingAtStart = laneData.pinsStandingAtStart;
    waitingForSettle = laneData.waitingForSettle;
    aimAngle = laneData.aimAngle;
    powerCharging = laneData.powerCharging;
    currentPower = laneData.currentPower;
    
    currentLaneData = laneData;
    
    console.log(`📂 Loaded state for Lane ${laneNumber}: Frame ${frameIndex + 1}, Roll ${rollIndex + 1}`);
    return true;
  }
  return false;
}

// Check if lane switching is allowed (only during first roll of any frame)
function canSwitchLanes() {
  // Allow switching only when:
  // 1. Game is ready (not actively rolling)
  // 2. Not charging power
  // 3. Not waiting for ball to settle
  // 4. On the first roll of any frame (rollIndex === 0)
  return gameState === 'READY' && 
         !powerCharging && 
         !waitingForSettle && 
         rollIndex === 0;
}

// Get lane information for display
function getLaneInfo(laneNumber) {
  const laneData = laneStates.get(laneNumber);
  if (!laneData) {
    return {
      frame: 1,
      roll: 1,
      score: 0,
      status: 'Fresh',
      isComplete: false
    };
  }
  
  const frameScores = calculateFrameScores(laneData.frames);
  const totalScore = frameScores.reduce((sum, score) => sum + score, 0);
  
  return {
    frame: laneData.frameIndex + 1,
    roll: laneData.rollIndex + 1,
    score: totalScore,
    status: laneData.isGameComplete ? 'Complete' : 'In Progress',
    isComplete: laneData.isGameComplete
  };
}

// ================= BOWLING CHARACTER ==============
let bowlingCharacter = null;
let characterAnimationState = 'IDLE'; // IDLE, CHARGING, THROWING, FOLLOW_THROUGH
let throwAnimationProgress = 0;
let characterBall = null; // Ball that the character holds during charging

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
// Create comprehensive lane-specific lighting like in real bowling alleys
const createBowlingAlleyLights = () => {
  const lights = [];
  
  // Main lane lighting - colorful overhead lights for each lane (3 lights per lane)
  const laneColors = [
    { light: 0xff8888, bulb: 0xff6666 }, // Red-ish for lane 1
    { light: 0x88ff88, bulb: 0x66ff66 }, // Green-ish for lane 2  
    { light: 0xfffff0, bulb: 0xffffe0 }, // Warm white for lane 3 (center)
    { light: 0x8888ff, bulb: 0x6666ff }, // Blue-ish for lane 4
    { light: 0xffaa88, bulb: 0xff9966 }  // Orange-ish for lane 5
  ];
  
  for (let i = 0; i < totalLanes; i++) {
    // Calculate X position for each lane
    const laneX = (i + 1 - Math.ceil(totalLanes / 2)) * laneSpacing;
    
    // Create 3 overhead lights per lane positioned along the lane length
    const lightPositions = [
      { z: -5, name: 'front' },   // Front of lane
      { z: 2, name: 'middle' },   // Middle of lane  
      { z: 9, name: 'back' }      // Back of lane (near pins)
    ];
    
    for (let j = 0; j < lightPositions.length; j++) {
      const lightPos = lightPositions[j];
      
      const laneLight = new THREE.SpotLight(laneColors[i].light, 5.0, 40, Math.PI / 6, 0.2);
      laneLight.position.set(laneX, 9, lightPos.z);
      laneLight.target.position.set(laneX, 0, lightPos.z);
      laneLight.castShadow = false; // Temporarily disable shadows for performance
      scene.add(laneLight);
      scene.add(laneLight.target);
      
      // Realistic hanging light fixtures
      const fixtureGroup = new THREE.Group();
      
      // Metal housing
      const housingGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.25, 12);
      const housingMaterial = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
      const housing = new THREE.Mesh(housingGeometry, housingMaterial);
      fixtureGroup.add(housing);
      
      // Reflector inside
      const reflectorGeometry = new THREE.CylinderGeometry(0.25, 0.35, 0.2, 12);
      const reflectorMaterial = new THREE.MeshLambertMaterial({ color: 0xcccccc });
      const reflector = new THREE.Mesh(reflectorGeometry, reflectorMaterial);
      reflector.position.y = -0.05;
      fixtureGroup.add(reflector);
      
      // Hanging chain/cord
      const cordGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.8, 6);
      const cordMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
      const cord = new THREE.Mesh(cordGeometry, cordMaterial);
      cord.position.y = 0.5;
      fixtureGroup.add(cord);
      
      // Glowing light bulb effect with lane-specific color
      const bulbGeometry = new THREE.SphereGeometry(0.1, 16, 16);
      const bulbMaterial = new THREE.MeshBasicMaterial({ 
        color: laneColors[i].bulb,
        transparent: true,
        opacity: 0.9
      });
      const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
      bulb.position.y = -0.15;
      fixtureGroup.add(bulb);
      
      fixtureGroup.position.copy(laneLight.position);
      fixtureGroup.position.y -= 0.3;
      scene.add(fixtureGroup);
      
      lights.push({ light: laneLight, fixture: fixtureGroup, bulb: bulb });
    }
  }
  
  // Pin area special lighting - dramatic bright lighting
  const pinAreaLight = new THREE.SpotLight(0xffffff, 4.0, 25, Math.PI / 3.5, 0.15);
  pinAreaLight.position.set(0, 11, CONFIG.PIN_BASE_Z);
  pinAreaLight.target.position.set(0, 0, CONFIG.PIN_BASE_Z);
  pinAreaLight.castShadow = true;
  scene.add(pinAreaLight);
  scene.add(pinAreaLight.target);
  
  // Add general fill lighting for overall visibility
  const fillLight1 = new THREE.PointLight(0xffffff, 1.5, 40);
  fillLight1.position.set(-5, 8, 0);
  scene.add(fillLight1);
  
  const fillLight2 = new THREE.PointLight(0xffffff, 1.5, 40);
  fillLight2.position.set(5, 8, 0);
  scene.add(fillLight2);
  
  const fillLight3 = new THREE.PointLight(0xffffff, 1.2, 35);
  fillLight3.position.set(0, 8, -8);
  scene.add(fillLight3);
  
  // Wall accent lighting - warm edge lighting
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const wallLight = new THREE.PointLight(0xff9944, 0.8, 12);
      wallLight.position.set(side * 6, 4, -4 + (i * 4));
      scene.add(wallLight);
      
      // Wall sconce fixtures
      const sconceGeometry = new THREE.SphereGeometry(0.15, 12, 12);
      const sconceMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x332211,
        transparent: true,
        opacity: 0.8
      });
      const sconce = new THREE.Mesh(sconceGeometry, sconceMaterial);
      sconce.position.copy(wallLight.position);
      scene.add(sconce);
    }
  }
  
  // Ceiling neon-style light strips - classic bowling alley look
  const stripColors = [0x4488ff, 0xff4488, 0x44ff88]; // Blue, pink, green
  for (let i = 0; i < 3; i++) {
    const stripGeometry = new THREE.BoxGeometry(10, 0.05, 0.2);
    const stripMaterial = new THREE.MeshBasicMaterial({ 
      color: stripColors[i],
      transparent: true,
      opacity: 0.8
    });
    const lightStrip = new THREE.Mesh(stripGeometry, stripMaterial);
    lightStrip.position.set(0, 10.5, -5 + (i * 5));
    scene.add(lightStrip);
    
    // Soft glow from strips
    const stripLight = new THREE.PointLight(stripColors[i], 0.4, 15);
    stripLight.position.copy(lightStrip.position);
    scene.add(stripLight);
  }
  
  // Entrance/back area lighting
  const entranceLight = new THREE.SpotLight(0xffaa44, 1.0, 20, Math.PI / 4, 0.3);
  entranceLight.position.set(0, 8, 8);
  entranceLight.target.position.set(0, 0, 5);
  scene.add(entranceLight);
  scene.add(entranceLight.target);
  
  // Under-lane accent lighting (like modern bowling alleys) - coordinated colors
  const underLaneColors = [
    0xff4444, // Red accent for lane 1
    0x44ff44, // Green accent for lane 2
    0x6644ff, // Purple accent for lane 3 (center)
    0x4444ff, // Blue accent for lane 4
    0xff6644  // Orange accent for lane 5
  ];
  
  for (let i = 0; i < totalLanes; i++) {
    // Calculate X position for each lane
    const laneX = (i + 1 - Math.ceil(totalLanes / 2)) * laneSpacing;
    
    const underLight = new THREE.PointLight(underLaneColors[i], 0.3, 8);
    underLight.position.set(laneX, 0.1, -3 + (i * 3.5));
    scene.add(underLight);
    
    // Add visual circular glow effect on the lane surface
    const glowGeometry = new THREE.RingGeometry(0.3, 0.5, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({ 
      color: underLaneColors[i],
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    const glowRing = new THREE.Mesh(glowGeometry, glowMaterial);
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.set(laneX, 0.02, 2); // Position on lane surface
    scene.add(glowRing);
  }
  
  return lights;
};

// Initialize bowling alley lighting
const bowlingLights = createBowlingAlleyLights();

// ================= BOWLING CHARACTER ==============
function createBowlingCharacter() {
  // Remove existing character if any
  if (bowlingCharacter) {
    scene.remove(bowlingCharacter);
    bowlingCharacter = null;
  }
  
  const laneX = CONFIG.SELECTED_LANE_X || 0;
  
  // Create character group for better organization
  const character = new THREE.Group();
  character.position.set(laneX, 0, CONFIG.BALL_SPAWN_Z - 1.5);
  
  // === MAIN BODY (more organic shape) ===
  
  // Torso - using sphere for more organic look, then scale it
  const torsoGeometry = new THREE.SphereGeometry(0.2, 16, 16);
  torsoGeometry.scale(1, 1.8, 0.8); // Make it taller and less wide
  const torsoMaterial = new THREE.MeshLambertMaterial({ color: 0x2c5aa0 }); // Blue bowling shirt
  const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
  torso.position.set(0, 0.95, 0);
  character.add(torso);
  
  // Head - slightly egg-shaped for more natural look
  const headGeometry = new THREE.SphereGeometry(0.14, 20, 16);
  headGeometry.scale(1, 1.1, 1); // Slightly taller
  const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac }); // Skin tone
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.set(0, 1.45, 0);
  character.add(head);
  
  // Eyes - positioned better
  const eyeGeometry = new THREE.SphereGeometry(0.015, 8, 8);
  const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0x000000 });
  
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.04, 1.48, 0.12);
  character.add(leftEye);
  
  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  rightEye.position.set(0.04, 1.48, 0.12);
  character.add(rightEye);
  
  // === ARMS (properly positioned at shoulder level) ===
  
  // Upper arms - positioned at shoulder height
  const upperArmGeometry = new THREE.CapsuleGeometry(0.03, 0.25, 4, 8); // More organic capsule shape
  const armMaterial = new THREE.MeshLambertMaterial({ color: 0xffdbac }); // Skin tone
  
  // Left upper arm
  const leftUpperArm = new THREE.Mesh(upperArmGeometry, armMaterial);
  leftUpperArm.position.set(-0.22, 1.25, 0); // At shoulder level
  leftUpperArm.rotation.z = Math.PI / 6; // Natural downward angle
  character.add(leftUpperArm);
  
  // Right upper arm
  const rightUpperArm = new THREE.Mesh(upperArmGeometry, armMaterial);
  rightUpperArm.position.set(0.22, 1.25, 0); // At shoulder level
  rightUpperArm.rotation.z = -Math.PI / 6; // Natural downward angle
  character.add(rightUpperArm);
  
  // Lower arms (forearms)
  const forearmGeometry = new THREE.CapsuleGeometry(0.025, 0.22, 4, 8);
  
  // Left forearm
  const leftForearm = new THREE.Mesh(forearmGeometry, armMaterial);
  leftForearm.position.set(-0.32, 1.05, 0); // Connected to upper arm
  leftForearm.rotation.z = Math.PI / 4; // Natural bend
  character.add(leftForearm);
  
  // Right forearm
  const rightForearm = new THREE.Mesh(forearmGeometry, armMaterial);
  rightForearm.position.set(0.32, 1.05, 0); // Connected to upper arm
  rightForearm.rotation.z = -Math.PI / 4; // Natural bend
  character.add(rightForearm);
  
  // Hands
  const handGeometry = new THREE.SphereGeometry(0.04, 12, 12);
  handGeometry.scale(1, 1, 0.8); // Slightly flattened
  
  // Left hand
  const leftHand = new THREE.Mesh(handGeometry, armMaterial);
  leftHand.position.set(-0.38, 0.9, 0);
  character.add(leftHand);
  
  // Right hand
  const rightHand = new THREE.Mesh(handGeometry, armMaterial);
  rightHand.position.set(0.38, 0.9, 0);
  character.add(rightHand);
  
  // === LEGS (more natural positioning) ===
  
  // Upper legs (thighs) - capsule for more organic look
  const thighGeometry = new THREE.CapsuleGeometry(0.055, 0.35, 4, 8);
  const pantsMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 }); // Dark pants
  
  // Left thigh
  const leftThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
  leftThigh.position.set(-0.08, 0.55, 0); // Closer together, more natural
  character.add(leftThigh);
  
  // Right thigh
  const rightThigh = new THREE.Mesh(thighGeometry, pantsMaterial);
  rightThigh.position.set(0.08, 0.55, 0); // Closer together, more natural
  character.add(rightThigh);
  
  // Lower legs (shins)
  const shinGeometry = new THREE.CapsuleGeometry(0.045, 0.32, 4, 8);
  
  // Left shin
  const leftShin = new THREE.Mesh(shinGeometry, pantsMaterial);
  leftShin.position.set(-0.08, 0.22, 0);
  character.add(leftShin);
  
  // Right shin
  const rightShin = new THREE.Mesh(shinGeometry, pantsMaterial);
  rightShin.position.set(0.08, 0.22, 0);
  character.add(rightShin);
  
  // === FEET (more shoe-like) ===
  
  const footGeometry = new THREE.BoxGeometry(0.1, 0.05, 0.2);
  footGeometry.translate(0, 0, 0.04); // Move forward slightly for shoe look
  const shoeMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 }); // Brown shoes
  
  // Left foot
  const leftFoot = new THREE.Mesh(footGeometry, shoeMaterial);
  leftFoot.position.set(-0.08, 0.03, 0);
  character.add(leftFoot);
  
  // Right foot
  const rightFoot = new THREE.Mesh(footGeometry, shoeMaterial);
  rightFoot.position.set(0.08, 0.03, 0);
  character.add(rightFoot);
  
  // === CLOTHING DETAILS ===
  
  // Collar area
  const collarGeometry = new THREE.SphereGeometry(0.21, 16, 16);
  collarGeometry.scale(1, 0.3, 0.8); // Flat collar shape
  const collarMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff }); // White collar
  const collar = new THREE.Mesh(collarGeometry, collarMaterial);
  collar.position.set(0, 1.25, 0);
  character.add(collar);
  
  // Simple belt line
  const beltGeometry = new THREE.SphereGeometry(0.21, 16, 16);
  beltGeometry.scale(1, 0.15, 0.85); // Thin belt
  const beltMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 }); // Brown belt
  const belt = new THREE.Mesh(beltGeometry, beltMaterial);
  belt.position.set(0, 0.72, 0);
  character.add(belt);
  
  scene.add(character);
  bowlingCharacter = character;
  
  console.log(`✅ Natural-looking human character created at lane X: ${laneX}`);
}

function createCharacterBall() {
  // Remove existing character ball if any
  if (characterBall) {
    scene.remove(characterBall);
    if (characterBall.geometry) characterBall.geometry.dispose();
    if (characterBall.material) characterBall.material.dispose();
    characterBall = null;
  }
  
  const ballGeometry = new THREE.SphereGeometry(CONFIG.BALL_R * 0.8, 12, 12);
  const ballMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  characterBall = new THREE.Mesh(ballGeometry, ballMaterial);
  characterBall.visible = false;
  scene.add(characterBall);
}

// ================= LANE SELECTION MODAL ==============
function createLaneSelectionModal() {
  // Remove existing modal if any
  const existingModal = document.getElementById('laneSelectionModal');
  if (existingModal) {
    document.body.removeChild(existingModal);
  }
  
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
    max-width: 900px;
    width: 95%;
    max-height: 90vh;
    overflow-y: auto;
  `;
  
  // Title with current lane info
  const title = document.createElement('h2');
  title.textContent = '🎳 Select Your Lane';
  title.style.cssText = `
    color: #60a5fa;
    margin: 0 0 15px 0;
    font-size: 2em;
    text-shadow: 0 2px 10px rgba(96, 165, 250, 0.3);
  `;
  modalContent.appendChild(title);
  
  // Current lane status
  const currentLaneInfo = getLaneInfo(selectedLane);
  const currentStatus = document.createElement('div');
  currentStatus.style.cssText = `
    background: rgba(96, 165, 250, 0.1);
    border: 1px solid #60a5fa;
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 25px;
    color: #e2e8f0;
  `;
  currentStatus.innerHTML = `
    <div style="font-size: 1.1em; color: #60a5fa; font-weight: bold; margin-bottom: 5px;">
      Currently Playing: Lane ${selectedLane}
    </div>
    <div style="font-size: 0.95em;">
      Frame ${currentLaneInfo.frame}, Roll ${currentLaneInfo.roll} | Score: ${currentLaneInfo.score}
    </div>
    ${rollIndex !== 0 ? '<div style="color: #f59e0b; font-size: 0.9em; margin-top: 5px;">⚠️ Lane switching only allowed on Roll 1</div>' : ''}
  `;
  modalContent.appendChild(currentStatus);
  
  // Lane buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 20px;
    justify-content: center;
    margin-bottom: 30px;
    max-width: 800px;
  `;
  
  // Create lane buttons with detailed information
  for (let i = 1; i <= totalLanes; i++) {
    const laneInfo = getLaneInfo(i);
    
    // Create lane button container
    const laneContainer = document.createElement('div');
    laneContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 10px;
    `;
    
    // Create main lane button
    const laneButton = document.createElement('button');
    laneButton.style.cssText = `
      padding: 15px 20px;
      background: ${i === selectedLane ? 'linear-gradient(90deg, #60a5fa 0%, #2563eb 100%)' : 'linear-gradient(90deg, #475569 0%, #64748b 100%)'};
      color: white;
      border: none;
      border-radius: 10px 10px 0 0;
      font-size: 1.1em;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
      min-width: 120px;
    `;
    laneButton.textContent = `Lane ${i}`;
    
    // Create info panel
    const infoPanel = document.createElement('div');
    infoPanel.style.cssText = `
      background: ${i === selectedLane ? 'rgba(96, 165, 250, 0.2)' : 'rgba(71, 85, 105, 0.3)'};
      border: 2px solid ${i === selectedLane ? '#60a5fa' : '#64748b'};
      border-top: none;
      border-radius: 0 0 10px 10px;
      padding: 10px;
      font-size: 0.9em;
      color: #e2e8f0;
      text-align: center;
      min-width: 120px;
      box-sizing: border-box;
    `;
    
    const statusColor = laneInfo.isComplete ? '#10b981' : '#f59e0b';
    infoPanel.innerHTML = `
      <div style="margin-bottom: 5px; color: ${statusColor}; font-weight: bold;">
        ${laneInfo.status}
      </div>
      <div style="margin-bottom: 3px;">
        Frame ${laneInfo.frame}, Roll ${laneInfo.roll}
      </div>
      <div style="color: #60a5fa; font-weight: bold;">
        Score: ${laneInfo.score}
      </div>
    `;
    
    laneButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectedLane = i;
      
      // Update all button styles
      buttonsContainer.querySelectorAll('.lane-container').forEach((container, index) => {
        const btn = container.querySelector('button');
        const panel = container.querySelector('.info-panel');
        if (index + 1 === selectedLane) {
          btn.style.background = 'linear-gradient(90deg, #60a5fa 0%, #2563eb 100%)';
          panel.style.background = 'rgba(96, 165, 250, 0.2)';
          panel.style.borderColor = '#60a5fa';
        } else {
          btn.style.background = 'linear-gradient(90deg, #475569 0%, #64748b 100%)';
          panel.style.background = 'rgba(71, 85, 105, 0.3)';
          panel.style.borderColor = '#64748b';
        }
      });
    });
    
    laneContainer.className = 'lane-container';
    infoPanel.className = 'info-panel';
    laneContainer.appendChild(laneButton);
    laneContainer.appendChild(infoPanel);
    buttonsContainer.appendChild(laneContainer);
  }
  
  modalContent.appendChild(buttonsContainer);
  
  // Start game button
  const startButton = document.createElement('button');
  startButton.textContent = gameStarted ? '🔄 Switch Lane' : '🎮 Start Game';
  startButton.style.cssText = `
    background: linear-gradient(90deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 10px;
    padding: 15px 30px;
    font-size: 1.2em;
    cursor: pointer;
    transition: all 0.3s ease;
    margin-right: 15px;
  `;
  
  startButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (gameStarted) {
      // Game is already running, check if we can switch lanes
      if (!canSwitchLanes()) {
        // Show message and don't close modal
        const existingMessage = modalContent.querySelector('.lane-switch-message');
        if (existingMessage) {
          existingMessage.remove();
        }
        
        let errorText = '❌ Cannot switch lanes ';
        if (rollIndex !== 0) {
          errorText += 'except on the first roll of a frame!';
        } else {
          errorText += 'during active gameplay!';
        }
        
        const errorMessage = document.createElement('div');
        errorMessage.className = 'lane-switch-message';
        errorMessage.innerHTML = `
          ${errorText}<br>
          <small style="color: #fbbf24;">💡 Lane switching is only allowed on Roll 1 of any frame</small>
        `;
        errorMessage.style.cssText = `
          color: #ef4444;
          margin-top: 15px;
          font-weight: bold;
          padding: 10px;
          background: rgba(239, 68, 68, 0.1);
          border-radius: 5px;
          border: 1px solid #ef4444;
          text-align: center;
        `;
        modalContent.appendChild(errorMessage);
        
        // Remove message after 4 seconds
        setTimeout(() => {
          if (errorMessage.parentNode) {
            errorMessage.remove();
          }
        }, 4000);
        
        return; // Don't close modal
      }
      
      // Game is already running, switch to selected lane
      const success = switchToLane(selectedLane);
      if (!success) {
        return; // Don't close modal if switch failed
      }
    } else {
      // Start new game with selected lane
      startGameWithSelectedLane();
    }
    
    document.body.removeChild(modalOverlay);
  });
  
  modalContent.appendChild(startButton);
  
  // Add click-to-close functionality (click outside modal)
  modalOverlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === modalOverlay) {
      document.body.removeChild(modalOverlay);
    }
  });
  
  // Prevent clicks inside modal content from bubbling
  modalContent.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);
}

// Add lane switching button to the UI
function addLaneSwitchingButton() {
  const existingButton = document.getElementById('switchLaneButton');
  if (existingButton) return; // Already exists
  
  const switchButton = document.createElement('button');
  switchButton.id = 'switchLaneButton';
  switchButton.textContent = 'Switch Lane';
  switchButton.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 25px;
    background: linear-gradient(90deg, #60a5fa 0%, #2563eb 100%);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    z-index: 1000;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    transition: all 0.3s ease;
  `;
  
  switchButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if switching is allowed before opening modal
    if (!canSwitchLanes()) {
      console.log('❌ Switch lane button clicked but switching not allowed');
      // Show visual feedback that the action is blocked
      switchButton.style.transform = 'scale(0.95)';
      setTimeout(() => {
        switchButton.style.transform = 'scale(1)';
      }, 150);
      return; // Don't open modal
    }
    
    // Only show modal if switching is allowed
    createLaneSelectionModal();
  });

  // Function to update button appearance based on switching availability
  function updateSwitchButtonState() {
    const canSwitch = canSwitchLanes();
    if (canSwitch) {
      switchButton.style.background = 'linear-gradient(90deg, #60a5fa 0%, #2563eb 100%)';
      switchButton.style.cursor = 'pointer';
      switchButton.style.opacity = '1';
      switchButton.style.filter = 'none';
      switchButton.title = 'Switch to another lane';
      switchButton.disabled = false;
    } else {
      switchButton.style.background = 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
      switchButton.style.cursor = 'not-allowed';
      switchButton.style.opacity = '0.6';
      switchButton.style.filter = 'brightness(0.8)';
      const reason = rollIndex === 0 ? 'during active gameplay' : `during Roll ${rollIndex + 1}`;
      switchButton.title = `Cannot switch lanes ${reason}. Switching only allowed on Roll 1 of any frame.`;
      switchButton.disabled = true;
    }
  }

  switchButton.addEventListener('mouseenter', () => {
    const canSwitch = canSwitchLanes();
    if (canSwitch) {
      switchButton.style.background = 'linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)';
      switchButton.style.transform = 'scale(1.05)';
      switchButton.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
    } else {
      // Still provide hover feedback but indicate it's disabled
      switchButton.style.background = 'linear-gradient(90deg, #dc2626 0%, #b91c1c 100%)';
      switchButton.style.transform = 'scale(1.02)'; // Smaller scale to indicate disabled
      switchButton.style.boxShadow = '0 4px 15px rgba(239, 68, 68, 0.4)';
      switchButton.style.filter = 'brightness(0.9)';
    }
  });

  switchButton.addEventListener('mouseleave', () => {
    updateSwitchButtonState();
    switchButton.style.transform = 'scale(1)';
    switchButton.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
  });

  // Update button state initially and periodically
  updateSwitchButtonState();
  setInterval(updateSwitchButtonState, 500); // Update every 500ms
  
  document.body.appendChild(switchButton);
}

// ================= SIMPLE CLOSED CUBE ROOM ==============
const createSimpleCubeRoom = () => {
  // Room dimensions - smaller cube
  const roomSize = 30;
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
  
  for (let i = 1; i <= totalLanes; i++) {
    const laneX = (i - Math.ceil(totalLanes / 2)) * laneSpacing;
    
    // Main lane surface
    const laneGeometry = new THREE.PlaneGeometry(laneWidth, laneLength);
    const laneMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
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
    
    // Foul line
    const foulLineGeometry = new THREE.PlaneGeometry(laneWidth, 0.05);
    const foulLineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const foulLine = new THREE.Mesh(foulLineGeometry, foulLineMaterial);
    foulLine.rotation.x = -Math.PI / 2;
    foulLine.position.set(laneX, 0.01, CONFIG.FOUL_LINE_Z);
    scene.add(foulLine);
  }
};

// Initialize the simple cube room and multiple lanes
createSimpleCubeRoom();
createMultipleLanes();

// ================= PHYSICS ==============
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.NaiveBroadphase();

// Enhanced physics materials for realistic ball-pin interaction
const ballMaterial = new CANNON.Material('ball');
const pinMaterial = new CANNON.Material('pin');
const groundMaterial = new CANNON.Material('ground');

const ballPinContact = new CANNON.ContactMaterial(ballMaterial, pinMaterial, {
  friction: 0.1,
  restitution: 0.4
});

const ballGroundContact = new CANNON.ContactMaterial(ballMaterial, groundMaterial, {
  friction: 0.02,
  restitution: 0.3
});

const pinGroundContact = new CANNON.ContactMaterial(pinMaterial, groundMaterial, {
  friction: 0.8,
  restitution: 0.1
});

world.addContactMaterial(ballPinContact);
world.addContactMaterial(ballGroundContact);
world.addContactMaterial(pinGroundContact);

// Ground
const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
groundBody.addShape(groundShape);
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);

const groundGeometry = new THREE.PlaneGeometry(20, 30);
const groundVisualMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 });
const groundMesh = new THREE.Mesh(groundGeometry, groundVisualMaterial);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// Green starting position rings for each lane
for (let i = 1; i <= totalLanes; i++) {
  const laneX = (i - Math.ceil(totalLanes / 2)) * laneSpacing;
  const ringGeometry = new THREE.RingGeometry(CONFIG.BALL_R + 0.02, CONFIG.BALL_R + 0.05, 16);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
  const startingRing = new THREE.Mesh(ringGeometry, ringMaterial);
  startingRing.position.set(laneX, 0.01, CONFIG.BALL_SPAWN_Z);
  startingRing.rotation.x = -Math.PI / 2;
  scene.add(startingRing);
}

// Start game with selected lane
function startGameWithSelectedLane() {
  gameStarted = true;
  justSelectedLane = true;
  console.log(`🎳 Starting game on Lane ${selectedLane}`);
  
  // Initialize lane states for all lanes
  initializeLaneStates();
  
  // Set the current physics lane to the selected lane
  currentPhysicsLane = selectedLane;
  
  // Calculate lane X position
  const selectedLaneX = (selectedLane - Math.ceil(totalLanes / 2)) * laneSpacing;
  CONFIG.SELECTED_LANE_X = selectedLaneX;
  
  // Update camera position for selected lane
  camera.position.set(selectedLaneX, 3.8, -8);
  camera.lookAt(selectedLaneX, 1, CONFIG.PIN_BASE_Z);
  
  // Start the game
  init();
  
  // Clear the flag after a short delay
  setTimeout(() => {
    justSelectedLane = false;
    console.log('✅ Ready for player input');
  }, 500);
}

// ================= DECORATIVE PIN MANAGEMENT ==============
// Remove decorative pins from a specific lane
function removeDecorativePinsFromLane(laneNumber) {
  const decorativePins = decorativePinsByLane.get(laneNumber);
  if (decorativePins && decorativePins.length > 0) {
    decorativePins.forEach(pin => {
      scene.remove(pin);
      pin.geometry.dispose();
      pin.material.dispose();
    });
    decorativePinsByLane.set(laneNumber, []);
    console.log(`🧹 Removed decorative pins from Lane ${laneNumber}`);
  }
}

// Add decorative pins to a specific lane
function addDecorativePinsToLane(laneNumber) {
  // Calculate lane X position
  const laneX = (laneNumber - Math.ceil(totalLanes / 2)) * laneSpacing;
  
  // Remove any existing decorative pins first
  removeDecorativePinsFromLane(laneNumber);
  
  // Create new decorative pins
  const decorativePins = [];
  const PIN_SETUP_BASE_Z = CONFIG.PIN_BASE_Z - 3;
  
  for (let row = 0; row < 4; row++) {
    const pinsInRow = row + 1;
    for (let col = 0; col < pinsInRow; col++) {
      const x = laneX + (col - (pinsInRow - 1) / 2) * CONFIG.PIN_SPACING;
      const z = PIN_SETUP_BASE_Z + row * CONFIG.PIN_ROW_SPACING;
      
      const pinGeometry = new THREE.CylinderGeometry(0.04, 0.06, CONFIG.PIN_H, 8);
      
      // Define pin colors by lane: red, green, blue, white, orange
      const laneColors = [0xff0000, 0x00ff00, 0x0066ff, 0xffffff, 0xff6600];
      const laneIndex = laneNumber - 1; // laneNumber is 1-5, convert to 0-4
      const pinColor = laneColors[laneIndex] || 0xffffff; // Default to white if out of range
      
      const pinMaterial = new THREE.MeshBasicMaterial({ color: pinColor });
      const decorativePin = new THREE.Mesh(pinGeometry, pinMaterial);
      decorativePin.position.set(x, CONFIG.PIN_H / 2, z);
      scene.add(decorativePin);
      decorativePins.push(decorativePin);
    }
  }
  
  decorativePinsByLane.set(laneNumber, decorativePins);
  console.log(`✨ Added decorative pins to Lane ${laneNumber}`);
}

// Switch physics pins to a new lane
function switchPhysicsPinsToLane(newLaneNumber) {
  console.log(`🔄 Switching physics pins from Lane ${currentPhysicsLane} to Lane ${newLaneNumber}`);
  
  // Add decorative pins back to the old physics lane
  if (currentPhysicsLane !== newLaneNumber) {
    addDecorativePinsToLane(currentPhysicsLane);
  }
  
  // Remove decorative pins from the new lane
  removeDecorativePinsFromLane(newLaneNumber);
  
  // Update current physics lane
  currentPhysicsLane = newLaneNumber;
  
  // Setup physics pins for the new lane will be handled by setupPins()
}

// Initialize decorative pins for all lanes except the current physics lane
function initializeAllDecorativePins() {
  for (let lane = 1; lane <= totalLanes; lane++) {
    if (lane !== currentPhysicsLane) {
      addDecorativePinsToLane(lane);
    }
  }
  console.log(`🎳 Initialized decorative pins for all lanes except physics lane ${currentPhysicsLane}`);
}

// Function to check if we can switch lanes (prevent during active gameplay)
// Function to switch to a different lane during gameplay
function switchToLane(newLaneNumber) {
  // Check if we can switch lanes
  if (!canSwitchLanes()) {
    const reason = rollIndex === 0 ? 'during active gameplay' : 'except on the first roll of a frame';
    console.log(`❌ Cannot switch lanes ${reason}`);
    return false;
  }
  
  console.log(`🔄 Switching from Lane ${selectedLane} to Lane ${newLaneNumber}`);
  
  // Save current lane state before switching
  saveCurrentLaneState();
  
  // Clean up all existing physics objects from the current lane
  cleanupLanePhysics();
  
  // Switch physics pins to new lane
  switchPhysicsPinsToLane(newLaneNumber);
  
  // Switch to new lane
  const oldLane = selectedLane;
  selectedLane = newLaneNumber;
  
  // Load state for new lane
  loadLaneState(newLaneNumber);
  
  // Calculate new lane X position
  const selectedLaneX = (selectedLane - Math.ceil(totalLanes / 2)) * laneSpacing;
  CONFIG.SELECTED_LANE_X = selectedLaneX;
  
  // Update camera position for new lane
  camera.position.set(selectedLaneX, 3.8, -8);
  camera.lookAt(selectedLaneX, 1, CONFIG.PIN_BASE_Z);
  
  // Update character position for new lane
  if (bowlingCharacter) {
    bowlingCharacter.position.x = selectedLaneX;
  }
  
  // Setup pins based on current frame/roll state
  setupPinsForCurrentState();
  createBall(); // This now includes cleanup of old ball
  createBowlingCharacter(); // Recreate character at new lane position
  createCharacterBall(); // Recreate character ball
  
  // Update UI to reflect new lane state
  updateUI();
  
  // Reset power charging state
  powerCharging = false;
  currentPower = 0;
  
  // Reset any UI elements
  const powerBarElement = document.getElementById('powerBar');
  if (powerBarElement) {
    powerBarElement.style.display = 'none';
  }
  const powerFillElement = document.getElementById('powerFill');
  if (powerFillElement) {
    powerFillElement.style.width = '0%';
  }
  
  updateUI();
  
  // Show success message
  showMessage(`🎳 Switched to Lane ${newLaneNumber} | Frame ${frameIndex + 1}, Roll ${rollIndex + 1}`, 3000);
  
  return true;
}

// ================= UPDATED GAME STATE ==============
let ball = null;
let ballInGutter = false;
let ballHitPinsBeforeGutter = false;
let pins = [];
// ================= GAME STATE (managed by lane system) ==============
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
const POWER_SPEED = 2.0; // Power increase/decrease speed

// Initialize frames (will be overridden by lane state loading)
for (let i = 0; i < 10; i++) {
  frames.push({ rolls: [] });
}

// ================= FUNCTIONS ==============
function createPin(x, z) {
  // Physics
  const shape = new CANNON.Cylinder(0.03, 0.06, CONFIG.PIN_H, 8);
  const body = new CANNON.Body({ mass: 0.5, material: pinMaterial });
  body.addShape(shape);
  body.position.set(x, CONFIG.PIN_H / 2, z);
  world.addBody(body);
  
  // Store original position for gutter detection
  body.originalPosition = { x, y: CONFIG.PIN_H / 2, z };
  
  // Visual - lane-specific pin colors
  const geometry = new THREE.CylinderGeometry(0.03, 0.06, CONFIG.PIN_H, 8);
  const laneColors = [0xff4444, 0x44ff44, 0x4444ff, 0xffffff, 0xffaa44]; // Red, Green, Blue, White, Orange
  const colorIndex = (selectedLane - 1) % laneColors.length;
  const material = new THREE.MeshLambertMaterial({ color: laneColors[colorIndex] });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  scene.add(mesh);
  
  return { body, mesh };
}

function createBall() {
  console.log('🎾 Creating new ball');
  
  // Clean up existing ball first
  cleanupBall();
  
  // Physics
  const shape = new CANNON.Sphere(CONFIG.BALL_R);
  const body = new CANNON.Body({ mass: 5, material: ballMaterial });
  body.addShape(shape);
  const laneX = CONFIG.SELECTED_LANE_X || 0;
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
  ballInGutter = false;
  ballHitPinsBeforeGutter = false;
  console.log('✅ Ball created at starting position');
}

// Clean up existing ball from scene and physics world
function cleanupBall() {
  if (ball) {
    console.log('🧹 Cleaning up existing ball');
    
    // Remove from physics world
    if (ball.body) {
      world.removeBody(ball.body);
    }
    
    // Remove from scene and dispose geometry/material
    if (ball.mesh) {
      scene.remove(ball.mesh);
      if (ball.mesh.geometry) {
        ball.mesh.geometry.dispose();
      }
      if (ball.mesh.material) {
        ball.mesh.material.dispose();
      }
    }
    
    ball = null;
    console.log('✅ Ball cleanup complete');
  }
}

// Comprehensive cleanup of all lane-specific physics objects
function cleanupLanePhysics() {
  console.log('🧹 Performing comprehensive lane physics cleanup');
  
  // Clean up ball
  cleanupBall();
  
  // Check for any orphaned ball bodies in the physics world
  const bodiesToRemove = [];
  for (let i = 0; i < world.bodies.length; i++) {
    const body = world.bodies[i];
    // Check if body is a ball (sphere shape with radius matching CONFIG.BALL_R)
    if (body.shapes && body.shapes.length > 0 && 
        body.shapes[0] instanceof CANNON.Sphere && 
        Math.abs(body.shapes[0].radius - CONFIG.BALL_R) < 0.001) {
      // This is likely an orphaned ball
      bodiesToRemove.push(body);
      console.log('🧹 Found orphaned ball body, marking for removal');
    }
  }
  
  // Remove orphaned ball bodies
  bodiesToRemove.forEach(body => {
    world.removeBody(body);
    console.log('✅ Removed orphaned ball body');
  });
  
  // Reset physics state
  powerCharging = false;
  currentPower = 0;
  waitingForSettle = false;
  
  console.log('✅ Lane physics cleanup complete');
}

// Setup pins based on current game state (for lane switching)
function setupPinsForCurrentState() {
  console.log(`🎳 Setting up pins for Frame ${frameIndex + 1}, Roll ${rollIndex + 1}`);
  
  if (rollIndex === 0) {
    // First roll of frame - set up all pins
    setupPins();
  } else if (rollIndex === 1) {
    // Second roll of frame - some pins may be down from first roll
    setupPins();
    
    // Get the first roll result to determine which pins should be down
    const firstRollPins = frames[frameIndex].rolls[0] || 0;
    const pinsToRemove = firstRollPins;
    
    // Remove pins from the back rows first (simulating real bowling pin fall patterns)
    let removedCount = 0;
    for (let i = pins.length - 1; i >= 0 && removedCount < pinsToRemove; i--) {
      const pin = pins[i];
      scene.remove(pin.mesh);
      world.removeBody(pin.body);
      pin.mesh.geometry.dispose();
      pin.mesh.material.dispose();
      pins.splice(i, 1);
      removedCount++;
    }
    
    console.log(`🎳 Removed ${removedCount} pins for second roll (${pins.length} pins remaining)`);
  }
  
  pinsStandingAtStart = pins.length;
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
  
  // Create new pins in reversed triangle formation (1-2-3-4 from front to back)
  // Move the entire setup forward by reducing the base Z position
  const PIN_SETUP_BASE_Z = CONFIG.PIN_BASE_Z - 3; // Move pins 3 units forward
  const laneX = CONFIG.SELECTED_LANE_X || 0;
  
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
  console.log(`✅ Set up ${pins.length} pins in reversed formation (1-2-3-4) - moved forward for better gameplay`);
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
  
  // Clean up old ball using consistent cleanup function
  cleanupBall();
  
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
  let pinsKnocked, scored;
  
  // Handle gutter ball logic
  if (ballInGutter && !ballHitPinsBeforeGutter) {
    // Ball went to gutter without hitting pins - score 0
    pinsKnocked = 0;
    scored = 0;
    console.log('🎳 Gutter ball - no pins hit, score = 0');
  } else {
    // Normal scoring or gutter after hitting pins
    pinsKnocked = Math.max(0, pinsStandingAtStart - pinsNowStanding);
    scored = Math.min(pinsStandingAtStart, pinsKnocked);
    
    if (ballInGutter && ballHitPinsBeforeGutter) {
      console.log('🎳 Gutter ball after hitting pins - normal scoring applies');
    }
  }
  
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
    if (ballInGutter && !ballHitPinsBeforeGutter) {
      showMessage('💀 GUTTER BALL! 0 pins knocked down', 2000);
    } else {
      showMessage(`First roll: ${scored} pins knocked down`, 2000);
    }
  } else {
    // Second roll, not a spare
    const total = currentFrame.rolls[0] + currentFrame.rolls[1];
    if (ballInGutter && !ballHitPinsBeforeGutter) {
      showMessage('💀 GUTTER BALL! 0 pins knocked down', 2000);
    } else {
      showMessage(`Second roll: ${scored} pins. Total: ${total} pins`, 2000);
    }
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
    
    // Update visual power bar
    const powerFillElement = document.getElementById('powerFill');
    if (powerFillElement) {
      powerFillElement.style.width = (currentPower * 100) + '%';
    }
    
    // Update message with power level
    const messageElement = document.getElementById('message');
    if (messageElement) {
      const powerPercent = Math.round(currentPower * 100);
      messageElement.textContent = `CHARGING POWER: ${powerPercent}% | Release to throw!`;
      messageElement.style.color = currentPower > 0.8 ? '#ff4444' : currentPower > 0.5 ? '#ffaa00' : '#00ff88';
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
        // Save final state
        saveCurrentLaneState();
        return;
      }
    } else {
      console.log('🏁 Game Complete');
      gameState = 'COMPLETE';
      showMessage(`🎳 Game Complete! Final Score: ${calculateFrameScores(frames)[9] || 0}`, 10000);
      updateUI();
      // Save final state
      saveCurrentLaneState();
      return;
    }
  }
  
  // Check if game should end
  if (frameIndex >= 10) {
    console.log('🏁 All frames complete');
    gameState = 'COMPLETE';
    updateUI();
    // Save final state
    saveCurrentLaneState();
    return;
  }
  
  // Save lane state after each roll transition
  saveCurrentLaneState();
  
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
  
  // Check if ball has hit any pins (for gutter logic)
  if (!ballHitPinsBeforeGutter && ball.body.position.z > CONFIG.PIN_BASE_Z - 2) {
    // Ball is near/past pins, check if any pins have moved
    for (const pin of pins) {
      if (pin.body.velocity.length() > 0.1 || 
          Math.abs(pin.body.position.x - pin.body.originalPosition.x) > 0.1 ||
          Math.abs(pin.body.position.z - pin.body.originalPosition.z) > 0.1) {
        ballHitPinsBeforeGutter = true;
        console.log('🎯 Ball hit pins before potential gutter');
        break;
      }
    }
  }
  
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
  // Ignore clicks on UI elements
  if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('#laneSelectionModal')) {
    return;
  }
  
  if (gameState === 'READY' && ball && !ball.thrown && !powerCharging) {
    console.log('🎯 POWER CHARGING STARTED');
    powerCharging = true;
    currentPower = 0;
    powerDirection = 1;
    
    // Show power bar
    const powerBarElement = document.getElementById('powerBar');
    if (powerBarElement) {
      powerBarElement.style.display = 'block';
    }
  }
});

window.addEventListener('mouseup', (e) => {
  // Ignore clicks on UI elements
  if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('#laneSelectionModal')) {
    // Still need to stop power charging if it was started
    if (powerCharging) {
      powerCharging = false;
      const powerBarElement = document.getElementById('powerBar');
      if (powerBarElement) {
        powerBarElement.style.display = 'none';
      }
    }
    return;
  }
  
  if (gameState === 'READY' && ball && !ball.thrown && powerCharging) {
    console.log(`🎯 THROWING BALL - Power: ${(currentPower * 100).toFixed(1)}%, Angle: ${aimAngle.toFixed(2)}`);
    
    // Calculate throw parameters with balanced compensation
    const power = CONFIG.BALL_MIN_SPEED + (currentPower * (CONFIG.BALL_MAX_SPEED - CONFIG.BALL_MIN_SPEED));
    
    // Add left offset since ball still goes right - need more leftward compensation
    const compensatedAngle = aimAngle - 0.45; // Increased compensation (about 26 degrees left)
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

window.addEventListener('click', (e) => {
  // Ignore clicks on UI elements
  if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('#laneSelectionModal')) {
    return;
  }
  
  // This is kept for fallback, but mousedown/mouseup handle the main interaction
  if (gameState === 'READY' && ball && !ball.thrown && !powerCharging) {
    // Quick throw with random power if click without holding
    const power = CONFIG.BALL_MIN_SPEED + Math.random() * (CONFIG.BALL_MAX_SPEED - CONFIG.BALL_MIN_SPEED);
    const compensatedAngle = aimAngle - 0.45; // Same increased compensation
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
  
  // Lane switching with number keys (1-5)
  if (e.key >= '1' && e.key <= '5') {
    const laneNumber = parseInt(e.key);
    if (gameStarted) {
      switchToLane(laneNumber);
    } else {
      selectedLane = laneNumber;
      console.log(`🎳 Selected Lane ${laneNumber} (press 'Start Game' to begin)`);
    }
  }
  
  // Quick aim offset adjustment keys (Alt + number keys)
  if (e.altKey && e.key === '1') {
    console.log('🎯 Testing: No offset');
    window.testAimOffset = 0;
  }
  if (e.altKey && e.key === '2') {
    console.log('🎯 Testing: Small right offset');
    window.testAimOffset = 0.05;
  }
  if (e.altKey && e.key === '3') {
    console.log('🎯 Testing: Medium right offset');
    window.testAimOffset = 0.1;
  }
  if (e.altKey && e.key === '4') {
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
    
    // Check for gutter detection when ball is thrown
    if (ball.thrown && gameState === 'ROLLING' && !ballInGutter) {
      const ballX = ball.body.position.x;
      const selectedLaneX = CONFIG.SELECTED_LANE_X || 0;
      const laneWidth = 1.8;
      const leftGutterBoundary = selectedLaneX - laneWidth/2;
      const rightGutterBoundary = selectedLaneX + laneWidth/2;
      
      // Check if ball has crossed into gutter
      if (ballX < leftGutterBoundary || ballX > rightGutterBoundary) {
        ballInGutter = true;
        console.log(`🎳 Ball entered gutter at X=${ballX.toFixed(2)} (Lane boundaries: ${leftGutterBoundary.toFixed(2)} to ${rightGutterBoundary.toFixed(2)})`);
        showMessage('💀 GUTTER BALL!', 2000);
        
        // If no pins hit yet, immediately finish the roll with score 0
        if (!ballHitPinsBeforeGutter) {
          console.log('🚫 Gutter ball with no pins hit - ending roll immediately');
          setTimeout(() => {
            finishRoll();
          }, 1000); // Small delay to show the gutter message
        }
      }
    }
  }
  
  for (const pin of pins) {
    pin.mesh.position.copy(pin.body.position);
    pin.mesh.quaternion.copy(pin.body.quaternion);
  }
  
  // Check for settlement
  checkSettlement();
  
  // Camera follows ball on selected lane with smooth tracking
  if (ball && ball.thrown && gameState === 'ROLLING') {
    const ballPos = ball.body.position;
    
    // Smooth camera following with interpolation
    const targetX = ballPos.x;
    const targetZ = ballPos.z - 8;
    
    // Interpolate camera position for smoother movement
    const lerpFactor = 0.1; // Adjust this value for smoothness (0.1 = smooth, 1.0 = instant)
    camera.position.x += (targetX - camera.position.x) * lerpFactor;
    camera.position.z += (targetZ - camera.position.z) * lerpFactor;
    
    // Look ahead of the ball slightly for better view
    camera.lookAt(ballPos.x, 1, ballPos.z + 3);
  } else {
    // Return camera to selected lane smoothly
    const selectedLaneX = CONFIG.SELECTED_LANE_X || 0;
    const targetX = selectedLaneX;
    const targetZ = -8;
    
    // Smooth return to lane position
    const lerpFactor = 0.15;
    camera.position.x += (targetX - camera.position.x) * lerpFactor;
    camera.position.z += (targetZ - camera.position.z) * lerpFactor;
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
  createBowlingCharacter();
  createCharacterBall();
  updateUI();
  addLaneSwitchingButton();
  
  // Initialize decorative pins for all lanes except the current physics lane
  initializeAllDecorativePins();
  
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

// Check if game should start with lane selection
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!gameStarted) {
        createLaneSelectionModal();
      }
    });
  } else {
    if (!gameStarted) {
      createLaneSelectionModal();
    }
  }
}