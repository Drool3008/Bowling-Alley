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
let switchButtonClicked = false; // Flag to prevent global click interference
const totalLanes = 5;
const laneSpacing = 2.2;

// ================= BOWLING CHARACTER ==============
let bowlingCharacter = null;
let characterAnimationState = 'IDLE'; // IDLE, CHARGING, THROWING, FOLLOW_THROUGH
let throwAnimationProgress = 0;
let characterBall = null; // Ball that the character holds during charging

// Pin management for all lanes
const decorativePinsByLane = new Map(); // Store decorative pins for inactive lanes
let currentPhysicsLane = 3; // Track which lane has physics pins

// Individual lane state storage
const laneGameStates = new Map();

// Initialize game states for all lanes (1-5)
function initializeLaneStates() {
  for (let i = 1; i <= totalLanes; i++) {
    laneGameStates.set(i, {
      gameState: 'READY',
      frames: [],
      frameIndex: 0,
      rollIndex: 0,
      pinsStandingAtStart: 0,
      waitingForSettle: false,
      hasPlayed: false // Track if this lane has been used
    });
    
    // Initialize frames for each lane
    const frames = [];
    for (let f = 0; f < 10; f++) {
      frames.push({ rolls: [] });
    }
    laneGameStates.get(i).frames = frames;
  }
}

// Initialize lane states
initializeLaneStates();

// Lane switching control functions
function canSwitchLanes() {
  console.log(`🔍 Checking lane switch availability: gameState=${gameState}, frameIndex=${frameIndex}, rollIndex=${rollIndex}`);
  
  // Cannot switch if ball is in motion
  if (gameState === 'ROLLING' || gameState === 'SETTLING') {
    console.log('❌ Cannot switch: Ball is in motion');
    return {
      allowed: false,
      reason: 'Cannot switch lanes while ball is in motion. Wait for ball to stop.'
    };
  }
  
  // Check if we're in the middle of a frame (roll 2)
  if (rollIndex === 1) {
    console.log('❌ Cannot switch: In middle of frame (roll 2)');
    return {
      allowed: false,
      reason: 'Cannot switch lanes during roll 2. Complete the frame first.'
    };
  }
  
  // Can switch during roll 1 of any frame (including first roll)
  if (rollIndex === 0) {
    console.log('✅ Can switch: Roll 1 of frame');
    return {
      allowed: true,
      reason: 'Lane switching available before first roll of frame.'
    };
  }
  
  console.log('✅ Can switch: General availability');
  return {
    allowed: true,
    reason: 'Lane switching available.'
  };
}

function saveCurrentLaneState() {
  const currentState = laneGameStates.get(selectedLane);
  currentState.gameState = gameState;
  currentState.frames = JSON.parse(JSON.stringify(frames)); // Deep copy
  currentState.frameIndex = frameIndex;
  currentState.rollIndex = rollIndex;
  currentState.pinsStandingAtStart = pinsStandingAtStart;
  currentState.waitingForSettle = waitingForSettle;
  currentState.hasPlayed = true;
  
  // Calculate current score for debugging
  const frameScores = calculateFrameScores(frames);
  const totalScore = frameScores.reduce((sum, score) => sum + score, 0);
  
  console.log(`💾 Saved state for Lane ${selectedLane}:`, {
    frame: frameIndex + 1,
    roll: rollIndex + 1,
    gameState: gameState,
    totalScore: totalScore,
    frames: frames.map(f => f.rolls)
  });
}

function loadLaneState(laneNumber) {
  const laneState = laneGameStates.get(laneNumber);
  
  gameState = laneState.gameState;
  frames = JSON.parse(JSON.stringify(laneState.frames)); // Deep copy
  frameIndex = laneState.frameIndex;
  rollIndex = laneState.rollIndex;
  pinsStandingAtStart = laneState.pinsStandingAtStart;
  waitingForSettle = laneState.waitingForSettle;
  
  // Ensure clean state when resuming
  if (laneState.hasPlayed) {
    gameState = 'READY'; // Always set to READY when resuming
    waitingForSettle = false;
  }
  
  console.log(`📂 Loaded state for Lane ${laneNumber}:`, {
    frame: frameIndex + 1,
    roll: rollIndex + 1,
    gameState: gameState,
    hasPlayed: laneState.hasPlayed
  });
}

function switchToLane(newLaneNumber) {
  const switchCheck = canSwitchLanes();
  if (!switchCheck.allowed) {
    alert(switchCheck.reason);
    return false;
  }
  
  console.log(`🔄 Switching from Lane ${selectedLane} to Lane ${newLaneNumber}`);
  
  // Save current lane state
  saveCurrentLaneState();
  
  // Switch to new lane
  const oldLane = selectedLane;
  selectedLane = newLaneNumber;
  
  // Load new lane state
  loadLaneState(newLaneNumber);
  
  // Handle pin switching
  switchPhysicsPinsToLane(newLaneNumber);
  
  // Force physics world step to settle any lingering physics
  world.step(CONFIG.PHYS_STEP);
  
  // Update camera and CONFIG
  const selectedLaneX = (selectedLane - Math.ceil(totalLanes / 2)) * laneSpacing;
  CONFIG.SELECTED_LANE_X = selectedLaneX;
  camera.position.set(selectedLaneX, 3.8, -8);
  camera.lookAt(selectedLaneX, 1, CONFIG.PIN_BASE_Z);
  
  // Update character position for new lane
  updateCharacterForLane(newLaneNumber);
  
  // Refresh game display
  setupPins();
  createBall();
  
  // Reset game state to ensure clean transition
  gameState = 'READY';
  waitingForSettle = false;
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
  updateLaneSwitchButton();
  
  // Show success message
  const laneState = laneGameStates.get(newLaneNumber);
  const frameInfo = `Frame ${frameIndex + 1}, Roll ${rollIndex + 1}`;
  const statusInfo = laneState.hasPlayed ? 'Resuming game' : 'Starting new game';
  showMessage(`🎳 Switched to Lane ${newLaneNumber} | ${frameInfo} | ${statusInfo}`, 3000);
  
  return true;
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
  
  switchButton.addEventListener('click', (event) => {
    console.log('🖱️ Switch Lane button clicked!');
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    // Set flag to prevent global click handler
    switchButtonClicked = true;
    setTimeout(() => { switchButtonClicked = false; }, 100);
    
    const switchCheck = canSwitchLanes();
    console.log(`Switch check result:`, switchCheck);
    
    if (!switchCheck.allowed) {
      console.log('❌ Switch not allowed, showing alert');
      alert(switchCheck.reason);
      switchButtonClicked = false; // Reset flag
      return;
    }
    console.log('✅ Switch allowed, creating modal');
    
    // Use setTimeout to ensure the flag is set before any other handlers run
    setTimeout(() => {
      createLaneSwitchingModal();
      switchButtonClicked = false; // Reset flag after modal is created
    }, 10);
  });
  
  switchButton.addEventListener('mouseenter', () => {
    if (!switchButton.disabled) {
      switchButton.style.transform = 'scale(1.05)';
      switchButton.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
    }
  });
  
  switchButton.addEventListener('mouseleave', () => {
    switchButton.style.transform = 'scale(1)';
    switchButton.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
  });
  
  document.body.appendChild(switchButton);
}

function updateLaneSwitchButton() {
  const switchButton = document.getElementById('switchLaneButton');
  if (!switchButton) {
    console.log('⚠️ Switch button not found');
    return;
  }
  
  const switchCheck = canSwitchLanes();
  console.log(`🔄 Updating switch button: ${switchCheck.allowed ? 'ENABLED' : 'DISABLED'} - ${switchCheck.reason}`);
  
  if (switchCheck.allowed) {
    switchButton.disabled = false;
    switchButton.textContent = 'Switch Lane';
    switchButton.style.background = 'linear-gradient(90deg, #60a5fa 0%, #2563eb 100%)';
    switchButton.style.opacity = '1';
    switchButton.style.cursor = 'pointer';
    switchButton.title = 'Click to switch to another lane';
  } else {
    switchButton.disabled = true;
    switchButton.textContent = 'Complete Roll';
    switchButton.style.background = 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
    switchButton.style.opacity = '0.7';
    switchButton.style.cursor = 'not-allowed';
    switchButton.title = switchCheck.reason;
  }
}

// Create lane switching modal
function createLaneSwitchingModal() {
  console.log('🎯 Creating lane switching modal...');
  
  // IMPORTANT: Save current lane state before showing modal
  saveCurrentLaneState();
  
  // Remove existing modal if any
  const existingModal = document.getElementById('laneSwitchModal');
  if (existingModal) {
    console.log('🗑️ Removing existing modal');
    document.body.removeChild(existingModal);
  }
  
  // Create modal overlay
  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'laneSwitchModal';
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
    z-index: 10000;
    backdrop-filter: blur(5px);
  `;
  
  console.log('✅ Modal overlay created successfully');
  
  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.style.cssText = `
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
    padding: 40px;
    border-radius: 20px;
    text-align: center;
    border: 3px solid #60a5fa;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    max-width: 900px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
  `;
  
  // Title
  const title = document.createElement('h1');
  title.textContent = 'Switch Lane';
  title.style.cssText = `
    color: #60a5fa;
    margin-bottom: 10px;
    font-size: 2.5em;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
  `;
  
  // Current lane info
  const currentInfo = document.createElement('p');
  
  // Calculate current score properly
  let currentScore = 0;
  if (frames && frames.length > 0) {
    const frameScores = calculateFrameScores(frames);
    currentScore = frameScores.reduce((sum, score) => sum + score, 0);
  }
  
  currentInfo.innerHTML = `
    <strong>Currently on Lane ${selectedLane}</strong><br>
    Frame ${frameIndex + 1}, Roll ${rollIndex + 1} | Score: ${currentScore}
  `;
  currentInfo.style.cssText = `
    color: #94a3b8;
    margin-bottom: 25px;
    font-size: 1.3em;
    line-height: 1.5;
  `;
  
  // Instruction
  const instruction = document.createElement('p');
  instruction.textContent = 'Select a lane to switch to:';
  instruction.style.cssText = `
    color: #cbd5e1;
    margin-bottom: 30px;
    font-size: 1.1em;
  `;
  
  modalContent.appendChild(title);
  modalContent.appendChild(currentInfo);
  modalContent.appendChild(instruction);
  
  // Lane buttons container
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.cssText = `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  `;
  
  // Create lane buttons
  for (let i = 1; i <= 5; i++) {
    const laneState = laneGameStates.get(i);
    
    // Calculate the total score for this lane (cumulative)
    let laneScore = 0;
    if (laneState.frames && laneState.frames.length > 0) {
      const frameScores = calculateFrameScores(laneState.frames);
      laneScore = frameScores.reduce((sum, score) => sum + score, 0);
    }
    
    const isCurrentLane = i === selectedLane;
    
    const laneButton = document.createElement('button');
    
    // Determine lane status
    let statusIcon, statusText, statusColor, frameInfo;
    if (isCurrentLane) {
      statusIcon = '🎯';
      statusText = 'Current Lane';
      statusColor = '#10b981';
      frameInfo = `F${frameIndex + 1}R${rollIndex + 1}`;
    } else if (laneState.hasPlayed) {
      statusIcon = '🎳';
      statusText = 'Resume Game';
      statusColor = '#f59e0b';
      frameInfo = `F${laneState.frameIndex + 1}R${laneState.rollIndex + 1}`;
    } else {
      statusIcon = '🆕';
      statusText = 'Start New';
      statusColor = '#3b82f6';
      frameInfo = 'F1R1';
    }
    
    laneButton.innerHTML = `
      <div style="font-size: 1.5em; margin-bottom: 8px;">${statusIcon}</div>
      <div style="font-size: 1.3em; font-weight: bold; margin-bottom: 5px;">Lane ${i}</div>
      <div style="font-size: 0.9em; opacity: 0.9; margin-bottom: 5px;">${frameInfo} | Score: ${laneScore}</div>
      <div style="font-size: 0.8em; color: ${statusColor}; font-weight: bold;">${statusText}</div>
    `;
    
    laneButton.style.cssText = `
      padding: 20px 15px;
      border: 2px solid ${statusColor};
      border-radius: 15px;
      cursor: ${isCurrentLane ? 'default' : 'pointer'};
      font-family: inherit;
      transition: all 0.3s ease;
      background: ${isCurrentLane ? 
        'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)' :
        'linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(37, 99, 235, 0.1) 100%)'
      };
      color: white;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
      opacity: ${isCurrentLane ? '0.7' : '1'};
    `;
    
    if (!isCurrentLane) {
      laneButton.addEventListener('mouseenter', () => {
        laneButton.style.transform = 'scale(1.02)';
        laneButton.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
        laneButton.style.background = 'linear-gradient(135deg, rgba(96, 165, 250, 0.2) 0%, rgba(37, 99, 235, 0.2) 100%)';
      });
      
      laneButton.addEventListener('mouseleave', () => {
        laneButton.style.transform = 'scale(1)';
        laneButton.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
        laneButton.style.background = 'linear-gradient(135deg, rgba(96, 165, 250, 0.1) 0%, rgba(37, 99, 235, 0.1) 100%)';
      });
      
      laneButton.addEventListener('click', () => {
        console.log(`🎯 Attempting to switch to Lane ${i}`);
        switchToLane(i);
        document.body.removeChild(modalOverlay);
      });
    }
    
    buttonsContainer.appendChild(laneButton);
  }
  
  modalContent.appendChild(buttonsContainer);
  
  // Cancel button
  const cancelButton = document.createElement('button');
  cancelButton.textContent = 'Cancel';
  cancelButton.style.cssText = `
    padding: 15px 30px;
    background: linear-gradient(90deg, #6b7280 0%, #4b5563 100%);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 1.1em;
    cursor: pointer;
    transition: all 0.3s ease;
  `;
  
  cancelButton.addEventListener('click', () => {
    document.body.removeChild(modalOverlay);
  });
  
  cancelButton.addEventListener('mouseenter', () => {
    cancelButton.style.background = 'linear-gradient(90deg, #4b5563 0%, #374151 100%)';
  });
  
  cancelButton.addEventListener('mouseleave', () => {
    cancelButton.style.background = 'linear-gradient(90deg, #6b7280 0%, #4b5563 100%)';
  });
  
  modalContent.appendChild(cancelButton);
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);
  
  console.log('🎯 Modal successfully added to DOM');
  
  // Close modal when clicking outside
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      document.body.removeChild(modalOverlay);
    }
  });
}

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
    updateLaneSwitchButton(); // Update button after setup
  }, 500);
}

// Initialize game components for selected lane
function initializeGameOnLane(laneX) {
  // Update CONFIG for selected lane
  CONFIG.SELECTED_LANE_X = laneX;
  
  // Switch pins to the selected lane
  switchPhysicsPinsToLane(selectedLane);
  
  // Start the game
  init();
}

// Add lane switching button to the UI
function addLaneSwitchButton() {
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
  
  switchButton.addEventListener('click', () => {
    createLaneSelectionModal();
  });
  
  switchButton.addEventListener('mouseenter', () => {
    if (!switchButton.disabled) {
      switchButton.style.transform = 'scale(1.05)';
      switchButton.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
    }
  });
  
  switchButton.addEventListener('mouseleave', () => {
    switchButton.style.transform = 'scale(1)';
    switchButton.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
  });
  
  document.body.appendChild(switchButton);
}

// Update the switch button whenever game state changes
function updateGameStateAndButton(newGameState) {
  gameState = newGameState;
  updateLaneSwitchButton();
}

// ================= BOWLING CHARACTER FUNCTIONS ==============
function createBowlingCharacter() {
  console.log('🏃 Creating bowling character');
  
  const laneX = CONFIG.SELECTED_LANE_X || 0;
  
  // Create character group
  const characterGroup = new THREE.Group();
  
  // === TORSO (more realistic rectangular shape) ===
  const torsoGeometry = new THREE.BoxGeometry(0.35, 0.6, 0.2);
  const torsoMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 }); // Dark blue bowling shirt
  const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
  torso.position.y = 1.0;
  characterGroup.add(torso);
  
  // === HEAD (more detailed) ===
  const headGeometry = new THREE.SphereGeometry(0.15, 16, 16);
  const headMaterial = new THREE.MeshLambertMaterial({ color: 0xfdbcb4 }); // Skin color
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 1.45;
  characterGroup.add(head);
  
  // === HAIR ===
  const hairGeometry = new THREE.SphereGeometry(0.16, 16, 16);
  const hairMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 }); // Brown hair
  const hair = new THREE.Mesh(hairGeometry, hairMaterial);
  hair.position.y = 1.52;
  hair.scale.set(1, 0.8, 1); // Flatten slightly
  characterGroup.add(hair);
  
  // === ARMS (hierarchical structure with proper connections) ===
  const armMaterial = new THREE.MeshLambertMaterial({ color: 0xfdbcb4 }); // Skin color
  
  // Left arm system
  const leftArmGroup = new THREE.Group();
  
  // Left upper arm
  const leftUpperArmGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8);
  const leftUpperArm = new THREE.Mesh(leftUpperArmGeometry, armMaterial);
  leftUpperArm.position.set(0, -0.175, 0); // Position relative to shoulder
  leftArmGroup.add(leftUpperArm);
  
  // Left forearm (child of upper arm)
  const leftForearmGroup = new THREE.Group();
  const leftForearmGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
  const leftForearm = new THREE.Mesh(leftForearmGeometry, armMaterial);
  leftForearm.position.set(0, -0.15, 0); // Position relative to elbow
  leftForearmGroup.add(leftForearm);
  
  // Left hand (child of forearm)
  const leftHandGeometry = new THREE.SphereGeometry(0.04, 8, 8);
  const leftHand = new THREE.Mesh(leftHandGeometry, armMaterial);
  leftHand.position.set(0, -0.18, 0); // Position at end of forearm (outward)
  leftForearmGroup.add(leftHand);
  
  leftForearmGroup.position.set(0, -0.35, 0); // Position forearm group at elbow
  leftArmGroup.add(leftForearmGroup);
  
  leftArmGroup.position.set(-0.25, 1.15, 0); // Position arm group at shoulder
  leftArmGroup.rotation.z = Math.PI / 6; // More outward angle
  characterGroup.add(leftArmGroup);
  
  // Right arm system (throwing arm)
  const rightArmGroup = new THREE.Group();
  
  // Right upper arm
  const rightUpperArmGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8);
  const rightUpperArm = new THREE.Mesh(rightUpperArmGeometry, armMaterial);
  rightUpperArm.position.set(0, -0.175, 0); // Position relative to shoulder
  rightArmGroup.add(rightUpperArm);
  
  // Right forearm (child of upper arm)
  const rightForearmGroup = new THREE.Group();
  const rightForearmGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
  const rightForearm = new THREE.Mesh(rightForearmGeometry, armMaterial);
  rightForearm.position.set(0, -0.15, 0); // Position relative to elbow
  rightForearmGroup.add(rightForearm);
  
  // Right hand (child of forearm)
  const rightHandGeometry = new THREE.SphereGeometry(0.04, 8, 8);
  const rightHand = new THREE.Mesh(rightHandGeometry, armMaterial);
  rightHand.position.set(0, -0.18, 0); // Position at end of forearm (outward)
  rightForearmGroup.add(rightHand);
  
  rightForearmGroup.position.set(0, -0.35, 0); // Position forearm group at elbow
  rightArmGroup.add(rightForearmGroup);
  
  rightArmGroup.position.set(0.25, 1.15, 0); // Position arm group at shoulder
  rightArmGroup.rotation.z = -Math.PI / 6; // More outward angle
  characterGroup.add(rightArmGroup);
  
  // === LEGS (more realistic with thighs and shins) ===
  const legMaterial = new THREE.MeshLambertMaterial({ color: 0x34495e }); // Darker blue pants
  
  // Left thigh
  const leftThighGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);
  const leftThigh = new THREE.Mesh(leftThighGeometry, legMaterial);
  leftThigh.position.set(-0.12, 0.5, 0);
  characterGroup.add(leftThigh);
  
  // Left shin
  const leftShinGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8);
  const leftShin = new THREE.Mesh(leftShinGeometry, legMaterial);
  leftShin.position.set(-0.12, 0.15, 0);
  characterGroup.add(leftShin);
  
  // Right thigh
  const rightThighGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8);
  const rightThigh = new THREE.Mesh(rightThighGeometry, legMaterial);
  rightThigh.position.set(0.12, 0.5, 0);
  characterGroup.add(rightThigh);
  
  // Right shin
  const rightShinGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8);
  const rightShin = new THREE.Mesh(rightShinGeometry, legMaterial);
  rightShin.position.set(0.12, 0.15, 0);
  characterGroup.add(rightShin);
  
  // === FEET (bowling shoes) ===
  const footGeometry = new THREE.BoxGeometry(0.12, 0.06, 0.25);
  const footMaterial = new THREE.MeshLambertMaterial({ color: 0x1a1a1a }); // Black bowling shoes
  
  const leftFoot = new THREE.Mesh(footGeometry, footMaterial);
  leftFoot.position.set(-0.12, 0.03, 0.05);
  characterGroup.add(leftFoot);
  
  const rightFoot = new THREE.Mesh(footGeometry, footMaterial);
  rightFoot.position.set(0.12, 0.03, 0.05);
  characterGroup.add(rightFoot);
  
  // === CLOTHING DETAILS ===
  // Bowling shirt collar
  const collarGeometry = new THREE.TorusGeometry(0.18, 0.02, 8, 16);
  const collarMaterial = new THREE.MeshLambertMaterial({ color: 0xe74c3c }); // Red collar
  const collar = new THREE.Mesh(collarGeometry, collarMaterial);
  collar.position.y = 1.25;
  collar.rotation.x = Math.PI / 2;
  characterGroup.add(collar);
  
  // Bowling shirt stripes
  for (let i = 0; i < 3; i++) {
    const stripeGeometry = new THREE.BoxGeometry(0.36, 0.03, 0.21);
    const stripeMaterial = new THREE.MeshLambertMaterial({ color: 0xe74c3c }); // Red stripes
    const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
    stripe.position.set(0, 1.0 - (i * 0.15), 0.01);
    characterGroup.add(stripe);
  }
  
  // Position character at throwing line
  characterGroup.position.set(laneX, 0, CONFIG.BALL_SPAWN_Z - 0.5);
  characterGroup.rotation.y = 0; // Facing down the lane
  
  scene.add(characterGroup);
  
  bowlingCharacter = {
    group: characterGroup,
    torso: torso,
    head: head,
    hair: hair,
    leftArmGroup: leftArmGroup,
    leftUpperArm: leftUpperArm,
    leftForearmGroup: leftForearmGroup,
    leftForearm: leftForearm,
    leftHand: leftHand,
    rightArmGroup: rightArmGroup,
    rightUpperArm: rightUpperArm,
    rightForearmGroup: rightForearmGroup,
    rightForearm: rightForearm,
    rightHand: rightHand,
    leftThigh: leftThigh,
    leftShin: leftShin,
    rightThigh: rightThigh,
    rightShin: rightShin,
    leftFoot: leftFoot,
    rightFoot: rightFoot
  };
  
  console.log(`✅ Realistic bowling character created at lane ${selectedLane}`);
}

function createCharacterBall() {
  if (characterBall) {
    scene.remove(characterBall);
    characterBall.geometry.dispose();
    characterBall.material.dispose();
  }
  
  const ballGeometry = new THREE.SphereGeometry(CONFIG.BALL_R * 0.8, 12, 12);
  const ballMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  characterBall = new THREE.Mesh(ballGeometry, ballMaterial);
  
  scene.add(characterBall);
  return characterBall;
}

function updateCharacterAnimation() {
  if (!bowlingCharacter) return;
  
  const laneX = CONFIG.SELECTED_LANE_X || 0;
  
  // Update character position for current lane
  bowlingCharacter.group.position.x = laneX;
  
  switch (characterAnimationState) {
    case 'IDLE':
      // Neutral standing position with arms at sides
      bowlingCharacter.rightArmGroup.rotation.x = 0;
      bowlingCharacter.rightForearmGroup.rotation.x = 0;
      bowlingCharacter.rightArmGroup.rotation.z = -Math.PI / 6; // Natural outward position
      bowlingCharacter.leftArmGroup.rotation.z = Math.PI / 6; // Natural outward position
      bowlingCharacter.torso.rotation.x = 0;
      
      // Reset leg positions
      bowlingCharacter.leftThigh.rotation.x = 0;
      bowlingCharacter.rightThigh.rotation.x = 0;
      
      // Hide character ball
      if (characterBall) {
        characterBall.visible = false;
      }
      break;
      
    case 'CHARGING':
      // Bowling stance - arm back with ball
      const chargeAngle = -Math.PI / 4 - (currentPower * Math.PI / 3); // Swing back more as power increases
      const leanAngle = Math.sin(currentPower * Math.PI) * 0.15; // Body lean
      
      // Arm positioning (shoulder rotation)
      bowlingCharacter.rightArmGroup.rotation.x = chargeAngle;
      bowlingCharacter.rightForearmGroup.rotation.x = chargeAngle * 0.3; // Slight forearm bend
      
      // Body lean forward slightly
      bowlingCharacter.torso.rotation.x = leanAngle;
      
      // Leg positioning for bowling stance
      bowlingCharacter.leftThigh.rotation.x = Math.PI / 12; // Left leg forward
      bowlingCharacter.rightThigh.rotation.x = -Math.PI / 12; // Right leg back
      
      // Show and position ball in right hand
      if (characterBall) {
        characterBall.visible = true;
        
        // Get world position of right hand
        const handWorldPos = new THREE.Vector3();
        bowlingCharacter.rightHand.getWorldPosition(handWorldPos);
        
        // Position ball at hand location
        characterBall.position.copy(handWorldPos);
        characterBall.position.y += 0.05; // Slight offset above hand
      }
      break;
      
    case 'THROWING':
      // Forward swing motion
      const throwProgress = throwAnimationProgress;
      const throwAngle = -Math.PI / 4 - (Math.PI / 3) + (throwProgress * Math.PI * 3/4); // Swing from back to forward
      
      // Arm animation
      bowlingCharacter.rightArmGroup.rotation.x = throwAngle;
      bowlingCharacter.rightForearmGroup.rotation.x = throwAngle * 0.4;
      
      // Body follow-through
      bowlingCharacter.torso.rotation.x = Math.sin(throwProgress * Math.PI) * 0.3;
      
      // Leg movement for follow-through
      bowlingCharacter.leftThigh.rotation.x = Math.PI / 8 * throwProgress;
      bowlingCharacter.rightThigh.rotation.x = -Math.PI / 8 * throwProgress;
      
      // Ball follows hand until release point
      if (characterBall && throwProgress < 0.6) {
        characterBall.visible = true;
        
        // Get world position of right hand
        const handWorldPos = new THREE.Vector3();
        bowlingCharacter.rightHand.getWorldPosition(handWorldPos);
        
        // Position ball at hand location
        characterBall.position.copy(handWorldPos);
        characterBall.position.y += 0.05;
      } else if (characterBall) {
        // Hide character ball after release
        characterBall.visible = false;
      }
      
      // Update animation progress
      throwAnimationProgress += 0.04; // Slightly slower for more realistic motion
      
      if (throwAnimationProgress >= 1.0) {
        characterAnimationState = 'FOLLOW_THROUGH';
        throwAnimationProgress = 0;
      }
      break;
      
    case 'FOLLOW_THROUGH':
      // Follow through position
      bowlingCharacter.rightArmGroup.rotation.x = Math.PI / 3;
      bowlingCharacter.rightForearmGroup.rotation.x = Math.PI / 6;
      bowlingCharacter.torso.rotation.x = 0.2;
      
      // Extended leg position
      bowlingCharacter.leftThigh.rotation.x = Math.PI / 6;
      bowlingCharacter.rightThigh.rotation.x = -Math.PI / 8;
      
      if (characterBall) {
        characterBall.visible = false;
      }
      
      // Return to idle after follow through
      throwAnimationProgress += 0.015; // Slower return
      if (throwAnimationProgress >= 1.0) {
        characterAnimationState = 'IDLE';
        throwAnimationProgress = 0;
      }
      break;
  }
}

function startCharacterThrowAnimation() {
  if (bowlingCharacter) {
    characterAnimationState = 'THROWING';
    throwAnimationProgress = 0;
    console.log('🎳 Character throw animation started');
  }
}

function updateCharacterForLane(laneNumber) {
  if (bowlingCharacter) {
    const laneX = (laneNumber - Math.ceil(totalLanes / 2)) * laneSpacing;
    bowlingCharacter.group.position.x = laneX;
    console.log(`🏃 Character moved to lane ${laneNumber}`);
  }
}

// ================= PIN MANAGEMENT FUNCTIONS ==============
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
      const pinMaterial = new THREE.MeshLambertMaterial({ color: 0xdddddd });
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
    const laneNumber = i + 1; // Lanes numbered 1-5
    const isActiveLane = laneNumber === selectedLane; // Use selectedLane instead of fixed center
    
    // Lane surface - same light brown color for all lanes
    const laneGeometry = new THREE.PlaneGeometry(laneWidth, laneLength);
    const laneColor = 0x8B4513; // Light brown for all lanes
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
    
    // Green starting position ring for each lane
    const ringGeometry = new THREE.RingGeometry(CONFIG.BALL_R + 0.02, CONFIG.BALL_R + 0.05, 16);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide });
    const startingRing = new THREE.Mesh(ringGeometry, ringMaterial);
    startingRing.position.set(laneX, 0.01, CONFIG.BALL_SPAWN_Z);
    startingRing.rotation.x = -Math.PI / 2;
    scene.add(startingRing);
    
    // Add decorative pins for non-active lanes
    if (!isActiveLane) {
      createDecorativePins(laneX, laneNumber);
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
const createDecorativePins = (laneX, laneNumber) => {
  const PIN_SETUP_BASE_Z = CONFIG.PIN_BASE_Z - 3;
  const decorativePins = [];
  
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
      decorativePins.push(decorativePin);
    }
  }
  
  // Store decorative pins for this lane
  decorativePinsByLane.set(laneNumber, decorativePins);
};

// Initialize the simple cube room and multiple lanes
createSimpleCubeRoom();
createMultipleLanes();

// ================= PHYSICS ==============
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.SAPBroadphase(world);
world.defaultContactMaterial.friction = 0.4;
world.defaultContactMaterial.restitution = 0.3;

// Create physics materials
const pinMaterial = new CANNON.Material('pin');
const ballMaterial = new CANNON.Material('ball');
const groundMaterial = new CANNON.Material('ground');

// Contact materials for realistic interactions
const ballPinContact = new CANNON.ContactMaterial(ballMaterial, pinMaterial, {
  friction: 0.2,
  restitution: 0.6
});
const ballGroundContact = new CANNON.ContactMaterial(ballMaterial, groundMaterial, {
  friction: 0.4,
  restitution: 0.1
});
const pinGroundContact = new CANNON.ContactMaterial(pinMaterial, groundMaterial, {
  friction: 0.7,
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
  // Physics - lighter pins that fall easier
  const shape = new CANNON.Cylinder(0.03, 0.06, CONFIG.PIN_H, 8);
  const body = new CANNON.Body({ 
    mass: 1.0, // Reduced mass for easier knockdown
    material: pinMaterial,
    linearDamping: 0.05, // Less damping for more movement
    angularDamping: 0.05
  });
  body.addShape(shape);
  body.position.set(x, CONFIG.PIN_H / 2, z);
  
  // Start with zero velocity
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  
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
  
  // Clean up any existing ball first
  if (ball) {
    console.log('🧹 Cleaning up existing ball before creating new one');
    scene.remove(ball.mesh);
    world.removeBody(ball.body);
    if (ball.mesh.geometry) ball.mesh.geometry.dispose();
    if (ball.mesh.material) ball.mesh.material.dispose();
    ball = null;
  }
  
  // Get selected lane X position
  const laneX = CONFIG.SELECTED_LANE_X || 0;
  
  // Physics
  const shape = new CANNON.Sphere(CONFIG.BALL_R);
  const body = new CANNON.Body({ 
    mass: 5, // Standard ball mass
    material: ballMaterial
  });
  body.addShape(shape);
  body.position.set(laneX, CONFIG.BALL_R + 0.02, CONFIG.BALL_SPAWN_Z);
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  
  // Ensure the body is completely at rest
  body.sleep();
  body.wakeUp();
  
  world.addBody(body);
  
  // Visual
  const geometry = new THREE.SphereGeometry(CONFIG.BALL_R, 16, 16);
  const material = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  scene.add(mesh);
  
  ball = { body, mesh, thrown: false };
  
  // Hide the physics ball initially - character will show ball during charging
  if (mesh) {
    mesh.visible = false;
  }
  
  // Add extra safety checks for physics state
  setTimeout(() => {
    if (ball && ball.body) {
      ball.body.velocity.set(0, 0, 0);
      ball.body.angularVelocity.set(0, 0, 0);
      ball.body.position.set(laneX, CONFIG.BALL_R + 0.02, CONFIG.BALL_SPAWN_Z);
      console.log(`🔒 Ball physics state locked for Lane ${selectedLane}`);
    }
  }, 50);
  
  console.log(`✅ Ball created on Lane ${selectedLane} at position x=${laneX}`);
}

function setupPins() {
  console.log(`🎳 SETTING UP PHYSICS PINS FOR LANE ${selectedLane}`);
  
  // Clear existing physics pins
  for (const pin of pins) {
    scene.remove(pin.mesh);
    world.removeBody(pin.body);
    pin.mesh.geometry.dispose();
    pin.mesh.material.dispose();
  }
  pins.length = 0;
  
  // Get selected lane X position
  const laneX = CONFIG.SELECTED_LANE_X || 0;
  
  // Ensure decorative pins are removed from the selected lane
  removeDecorativePinsFromLane(selectedLane);
  
  // Create new physics pins in reversed triangle formation (1-2-3-4 from front to back)
  const PIN_SETUP_BASE_Z = CONFIG.PIN_BASE_Z - 3;
  
  for (let row = 0; row < 4; row++) {
    const pinsInRow = row + 1;
    for (let col = 0; col < pinsInRow; col++) {
      const x = laneX + (col - (pinsInRow - 1) / 2) * CONFIG.PIN_SPACING;
      const z = PIN_SETUP_BASE_Z + row * CONFIG.PIN_ROW_SPACING;
      const pin = createPin(x, z);
      pins.push(pin);
    }
  }
  
  pinsStandingAtStart = pins.length;
  console.log(`✅ Set up ${pins.length} PHYSICS pins on Lane ${selectedLane} at x=${laneX}`);
}

function isPinDown(pin) {
  if (!pin || !pin.body) return true;
  
  const pos = pin.body.position;
  const quat = pin.body.quaternion;
  
  // Check if pin fell over
  const upVector = new THREE.Vector3(0, 1, 0);
  upVector.applyQuaternion(new THREE.Quaternion(quat.x, quat.y, quat.z, quat.w));
  const tiltAngle = Math.acos(Math.max(-1, Math.min(1, upVector.y))) * (180 / Math.PI);
  
  // Pin is down if it's tilted significantly OR has fallen below ground level
  const significantTilt = tiltAngle > 20; // More sensitive - 20 degrees
  const belowGround = pos.y < CONFIG.PIN_H * 0.3; // If pin height is less than 30% of original
  
  return significantTilt || belowGround;
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
  
  // Remove knocked pins immediately - no position resetting!
  for (let i = pins.length - 1; i >= 0; i--) {
    const pin = pins[i];
    if (isPinDown(pin)) {
      console.log(`Removing knocked pin at position (${pin.body.position.x.toFixed(2)}, ${pin.body.position.z.toFixed(2)})`);
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
  updateLaneSwitchButton(); // Update switch button availability
  
  // Reset power bar
  powerCharging = false;
  currentPower = 0;
  
  // Reset character animation
  characterAnimationState = 'IDLE';
  throwAnimationProgress = 0;
  
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
      updateLaneSwitchButton();
      updateLaneSwitchButton(); // Update switch button (now available)
    } else if (rollCount === 1) {
      // Second roll
      console.log('➡️ Second roll');
      rollIndex = 1;
      removeKnockedPins();
      updateLaneSwitchButton();
      updateLaneSwitchButton(); // Update switch button (now blocked)
    } else {
      // Frame complete
      console.log('✅ Frame complete');
      frameIndex++;
      rollIndex = 0;
      console.log(`🔄 Advanced to frame ${frameIndex + 1}`);
      setupPins();
      updateLaneSwitchButton();
      updateLaneSwitchButton(); // Update switch button (now available)
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
  updateLaneSwitchButton(); // Update switch button availability
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
    const pinVel = pin.body.velocity.length();
    maxPinVel = Math.max(maxPinVel, pinVel);
  }
  
  const ballStopped = ballVel < 0.5;
  const pinsStopped = maxPinVel < 0.3;
  const ballPastPins = ball.body.position.z > CONFIG.PIN_BASE_Z + 1;
  
  if ((ballStopped && pinsStopped) || ballPastPins) {
    console.log('⏹️ Settlement detected - ball vel:', ballVel.toFixed(2), 'max pin vel:', maxPinVel.toFixed(2));
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
  // Don't start power charging if clicking on UI buttons
  if (switchButtonClicked || 
      e.target.tagName === 'BUTTON' || 
      e.target.closest('button') || 
      e.target.id === 'switchLaneButton' ||
      e.target.closest('#switchLaneButton')) {
    console.log('🚫 Mousedown on button detected, not starting power charge');
    return;
  }
  
  console.log(`🎯 MOUSEDOWN - gameState: ${gameState}, ball: ${!!ball}, ball.thrown: ${ball?.thrown}, powerCharging: ${powerCharging}, justSelectedLane: ${justSelectedLane}`);
  
  if (gameState === 'READY' && ball && !ball.thrown && !powerCharging && !justSelectedLane) {
    console.log('🎯 POWER CHARGING STARTED');
    powerCharging = true;
    currentPower = 0;
    powerDirection = 1;
    
    // Start character charging animation
    characterAnimationState = 'CHARGING';
    if (!characterBall) {
      createCharacterBall();
    }
    
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
  // Don't throw ball if clicking on UI buttons
  if (switchButtonClicked || 
      e.target.tagName === 'BUTTON' || 
      e.target.closest('button') || 
      e.target.id === 'switchLaneButton' ||
      e.target.closest('#switchLaneButton')) {
    console.log('🚫 Mouseup on button detected, not throwing ball');
    return;
  }
  
  if (gameState === 'READY' && ball && !ball.thrown && powerCharging) {
    console.log(`🎯 THROWING BALL - Power: ${(currentPower * 100).toFixed(1)}%, Angle: ${aimAngle.toFixed(2)}`);
    
    // Start character throw animation
    startCharacterThrowAnimation();
    
    // Calculate throw parameters with corrected physics
    const power = CONFIG.BALL_MIN_SPEED + (currentPower * (CONFIG.BALL_MAX_SPEED - CONFIG.BALL_MIN_SPEED));
    
    // Add compensation for leftward bias - shift left by subtracting negative offset
    const compensatedAngle = aimAngle - 0.6; // Subtract 0.6 to shift left (about 30 degrees)
    const vx = compensatedAngle * power * 0.4;
    const vz = power;
    
    console.log(`Original angle: ${aimAngle.toFixed(2)}, Compensated: ${compensatedAngle.toFixed(2)}`);
    console.log(`Calculated velocities: vx=${vx.toFixed(2)}, vz=${vz.toFixed(2)}`);
    
    // Show the physics ball and apply physics after character animation delay
    setTimeout(() => {
      if (ball && ball.mesh) {
        ball.mesh.visible = true;
      }
      
      // Throw ball
      ball.body.velocity.set(vx, 0, vz);
      ball.body.angularVelocity.set(0, 0, -power * 2);
      ball.thrown = true;
      
      gameState = 'ROLLING';
      waitingForSettle = true;
      updateLaneSwitchButton(); // Disable switching while ball is rolling
    }, 350); // Delay to match character animation
    
    // Update game state
    gameState = 'ROLLING';
    waitingForSettle = true;
    powerCharging = false;
    updateLaneSwitchButton(); // Disable switching while ball is rolling
    
    // Hide power bar
    const powerBarElement = document.getElementById('powerBar');
    if (powerBarElement) {
      powerBarElement.style.display = 'none';
    }
    
    console.log(`Ball thrown with compensated angle, velocity (${vx.toFixed(2)}, 0, ${vz.toFixed(2)})`);
  }
});

window.addEventListener('click', (event) => {
  // Don't trigger ball throw if switch button was just clicked
  if (switchButtonClicked) {
    console.log('🚫 Switch button click detected, not throwing ball');
    return;
  }
  
  // Don't trigger ball throw if clicking on UI buttons
  if (event.target.tagName === 'BUTTON' || 
      event.target.closest('button') || 
      event.target.id === 'switchLaneButton' ||
      event.target.closest('#switchLaneButton')) {
    console.log('🚫 Click on button detected, not throwing ball');
    return;
  }
  
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
    updateLaneSwitchButton();
    
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
  
  // Update character animation
  updateCharacterAnimation();
  
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
  console.log(`🎳 INITIALIZING BOWLING GAME FOR LANE ${selectedLane}`);
  
  setupPins();
  createBall();
  createBowlingCharacter();
  createCharacterBall();
  updateUI();
  addLaneSwitchingButton();
  updateLaneSwitchButton();
  
  // Test message system immediately
  showMessage(`🎳 Lane ${selectedLane} Ready! Frame ${frameIndex + 1}, Roll ${rollIndex + 1}`, 5000);
  
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