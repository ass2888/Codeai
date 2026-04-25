/**
 * Generates a random integer between min and max (inclusive)
 */
export function randomRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * Checks for collision between the bird and a pipe
 */
export function checkCollision(bird, pipe) {
    const PIPE_GAP = 170;
    const GROUND_HEIGHT = 80;

    // Bird hitbox (slightly smaller for fairness)
    const b = {
        left: bird.x + 6,
        right: bird.x + bird.width - 6,
        top: bird.y + 6,
        bottom: bird.y + bird.height - 6
    };

    // Pipe collision
    if (b.right > pipe.x && b.left < pipe.x + pipe.width) {
        // Top Pipe
        if (b.top < pipe.topHeight) return true;
        // Bottom Pipe
        if (b.bottom > pipe.topHeight + PIPE_GAP) return true;
    }

    return false;
}

/**
 * Saves high score to local storage
 */
export function saveHighScore(score) {
    localStorage.setItem('flappy_high_score_retro', score);
}

/**
 * Retrieves high score from local storage
 */
export function getHighScore() {
    return parseInt(localStorage.getItem('flappy_high_score_retro')) || 0;
}