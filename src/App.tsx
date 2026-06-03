import { useState, useEffect, useRef, useCallback } from 'react';
import { AdMob } from '@capacitor-community/admob';
import './App.css';
import questionsData from './questions.json';

// ==========================================================================
// Types & Data Definitions
// ==========================================================================

interface ShooterQuestion {
  id: number;
  q: string;
  a: string;
  hint: string;
  explanation: string;
}

const SHOOTER_QUESTIONS: ShooterQuestion[] = questionsData;

export default function App() {
  const [appState, setAppState] = useState<'title' | 'playing' | 'hit' | 'exploding' | 'gameover' | 'cleared'>('title');
  const [playMode, setPlayMode] = useState<'10q' | 'endless' | 'marathon'>('10q');
  const [questionsList, setQuestionsList] = useState<ShooterQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState<number>(0);
  const [inputValue, setInputValue] = useState<string>('');
  const [inputStatus, setInputStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [life, setLife] = useState<number>(5);
  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(10.0); // 10秒制限
  const [laserActive, setLaserActive] = useState<boolean>(false);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [screenEffect, setScreenEffect] = useState<'none' | 'shake' | 'red-flash'>('none');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [settings, setSettings] = useState({
    timeLimit: 10,
    initialLife: 5,
    questionCount10q: 10,
  });
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  const timerRef = useRef<any>(null);

  // ==========================================================================
  // AdMob (Advertising) Configuration & Handlers
  // ==========================================================================
  const prepareInterstitial = async () => {
    try {
      await AdMob.prepareInterstitial({
        adId: 'ca-app-pub-3940256099942544/1033173712', // Google Play Test Interstitial Ad ID
        isTesting: true
      });
    } catch (error) {
      console.warn('AdMob prepare failed:', error);
    }
  };

  const showAd = async () => {
    try {
      await AdMob.showInterstitial();
      prepareInterstitial(); // Pre-load next ad
    } catch (error) {
      console.warn('AdMob show failed:', error);
    }
  };

  // Initialize AdMob on start
  useEffect(() => {
    AdMob.initialize({
      initializeForTesting: true
    }).then(() => {
      prepareInterstitial();
    }).catch(err => {
      console.error('AdMob initialization failed:', err);
    });
  }, []);

  // Display interstitial ad upon game over or complete
  useEffect(() => {
    if (appState === 'gameover' || appState === 'cleared') {
      showAd();
    }
  }, [appState]);
  
  // 現在の問題を取得 (安全対策としてフォールバックを定義)
  const currentQuestion = questionsList[currentQIndex] || {
    q: 'データロード中...',
    a: '0',
    hint: 'ロード中',
    explanation: 'ロード中'
  };

  const startGame = (mode: '10q' | 'endless' | 'marathon') => {
    setPlayMode(mode);
    
    // 問題リストを決定
    let list = [...SHOOTER_QUESTIONS];
    // ランダムにシャッフルする
    list = list.sort(() => 0.5 - Math.random());
    
    if (mode === '10q') {
      list = list.slice(0, settings.questionCount10q);
    }
    
    setQuestionsList(list);
    setCurrentQIndex(0);
    setInputValue('');
    setInputStatus('idle');
    if (mode === 'endless') {
      setLife(Math.max(1, settings.initialLife - 2));
    } else {
      setLife(settings.initialLife);
    }
    setScore(0);
    setCombo(0);
    setTimeLeft(settings.timeLimit);
    setAppState('playing');
    setLaserActive(false);
    setShowExplanation(false);
    setScreenEffect('none');
    setIsPaused(false);
  };

  // タイマー処理
  useEffect(() => {
    if (appState !== 'playing' || showExplanation || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0.1) {
          clearInterval(timerRef.current!);
          handleConflict(); // 激突
          return 0;
        }
        return Number((prev - 0.1).toFixed(1));
      });
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [appState, currentQIndex, showExplanation]);

  // 激突（タイムアップ）
  const handleConflict = () => {
    setAppState('hit');
    setScreenEffect('red-flash');
    setCombo(0);
    setLife(prev => {
      const nextLife = prev - 1;
      if (nextLife <= 0) {
        setAppState('gameover');
      } else {
        setTimeout(() => {
          setShowExplanation(true);
          setScreenEffect('none');
        }, 600);
      }
      return nextLife;
    });
  };

  // 判定処理
  const handleFire = useCallback(() => {
    if (appState !== 'playing' || showExplanation || inputValue.trim() === '') return;

    if (inputValue === currentQuestion.a) {
      // 正解
      setLaserActive(true);
      setInputStatus('correct');
      if (timerRef.current) clearInterval(timerRef.current);
      
      setTimeout(() => {
        setLaserActive(false);
        setAppState('exploding');
        const calculatedScore = score + 100 + (combo * 20);
        setScore(calculatedScore);
        setCombo(prev => prev + 1);

        setTimeout(() => {
          setShowExplanation(true);
        }, 500);
      }, 250);
    } else {
      // 不正解
      setInputStatus('incorrect');
      setCombo(0);
      setScreenEffect('shake');
      setTimeout(() => {
        setInputStatus('idle');
        setInputValue('');
        setScreenEffect('none');
      }, 400);
    }
  }, [inputValue, currentQuestion, appState, showExplanation, score, combo]);

  const handleNextQuestion = () => {
    setShowExplanation(false);
    setInputValue('');
    setInputStatus('idle');
    setTimeLeft(settings.timeLimit);
    setAppState('playing');
    
    if (currentQIndex + 1 < questionsList.length) {
      setCurrentQIndex(prev => prev + 1);
    } else {
      if (playMode === 'endless') {
        // エンドレスなら再シャッフルしてループ
        const newList = [...SHOOTER_QUESTIONS].sort(() => 0.5 - Math.random());
        setQuestionsList(newList);
        setCurrentQIndex(0);
      } else {
        setAppState('cleared');
      }
    }
  };

  const handleKeyPress = (char: string) => {
    if (appState !== 'playing' || showExplanation || isPaused) return;

    if (char === 'C') {
      setInputValue('');
    } else if (char === 'Enter') {
      handleFire();
    } else {
      if (inputValue.length < 4) {
        setInputValue(prev => prev + char);
      }
    }
  };

  // キーボードリスナー
  useEffect(() => {
    const handlePhysicalKeyDown = (e: KeyboardEvent) => {
      if (appState !== 'playing' || isPaused) return;
      
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        setInputValue(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        handleFire();
      } else if (e.key === 'Escape') {
        setInputValue('');
      }
    };

    window.addEventListener('keydown', handlePhysicalKeyDown);
    return () => window.removeEventListener('keydown', handlePhysicalKeyDown);
  }, [appState, handleKeyPress, handleFire]);

  const isTimeWarning = timeLeft <= Math.max(2.0, settings.timeLimit * 0.3);

  return (
    <div className="app-container">
      {/* ----------------- 0. TITLE SCREEN ----------------- */}
      {appState === 'title' && (
        <div className="title-screen">
          <div className="title-logo">
            <span className="subtitle-mini">宅建数字撃破ゲーム</span>
            <h1 className="title-glow large">TAKKEN NUMBERS</h1>
          </div>
          
          <div className="instruction-box">
            <h3>🎮 遊び方</h3>
            <p>画面に現れる「宅建の重要要件クイズ」の正しい「数値」を制限時間（10秒）以内にテンキーで入力して撃破してください。</p>
            <ul>
              <li>💡 PCの物理キーボード（テンキーなど）でも入力可能です。</li>
              <li>⚡ 連続正解（コンボ）でボーナススコアを獲得！</li>
              <li>💥 タイムアップするとコアが激突し、ライフが減ります。</li>
            </ul>
          </div>

          <div className="mode-selection-area">
            <h3>🏁 プレイモード選択</h3>
            <div className="mode-buttons-grid">
              <button className="btn-cyber mode-btn" onClick={() => startGame('10q')}>
                <span className="mode-icon">⚡</span>
                <span className="mode-text">10問チャレンジ</span>
                <span className="mode-desc">サクッと10問で力試し</span>
              </button>
              
              <button className="btn-cyber mode-btn-survival" onClick={() => startGame('endless')}>
                <span className="mode-icon">☠️</span>
                <span className="mode-text">サバイバル</span>
                <span className="mode-desc">ライフが尽きるまで無限挑戦</span>
              </button>

              <button className="btn-cyber mode-btn-marathon" onClick={() => startGame('marathon')}>
                <span className="mode-icon">🏆</span>
                <span className="mode-text">100問マラソン</span>
                <span className="mode-desc">全問網羅ノックアウト</span>
              </button>

              <button className="mode-btn-settings" onClick={() => setShowSettingsModal(true)}>
                <span className="mode-icon">⚙️</span>
                <span className="mode-text">カスタム設定</span>
                <span className="mode-desc">制限時間や初期ライフを変更</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- 1. GAMEPLAY SCREEN ----------------- */}
      {(appState === 'playing' || appState === 'hit' || appState === 'exploding') && (
        <div className="game-screen-layout">
          {/* HUD Header */}
          <div className="shooter-header">
            <div className="stats-group">
              <div className="stat-item">
                <span className="stat-label">SCORE:</span>
                <span className="stat-value neon-cyan">{score}</span>
              </div>
              {combo > 0 && (
                <div className="stat-item" style={{ animation: 'bounceBack 0.3s' }}>
                  <span className="stat-label" style={{ color: 'var(--color-accent)' }}>COMBO:</span>
                  <span className="stat-value" style={{ color: 'var(--color-accent)', fontWeight: 800 }}>{combo}</span>
                </div>
              )}
            </div>

            <button className="btn-pause-trigger" onClick={() => setIsPaused(true)}>
              ⏸️
            </button>

            <div className="stats-group">
              <div className="stat-item">
                <span className="stat-label">
                  {playMode === 'endless' ? 'Q-NO:' : 'PROGRESS:'}
                </span>
                <span className="stat-value" style={{ color: 'var(--color-secondary)' }}>
                  {playMode === 'endless' ? `${currentQIndex + 1}` : `${currentQIndex + 1}/${questionsList.length}`}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">LIVES:</span>
                <span className="stat-value neon-pink">
                  {'❤️'.repeat(Math.max(0, life))}
                  {life <= 0 && '☠️'}
                </span>
              </div>
            </div>
          </div>

          {/* Core Visual Area */}
          <div className={`screen-wrapper 
            ${screenEffect === 'shake' ? 'shake' : ''} 
            ${screenEffect === 'red-flash' ? 'red-flash' : ''}
          `}>
            <div className="perspective-stage">
              {laserActive && <div className="laser-beam"></div>}

              {!showExplanation && (
                <div 
                  className={`cyber-core 
                    ${appState === 'exploding' ? 'exploding' : ''}
                    ${appState === 'hit' ? 'hit' : ''}
                  `}
                  style={{
                    transform: appState === 'exploding' ? undefined : 'scale(1)',
                    opacity: 1,
                    pointerEvents: 'none'
                  }}
                >
                  {currentQuestion.q.includes(':') ? (
                    <div className="core-question-split">
                      <div className="core-question-prefix">{currentQuestion.q.split(':')[0].trim()}</div>
                      <div 
                        className="core-question-main"
                        style={{
                          fontSize: currentQuestion.q.split(':').slice(1).join(':').trim().length > 60 ? '0.88rem' : 
                                    currentQuestion.q.split(':').slice(1).join(':').trim().length > 45 ? '0.96rem' : 
                                    currentQuestion.q.split(':').slice(1).join(':').trim().length > 30 ? '1.08rem' : '1.28rem',
                          lineHeight: currentQuestion.q.split(':').slice(1).join(':').trim().length > 45 ? '1.3' : '1.45'
                        }}
                      >
                        {currentQuestion.q.split(':').slice(1).join(':').trim()}
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="core-question"
                      style={{
                        fontSize: currentQuestion.q.trim().length > 60 ? '0.88rem' : 
                                  currentQuestion.q.trim().length > 45 ? '0.96rem' : 
                                  currentQuestion.q.trim().length > 30 ? '1.08rem' : '1.28rem',
                        lineHeight: currentQuestion.q.trim().length > 45 ? '1.3' : '1.45'
                      }}
                    >
                      {currentQuestion.q.trim()}
                    </div>
                  )}
                  <div className="core-hint">ヒント: {currentQuestion.hint}</div>
                  
                  <div 
                    className={`core-timer-bar ${isTimeWarning ? 'warning' : ''}`}
                    style={{ width: `${(timeLeft / settings.timeLimit) * 100}%` }}
                  ></div>
                </div>
              )}
            </div>
          </div>

          {/* Input Interface */}
          {!showExplanation && (
            <div className="controls-area">
              <div className="shooter-input-display">
                <div className={`input-box ${
                  inputStatus === 'correct' ? 'correct' :
                  inputStatus === 'incorrect' ? 'incorrect' : ''
                }`}>
                  {inputValue || '_'}
                </div>
              </div>

              <div className="keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button 
                    key={num} 
                    className="key-btn"
                    onClick={() => handleKeyPress(num)}
                  >
                    {num}
                  </button>
                ))}
                <button className="key-btn action-key" onClick={() => handleKeyPress('C')}>C</button>
                <button className="key-btn" onClick={() => handleKeyPress('0')}>0</button>
                <button className="key-btn action-key target-btn" onClick={() => handleKeyPress('Enter')}>決定</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------- 2. MODALS & RESULTS ----------------- */}
      
      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="result-card settings-card">
            <h2>⚙️ ゲーム設定</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.2rem' }}>
              ゲームの難易度や出題数をカスタマイズできます。
            </p>
            
            <div className="settings-list" style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1.2rem', textAlign: 'left' }}>
              
              <div className="setting-item">
                <div style={{ fontWeight: 700, color: 'var(--color-secondary)', marginBottom: '0.4rem', fontSize: '0.92rem' }}>
                  ⏳ 制限時間（1問あたり）
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button className="btn-adjust" onClick={() => setSettings(prev => ({ ...prev, timeLimit: Math.max(3, prev.timeLimit - 1) }))}>-</button>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, flexGrow: 1, textAlign: 'center', color: 'var(--text-main)' }}>
                    {settings.timeLimit} 秒
                  </span>
                  <button className="btn-adjust" onClick={() => setSettings(prev => ({ ...prev, timeLimit: Math.min(60, prev.timeLimit + 1) }))}>+</button>
                </div>
              </div>

              <div className="setting-item">
                <div style={{ fontWeight: 700, color: 'var(--color-secondary)', marginBottom: '0.4rem', fontSize: '0.92rem' }}>
                  ❤️ 初期ライフ（通常モード）
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button className="btn-adjust" onClick={() => setSettings(prev => ({ ...prev, initialLife: Math.max(1, prev.initialLife - 1) }))}>-</button>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, flexGrow: 1, textAlign: 'center', color: 'var(--text-main)' }}>
                    {settings.initialLife} 機
                  </span>
                  <button className="btn-adjust" onClick={() => setSettings(prev => ({ ...prev, initialLife: Math.min(10, prev.initialLife + 1) }))}>+</button>
                </div>
              </div>

              <div className="setting-item">
                <div style={{ fontWeight: 700, color: 'var(--color-secondary)', marginBottom: '0.4rem', fontSize: '0.92rem' }}>
                  ⚡ 10問チャレンジの出題数
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button className="btn-adjust" onClick={() => setSettings(prev => ({ ...prev, questionCount10q: Math.max(5, prev.questionCount10q - 5) }))}>-</button>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, flexGrow: 1, textAlign: 'center', color: 'var(--text-main)' }}>
                    {settings.questionCount10q} 問
                  </span>
                  <button className="btn-adjust" onClick={() => setSettings(prev => ({ ...prev, questionCount10q: Math.min(100, prev.questionCount10q + 5) }))}>+</button>
                </div>
              </div>

            </div>

            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button className="btn-cyber" style={{ width: '100%', borderRadius: '30px' }} onClick={() => setShowSettingsModal(false)}>
                設定を保存して戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {isPaused && (
        <div className="modal-overlay">
          <div className="result-card pause-card">
            <h2>⏸️ 一時停止中</h2>
            <p>ゲームは一時停止されています。学習を再開しますか？</p>
            <div className="modal-actions-vertical">
              <button className="btn-cyber" style={{ width: '100%', borderRadius: '12px', marginBottom: '0.8rem' }} onClick={() => setIsPaused(false)}>
                ゲームを再開する
              </button>
              <button className="btn-secondary" style={{ width: '100%', borderRadius: '12px' }} onClick={() => {
                setIsPaused(false);
                setAppState('title');
              }}>
                タイトルに戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explanation Modal */}
      {showExplanation && (
        <div className="modal-overlay">
          <div className="result-card">
            <h2 style={{ color: inputStatus === 'correct' ? 'var(--color-accent)' : 'var(--color-accent-pink)' }}>
              {inputStatus === 'correct' ? '🎯 正解撃破！' : '💥 衝突ダメージ！'}
            </h2>
            <div style={{ margin: '1.2rem 0', fontSize: '1.2rem', fontWeight: 700 }}>
              Q: {currentQuestion.q}
            </div>
            <div style={{ display: 'inline-block', background: 'rgba(0,242,254,0.1)', padding: '0.5rem 1.5rem', borderRadius: '8px', fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: '1.2rem' }}>
              正解: {currentQuestion.a}
            </div>
            <div className="explanation-item" style={{ textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: '1.2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontWeight: 700, color: 'var(--color-secondary)', marginBottom: '0.4rem' }}>解説:</div>
              <div className="exp-desc" style={{ fontSize: '0.92rem' }}>{currentQuestion.explanation}</div>
            </div>
            <div className="modal-actions">
              <button className="btn-cyber" onClick={handleNextQuestion}>次の問題へ進む</button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {appState === 'gameover' && (
        <div className="modal-overlay">
          <div className="result-card">
            <h2 className="gameover">☠️ ミッション失敗 (GAME OVER)</h2>
            <p>ライフが尽きました。もう一度チャレンジして重要数値を脳に叩き込みましょう！</p>
            <div className="score-stats">
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>最終スコア</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-primary)' }}>{score}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>到達問題</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-accent-pink)' }}>{currentQIndex + 1}</div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setAppState('title')}>タイトルへ</button>
              <button className="btn-cyber" onClick={() => startGame(playMode)}>リトライ</button>
            </div>
          </div>
        </div>
      )}

      {/* Cleared Modal */}
      {appState === 'cleared' && (
        <div className="modal-overlay">
          <div className="result-card">
            <h2 className="victory">🏆 ミッションクリア！完全合格！</h2>
            <p>{playMode === '10q' ? '10問チャレンジ' : '100問マラソン'} をクリアしました！素晴らしい成績です！</p>
            <div className="score-stats">
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>最終スコア</div>
                <div style={{ fontSize: 2 + 'rem', fontWeight: 900, color: 'var(--color-accent)' }}>{score}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>クリアモード</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: '0.5rem' }}>
                  {playMode === '10q' ? '10問チャレンジ' : '100問マラソン'}
                </div>
              </div>
            </div>

            <div className="explanation-list" style={{ maxHeight: '250px', overflowY: 'auto' }}>
              {questionsList.map(item => (
                <div key={item.id} className="explanation-item">
                  <div className="exp-term">
                    <span>{item.q.replace("〇〇", "【 " + item.a + " 】")}</span>
                  </div>
                  <div className="exp-desc">{item.explanation}</div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setAppState('title')}>タイトルへ</button>
              <button className="btn-cyber" onClick={() => startGame(playMode)}>もう一度遊ぶ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
