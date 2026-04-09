import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

const GRID_SIZE = 20;
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 400;
const GAME_SPEED = 150; // CONSTANT Speed as requested

// --- Web Audio Retro Synth Engine ---
let audioCtx = null;
const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
};

const playTone = (frequency, type, duration, vol, slideFreq) => {
  if (!audioCtx || window.globalSfxMuted) return;
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  if (slideFreq) {
    oscillator.frequency.exponentialRampToValueAtTime(slideFreq, audioCtx.currentTime + duration);
  }
  
  gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + duration);
};

const playSound = (type) => {
  try {
    initAudio();
    if (type === 'eat') {
      if (!window.globalSfxMuted) playTone(600, 'sine', 0.1, 0.1, 1200); 
    } else if (type === 'die') {
      const memeAudio = document.getElementById('die-sfx');
      if (memeAudio && !window.globalMusicMuted) {
        memeAudio.currentTime = 0;
        memeAudio.play().catch(() => {
          if (!window.globalSfxMuted) playTone(150, 'sawtooth', 0.4, 0.15, 40); 
        });
        // Limit custom audio to exactly 1.55 seconds as requested
        setTimeout(() => { memeAudio.pause(); }, 1550);
      } else {
        if (!window.globalSfxMuted) playTone(150, 'sawtooth', 0.4, 0.15, 40); 
      }
    } else if (type === 'levelup') {
      playTone(400, 'square', 0.1, 0.05);
      setTimeout(() => { if (audioCtx) playTone(500, 'square', 0.1, 0.05) }, 100);
      setTimeout(() => { if (audioCtx) playTone(600, 'square', 0.2, 0.05) }, 200);
      setTimeout(() => { if (audioCtx) playTone(800, 'square', 0.3, 0.05) }, 300);
    }
  } catch (e) {
    // Audio synthesis fallback logic
  }
};


function App() {
  const canvasRef = useRef(null);
  
  // Game state for UI
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [highScore, setHighScore] = useState(0);
  const [gameState, setGameState] = useState('start'); // 'start', 'playing', 'paused', 'over'
  const [playerName, setPlayerName] = useState('');
  const [totalMoves, setTotalMoves] = useState(0);
  
  // Leaderboard UI state
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const scoresResult = useQuery(api.scores?.getTopScores) || [];
  const submitScoreMutation = useMutation(api.scores?.submitScore);
  const scores = scoresResult || [];
  
  // Music & SFX state
  const [musicMuted, setMusicMutedState] = useState(false);
  const [sfxMuted, setSfxMutedState] = useState(false);

  const setMusicMuted = (val) => {
    window.globalMusicMuted = val;
    setMusicMutedState(val);
  };
  const setSfxMuted = (val) => {
    window.globalSfxMuted = val;
    setSfxMutedState(val);
  };

  // Mutable game refs to avoid stale closures in interval
  const gameRef = useRef({
    snake: [],
    food: { x: 0, y: 0 },
    dx: GRID_SIZE,
    dy: 0,
    pauseUsed: false,
    intervalId: null
  });

  // Touch handling refs
  const touchStartRef = useRef({ x: 0, y: 0 });

  // Load initialized name on mount
  useEffect(() => {
    const savedName = localStorage.getItem('lastPlayerName') || '';
    setPlayerName(savedName);
  }, []);

  // Sync high score when player name changes or via scores update
  useEffect(() => {
    if (playerName && scores.length > 0) {
      const p = scores.find(s => s.name.toLowerCase() === playerName.toLowerCase());
      if (p) setHighScore((prev) => Math.max(prev, p.score));
    }
  }, [playerName, scores]);

  const toggleMusic = () => {
    setMusicMuted(!musicMuted);
  };

  const toggleSfx = () => {
    setSfxMuted(!sfxMuted);
  };

  // --- Leaderboard Logic ---
  const saveScore = (name, currentScore) => {
    if (!name) return;
    
    // Save to Convex DB
    submitScoreMutation({ name, score: currentScore }).catch(console.error);

    // Update local immediately for fast UI feedback
    if (currentScore > highScore) {
      setHighScore(currentScore);
    }
  };

  const getPlayerRank = (name) => {
    const index = scores.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
    return index === -1 ? "-" : index + 1;
  };

  // --- Game Engine Logic ---
  const drawRect = (ctx, x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, GRID_SIZE, GRID_SIZE);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(x, y, GRID_SIZE, GRID_SIZE);
  };

  const drawSnake = (ctx) => {
    gameRef.current.snake.forEach((segment) => drawRect(ctx, segment.x, segment.y, "#0f0"));
  };

  const drawFood = (ctx) => {
    drawRect(ctx, gameRef.current.food.x, gameRef.current.food.y, "#f00");
  };

  const renderGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawFood(ctx);
    drawSnake(ctx);
  };

  const generateFood = () => {
    let newFoodX, newFoodY, collision;
    do {
      newFoodX = Math.floor(Math.random() * (CANVAS_WIDTH / GRID_SIZE)) * GRID_SIZE;
      newFoodY = Math.floor(Math.random() * (CANVAS_HEIGHT / GRID_SIZE)) * GRID_SIZE;
      collision = gameRef.current.snake.some(seg => seg.x === newFoodX && seg.y === newFoodY);
    } while (collision);
    gameRef.current.food = { x: newFoodX, y: newFoodY };
  };

  const handleCollision = () => {
    playSound('die');
    setLives(prev => {
      const nextLives = prev - 1;
      if (nextLives < 0) {
        setGameState('over');
        if (gameRef.current.intervalId) clearInterval(gameRef.current.intervalId);
        return prev; // Won't matter, game is over, handled in useEffect
      }
      return nextLives;
    });
  };

  // Sync game loop to gameState and lives
  useEffect(() => {
    if (gameState === 'over') {
       saveScore(playerName, score);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, lives, playerName, score, highScore]);

  useEffect(() => {
    if (gameState === 'playing' && lives >= 0) {
      gameRef.current.intervalId = setInterval(gameLoop, GAME_SPEED);
    } else {
      clearInterval(gameRef.current.intervalId);
    }
    return () => clearInterval(gameRef.current.intervalId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, lives]); // Restart loop if playing and lives change

  const cleanupAfterCollision = () => {
     gameRef.current.snake = [
        { x: 10 * GRID_SIZE, y: 10 * GRID_SIZE },
        { x: 9 * GRID_SIZE, y: 10 * GRID_SIZE },
      ];
      gameRef.current.dx = GRID_SIZE;
      gameRef.current.dy = 0;
      generateFood();
  };

  const gameLoop = () => {
    const { snake, food, dx, dy } = gameRef.current;
    if (snake.length === 0) return;

    const head = { x: snake[0].x + dx, y: snake[0].y + dy };

    // Wall collision
    if (head.x < 0 || head.x >= CANVAS_WIDTH || head.y < 0 || head.y >= CANVAS_HEIGHT) {
      clearInterval(gameRef.current.intervalId);
      cleanupAfterCollision();
      handleCollision();
      return;
    }

    // Self collision
    for (let i = 1; i < snake.length; i++) {
       if (head.x === snake[i].x && head.y === snake[i].y) {
         clearInterval(gameRef.current.intervalId);
         cleanupAfterCollision();
         handleCollision();
         return;
       }
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      setScore(s => {
        const nextScore = s + 1;
        if (nextScore % 5 === 0) playSound('levelup');
        else playSound('eat');
        return nextScore;
      });
      generateFood();
    } else {
      snake.pop();
    }

    renderGame();
  };

  const startGame = () => {
    let finalName = playerName.trim();
    if (!finalName) {
      finalName = `Player_${Math.floor(Math.random() * 9000 + 1000)}`;
      setPlayerName(finalName);
    }
    
    localStorage.setItem('lastPlayerName', finalName);
    setScore(0);
    setLives(3);
    setTotalMoves(0);
    
    gameRef.current.snake = [
      { x: 10 * GRID_SIZE, y: 10 * GRID_SIZE },
      { x: 9 * GRID_SIZE, y: 10 * GRID_SIZE },
    ];
    gameRef.current.dx = GRID_SIZE;
    gameRef.current.dy = 0;
    gameRef.current.pauseUsed = false;
    
    generateFood();
    setGameState('playing');
  };

  const togglePause = () => {
    if (gameState === 'start' || gameState === 'over' || gameRef.current.pauseUsed) return;
    if (gameState === 'playing') {
      setGameState('paused');
    } else if (gameState === 'paused') {
      setGameState('playing');
      gameRef.current.pauseUsed = true;
    }
  };

  // --- Keyboard & Swipe Handlers ---
  const applyDirectionChange = (newDx, newDy) => {
     if (gameRef.current.dx === newDx && gameRef.current.dy === newDy) return;
     gameRef.current.dx = newDx;
     gameRef.current.dy = newDy;
     setTotalMoves(m => m + 1);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      
      if (key === 'r') {
         setGameState('start');
         return;
      }
      // Start or restart via shortcut
      if (gameState === 'start' && (key === ' ' || key === 'enter')) {
        startGame();
        return;
      }

      if (gameState !== 'playing') return;

      const { dx, dy } = gameRef.current;
      const goingUp = dy === -GRID_SIZE;
      const goingDown = dy === GRID_SIZE;
      const goingLeft = dx === -GRID_SIZE;
      const goingRight = dx === GRID_SIZE;

      if ((key === 'arrowup' || key === 'w') && !goingDown) applyDirectionChange(0, -GRID_SIZE);
      else if ((key === 'arrowdown' || key === 's') && !goingUp) applyDirectionChange(0, GRID_SIZE);
      else if ((key === 'arrowleft' || key === 'a') && !goingRight) applyDirectionChange(-GRID_SIZE, 0);
      else if ((key === 'arrowright' || key === 'd') && !goingLeft) applyDirectionChange(GRID_SIZE, 0);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, playerName]);

  useEffect(() => {
    const handleTouchStart = (e) => {
       if (gameState !== 'playing') return;
       touchStartRef.current = {
         x: e.touches[0].clientX,
         y: e.touches[0].clientY
       };
    };

    const handleTouchEnd = (e) => {
       if (gameState !== 'playing') return;
       const touchEndX = e.changedTouches[0].clientX;
       const touchEndY = e.changedTouches[0].clientY;
       
       const diffX = touchStartRef.current.x - touchEndX;
       const diffY = touchStartRef.current.y - touchEndY;
       
       if (Math.abs(diffX) > 30 || Math.abs(diffY) > 30) {
          const { dx, dy } = gameRef.current;
          const goingUp = dy === -GRID_SIZE;
          const goingDown = dy === GRID_SIZE;
          const goingLeft = dx === -GRID_SIZE;
          const goingRight = dx === GRID_SIZE;

          if (Math.abs(diffX) > Math.abs(diffY)) {
             if (diffX > 0 && !goingRight) applyDirectionChange(-GRID_SIZE, 0); 
             else if (diffX < 0 && !goingLeft) applyDirectionChange(GRID_SIZE, 0); 
          } else {
             if (diffY > 0 && !goingDown) applyDirectionChange(0, -GRID_SIZE); 
             else if (diffY < 0 && !goingUp) applyDirectionChange(0, GRID_SIZE); 
          }
       }
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  // Draw start screen initially
  useEffect(() => {
     renderGame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <audio id="die-sfx" src="/fahhhhh.mp3" preload="auto" />
      
      <div style={{ textAlign: 'center', width: '100%', marginTop: '20px', marginBottom: '15px' }}>
         <h1 style={{ color: '#fff', textShadow: '0 0 10px #fff, 0 0 20px #ff0, 0 0 30px #ff0', fontSize: '2.4em', margin: 0, fontFamily: '"Press Start 2P", monospace' }}>RETRO SNAKE</h1>
      </div>

      <div style={{ display: 'flex', gap: '15px', width: '100%', maxWidth: '400px', justifyContent: 'flex-end', marginBottom: '15px' }}>
        <button
          title="Pause/Resume Game"
          onClick={togglePause}
          className="icon-button"
          disabled={gameState === 'start' || gameState === 'over' || gameRef.current.pauseUsed}
          style={{
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: (gameState === 'start' || gameState === 'over' || gameRef.current.pauseUsed) ? 0.3 : 1
          }}
        >
          {gameState === 'paused' ? (
            <svg viewBox="0 0 24 24" fill="var(--neon-green)" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="var(--neon-green)" width="28" height="28"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          )}
        </button>
        <button
          title="Toggle Song"
          onClick={toggleMusic}
          className="icon-button"
          style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {musicMuted ? (
             <svg viewBox="0 0 24 24" fill="red" width="28" height="28"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/><line x1="2" y1="2" x2="22" y2="22" stroke="red" strokeWidth="2" strokeLinecap="round"/></svg>
          ) : (
             <svg viewBox="0 0 24 24" fill="var(--neon-green)" width="28" height="28"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          )}
        </button>
        <button
          title="Toggle SFX"
          onClick={toggleSfx}
          className="icon-button"
          style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {sfxMuted ? (
             <svg viewBox="0 0 24 24" fill="red" width="28" height="28"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
          ) : (
             <svg viewBox="0 0 24 24" fill="var(--neon-green)" width="28" height="28"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          )}
        </button>
      </div>

      <div className="game-container">
        <div className="game-info" style={{ gap: '5px', width: '100%', maxWidth: '400px', marginBottom: '10px' }}>
          <div style={{ whiteSpace: 'nowrap' }}>PTS: <span>{score}</span></div>
          <div id="lives-container" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
             HP: 
             <span style={{ display: 'inline-flex', alignItems: 'center' }}>
               {Array(3).fill(0).map((_, i) => (
                 i < Math.max(0, lives) ? (
                   <svg key={i} viewBox="0 0 24 24" fill="var(--neon-green)" width="16" height="16" style={{ margin: '0 2px' }}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                 ) : (
                   <svg key={i} viewBox="0 0 24 24" fill="none" stroke="var(--neon-green)" strokeWidth="2" width="16" height="16" style={{ margin: '0 2px' }}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                 )
               ))}
             </span>
          </div>
          <div style={{ whiteSpace: 'nowrap' }}>MAX: <span>{highScore}</span></div>
        </div>

        <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}></canvas>

        {gameState === 'start' && !showLeaderboard && (
          <div className="overlay" style={{ justifyContent: 'center' }}>
            <div style={{ marginBottom: '35px' }}>
              <input
                type="text"
                placeholder="Enter your name"
                className={`name-input ${!playerName.trim() ? "invalid" : ""}`}
                style={{ width: '220px', marginBottom: 0 }}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
              />
            </div>
            <p>Use ARROW keys, WASD,</p>
            <p>or SWIPE to move.</p>
            <br />
            <p>Press SPACE to start.</p>
            <p>Press 'R' to restart anytime.</p>
            <p style={{ color: '#ff0' }}>You have ONE pause power!</p>
          </div>
        )}

        {showLeaderboard && (
          <div className="overlay">
            <h2>TOP 10 PLAYERS</h2>
            <div style={{ margin: '20px 0', width: '80%', maxWidth: 400 }}>
              {scores.length === 0 ? (
                <div style={{ color: '#0f0' }}>No scores yet!</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th style={{ padding: 10, textAlign: 'center' }}>RANK</th>
                      <th style={{ padding: 10 }}>NAME</th>
                      <th style={{ padding: 10, textAlign: 'right' }}>SCORE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scores.map((s, idx) => (
                      <tr key={idx} style={{ color: s.name.toLowerCase() === playerName.toLowerCase() ? '#ff0' : 'inherit' }}>
                         <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                         <td>{s.name}</td>
                         <td style={{ textAlign: 'right' }}>{s.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p>Your Best Rank: <span>{getPlayerRank(playerName)}</span></p>
            <button onClick={() => setShowLeaderboard(false)}>CLOSE</button>
          </div>
        )}

        {gameState === 'over' && (
          <div className="overlay">
            <h2>GAME OVER!</h2>
            <p>Your Score: <span>{score}</span></p>
            <p>High Score: <span>{highScore > score ? highScore : score}</span></p>
            <p>Total Moves: <span>{totalMoves}</span></p>
            <button onClick={() => setGameState('start')}>PLAY AGAIN</button>
          </div>
        )}
        
        {gameState === 'paused' && (
           <div className="overlay">
              <h2>PAUSED</h2>
              <button onClick={togglePause}>RESUME</button>
           </div>
        )}
      </div>

      {/* START SCREEN BOTTOM CONTROLS */}
      {gameState === 'start' && !showLeaderboard && (
        <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', width: '100%', maxWidth: '400px' }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'center' }}>
            <button onClick={startGame} style={{ marginTop: 0 }}>START GAME</button>
            <button onClick={() => setShowLeaderboard(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5em', padding: 0, width: 50, height: 50, marginTop: 0 }}>
              <svg viewBox="0 0 24 24" fill="#000" width="28" height="28"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>
            </button>
          </div>
        </div>
      )}

    </>
  );
}

export default App;
