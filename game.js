// game.js
// Simple "Fetch the Bone" canvas game with optional MediaPipe hand control

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const startBtn = document.getElementById('startBtn');
const enableHand = document.getElementById('enableHand');
const webcamVideo = document.getElementById('webcam');

const CANVAS_W = canvas.width;
const CANVAS_H = canvas.height;

// assets (you can replace with your images)
const dogImg = new Image();
dogImg.src = 'assets/dog.png'; // put a small dog image
const boneImg = new Image();
boneImg.src = 'assets/bone.png'; // put a bone image

// game state
let score = 0;
let lives = 3;
let running = false;
let player = {
  x: CANVAS_W/2,
  y: CANVAS_H - 80,
  w: 120,
  h: 80,
  speed: 8
};

let bones = [];
let spawnTimer = 0;
let spawnInterval = 80; // frames

// Input
let keys = {};
let mouseX = null;
let useHandControl = false;
let handXNormalized = null; // 0..1

// Helpers
function rand(min,max){ return Math.random()*(max-min)+min; }

// Start / Reset
function resetGame(){
  score = 0; lives = 3; bones = []; running = true;
  scoreEl.textContent = `Score: ${score}`;
  livesEl.textContent = `Lives: ${lives}`;
}

startBtn.addEventListener('click',()=>{
  resetGame();
});

// Input listeners
window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouseX = (e.clientX - rect.left);
});

// Game loop
function update(){
  if(!running) { draw(); requestAnimationFrame(update); return; }

  // spawn bones
  spawnTimer++;
  if(spawnTimer >= spawnInterval){
    spawnTimer = 0;
    const size = rand(28,48);
    bones.push({
      x: rand(20, CANVAS_W-20),
      y: -50,
      vy: rand(2.0,4.0),
      size
    });
    // gradually increase drop speed and frequency
    if(spawnInterval>30) spawnInterval -= 0.5;
  }

  // control player
  let targetX = player.x;
  // keyboard
  if(keys['arrowleft'] || keys['a']) targetX -= player.speed*2;
  if(keys['arrowright'] || keys['d']) targetX += player.speed*2;
  // mouse
  if(mouseX !== null) targetX = mouseX - player.w/2;
  // hand control (normalized)
  if(useHandControl && handXNormalized !== null){
    targetX = handXNormalized * (CANVAS_W - player.w);
  }

  // smooth
  player.x += (targetX - player.x) * 0.25;
  player.x = Math.max(0, Math.min(CANVAS_W - player.w, player.x));

  // update bones
  for(let i=bones.length-1; i>=0; i--){
    const b = bones[i];
    b.y += b.vy;
    b.vy += 0.03; // gravity

    // collision with dog
    if(b.y + b.size > player.y && b.y < player.y + player.h){
      if(b.x > player.x - 20 && b.x < player.x + player.w + 20){
        // caught
        bones.splice(i,1);
        score += 10;
        scoreEl.textContent = `Score: ${score}`;
        continue;
      }
    }

    // missed
    if(b.y > CANVAS_H + 50){
      bones.splice(i,1);
      lives -= 1;
      livesEl.textContent = `Lives: ${lives}`;
      if(lives <= 0){
        running = false;
        // simple game over
        setTimeout(()=> alert(`Game Over! Score: ${score}`), 50);
      }
    }
  }

  draw();
  requestAnimationFrame(update);
}

function draw(){
  // clear
  ctx.clearRect(0,0,CANVAS_W,CANVAS_H);

  // background simple ground
  ctx.fillStyle = '#eaf6ff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // draw bones
  for(const b of bones){
    if(boneImg.complete){
      ctx.drawImage(boneImg, b.x - b.size/2, b.y - b.size/2, b.size, b.size);
    } else {
      ctx.fillStyle = '#ffd';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size/2, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // draw dog (player)
  if(dogImg.complete){
    ctx.drawImage(dogImg, player.x, player.y, player.w, player.h);
  } else {
    ctx.fillStyle = '#ffb84d';
    ctx.fillRect(player.x, player.y, player.w, player.h);
  }

  // debug hand indicator
  if(useHandControl){
    ctx.fillStyle = 'rgba(59,130,246,0.25)';
    const hx = (handXNormalized ?? 0.5) * CANVAS_W;
    ctx.fillRect(hx - 5, 0, 10, CANVAS_H);
  }

  // HUD on canvas (optional)
  ctx.fillStyle = '#333';
  ctx.font = '14px system-ui';
  ctx.fillText(`Score: ${score}`, 10, 20);
  ctx.fillText(`Lives: ${lives}`, 10, 40);
}

// MediaPipe hand integration
// If user enables hand control, we start webcam and use MediaPipe Hands to detect index finger X.
// This uses the @mediapipe/hands library loaded in index.html.
// See MediaPipe docs for details and advanced settings. (MediaPipe provides high-fidelity hand landmarks.)
async function setupHandControl(){
  if(typeof Hands === 'undefined'){
    console.warn('MediaPipe Hands not loaded.');
    return;
  }

  // show webcam element
  webcamVideo.style.display = 'block';
  // start webcam
  const stream = await navigator.mediaDevices.getUserMedia({video:true, audio:false});
  webcamVideo.srcObject = stream;

  // create MediaPipe Hands
  const hands = new Hands({
    locateFile: (file) => {
      // use jsdelivr path — the library will fetch its assets relative to this
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });

  hands.onResults( (results) => {
    if(!results.multiHandLandmarks || results.multiHandLandmarks.length === 0){
      handXNormalized = null;
      return;
    }
    // index finger tip is landmark 8. landmarks are normalized (0..1)
    const landmarks = results.multiHandLandmarks[0];
    const indexTip = landmarks[8];
    // x is relative to video frame; we want normalized x (0..1)
    handXNormalized = indexTip.x; // 0..1
    // optionally you might flip depending on camera mirror; adjust if needed
  });

  // create a camera loop
  const camera = new Camera(webcamVideo, {
    onFrame: async () => {
      await hands.send({image: webcamVideo});
    },
    width: 640,
    height: 480
  });
  camera.start();
  useHandControl = true;
}

// Enable/disable hand control
enableHand.addEventListener('change', async (e)=>{
  if(enableHand.checked){
    try{
      await setupHandControl();
    }catch(err){
      console.error('Cam error', err);
      useHandControl = false;
      enableHand.checked = false;
      alert('Could not start webcam/hand tracking: ' + err.message);
    }
  } else {
    // disable
    useHandControl = false;
    handXNormalized = null;
    // stop webcam if active
    if(webcamVideo.srcObject){
      for(const track of webcamVideo.srcObject.getTracks()) track.stop();
      webcamVideo.srcObject = null;
    }
    webcamVideo.style.display = 'none';
  }
});

// Kick off draw loop
draw();
requestAnimationFrame(update);
