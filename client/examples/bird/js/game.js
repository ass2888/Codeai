import { randomRange, checkCollision, saveHighScore, getHighScore } from './utils.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreElement = document.getElementById('final-score');
const highScoreElement = document.getElementById('high-score');
const hud = document.getElementById('hud');

// Game Constants
const GRAVITY = 0.22;
const JUMP_STRENGTH = -5.0;
const PIPE_SPEED = 2.8;
const PIPE_SPAWN_RATE = 85; 
const PIPE_GAP = 170;
const GROUND_HEIGHT = 80;

let gameState = 'START'; 
let score = 0;
let frameCount = 0;
let pipes = [];
let particles = [];
let shakeTime = 0;
let groundX = 0;

// Background Elements
const clouds = [
    { x: 50, y: 100, s: 0.5 },
    { x: 200, y: 150, s: 0.8 },
    { x: 350, y: 80, s: 0.6 }
];

const bird = {
    x: 60,
    y: 0,
    width: 38,
    height: 28,
    velocity: 0,
    rotation: 0,
    wingAngle: 0,
    
    reset() {
        this.y = canvas.height / 2;
        this.velocity = 0;
        this.rotation = 0;
    },

    update() {
        this.velocity += GRAVITY;
        this.y += this.velocity;

        // Rotation logic
        let targetRotation = (this.velocity * 0.08);
        if (targetRotation > Math.PI / 3) targetRotation = Math.PI / 3;
        if (targetRotation < -Math.PI / 6) targetRotation = -Math.PI / 6;
        this.rotation = targetRotation;

        // Wing animation
        this.wingAngle = Math.sin(frameCount * 0.2) * 0.5;

        // Floor/Ceiling collision
        if (this.y + this.height > canvas.height - GROUND_HEIGHT) {
            this.y = canvas.height - GROUND_HEIGHT - this.height;
            endGame();
        }
        if (this.y < 0) {
            this.y = 0;
            this.velocity = 0;
        }
    },

    jump() {
        this.velocity = JUMP_STRENGTH;
        createJumpParticles(this.x, this.y + this.height/2);
    },

    draw() {
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.rotate(this.rotation);
        
        // Body (Yellow)
        ctx.fillStyle = '#F7D308';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 12);
        ctx.fill();
        ctx.stroke();
        
        // Eye
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(8, -6, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(10, -6, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Beak (Orange)
        ctx.fillStyle = '#F75308';
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(24, 4);
        ctx.lineTo(12, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Wing (White/Yellow)
        ctx.save();
        ctx.translate(-8, 2);
        ctx.rotate(this.wingAngle);
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.roundRect(-12, -6, 18, 12, 6);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    }
};

class Pipe {
    constructor() {
        this.width = 65;
        this.x = canvas.width;
        this.topHeight = randomRange(80, canvas.height - GROUND_HEIGHT - PIPE_GAP - 80);
        this.passed = false;
        this.lipHeight = 25;
        this.lipOverlap = 5;
    }

    update() {
        this.x -= PIPE_SPEED;
    }

    draw() {
        const drawSinglePipe = (x, y, h, isTop) => {
            ctx.fillStyle = '#73BF2E'; // Main Green
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            
            // Body
            ctx.fillRect(x, y, this.width, h);
            ctx.strokeRect(x, y, this.width, h);
            
            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(x + 10, y, 8, h);

            // Lip
            ctx.fillStyle = '#73BF2E';
            const lipY = isTop ? y + h - this.lipHeight : y;
            ctx.fillRect(x - this.lipOverlap, lipY, this.width + (this.lipOverlap * 2), this.lipHeight);
            ctx.strokeRect(x - this.lipOverlap, lipY, this.width + (this.lipOverlap * 2), this.lipHeight);
            
            // Lip Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillRect(x - this.lipOverlap + 10, lipY, 8, this.lipHeight);
        };

        // Top pipe
        drawSinglePipe(this.x, 0, this.topHeight, true);
        // Bottom pipe
        const bottomY = this.topHeight + PIPE_GAP;
        const bottomH = canvas.height - GROUND_HEIGHT - bottomY;
        drawSinglePipe(this.x, bottomY, bottomH, false);
    }
}

function createJumpParticles(x, y) {
    for (let i = 0; i < 5; i++) {
        particles.push({
            x, y,
            vx: -Math.random() * 2 - 1,
            vy: (Math.random() - 0.5) * 2,
            size: Math.random() * 8 + 4,
            life: 1.0,
            color: 'rgba(255, 255, 255, 0.8)'
        });
    }
}

function createDeathParticles(x, y) {
    for (let i = 0; i < 20; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.5) * 12,
            size: Math.random() * 6 + 2,
            life: 1.0,
            color: '#F7D308'
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });
}

function drawBackground() {
    // Sky is handled by CSS background-color
    
    // Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    clouds.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 30 * c.s, 0, Math.PI * 2);
        ctx.arc(c.x + 25 * c.s, c.y - 10 * c.s, 25 * c.s, 0, Math.PI * 2);
        ctx.arc(c.x + 50 * c.s, c.y, 30 * c.s, 0, Math.PI * 2);
        ctx.fill();
    });

    // Ground
    groundX = (groundX - PIPE_SPEED) % 40;
    ctx.fillStyle = '#DDD894'; // Ground Tan
    ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);
    
    // Grass top
    ctx.fillStyle = '#73BF2E';
    ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, 15);
    
    // Ground stripes
    ctx.strokeStyle = '#538032';
    ctx.lineWidth = 2;
    for (let i = groundX; i < canvas.width; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, canvas.height - GROUND_HEIGHT + 15);
        ctx.lineTo(i - 20, canvas.height);
        ctx.stroke();
    }
    
    // Ground border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeRect(-5, canvas.height - GROUND_HEIGHT, canvas.width + 10, GROUND_HEIGHT + 5);
}

function init() {
    resize();
    window.addEventListener('resize', resize);
    
    const triggerJump = () => {
        if (gameState === 'PLAYING') bird.jump();
        else if (gameState === 'START') startGame();
    };

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') triggerJump();
    });
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        triggerJump();
    });
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) triggerJump();
    });

    document.getElementById('start-btn').onclick = startGame;
    document.getElementById('restart-btn').onclick = startGame;

    gameLoop();
}

function resize() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    if (gameState === 'START') bird.reset();
}

function startGame() {
    gameState = 'PLAYING';
    score = 0;
    frameCount = 0;
    pipes = [];
    particles = [];
    bird.reset();
    startScreen.classList.remove('visible');
    startScreen.classList.add('hidden');
    gameOverScreen.classList.remove('visible');
    gameOverScreen.classList.add('hidden');
    hud.innerText = '0';
}

function endGame() {
    if (gameState === 'GAMEOVER') return;
    gameState = 'GAMEOVER';
    shakeTime = 20;
    createDeathParticles(bird.x + bird.width/2, bird.y + bird.height/2);
    
    const high = getHighScore();
    if (score > high) saveHighScore(score);
    
    finalScoreElement.innerText = score;
    highScoreElement.innerText = Math.max(score, high);
    
    gameOverScreen.classList.remove('hidden');
    gameOverScreen.classList.add('visible');
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Screen Shake
    if (shakeTime > 0) {
        const dx = (Math.random() - 0.5) * 12;
        const dy = (Math.random() - 0.5) * 12;
        ctx.translate(dx, dy);
        shakeTime--;
    }

    drawBackground();

    if (gameState === 'PLAYING') {
        frameCount++;
        
        if (frameCount % PIPE_SPAWN_RATE === 0) {
            pipes.push(new Pipe());
        }

        bird.update();

        pipes.forEach((pipe, index) => {
            pipe.update();
            
            // Collision
            if (checkCollision(bird, pipe)) {
                endGame();
            }

            // Score
            if (!pipe.passed && pipe.x + pipe.width < bird.x) {
                score++;
                pipe.passed = true;
                hud.innerText = score;
                // Small score pop effect could go here
            }

            // Remove offscreen pipes
            if (pipe.x + pipe.width < -20) {
                pipes.splice(index, 1);
            }
        });
    }

    // Draw
    pipes.forEach(pipe => pipe.draw());
    if (gameState !== 'GAMEOVER') bird.draw();
    updateParticles();
    drawParticles();

    if (shakeTime > 0) ctx.setTransform(1, 0, 0, 1, 0, 0); 

    requestAnimationFrame(gameLoop);
}

init();