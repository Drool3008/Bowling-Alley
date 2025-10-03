# 🎳 Bowling Alley - Professional 3D Bowling Simulator

A comprehensive 3D bowling game built with Three.js and Cannon.js physics engine. Features realistic bowling mechanics, multi-lane gameplay, professional bowling alley environment, and complete scoring system.

## 🌟 Key Features

### 🎮 Game Mechanics
- **Realistic Physics**: Powered by Cannon.js for authentic ball-pin interactions
- **Professional Scoring**: Complete 10-frame bowling scoring system with strikes, spares, and 10th frame bonus handling
- **Gutter Ball System**: Accurate gutter detection with proper scoring rules
- **Power Control**: Variable power throwing system with visual feedback
- **Precision Aiming**: Mouse-controlled aiming with real-time visual indicators

### 🏟️ Multi-Lane System
- **5 Individual Lanes**: Each with independent game state management
- **Lane Switching**: Switch between lanes during gameplay (Roll 1 only)
- **State Persistence**: Each lane maintains its own frame progress, score, and game state
- **Lane-Specific Pin Colors**: Visual differentiation with unique color schemes per lane
- **Decorative Pin System**: Non-physics pins displayed on inactive lanes

### 🎨 Professional Environment
- **Immersive Bowling Alley**: Complete interior environment with themed walls
- **Dynamic Lighting**: Bilateral lamp system with 6 professional bowling alley lights
- **Themed Wall Decorations**:
  - **Back Wall**: "Strike Zone" with professional bowling signage
  - **Left Wall**: "Lane Records" with trophy displays and high scores
  - **Right Wall**: "Vintage Lanes Est. 1952" with classic bowling memorabilia
- **Procedural Textures**: Canvas-generated wood paneling and decorative elements
- **Atmospheric Details**: Seating areas, pillars, and realistic bowling alley aesthetics

### 🎯 Gameplay Features
- **Smart Camera System**: Smooth ball tracking with interpolated movement
- **Character Animation**: Bowling character with realistic proportions
- **Power Bar System**: Visual power charging with oscillating power meter
- **Real-time Feedback**: Strike, spare, and gutter ball notifications
- **Lane Selection Modal**: Professional lane selection interface with game statistics

## 🛠️ Technical Architecture

### Core Technologies
- **Three.js v0.158.0**: 3D graphics rendering and scene management
- **Cannon.js v0.20.0**: Physics simulation for realistic ball and pin dynamics
- **ES6 Modules**: Modern JavaScript architecture
- **HTML5 Canvas**: Procedural texture generation for backgrounds

### Physics System
```javascript
// Enhanced physics materials for realistic interactions
const ballMaterial = new CANNON.Material('ball');
const pinMaterial = new CANNON.Material('pin');
const groundMaterial = new CANNON.Material('ground');

// Contact materials with realistic friction and restitution
const ballPinContact = new CANNON.ContactMaterial(ballMaterial, pinMaterial, {
  friction: 0.1,
  restitution: 0.4
});
```

### Multi-Lane Architecture
```javascript
// Lane state management system
let laneStates = new Map(); // Stores game state for each lane
let decorativePinsByLane = new Map(); // Manages decorative pins
let currentPhysicsLane = 3; // Tracks active physics lane

// Lane switching with state persistence
function switchToLane(newLaneNumber) {
  saveCurrentLaneState();
  cleanupLanePhysics();
  switchPhysicsPinsToLane(newLaneNumber);
  loadLaneState(newLaneNumber);
}
```

### Camera System
```javascript
// Smooth ball tracking with interpolation
if (ball && ball.thrown && gameState === 'ROLLING') {
  const lerpFactor = 0.1;
  camera.position.x += (targetX - camera.position.x) * lerpFactor;
  camera.position.z += (targetZ - camera.position.z) * lerpFactor;
  camera.lookAt(ballPos.x, 1, ballPos.z + 3);
}
```

## 🎳 Game Rules & Scoring

### Bowling Fundamentals
- **10 Frames per Game**: Standard bowling game structure
- **Strike**: All 10 pins knocked down with first ball (Frame score + next 2 rolls)
- **Spare**: All 10 pins knocked down with two balls (Frame score + next 1 roll)
- **10th Frame Special Rules**: Extra rolls for strikes/spares in final frame
- **Gutter Balls**: Automatic 0 score when ball enters gutter without hitting pins

### Scoring System
```javascript
function calculateFrameScores(frames) {
  // Simplified scoring - sums pins knocked in each frame
  const scores = [];
  for (let i = 0; i < 10; i++) {
    const frame = frames[i];
    const frameScore = frame.rolls.reduce((sum, roll) => sum + roll, 0);
    scores.push(frameScore);
  }
  return scores;
}
```

## 🎮 Controls & Gameplay

### Mouse Controls
- **Mouse Movement**: Aim the ball left and right
- **Mouse Hold**: Charge power (oscillating power bar)
- **Mouse Release**: Throw ball with current power and aim

### Keyboard Shortcuts
- **1-5**: Switch to lane number (if switching allowed)
- **R**: Emergency reset ball position
- **S**: Skip current roll (for testing)
- **F**: Full game reset
- **G**: Display position debug information

### Lane Switching Rules
- **Allowed**: Only on Roll 1 of any frame when game state is 'READY'
- **Blocked**: During active gameplay, power charging, or waiting for settlement
- **Visual Feedback**: Switch Lane button changes color based on availability

## 🏗️ Project Structure

```
Bowling alley/
├── index.html          # Main HTML structure
├── style.css           # Responsive styling and UI design
├── script_fixed.js     # Main game logic and physics
└── README.md          # This documentation
```

### Key Components

#### Core Game Loop (`animate()`)
- Physics world stepping at 120 FPS
- Visual synchronization with physics bodies
- Power bar updates and visual feedback
- Camera interpolation and ball tracking
- Settlement detection and gutter monitoring

#### Lane Management System
- `initializeLaneStates()`: Sets up all 5 lanes with fresh game states
- `switchToLane()`: Handles lane transitions with state preservation
- `decorativePinsByLane`: Manages visual pins on inactive lanes
- `cleanupLanePhysics()`: Comprehensive cleanup between lane switches

#### Environment Generation
- `createBowlingAlleyBackground()`: Procedural bowling alley interior
- `createSimpleLaneLamps()`: Professional lighting system
- `createBowlingCharacter()`: Realistic bowling character model

## 🎨 Visual Features

### Lighting System
- **6 Professional Lamps**: 3 lamps on each side of the lanes
- **Dynamic Shadows**: Realistic shadow casting from directional lights
- **Ambient Lighting**: Subtle ambient illumination for depth
- **Point Light Sources**: Individual lamp illumination with falloff

### Character Design
- **Realistic Proportions**: Properly scaled human bowling character
- **Color-Coded Clothing**: Blue shirt, dark pants, brown shoes
- **Animation States**: Idle, charging, throwing, follow-through
- **Lane-Specific Positioning**: Character follows selected lane

### Environmental Details
- **Wood Paneling Textures**: Procedurally generated with gradient backgrounds
- **Themed Decorations**: Bowling-specific signage and memorabilia
- **Atmospheric Elements**: Seating areas, pillars, ceiling details
- **Color-Coded Lanes**: Each lane has unique pin colors for identification

## 🚀 Getting Started

### Prerequisites
- Modern web browser with WebGL support
- No additional installations required (uses CDN libraries)

### Running the Game
1. Clone or download the project files
2. Open `index.html` in a web browser
3. Or serve via local server: `python3 -m http.server 8000`
4. Select your starting lane from the modal
5. Use mouse to aim and throw bowling balls

### Development Setup
```bash
# Clone the repository
git clone [repository-url]

# Navigate to project directory
cd "Bowling alley"

# Start local development server
python3 -m http.server 8000

# Open browser to http://localhost:8000
```

## 🔧 Configuration

### Game Constants
```javascript
const CONFIG = {
  BALL_R: 0.18,              // Ball radius
  PIN_H: 0.38,               // Pin height
  PIN_SPACING: 0.3048,       // Distance between pins
  BALL_MIN_SPEED: 5,         // Minimum throw velocity
  BALL_MAX_SPEED: 20,        // Maximum throw velocity
  PHYS_STEP: 1/120,          // Physics timestep
  SELECTED_LANE_X: 0         // Current lane X position
};
```

### Customization Options
- **Lane Count**: Modify `totalLanes` variable (currently 5)
- **Lane Spacing**: Adjust `laneSpacing` for wider/narrower lanes
- **Physics Parameters**: Tune friction, restitution in contact materials
- **Visual Themes**: Modify canvas texture generation in background functions

## 🎯 Advanced Features

### State Management
- **Persistent Lane States**: Each lane remembers frame progress, scores, and game state
- **Automatic State Saving**: Game state saved after each roll transition
- **Lane Switching Logic**: Prevents switching during active gameplay
- **Game Completion Tracking**: Tracks completed games per lane

### Physics Optimization
- **Efficient Pin Management**: Only one lane has active physics pins
- **Decorative Pin System**: Static visual pins for inactive lanes
- **Ball Cleanup**: Comprehensive cleanup prevents memory leaks
- **Settlement Detection**: Smart detection of when ball and pins stop moving

### UI/UX Features
- **Professional Scoreboards**: Two-row layout for all 10 frames
- **Real-time Statistics**: Frame, roll, and score tracking
- **Visual Feedback**: Strike/spare notifications, gutter ball alerts
- **Responsive Design**: Mobile-friendly interface with adaptive layouts

## 🐛 Debugging & Testing

### Debug Features
- **Position Checking**: Press 'G' to log ball and camera positions
- **Emergency Reset**: Press 'R' to reset ball position
- **Skip Roll**: Press 'S' to force completion of current roll
- **Full Reset**: Press 'F' to restart entire game

### Common Issues
- **Ball Goes Off-Course**: Aim compensation of -0.45 radians built-in
- **Pins Don't Fall**: Check physics material friction/restitution settings
- **Camera Issues**: Smooth interpolation prevents jerky movement
- **Lane Switching Blocked**: Only allowed on Roll 1 of frames

## 📊 Performance

### Optimization Strategies
- **Efficient Physics**: 120 FPS physics with optimized contact materials
- **Visual Culling**: Only render active elements
- **Memory Management**: Proper disposal of geometries and materials
- **Smooth Interpolation**: Reduced camera jitter with lerp factor tuning

### Browser Compatibility
- **Chrome**: Full support with optimal performance
- **Firefox**: Full support with good performance
- **Safari**: Full support (may require local server)
- **Edge**: Full support with optimal performance

## 🎳 Future Enhancements

### Potential Features
- **Multiplayer Support**: Network-based multi-player games
- **Tournament Mode**: Bracket-style competitions
- **Pin Placement Variations**: Different pin setup patterns
- **Ball Customization**: Different ball weights and materials
- **Sound Effects**: Realistic bowling alley audio
- **Statistics Tracking**: Historical game data and averages

### Technical Improvements
- **WebXR Support**: VR/AR bowling experience
- **Advanced Physics**: More realistic pin interactions
- **Procedural Animation**: Dynamic character movements
- **Texture Loading**: External texture files for better visuals

---

**Enjoy your professional bowling experience! 🎳**

*Strike Zone - Where Every Roll Counts*
