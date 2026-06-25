// main.js — LearnBuddy.ai  ·  Redesigned UI wiring

document.addEventListener('DOMContentLoaded', () => {

  // ── Wait for Firebase to be ready ─────────────────────────────
  let firebaseReady = false;
  function waitForFirebase(cb, attempts = 0) {
    if (window.auth && window.db && window.onAuthStateChanged) {
      cb();
    } else if (attempts < 40) {
      setTimeout(() => waitForFirebase(cb, attempts + 1), 150);
    } else {
      console.error('Firebase failed to initialise');
    }
  }

  // ── DOM ────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // Auth
  const loginForm      = $('form-login');
  const signupForm     = $('form-signup');
  const btnLogin       = $('btn-login');
  const btnSignup      = $('btn-signup');
  const authMessage    = $('auth-message');
  const otpVerifyScreen  = $('otp-verify-screen');
  const otpEmailDisplay  = $('otp-email-display');
  const btnVerifyOtp     = $('btn-verify-otp');
  const btnResendOtp     = $('btn-resend-otp');
  const btnCancelOtp     = $('btn-cancel-otp');
  const otpError         = $('otp-error');
  const otpSuccess       = $('otp-success');
  const passwordInput    = $('signup-password');
  const passwordStrength = $('password-strength');

  // Logged-in shell
  const loggedInView   = $('logged-in-view');
  const userEmailSpan  = $('user-email');

  // Child section
  const childSection   = $('child-section');
  const childrenList   = $('children-list');
  const btnAddChild    = $('btn-add-child');
  const formWrapper    = $('form-add-child-wrapper');
  const formAddChild   = $('form-add-child');
  const btnCancelChild = $('btn-cancel-child');
  const childMessage   = $('child-message');

  // PIN modal
  const pinModal       = $('pin-modal');
  const pinForChild    = $('pin-for-child');
  const pinError       = $('pin-error');
  const btnCancelPin   = $('btn-cancel-pin');

  // Child welcome
  const childWelcome   = $('child-welcome');
  const childNameWelcome = $('child-name-welcome');
  const btnBackToParent  = $('btn-back-to-parent');
  const subjectPicker    = $('subject-picker');
  const childStatsStrip  = $('child-stats-strip');

  // Learning session
  const learningSession    = $('learning-session');
  const questionText       = $('question-text');
  const questionCounter    = $('question-counter');
  const optionsContainer   = $('options-container');
  const feedback           = $('feedback');
  const btnNextQuestion    = $('btn-next-question');
  const btnFinishSession   = $('btn-finish-session');
  const btnBackFromLearning = $('btn-back-from-learning');
  const btnRepeatQuestion  = $('btn-repeat-question');
  const hintArea           = $('hint-area');
  const btnShowHint        = $('btn-show-hint');
  const hintText           = $('hint-text');
  const progressFill       = $('progress-fill');
  const sessionScoreDisplay = $('session-score-display');

  // Delete modal
  const deleteModal     = $('delete-modal');
  const deleteChildName = $('delete-child-name');
  const btnConfirmDelete = $('btn-confirm-delete');
  const btnCancelDelete  = $('btn-cancel-delete');

  // Logout buttons
  const btnLogout        = $('btn-logout');
  const btnLogoutBottom  = $('btn-logout-bottom');
  const logoutRow        = $('logout-row');

  // ── State ─────────────────────────────────────────────────────
  let currentQuestionIndex = 0;
  let score                = 0;
  let consecutiveCorrect   = 0; // mid-session streak — shows "N in a row" indicator
  let currentChild         = null;
  let selectedSubject      = null;
  let sessionQuestions     = [];
  let hintTimer            = null;
  let childToDeleteId      = null;
  let pinBuffer            = '';
  let pendingPinResolve    = null;
  let pendingOtpData       = null; // { email, uid, otp }

  // ── EmailJS Init (for OTP emails) ─────────────────────────────
  const EMAILJS_PUBLIC_KEY = '8XzJ-S-AI-7Q7Pqfl';
  const EMAILJS_SERVICE_ID = 'service_k6oe0h2';
  const EMAILJS_TEMPLATE_ID = 'template_y2vtior';

  if (typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }

  // ── OTP Helpers ───────────────────────────────────────────────
  function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async function sendOtpEmail(toEmail, otpCode, userName) {
    if (typeof emailjs === 'undefined') {
      console.error('EmailJS not loaded');
      return false;
    }

    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: toEmail,
        to_name: userName,
        otp_code: otpCode,
        app_name: 'LearnBuddy.ai'
      });
      return true;
    } catch (err) {
      console.error('EmailJS send failed:', err);
      return false;
    }
  }

  async function storeOtpInFirestore(uid, email, otp) {
    try {
      await window.setDoc(window.doc(window.db, 'pending_verifications', uid), {
        email,
        otp,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min expiry
      });
      return true;
    } catch (err) {
      console.error('Failed to store OTP:', err);
      return false;
    }
  }

  async function verifyOtpFromFirestore(uid, inputOtp) {
    try {
      const docRef = window.doc(window.db, 'pending_verifications', uid);
      const snap = await window.getDoc(docRef);
      
      if (!snap.exists()) return false;
      
      const data = snap.data();
      const now = new Date();
      const expires = new Date(data.expiresAt);
      
      if (now > expires) {
        await window.deleteDoc(docRef);
        return false;
      }
      
      if (data.otp === inputOtp) {
        await window.deleteDoc(docRef);
        return true;
      }
      
      return false;
    } catch (err) {
      console.error('OTP verify failed:', err);
      return false;
    }
  }

  // ── Subject config ────────────────────────────────────────────
  const SUBJECT_META = {
    maths:               { icon: '🔢', label: 'Maths',          bg: 'linear-gradient(135deg,#a78bfa,#7c3aed)', shadow: '#5b21b6' },
    english:             { icon: '📚', label: 'English',         bg: 'linear-gradient(135deg,#f472b6,#ec4899)', shadow: '#9d174d' },
    science:             { icon: '🔬', label: 'Science',         bg: 'linear-gradient(135deg,#34d399,#059669)', shadow: '#065f46' },
    general_knowledge:   { icon: '🌍', label: 'General Know.',   bg: 'linear-gradient(135deg,#fb923c,#ef4444)', shadow: '#7f1d1d' },
    computer_modern_tech:{ icon: '💻', label: 'Tech',            bg: 'linear-gradient(135deg,#38bdf8,#0ea5e9)', shadow: '#0c4a6e' },
  };

  // ── Age dropdown ──────────────────────────────────────────────
  const ageSelect = $('child-age');
  if (ageSelect) {
    for (let i = 2; i <= 12; i++) {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = i;
      ageSelect.appendChild(opt);
    }
  }

  // ── Speech synthesis ─────────────────────────────────────────
  // Tracks whatever audio we're currently playing so we can stop it cleanly
  let currentSpokenAudio = null;

  /**
   * Speak text aloud. If ElevenLabs is enabled (master toggle ON) AND the current
   * child has a voice selected, use ElevenLabs. Otherwise (or on any failure),
   * fall back to browser TTS so the quiz never breaks.
   */
  async function speak(text) {
    // Stop any audio currently playing
    if (currentSpokenAudio) {
      try { currentSpokenAudio.pause(); } catch {}
      currentSpokenAudio = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    // Try ElevenLabs only if master toggle is ON and child has a voice
    const voiceId = currentChild?.selectedVoiceId;
    console.log('[VOICE DEBUG] toggle enabled?', elevenLabsEnabled, '| child voiceId:', voiceId, '| presetVoices loaded:', presetVoices.length);
    if (elevenLabsEnabled && voiceId) {
      const voice = findVoiceById(voiceId);
      console.log('[VOICE DEBUG] resolved voice:', voice, '| elevenLabsVoiceId:', voice?.elevenLabsVoiceId, '| locked?', lockedVoiceIds.has(voice?.elevenLabsVoiceId));
      if (voice?.elevenLabsVoiceId) {
        const blob = await generateSpeechElevenLabs(text, voice.elevenLabsVoiceId);
        console.log('[VOICE DEBUG] audio blob from server?', !!blob, blob ? `(${blob.size} bytes)` : '');
        if (blob) {
          try {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            currentSpokenAudio = audio;
            await audio.play();
            return; // success — don't fall through to browser TTS
          } catch (e) {
            console.warn('[VOICE DEBUG] ❌ Audio.play() blocked/failed — falling back to TTS:', e);
          }
        }
        // If we got here, ElevenLabs failed — fall through to browser TTS
      } else {
        console.warn('[VOICE DEBUG] ❌ Assigned voice has no elevenLabsVoiceId (or not found in list) — falling back.');
      }
    } else {
      console.warn('[VOICE DEBUG] ❌ Falling back because:', !elevenLabsEnabled ? 'master toggle is OFF at runtime' : 'no voice assigned to this child');
    }

    // Fallback: browser TTS (original behavior)
    if (!('speechSynthesis' in window)) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.8; utt.pitch = 1.2; utt.volume = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const preferred = ['Google US English', 'Google UK English Female',
      'Microsoft Jenny', 'Microsoft Aria', 'Microsoft Zira',
      'Samantha', 'Karen', 'Moira', 'Tessa'];
    const pick = voices.find(v => preferred.some(p => v.name.includes(p) && v.lang.startsWith('en')))
              || voices.find(v => v.name.toLowerCase().includes('female') && v.lang.startsWith('en'))
              || voices.find(v => v.lang.startsWith('en'))
              || voices[0];
    if (pick) utt.voice = pick;
    window.speechSynthesis.speak(utt);
  }

  // ensure voices are loaded
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  // ── Auth tab toggle ───────────────────────────────────────────
  btnLogin?.addEventListener('click', () => {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    btnLogin.classList.add('active');
    btnSignup.classList.remove('active');
    authMessage.innerHTML = '';
    // OTP screen stays hidden - not used anymore
  });

  btnSignup?.addEventListener('click', () => {
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    btnSignup.classList.add('active');
    btnLogin.classList.remove('active');
    authMessage.innerHTML = '';
    // OTP screen stays hidden - not used anymore
  });

  // ── Password strength validator ──────────────────────────────
  function validatePassword(pass) {
    const checks = {
      length:   { test: pass.length >= 8,             msg: 'At least 8 characters', icon: '📏' },
      upper:    { test: /[A-Z]/.test(pass),           msg: 'One uppercase letter',  icon: '🔤' },
      lower:    { test: /[a-z]/.test(pass),           msg: 'One lowercase letter',  icon: '🔡' },
      number:   { test: /[0-9]/.test(pass),           msg: 'One number',            icon: '🔢' },
      special:  { test: /[!@#$%^&*(),.?":{}|<>]/.test(pass), msg: 'One special char (!@#$%...)', icon: '✨' },
    };
    
    const allPassed = Object.values(checks).every(c => c.test);
    return { checks, allPassed };
  }

  // Real-time password strength feedback
  passwordInput?.addEventListener('input', () => {
    const val = passwordInput.value;
    if (!val) {
      passwordStrength.innerHTML = '';
      return;
    }
    const { checks, allPassed } = validatePassword(val);
    
    passwordStrength.innerHTML = Object.entries(checks).map(([key, check]) => {
      const color = check.test ? 'text-green-600' : 'text-gray-400';
      const icon  = check.test ? '✅' : '⚪';
      return `<div class="${color} font-semibold flex items-center gap-2">
                <span>${icon}</span> <span>${check.msg}</span>
              </div>`;
    }).join('');
  });

  // ── Sign up (NO VERIFICATION REQUIRED) ───────────────────────
  signupForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const name     = $('signup-name')?.value.trim();
    const email    = $('signup-email')?.value.trim();
    const password = $('signup-password')?.value;

    console.log('[SIGNUP] Starting signup for:', email);

    // Validate password strength
    const { allPassed } = validatePassword(password);
    if (!allPassed) {
      authMessage.innerHTML = '<p class="text-red-500">❌ Password doesn\'t meet all requirements above.</p>';
      return;
    }

    authMessage.innerHTML = '<p class="text-purple-500">Creating account... 🚀</p>';

    try {
      // Create Firebase user
      console.log('[SIGNUP] Creating Firebase user...');
      const cred = await window.createUserWithEmailAndPassword(window.auth, email, password);
      console.log('[SIGNUP] User created with UID:', cred.user.uid);
      
      // Save user doc (ALREADY VERIFIED - skip OTP)
      console.log('[SIGNUP] Saving user doc to Firestore...');
      await window.setDoc(window.doc(window.db, 'users', cred.user.uid), {
        name, 
        email, 
        emailVerified: true,  // ← AUTO-VERIFIED, NO OTP NEEDED
        createdAt: new Date().toISOString()
      });
      console.log('[SIGNUP] User doc saved ✅');

      authMessage.innerHTML = '<p class="text-green-600">✅ Account created! Logging you in...</p>';
      
      // Auto-login after 1 second
      setTimeout(() => {
        authMessage.innerHTML = '';
      }, 1000);

    } catch (err) {
      console.error('[SIGNUP] ERROR:', err);
      let msg = err.message;
      if (err.code === 'auth/email-already-in-use') msg = '❌ Email already in use.';
      if (err.code === 'auth/invalid-email')         msg = '❌ Invalid email format.';
      if (err.code === 'auth/weak-password')         msg = '❌ Password is too weak.';
      authMessage.innerHTML = `<p class="text-red-500">${msg}</p>`;
    }
  });

  // ── OTP Input Auto-Advance ────────────────────────────────────
  document.addEventListener('input', e => {
    if (!e.target.classList.contains('otp-digit')) return;
    
    const input = e.target;
    const val = input.value;
    
    // Only allow digits
    if (!/^\d$/.test(val)) {
      input.value = '';
      return;
    }
    
    // Move to next input
    const index = parseInt(input.dataset.index);
    if (index < 5) {
      const next = document.querySelector(`.otp-digit[data-index="${index + 1}"]`);
      next?.focus();
    }
    
    // Hide errors when user types
    otpError?.classList.add('hidden');
  });

  // Backspace handling
  document.addEventListener('keydown', e => {
    if (!e.target.classList.contains('otp-digit')) return;
    if (e.key !== 'Backspace') return;
    
    const input = e.target;
    const index = parseInt(input.dataset.index);
    
    if (input.value === '' && index > 0) {
      e.preventDefault();
      const prev = document.querySelector(`.otp-digit[data-index="${index - 1}"]`);
      prev?.focus();
      prev && (prev.value = '');
    }
  });

  // ── Verify OTP ────────────────────────────────────────────────
  btnVerifyOtp?.addEventListener('click', async () => {
    if (!pendingOtpData) return;
    
    // Collect OTP digits
    const digits = Array.from(document.querySelectorAll('.otp-digit')).map(inp => inp.value);
    const enteredOtp = digits.join('');
    
    if (enteredOtp.length !== 6) {
      otpError.textContent = '❌ Please enter all 6 digits';
      otpError.classList.remove('hidden');
      return;
    }
    
    btnVerifyOtp.textContent = 'Verifying...';
    btnVerifyOtp.disabled = true;
    otpError.classList.add('hidden');
    
    try {
      const isValid = await verifyOtpFromFirestore(pendingOtpData.uid, enteredOtp);
      
      if (isValid) {
        // Mark user as verified
        await window.updateDoc(window.doc(window.db, 'users', pendingOtpData.uid), {
          emailVerified: true
        });
        
        otpSuccess.classList.remove('hidden');
        speak('Yay! Your email is verified! You can now log in!');
        
        setTimeout(() => {
          otpVerifyScreen.classList.add('hidden');
          otpSuccess.classList.add('hidden');
          btnLogin.click();
          authMessage.innerHTML = '<p class="text-green-600">✅ Email verified! Please log in.</p>';
          
          // Clear OTP inputs
          document.querySelectorAll('.otp-digit').forEach(inp => inp.value = '');
        }, 2000);
        
      } else {
        otpError.textContent = '❌ Invalid or expired code';
        otpError.classList.remove('hidden');
        
        // Shake animation
        const container = document.getElementById('otp-inputs-container');
        container.style.animation = 'shake 0.4s ease';
        setTimeout(() => container.style.animation = '', 400);
      }
      
    } catch (err) {
      console.error('Verify error:', err);
      otpError.textContent = '❌ Verification failed. Try again.';
      otpError.classList.remove('hidden');
    } finally {
      btnVerifyOtp.textContent = 'Verify Code 🔐';
      btnVerifyOtp.disabled = false;
    }
  });

  // ── Resend OTP ────────────────────────────────────────────────
  btnResendOtp?.addEventListener('click', async () => {
    if (!pendingOtpData) return;
    
    btnResendOtp.textContent = 'Sending...';
    btnResendOtp.disabled = true;
    
    try {
      const newOtp = generateOtp();
      await storeOtpInFirestore(pendingOtpData.uid, pendingOtpData.email, newOtp);
      
      const sent = await sendOtpEmail(pendingOtpData.email, newOtp, pendingOtpData.name);
      
      if (!sent) {
        console.log('📧 NEW OTP FOR TESTING:', newOtp);
      }
      
      authMessage.innerHTML = '<p class="text-green-600">✅ New code sent!</p>';
      setTimeout(() => authMessage.innerHTML = '', 3000);
      
    } catch (err) {
      authMessage.innerHTML = '<p class="text-red-500">⚠️ Failed to resend. Try again.</p>';
    } finally {
      btnResendOtp.textContent = "Didn't get it? Resend code";
      btnResendOtp.disabled = false;
    }
  });

  // ── Cancel OTP (back to signup) ───────────────────────────────
  btnCancelOtp?.addEventListener('click', () => {
    otpVerifyScreen.classList.add('hidden');
    signupForm.classList.remove('hidden');
    document.querySelectorAll('.otp-digit').forEach(inp => inp.value = '');
    otpError.classList.add('hidden');
    otpSuccess.classList.add('hidden');
    pendingOtpData = null;
  });

  // ── Log in (NO VERIFICATION CHECK) ───────────────────────────
  loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    authMessage.innerHTML = '<p class="text-purple-500">Logging in... 🚀</p>';
    const email    = $('login-email')?.value.trim();
    const password = $('login-password')?.value;
    
    try {
      await window.signInWithEmailAndPassword(window.auth, email, password);
      loginForm.reset();
      authMessage.innerHTML = '';
      
    } catch (err) {
      let msg = 'Something went wrong.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')
        msg = '❌ Invalid email or password.';
      if (err.code === 'auth/invalid-email') msg = '❌ Invalid email.';
      authMessage.innerHTML = `<p class="text-red-500">${msg}</p>`;
    }
  });

  // ── Logout ────────────────────────────────────────────────────
  const doLogout = async () => { try { await window.signOut(window.auth); } catch(e) {} };
  btnLogout?.addEventListener('click', doLogout);
  btnLogoutBottom?.addEventListener('click', doLogout);

  // ── Auth state ────────────────────────────────────────────────
  waitForFirebase(() => {
    window.onAuthStateChanged(window.auth, user => {
      if (user) {
        $('auth-section')?.classList.add('hidden');
        loggedInView?.classList.remove('hidden');
        userEmailSpan.textContent = user.email;
        showView('child-section');
        loadChildren(user.uid);
        
        // Show assessment test section (for development)
        $('assessment-test-section')?.classList.remove('hidden');
      } else {
        $('auth-section')?.classList.remove('hidden');
        loggedInView?.classList.add('hidden');
        authMessage.innerHTML = '';
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ASSESSMENT AGENT TEST BUTTON (Development)
  // ═══════════════════════════════════════════════════════════
  
  $('btn-run-assessment')?.addEventListener('click', async () => {
    const resultsDiv = $('assessment-results');
    
    console.log('[ASSESSMENT TEST] Current child:', currentChild);
    
    if (!currentChild) {
      resultsDiv.innerHTML = '<p class="text-red-600 font-bold">⚠️ Please select a child first (enter PIN)</p>';
      return;
    }
    
    console.log('[ASSESSMENT TEST] Running analysis for child ID:', currentChild.id);
    console.log('[ASSESSMENT TEST] Child name:', currentChild.name);
    
    resultsDiv.innerHTML = '<p class="text-blue-600 font-bold">🔄 Analyzing... Please wait...</p>';
    
    try {
      const insights = await generateInsights(currentChild.id);
      
      // Display results
      let html = `
        <div class="space-y-3">
          <div class="p-3 bg-white rounded-xl border border-blue-200">
            <p class="font-bold text-blue-700 mb-2">📋 Summary:</p>
            <p class="text-gray-700">${insights.summary}</p>
          </div>
      `;
      
      if (insights.recommendations.length > 0) {
        html += `
          <div class="p-3 bg-white rounded-xl border border-blue-200">
            <p class="font-bold text-blue-700 mb-2">💡 Recommendations:</p>
            <ul class="space-y-2">
        `;
        insights.recommendations.forEach(rec => {
          const priorityColor = rec.priority === 'high' ? 'text-red-600' : 'text-gray-600';
          html += `
            <li class="flex items-start gap-2">
              <span class="text-lg">${rec.icon}</span>
              <span class="${priorityColor} text-sm">${rec.message}</span>
            </li>
          `;
        });
        html += `</ul></div>`;
      }
      
      if (insights.topMistakes.length > 0) {
        html += `
          <div class="p-3 bg-white rounded-xl border border-red-200">
            <p class="font-bold text-red-700 mb-2">🎯 Top Repeated Mistakes:</p>
            <ul class="space-y-1 text-sm">
        `;
        insights.topMistakes.slice(0, 3).forEach(mistake => {
          html += `
            <li class="text-gray-700">
              <strong>${mistake.question.substring(0, 50)}...</strong>
              <br><span class="text-xs text-gray-500">Wrong ${mistake.frequency} times • ${mistake.conceptGap}</span>
            </li>
          `;
        });
        html += `</ul>`;

        // Practice button: launches a re-quiz session targeting the subject with the most mistakes.
        // Disabled for toddlers (deferred to Stage 5).
        if (!isToddlerMode(currentChild)) {
          html += `
            <button id="btn-launch-practice"
              class="mt-3 w-full bg-gradient-to-r from-orange-400 to-amber-500 hover:from-orange-500 hover:to-amber-600 text-white font-bold py-2 px-4 rounded-xl shadow-md transition-all">
              🎯 Practice with ${currentChild.name}
            </button>
          `;
        }
        html += `</div>`;
      }
      
      // Format performance data as nice tables instead of JSON
      const perf = insights.performance;
      if (perf.totalSessions > 0) {
        html += `
          <div class="p-3 bg-white rounded-xl border border-green-200">
            <p class="font-bold text-green-700 mb-3">📊 Detailed Performance:</p>
            
            <!-- Overall Stats -->
            <div class="mb-3 p-2 bg-green-50 rounded-lg">
              <div class="text-sm text-gray-700">
                <strong>Total Sessions:</strong> ${perf.totalSessions} | 
                <strong>Overall Accuracy:</strong> ${perf.overall.accuracy}% | 
                <strong>Trend:</strong> ${perf.overall.trend}
              </div>
            </div>
            
            <!-- Subject Breakdown Table -->
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-200">
                  <th class="text-left py-2 text-gray-700">Subject</th>
                  <th class="text-center py-2 text-gray-700">Sessions</th>
                  <th class="text-center py-2 text-gray-700">Accuracy</th>
                  <th class="text-center py-2 text-gray-700">Status</th>
                  <th class="text-center py-2 text-gray-700">Trend</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        for (const [subject, data] of Object.entries(perf.subjects)) {
          const statusEmoji = data.status === 'strong' ? '💪' : 
                             data.status === 'struggling' ? '⚠️' : '📝';
          const statusColor = data.status === 'strong' ? 'text-green-600' : 
                             data.status === 'struggling' ? 'text-red-600' : 'text-gray-600';
          const trendEmoji = data.trend === 'improving' ? '📈' : 
                            data.trend === 'declining' ? '📉' : '➡️';
          
          const subjectName = SUBJECT_META[subject]?.label || subject;
          const subjectIcon = SUBJECT_META[subject]?.icon || '📚';
          
          html += `
            <tr class="border-b border-gray-100 hover:bg-gray-50">
              <td class="py-2">${subjectIcon} ${subjectName}</td>
              <td class="text-center">${data.totalSessions}</td>
              <td class="text-center font-bold ${statusColor}">${data.accuracy}%</td>
              <td class="text-center">${statusEmoji} ${data.status}</td>
              <td class="text-center">${trendEmoji} ${data.trend}</td>
            </tr>
          `;
        }
        
        html += `
              </tbody>
            </table>
          </div>
        `;
      }
      
      // Achievements strip placeholder — populated async after innerHTML below
      html += `
        <div class="p-3 bg-white rounded-xl border border-amber-200">
          <p class="font-bold text-amber-700 mb-2">🏆 Achievements</p>
          <div id="dashboard-badge-strip" class="badge-strip">
            <span class="text-xs text-gray-500">Loading...</span>
          </div>
        </div>
      `;

      html += `</div>`;

      resultsDiv.innerHTML = html;

      // Populate the achievements strip
      try {
        const stripEl = document.getElementById('dashboard-badge-strip');
        if (stripEl) {
          const earned = await getEarnedBadges(currentChild.id);
          if (earned.length === 0) {
            stripEl.innerHTML = `<span class="text-xs text-gray-500 italic">No badges earned yet — keep playing!</span>`;
          } else {
            stripEl.innerHTML = earned.map(b => `
              <span class="badge-strip-item" title="${b.description}">
                <span class="badge-strip-icon">${b.icon}</span>
                <span>${b.name}</span>
              </span>
            `).join('') + `<span class="text-xs text-gray-500 ml-2">${earned.length} of ${BADGE_DEFINITIONS.length}</span>`;
          }
        }
      } catch (e) {
        console.warn('[BADGES] Could not render dashboard strip:', e);
      }

      // Wire up the practice button (if it was rendered).
      // We use document.getElementById since it's inside dynamically-inserted HTML.
      const practiceBtn = document.getElementById('btn-launch-practice');
      if (practiceBtn) {
        practiceBtn.addEventListener('click', () => {
          // Close insights panel and switch into child mode to run the re-quiz
          showView('child-welcome');
          renderStatsStrip();
          renderSubjectPicker();
          // Launch re-quiz on the subject with the most mistakes (auto-picked)
          startRequizSession();
        });
      }

    } catch (error) {
      resultsDiv.innerHTML = `<p class="text-red-600 font-bold">❌ Error: ${error.message}</p>`;
      console.error('[ASSESSMENT TEST] Error:', error);
    }
  });

  // ── View manager ─────────────────────────────────────────────
  const VIEWS = ['child-section', 'parent-dashboard', 'child-welcome', 'learning-session', 'badge-collection-view'];
  function showView(id) {
    VIEWS.forEach(v => $(v)?.classList.add('hidden'));
    $(id)?.classList.remove('hidden');
    // Show logout button only on child-section (parent view)
    if (logoutRow) {
      logoutRow.classList.toggle('hidden', id !== 'child-section');
    }
  }

  // ── Add child ────────────────────────────────────────────────
  btnAddChild?.addEventListener('click', async () => {
    formWrapper.classList.remove('hidden');
    btnAddChild.classList.add('hidden');
    childMessage.innerHTML = '';
    // Make sure voice dropdown shows latest voices
    await loadParentVoices();
    refreshChildVoiceDropdown();
  });

  btnCancelChild?.addEventListener('click', () => {
    formWrapper.classList.add('hidden');
    btnAddChild.classList.remove('hidden');
    formAddChild.reset();
    childMessage.innerHTML = '';
  });

  // Toggle "Other" interest input
  $('interest-other-checkbox')?.addEventListener('change', (e) => {
    const otherInput = $('interest-other-input');
    if (e.target.checked) {
      otherInput.classList.remove('hidden');
      otherInput.focus();
    } else {
      otherInput.classList.add('hidden');
      otherInput.value = '';
    }
  });

  // Auto-tick the toddler-mode checkbox based on age (parent can still toggle)
  $('child-age')?.addEventListener('input', (e) => {
    const age = parseInt(e.target.value);
    const cb = $('child-toddler-mode');
    if (cb && !isNaN(age)) {
      cb.checked = age >= 2 && age <= 5;
    }
  });

  formAddChild?.addEventListener('submit', async e => {
    e.preventDefault();
    const name      = $('child-name')?.value.trim();
    const ageStr    = $('child-age')?.value;
    const pin       = $('child-pin')?.value.trim();
    const interests = [];
    
    // Collect checked interests
    document.querySelectorAll('input[name="interests"]:checked').forEach(cb => {
      if (cb.value === 'other') {
        // Get custom interest from text input
        const customInterest = $('interest-other-input')?.value.trim();
        if (customInterest) {
          interests.push(customInterest.toLowerCase());
        }
      } else {
        interests.push(cb.value);
      }
    });
    
    const age = parseInt(ageStr);

    console.log('[ADD CHILD] Form submitted:', { name, age, pin, interests });

    if (!name || isNaN(age) || age < 2 || age > 12 || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      childMessage.innerHTML = '<p class="text-red-500">⚠️ Please fill all fields correctly.</p>';
      console.error('[ADD CHILD] Validation failed');
      return;
    }
    try {
      const uid = window.auth.currentUser?.uid;
      console.log('[ADD CHILD] Current user UID:', uid);
      
      if (!uid) throw new Error('Not signed in');
      
      const ref = window.doc(window.collection(window.db, `users/${uid}/children`));
      console.log('[ADD CHILD] Firestore path:', `users/${uid}/children/${ref.id}`);
      
      // Read selected voice from dropdown (empty string = default browser TTS)
      const selectedVoiceId = $('child-voice')?.value || null;

      // Read the toddler-mode checkbox.
      // We save the explicit boolean so isToddlerMode() respects the parent's choice.
      const toddlerModeOverride = !!$('child-toddler-mode')?.checked;

      // Read the speech-to-text checkbox (Toddler Mode only feature).
      // Default OFF — parent must opt in. Even when ON, voice never blocks tap-to-answer.
      const voiceAnswersEnabled = !!$('child-voice-answers')?.checked;

      await window.setDoc(ref, {
        name, age, interests, pin,
        createdAt: new Date().toISOString(),
        level: 1,
        subjects: {},
        selectedVoiceId,
        toddlerModeOverride,
        voiceAnswersEnabled
      });
      
      console.log('[ADD CHILD] Child document saved ✅');
      childMessage.innerHTML = '<p class="text-green-600">✅ Child added!</p>';
      formAddChild.reset();
      formWrapper.classList.add('hidden');
      btnAddChild.classList.remove('hidden');
      loadChildren(uid);
      window.showBadge?.('New learner added! 🎉');
    } catch (err) {
      console.error('[ADD CHILD] ERROR:', err);
      childMessage.innerHTML = `<p class="text-red-500">Error: ${err.message}</p>`;
    }
  });

  // ── Load children list ────────────────────────────────────────
  const AVATAR_COLORS = [
    { bg: 'linear-gradient(135deg,#c4b5fd,#7c3aed)', text: '#fff' },
    { bg: 'linear-gradient(135deg,#fdba74,#f97316)', text: '#fff' },
    { bg: 'linear-gradient(135deg,#86efac,#16a34a)', text: '#fff' },
    { bg: 'linear-gradient(135deg,#7dd3fc,#0284c7)', text: '#fff' },
    { bg: 'linear-gradient(135deg,#f9a8d4,#ec4899)', text: '#fff' },
  ];
  const AVATAR_EMOJIS = ['🦁','🐼','🦊','🐨','🐸','🐯','🦄','🐧','🐥','🦋'];

  async function loadChildren(uid) {
    if (!uid || !childrenList) {
      console.error('[LOAD CHILDREN] Missing UID or childrenList element');
      return;
    }
    console.log('[LOAD CHILDREN] Loading for UID:', uid);
    childrenList.innerHTML = '<p class="text-gray-400 text-center font-bold">Loading...</p>';
    try {
      const path = `users/${uid}/children`;
      console.log('[LOAD CHILDREN] Firestore path:', path);
      const snap = await window.getDocs(window.collection(window.db, path));
      console.log('[LOAD CHILDREN] Query result - empty?', snap.empty, 'size:', snap.size);
      
      childrenList.innerHTML = '';
      if (snap.empty) {
        console.log('[LOAD CHILDREN] No children found');
        childrenList.innerHTML = `
          <div class="text-center py-8">
            <div class="text-5xl mb-3">👧🧒</div>
            <p class="text-gray-400 font-bold">No kids added yet!</p>
            <p class="text-gray-400 text-sm">Tap "+ Add Child" to get started</p>
          </div>`;
        return;
      }
      let idx = 0;
      snap.forEach(docSnap => {
        const data = docSnap.data();
        console.log('[LOAD CHILDREN] Child doc:', docSnap.id, data);
        const av   = AVATAR_COLORS[idx % AVATAR_COLORS.length];
        const em   = AVATAR_EMOJIS[idx % AVATAR_EMOJIS.length];
        idx++;

        const card = document.createElement('div');
        card.className = 'child-card';
        card.dataset.childId = docSnap.id;

        const subjectLevels = Object.entries(data.subjects || {})
          .map(([k, v]) => `<span class="level-pill">${SUBJECT_META[k]?.icon || '📖'} Lv${v}</span>`)
          .join('');

        // Settings button is only shown for children currently in Toddler Mode,
        // because the settings modal only controls toddler-specific things:
        //   - Toddler Mode override (off-toggle for older overridden children)
        //   - Voice answers (Toddler Mode only feature)
        // For non-toddler children, this button is just clutter, so we hide it.
        // isToddlerMode() correctly covers age 2-5 AND any older child the parent
        // explicitly set with toddlerModeOverride=true (so they can turn it off again).
        const showSettings = isToddlerMode(data);

        card.innerHTML = `
          <div class="flex items-center gap-4">
            <div class="avatar" style="background:${av.bg}; color:${av.text}">
              ${em}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <p class="font-bold text-gray-800 text-lg truncate">${data.name}</p>
                <div class="flex items-center gap-2">
                  <button class="view-dashboard-btn bg-gradient-to-r from-purple-400 to-pink-400 text-white px-3 py-1 rounded-full text-xs font-bold hover:shadow-lg transition hover:scale-105"
                          data-child-id="${docSnap.id}" data-child-name="${data.name}"
                          title="View Dashboard">📊 Dashboard</button>
                  ${showSettings ? `
                  <button class="edit-child-btn text-gray-400 hover:text-purple-500 text-xl transition flex-shrink-0"
                          data-child-id="${docSnap.id}"
                          title="Toddler Settings">⚙️</button>
                  ` : ''}
                  <button class="delete-child-btn text-gray-300 hover:text-red-400 text-xl transition flex-shrink-0"
                          data-child-id="${docSnap.id}" data-child-name="${data.name}"
                          title="Remove">🗑️</button>
                </div>
              </div>
              <p class="text-sm text-gray-500 font-semibold">Age ${data.age} · Level ${data.level || 1}</p>
              ${subjectLevels ? `<div class="flex flex-wrap gap-1 mt-2">${subjectLevels}</div>` : ''}
            </div>
          </div>
          <div class="absolute right-4 top-1/2 -translate-y-1/2 text-purple-200 text-xl pointer-events-none">▶</div>
        `;

        card.addEventListener('click', e => {
          // Check if dashboard button was clicked
          if (e.target.classList.contains('view-dashboard-btn') || e.target.closest('.view-dashboard-btn')) {
            e.stopPropagation();
            const btn = e.target.closest('.view-dashboard-btn');
            openParentDashboard(btn.dataset.childId, btn.dataset.childName, data.age, data.subjects);
            return;
          }
          // Check if edit/settings button was clicked
          if (e.target.classList.contains('edit-child-btn') || e.target.closest('.edit-child-btn')) {
            e.stopPropagation();
            openChildSettingsModal(docSnap.id, data);
            return;
          }
          // Check if delete button was clicked
          if (e.target.classList.contains('delete-child-btn') || e.target.closest('.delete-child-btn')) return;
          // Otherwise open PIN modal for learning. Pass the full doc data so all fields
          // (including new ones like voiceAnswersEnabled, toddlerModeOverride) flow through.
          openPinModal(docSnap.id, data);
        });

        childrenList.appendChild(card);
      });
      console.log('[LOAD CHILDREN] Rendered', idx, 'child cards ✅');
    } catch (err) {
      console.error('[LOAD CHILDREN] ERROR:', err);
      childrenList.innerHTML = '<p class="text-red-400 text-center font-bold">Error loading profiles.</p>';
    }
  }

  // ── Delete flow ───────────────────────────────────────────────
  document.addEventListener('click', e => {
    const deleteBtn = e.target.closest('.delete-child-btn');
    if (deleteBtn) {
      e.stopPropagation();
      childToDeleteId = deleteBtn.dataset.childId;
      deleteChildName.textContent = deleteBtn.dataset.childName;
      deleteModal.classList.remove('hidden');
    }
  });

  btnConfirmDelete?.addEventListener('click', async () => {
    if (!childToDeleteId) return;
    try {
      const uid = window.auth.currentUser?.uid;
      await window.deleteDoc(window.doc(window.db, `users/${uid}/children`, childToDeleteId));
      deleteModal.classList.add('hidden');
      childToDeleteId = null;
      loadChildren(uid);
      childMessage.innerHTML = '<p class="text-green-600">Profile removed.</p>';
      setTimeout(() => childMessage.innerHTML = '', 4000);
    } catch (err) {
      console.error(err);
    }
  });

  btnCancelDelete?.addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    childToDeleteId = null;
  });

  // ── Child Settings Modal ──────────────────────────────────────
  // Lets the parent toggle Toddler Mode and Voice Answers on an EXISTING child
  // without having to re-add them. This is also a backfill path for older child
  // documents that predate these fields (they show up as unchecked, and saving
  // writes the explicit boolean to Firestore).

  let _settingsChildId = null; // which child the open settings modal applies to

  function openChildSettingsModal(childId, data) {
    _settingsChildId = childId;
    $('settings-child-name').textContent = data.name || 'this child';
    // Pre-fill checkboxes from current data (treat undefined as false explicitly)
    $('settings-toddler-mode').checked   = !!data.toddlerModeOverride;
    $('settings-voice-answers').checked  = !!data.voiceAnswersEnabled;
    $('child-settings-modal').classList.remove('hidden');
  }

  function closeChildSettingsModal() {
    $('child-settings-modal').classList.add('hidden');
    _settingsChildId = null;
  }

  $('btn-cancel-settings')?.addEventListener('click', closeChildSettingsModal);

  $('btn-save-settings')?.addEventListener('click', async () => {
    if (!_settingsChildId) { closeChildSettingsModal(); return; }
    const uid = window.auth?.currentUser?.uid;
    if (!uid) { closeChildSettingsModal(); return; }

    const newToddlerOverride = !!$('settings-toddler-mode').checked;
    const newVoiceAnswers    = !!$('settings-voice-answers').checked;

    try {
      const childRef = window.doc(window.db, `users/${uid}/children`, _settingsChildId);
      await window.updateDoc(childRef, {
        toddlerModeOverride: newToddlerOverride,
        voiceAnswersEnabled: newVoiceAnswers
      });
      window.showBadge?.('✅ Settings saved');
      closeChildSettingsModal();
      // Refresh the child list so any UI tied to these fields updates
      loadChildren(uid);
    } catch (err) {
      console.error('[SETTINGS] Failed to update child:', err);
      window.showBadge?.('⚠️ Could not save settings');
    }
  });

  // ── PIN Modal (custom numpad) ─────────────────────────────────
  function openPinModal(childId, data) {
    // Unpack data with safe defaults — keeps support for existing children whose
    // documents predate newer fields (voiceAnswersEnabled, toddlerModeOverride).
    const childName       = data.name;
    const storedPin       = data.pin;
    const age             = data.age;
    const interests       = data.interests;
    const level           = data.level;
    const subjects        = data.subjects;
    const selectedVoiceId = data.selectedVoiceId || null;

    pinBuffer = '';
    pinError.classList.add('hidden');
    updatePinDots();
    pinForChild.textContent = childName;
    pinModal.classList.remove('hidden');

    function verify() {
      if (pinBuffer === storedPin) {
        pinModal.classList.add('hidden');
        // Build currentChild from the FULL document data so newer fields
        // (voiceAnswersEnabled, toddlerModeOverride, etc.) propagate correctly.
        currentChild = {
          id: childId,
          name: childName,
          age,
          interests,
          level,
          subjects: subjects || {},
          selectedVoiceId,
          voiceAnswersEnabled: !!data.voiceAnswersEnabled,
          toddlerModeOverride: data.toddlerModeOverride
        };

        console.log('[CHILD LOGIN] Child selected:', childName);
        console.log('[CHILD LOGIN] Child ID:', childId);
        console.log('[CHILD LOGIN] Age:', age);
        console.log('[CHILD LOGIN] Subjects data loaded:', subjects);
        console.log('[CHILD LOGIN] Selected voice:', selectedVoiceId || 'default browser TTS');
        console.log('[CHILD LOGIN] Voice answers enabled?', currentChild.voiceAnswersEnabled);
        console.log('[CHILD LOGIN] Toddler mode override:', currentChild.toddlerModeOverride);
        console.log('[CHILD LOGIN] Current child object:', currentChild);
        
        // Make sure parent voices are loaded so speak() can find this child's voice.
        // Also load the master ElevenLabs toggle state so we know whether to use
        // the AI voice or fall back to browser TTS.
        (async () => {
          await loadElevenLabsToggle();
          // Always fetch the preset list so speak() can find preset_* voices.
          if (!presetVoices.length) {
            await fetchAvailablePresetVoices();
          }
          if (selectedVoiceId && !selectedVoiceId.startsWith('preset_') && !parentVoices.length) {
            await loadParentVoices();
          }
          speak(`Welcome back, ${childName}! Let's learn something fun today!`);
        })();
        enterChildWelcome();
      } else {
        pinError.classList.remove('hidden');
        pinBuffer = '';
        updatePinDots();
        // shake effect
        const card = pinModal.querySelector('.modal-card');
        card.style.animation = 'none';
        card.offsetHeight;
        card.style.animation = 'shake 0.4s ease';
      }
    }

    $('pin-pad').onclick = e => {
      const k = e.target.closest('.pin-key')?.dataset.k;
      if (!k) return;
      if (k === 'back') { pinBuffer = pinBuffer.slice(0, -1); }
      else if (k === 'ok') { if (pinBuffer.length === 4) verify(); }
      else if (pinBuffer.length < 4) { pinBuffer += k; }
      updatePinDots();
      if (pinBuffer.length === 4 && k !== 'ok') setTimeout(verify, 200);
    };

    btnCancelPin.onclick = () => {
      pinModal.classList.add('hidden');
      pinBuffer = '';
    };
  }

  function updatePinDots() {
    for (let i = 0; i < 4; i++) {
      const dot = $(`pd-${i}`);
      if (dot) dot.classList.toggle('filled', i < pinBuffer.length);
    }
  }

  // ── Child Welcome screen ──────────────────────────────────────
  function enterChildWelcome() {
    childNameWelcome.textContent = currentChild.name;
    showView('child-welcome');
    renderStatsStrip();
    renderSubjectPicker();
  }

  function renderStatsStrip() {
    if (!childStatsStrip) return;
    
    // Calculate streak from sessions
    calculateStreak(currentChild.id).then(streak => {
      const totalSessions = currentChild.totalSessions || 0;
      childStatsStrip.innerHTML = `
        <div class="flex items-center gap-2 bg-yellow-100 border-2 border-yellow-300 rounded-2xl px-4 py-2">
          <span class="text-xl">🔥</span>
          <span class="font-bold text-yellow-700 text-sm">${streak} day streak</span>
        </div>
        <div class="flex items-center gap-2 bg-purple-100 border-2 border-purple-200 rounded-2xl px-4 py-2">
          <span class="text-xl">⭐</span>
          <span class="font-bold text-purple-700 text-sm">Level ${currentChild.level || 1}</span>
        </div>
      `;
    });
  }

  // Calculate current streak (consecutive days with sessions)
  async function calculateStreak(childId) {
    try {
      const sessions = await getRecentSessions(childId, 365); // Get all sessions
      if (sessions.length === 0) return 0;

      // Sort sessions by date (newest first)
      const sortedSessions = sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      // Get unique dates (only count one session per day)
      const uniqueDates = [...new Set(sortedSessions.map(s => new Date(s.date).toDateString()))];
      
      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Check each day going backwards from today
      for (let i = 0; i < uniqueDates.length; i++) {
        const sessionDate = new Date(uniqueDates[i]);
        sessionDate.setHours(0, 0, 0, 0);
        
        const daysDiff = Math.floor((today - sessionDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === i) {
          streak++;
        } else {
          break; // Streak is broken
        }
      }
      
      return streak;
    } catch (error) {
      console.error('[STREAK] Error calculating streak:', error);
      return 0;
    }
  }

  async function renderSubjectPicker() {
    subjectPicker.innerHTML = '';
    const group = currentChild.age <= 5 ? 'beginner' : currentChild.age <= 8 ? 'intermediate' : 'advanced';
    // Toddler Mode (auto for age 2-5 or parent override) → only show 4 visualizable subjects.
    // Otherwise: advanced gets computer_modern_tech, others get general_knowledge.
    const subs = isToddlerMode(currentChild)
      ? TODDLER_SUBJECTS
      : (group === 'advanced'
          ? ['maths','english','science','computer_modern_tech']
          : ['maths','english','science','general_knowledge']);

    subs.forEach(sub => {
      const meta = SUBJECT_META[sub];
      const btn  = document.createElement('button');
      btn.className = 'subject-btn';
      const subLevel = currentChild.subjects?.[sub] || 1;
      btn.style.cssText = `background:${meta.bg}; box-shadow: 0 6px 0 ${meta.shadow}, 0 10px 24px ${meta.shadow}44; color:white;`;
      btn.innerHTML = `
        <span class="subj-icon">${meta.icon}</span>
        <span>${meta.label}</span>
        <span style="font-size:0.75rem;opacity:0.85;font-family:'Nunito',sans-serif;font-weight:800;">Level ${subLevel}</span>
      `;
      btn.addEventListener('click', () => {
        selectedSubject = sub;
        startSession();
      });
      subjectPicker.appendChild(btn);
    });

    // ─── Practice tile: appears only if there are unresolved mistakes ───
    // Toddler mode doesn't get a practice tile (deferred to Stage 5).
    if (!isToddlerMode(currentChild)) {
      try {
        const counts = await getMistakeCountsBySubject(currentChild.id);
        const totalMistakes = Object.values(counts).reduce((a, b) => a + b, 0);

        if (totalMistakes > 0) {
          // Pick the subject with the most mistakes for the launch
          const targetSubject = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
          const targetMeta = SUBJECT_META[targetSubject];

          const practiceBtn = document.createElement('button');
          practiceBtn.className = 'subject-btn practice-tile';
          practiceBtn.style.cssText = `background: linear-gradient(135deg, #fb923c, #f59e0b); box-shadow: 0 6px 0 #c2410c, 0 10px 24px #c2410c44; color: white;`;
          practiceBtn.innerHTML = `
            <span class="subj-icon">🎯</span>
            <span>Practice Tricky Questions</span>
            <span style="font-size:0.75rem;opacity:0.95;font-family:'Nunito',sans-serif;font-weight:800;">
              ${totalMistakes} to practice · starts with ${targetMeta?.label || targetSubject}
            </span>
          `;
          practiceBtn.addEventListener('click', () => {
            startRequizSession(targetSubject);
          });
          subjectPicker.appendChild(practiceBtn);
        }
      } catch (err) {
        // If the mistakes query fails for any reason, just silently skip the practice tile.
        // The regular subject buttons still work.
        console.warn('[REQUIZ] Could not load practice tile:', err);
      }
    }
  }

  btnBackToParent?.addEventListener('click', () => {
    showView('child-section');
    loadChildren(window.auth.currentUser?.uid);
  });

  // ── Badge collection view ────────────────────────────────────
  /**
   * Render the My Badges grid for the current child.
   * Shows all 8 badges; earned ones in color, locked ones greyed out.
   */
  async function renderBadgeCollection() {
    const gridEl = document.getElementById('badge-collection-grid');
    const countEl = document.getElementById('badge-count-display');
    if (!gridEl || !currentChild) return;

    // Load earned badges
    const earnedList = await getEarnedBadges(currentChild.id);
    const earnedIds = new Set(earnedList.map(b => b.id));

    // Update header count
    if (countEl) {
      countEl.textContent = `${earnedIds.size} of ${BADGE_DEFINITIONS.length} earned`;
    }

    // Render every defined badge: earned first (sorted by earnedAt desc), then locked
    const earnedSorted = BADGE_DEFINITIONS.filter(b => earnedIds.has(b.id))
      .map(b => ({ ...b, earnedAt: earnedList.find(e => e.id === b.id)?.earnedAt }))
      .sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));
    const lockedList = BADGE_DEFINITIONS.filter(b => !earnedIds.has(b.id));
    const ordered = [...earnedSorted, ...lockedList];

    gridEl.innerHTML = ordered.map(b => {
      const isEarned = earnedIds.has(b.id);
      const statusText = isEarned
        ? `✓ Earned ${b.earnedAt ? new Date(b.earnedAt).toLocaleDateString() : ''}`
        : '🔒 Locked';
      return `
        <div class="badge-tile ${isEarned ? 'earned' : 'locked'}">
          <div class="badge-tile-icon">${b.icon}</div>
          <div class="badge-tile-name">${b.name}</div>
          <div class="badge-tile-desc">${b.description}</div>
          <div class="badge-tile-status">${statusText}</div>
        </div>
      `;
    }).join('');
  }

  // Open My Badges from child welcome
  document.getElementById('btn-my-badges')?.addEventListener('click', async () => {
    showView('badge-collection-view');
    await renderBadgeCollection();
  });

  // Back from badges → child welcome
  document.getElementById('btn-back-from-badges')?.addEventListener('click', () => {
    showView('child-welcome');
  });

  // ── Session start ─────────────────────────────────────────────
  async function startSession() {
    // Initialize session tracking
    sessionStartTime = Date.now();
    totalHintsUsed = 0;
    totalPauses = 0;
    
    currentQuestionIndex = 0;
    score = 0;
    consecutiveCorrect = 0;
    resetSpeechToTextSession(); // clear voice-answer failed-attempt counter for the new session
    resetSessionUI();
    showView('learning-session');

    const meta = SUBJECT_META[selectedSubject];
    $('session-subject-icon').textContent = meta.icon + ' ';
    $('session-subject-name').textContent = meta.label;
    updateScoreDisplay();

    // ─── Show a friendly loading state while questions are being generated ───
    // The LLM call typically takes 2-5 seconds. Showing a bouncing thinking
    // emoji turns the wait into part of the experience instead of dead time.
    feedback.innerHTML = `
      <div class="llm-loading">
        <div class="llm-loading-emoji">🤔</div>
        <div class="llm-loading-text">
          Buddy is making your questions<span class="llm-loading-dots"></span>
        </div>
      </div>
    `;
    // Hide the options container while loading (it's empty anyway, but this
    // ensures any stale content from a previous session doesn't show)
    optionsContainer.innerHTML = '';

    sessionQuestions = await getSessionQuestions(currentChild, selectedSubject);

    // Clear the loading state — showQuestion() will populate properly
    feedback.innerHTML = '';

    if (!sessionQuestions.length) {
      feedback.innerHTML = '<p class="text-red-500 font-bold">⚠️ Couldn\'t load questions. Check your questions folder!</p>';
      return;
    }

    // Show notification about question source / session type
    if (window.requizSession) {
      window.showBadge?.('🎯 Practice session — focusing on tricky concepts!');
    } else if (window.sessionQuestionSource === 'llm') {
      window.showBadge?.('🤖 AI is creating personalized questions for you!');
    } else {
      window.showBadge?.('📚 Loading questions from question bank');
    }

    speak(window.requizSession
      ? `Let's practice ${meta.label}!`
      : `Let's play ${meta.label}!`);
    showQuestion(0);
  }

  /**
   * Start a re-quiz (practice) session.
   *
   * If a subject is provided, practice that subject. Otherwise pick the subject
   * with the most unresolved mistakes. If the child has no mistakes recorded,
   * shows a friendly badge and bails out — the picker should not have shown
   * the practice tile in that case, but we defend against the edge anyway.
   */
  async function startRequizSession(subject = null) {
    if (!currentChild) {
      console.warn('[REQUIZ] No current child; cannot start re-quiz.');
      return;
    }
    const childId = currentChild.id || currentChild.childId || 'unknown';

    // If no subject given, pick the one with the most unresolved mistakes
    if (!subject) {
      const counts = await getMistakeCountsBySubject(childId);
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (entries.length === 0) {
        window.showBadge?.('🎉 No tricky questions to practice — great job!');
        return;
      }
      subject = entries[0][0];
      console.log(`[REQUIZ] Auto-selected subject: ${subject} (${entries[0][1]} mistakes)`);
    }

    // Set the re-quiz flag, then start a normal session.
    // getSessionQuestions reads this flag and fetches weak concepts accordingly.
    selectedSubject = subject;
    window.requizSession = true;
    try {
      await startSession();
    } finally {
      // Clear the flag so a subsequent normal session doesn't accidentally inherit it.
      // We clear AFTER startSession() returns, but startSession is fire-and-forget
      // (it doesn't await question answering) — actual clearing happens in
      // saveSessionToFirestore's finally block.
    }
  }

  function resetSessionUI() {
    optionsContainer.innerHTML = '';
    feedback.innerHTML = '';
    btnNextQuestion.classList.add('hidden');
    btnFinishSession.classList.add('hidden');
    $('session-end-screen')?.remove();
    const totalQs = isToddlerMode(currentChild) ? TODDLER_SESSION_LENGTH : 5;
    questionCounter.textContent = `Question 1 of ${totalQs}`;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = null;
    hintArea.classList.add('hidden');
    hintText.classList.add('hidden');
    hintText.textContent = '';
    btnShowHint.classList.remove('hidden');
    progressFill.style.width = `${(1 / totalQs) * 100}%`;
    updateScoreDisplay();
  }

  function updateScoreDisplay() {
    if (sessionScoreDisplay) sessionScoreDisplay.textContent = `⭐ ${score}`;
  }

  // ── Load questions from JSON ──────────────────────────────────
  async function loadQuestions(group, subject) {
    try {
      const res = await fetch(`questions/${group}/${subject}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error('loadQuestions failed:', err);
      return {};
    }
  }

  // ── Show question ────────────────────────────────────────────
  function showQuestion(index) {
    if (index >= sessionQuestions.length) { showSessionEnd(); return; }

    const q = sessionQuestions[index];
    const total = sessionQuestions.length;
    
    // Track when question is shown
    q.questionStartTime = Date.now();

    questionCounter.textContent = `Question ${index + 1} of ${total}`;
    progressFill.style.width = `${((index + 1) / total) * 100}%`;

    // Show question source badge
    const sourceBadge = $('question-source-badge');
    if (q.generatedBy === 'llm') {
      sourceBadge.className = 'text-xs px-3 py-1 rounded-full font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg';
      sourceBadge.textContent = '🤖 AI Generated';
      sourceBadge.classList.remove('hidden');
    } else if (q.generatedBy === 'bank') {
      sourceBadge.className = 'text-xs px-3 py-1 rounded-full font-bold bg-blue-100 text-blue-700 border-2 border-blue-300';
      sourceBadge.textContent = '📚 Question Bank';
      sourceBadge.classList.remove('hidden');
    } else {
      sourceBadge.classList.add('hidden');
    }

    questionText.textContent = q.question;
    setTimeout(() => speak(q.question), 300);

    optionsContainer.innerHTML = '';

    // Remove any leftover speech-to-text mic row from the previous question.
    // The mic row is inserted as a sibling of optionsContainer (not a child of it),
    // so clearing optionsContainer.innerHTML doesn't catch it. We query and remove
    // all .stt-mic-row elements before deciding whether to render a new one. This
    // prevents the bug where mic rows visually stack up across questions.
    document.querySelectorAll('.stt-mic-row').forEach(el => el.remove());

    // Branch: render toddler-mode emoji grid or regular text buttons
    const useToddlerLayout = q.mode === 'toddler' || isToddlerMode(currentChild);

    if (useToddlerLayout) {
      // ── Toddler Mode: 2×2 emoji grid ──
      optionsContainer.className = 'toddler-options-grid';
      q.options.forEach((opt) => {
        const tile = document.createElement('button');
        tile.className = 'toddler-option-tile';
        tile.dataset.optionValue = opt;
        const emoji = getEmojiForWord(opt);
        tile.innerHTML = `
          <div class="toddler-emoji">${emoji || '❓'}</div>
          <div class="toddler-option-label">${opt}</div>
        `;
        tile.addEventListener('click', () => checkAnswer(opt, q.correct, tile));
        optionsContainer.appendChild(tile);
      });
      // Apply Twemoji after tiles are in the DOM so the emojis become consistent SVGs
      applyTwemoji(optionsContainer);

      // ── Voice answers (optional, only if parent enabled it) ──
      // The mic row is injected below the grid. Voice never blocks tap — the
      // tiles remain fully tappable. After 2 misses we hide the mic for the
      // rest of the session and the child just taps like normal.
      if (shouldOfferVoiceAnswers(currentChild)) {
        renderSpeechToTextRow(q);
      }
    } else {
      // ── Regular Mode: stacked text buttons (existing behavior) ──
      optionsContainer.className = 'space-y-3 mb-4';
      const letters = ['A','B','C','D'];
      q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.dataset.letter = letters[i] || '?';
        btn.textContent = opt;
        btn.addEventListener('click', () => checkAnswer(opt, q.correct, btn));
        optionsContainer.appendChild(btn);
      });
    }

    feedback.innerHTML = '';
    btnNextQuestion.classList.add('hidden');
    btnFinishSession.classList.add('hidden');

    btnRepeatQuestion.onclick = () => speak(q.question);

    // Hint timer
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = null;
    hintArea.classList.add('hidden');
    hintText.classList.add('hidden');
    hintText.textContent = '';
    btnShowHint.classList.remove('hidden');

    hintTimer = setTimeout(() => {
      hintArea.classList.remove('hidden');
    }, 25000);
  }

  /**
   * Render the speech-to-text mic row below the toddler options grid.
   * Only called when shouldOfferVoiceAnswers(currentChild) is true.
   *
   * The mic button has 3 states (handled via CSS classes):
   *   idle       → blue, "Tap mic to say the answer"
   *   listening  → red pulsing, "Listening..."
   *   error      → amber shake, "Didn't catch that — try again or tap"
   *
   * On a successful match → simulates a tap on the matching tile.
   * On 2 consecutive failures → hides the mic for the rest of the session.
   */
  function renderSpeechToTextRow(q) {
    // Build the mic row DOM (one mic button + a status text label)
    const row = document.createElement('div');
    row.className = 'stt-mic-row';
    row.innerHTML = `
      <button type="button" class="stt-mic-btn" id="stt-mic-btn" aria-label="Tap to speak your answer">🎤</button>
      <span class="stt-status" id="stt-status">Tap the mic to say it!</span>
    `;
    optionsContainer.parentNode.insertBefore(row, optionsContainer.nextSibling);

    const micBtn = document.getElementById('stt-mic-btn');
    const status = document.getElementById('stt-status');

    const setIdle = (msg = 'Tap the mic to say it!') => {
      micBtn.classList.remove('listening', 'error');
      status.classList.remove('listening', 'error', 'success');
      status.textContent = msg;
    };
    const setListening = () => {
      micBtn.classList.remove('error');
      micBtn.classList.add('listening');
      status.classList.remove('error', 'success');
      status.classList.add('listening');
      status.textContent = 'Listening...';
    };
    const setError = (msg) => {
      micBtn.classList.remove('listening');
      micBtn.classList.add('error');
      status.classList.remove('listening', 'success');
      status.classList.add('error');
      status.textContent = msg;
      // Auto-revert to idle after 1.6 s so the child can try again
      setTimeout(() => {
        if (!_sttListening) setIdle('Try again — or just tap an answer!');
      }, 1600);
    };
    const setSuccess = (msg) => {
      micBtn.classList.remove('listening', 'error');
      status.classList.remove('listening', 'error');
      status.classList.add('success');
      status.textContent = msg;
    };

    const hideRowForSession = () => {
      _sttSession.disabled = true;
      row.remove();
    };

    micBtn.addEventListener('click', () => {
      // If already listening, treat as cancel
      if (_sttListening) {
        stopSpeechToText();
        setIdle();
        return;
      }

      startSpeechToText({
        onListening: () => setListening(),
        onResult: (alternatives) => {
          const match = matchSpokenToOption(alternatives, q.options);
          if (match) {
            // Find the corresponding tile and simulate a tap
            const tile = optionsContainer.querySelector(`.toddler-option-tile[data-option-value="${match}"]`);
            if (tile) {
              setSuccess(`Heard: "${match}" ✓`);
              _sttSession.failedAttempts = 0; // reset on success
              // Slight delay so the child sees the success message before the answer feedback
              setTimeout(() => {
                checkAnswer(match, q.correct, tile);
              }, 250);
              return;
            }
          }
          // No match — increment fail counter and decide what to do
          _sttSession.failedAttempts++;
          if (_sttSession.failedAttempts >= 2) {
            // Give up on voice for this session, just tap from now on
            hideRowForSession();
            window.showBadge?.('Just tap the answer! 👇');
          } else {
            setError("Didn't catch that");
          }
        },
        onError: (reason) => {
          if (reason === 'denied') {
            // Mic permission denied — no point retrying this session
            hideRowForSession();
            window.showBadge?.('Microphone is off — tap to answer');
          } else if (reason === 'unsupported') {
            // Browser doesn't actually support it (shouldn't reach here, but just in case)
            hideRowForSession();
          } else if (reason === 'no-speech' || reason === 'no-match') {
            _sttSession.failedAttempts++;
            if (_sttSession.failedAttempts >= 2) {
              hideRowForSession();
              window.showBadge?.('Just tap the answer! 👇');
            } else {
              setError("I didn't hear you");
            }
          } else if (reason === 'aborted') {
            // User canceled or browser aborted — just reset, don't count it
            setIdle();
          } else {
            setError('Something went wrong');
          }
        },
        onEnd: () => {
          // If we ended up not setting any other state, ensure UI returns to idle
          // (setError/setSuccess already handled their own state above)
          if (!micBtn.classList.contains('listening')) return;
          // We were still showing listening at end with no result — let error path handle it
        }
      });
    });
  }

  // ── Check answer ──────────────────────────────────────────────
  function checkAnswer(selected, correct, button) {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    hintArea.classList.add('hidden');
    // Stop any in-flight speech recognition so it doesn't capture the
    // answer-feedback voice narration ("Yes!", "It's this one — the cow!")
    stopSpeechToText();

    const q = sessionQuestions[currentQuestionIndex];
    q.userAnswer = selected;

    // Calculate time spent on this question
    if (q.questionStartTime) {
      q.timeSpent = Math.round((Date.now() - q.questionStartTime) / 1000);
    }

    const isCorrect = selected === correct;
    const useToddlerLayout = q.mode === 'toddler' || isToddlerMode(currentChild);

    // Disable all options + mark the correct one
    Array.from(optionsContainer.children).forEach(b => {
      b.disabled = true;
      // Match by dataset.optionValue (toddler) OR textContent (regular)
      const valueMatches = useToddlerLayout
        ? b.dataset.optionValue === correct
        : b.textContent === correct;
      if (valueMatches) {
        // For wrong-answer case, add 'reveal' to draw attention to the correct tile
        if (!isCorrect && useToddlerLayout) {
          b.classList.add('reveal');
        } else {
          b.classList.add('correct');
        }
      }
      if (useToddlerLayout) b.classList.add('locked');
    });

    if (isCorrect) {
      score++;
      consecutiveCorrect++;
      updateScoreDisplay();
      button.classList.add('correct');

      // Streak indicator — show a toast when the child hits 2+ in a row
      // (skip if this is the last question so it doesn't clash with end screen)
      const isLastQ = currentQuestionIndex >= sessionQuestions.length - 1;
      if (consecutiveCorrect >= 2 && !isLastQ) {
        const streakEmoji = consecutiveCorrect >= 4 ? '🔥🔥' : '🔥';
        window.showBadge?.(`${streakEmoji} ${consecutiveCorrect} in a row!`);
      }
      if (useToddlerLayout) {
        // Toddler: simpler, voice-led feedback (no big visual feedback text)
        feedback.innerHTML = `
          <div class="feedback-pop flex items-center gap-2 justify-center bg-green-100 text-green-700 px-5 py-3 rounded-2xl font-bold text-lg border-2 border-green-300">
            🌟 Yes!
          </div>`;
        const phrases = ['Yes! Great job!', 'Awesome!', 'You got it!', 'Wonderful!'];
        speak(phrases[Math.floor(Math.random() * phrases.length)]);
      } else {
        feedback.innerHTML = `
          <div class="feedback-pop flex items-center gap-2 justify-center bg-green-100 text-green-700 px-5 py-3 rounded-2xl font-bold text-lg border-2 border-green-300">
            🌟 Yay! Correct!
          </div>`;
        speak('Yay! That is correct! Great job!');
      }
      // confetti burst
      const rect = button.getBoundingClientRect();
      window.burstConfetti?.(rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else {
      consecutiveCorrect = 0;  // streak broken
      button.classList.add('wrong');
      if (useToddlerLayout) {
        // Toddler: amber (not red), gentle, supportive — point at the right answer
        feedback.innerHTML = `
          <div class="feedback-pop flex items-center gap-2 justify-center bg-amber-50 text-amber-700 px-5 py-3 rounded-2xl font-bold text-lg border-2 border-amber-300">
            👀 It's this one!
          </div>`;
        speak(`It's this one — the ${correct}!`);
      } else {
        feedback.innerHTML = `
          <div class="feedback-pop flex items-center gap-2 justify-center bg-red-50 text-red-600 px-5 py-3 rounded-2xl font-bold text-lg border-2 border-red-200">
            💪 Good try! The answer is "${correct}"
          </div>`;
        speak(`Good try! The correct answer is ${correct}.`);
      }
    }

    // Show next/finish button OR auto-advance in toddler mode
    const isLastQuestion = currentQuestionIndex >= sessionQuestions.length - 1;

    if (useToddlerLayout) {
      // Toddler mode: auto-advance after 2 seconds (longer if wrong, to give them time to see the correct tile)
      const advanceDelay = isCorrect ? 1800 : 2400;
      setTimeout(() => {
        if (isLastQuestion) {
          showSessionEnd();
        } else {
          currentQuestionIndex++;
          showQuestion(currentQuestionIndex);
        }
      }, advanceDelay);
    } else {
      // Regular mode: show the next/finish button as before
      if (isLastQuestion) {
        btnFinishSession.classList.remove('hidden');
      } else {
        btnNextQuestion.classList.remove('hidden');
      }
    }
  }

  btnNextQuestion?.addEventListener('click', () => {
    currentQuestionIndex++;
    showQuestion(currentQuestionIndex);
  });

  btnFinishSession?.addEventListener('click', showSessionEnd);

  btnShowHint?.addEventListener('click', () => {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    const q = sessionQuestions[currentQuestionIndex];
    if (q?.hint) {
      totalHintsUsed++;  // Track hint usage
      q.hintShown = true;  // Mark this question as having hint shown
      hintText.textContent = `💡 Hint: ${q.hint}`;
      hintText.classList.remove('hidden');
      btnShowHint.classList.add('hidden');
      speak(q.hint);
    }
  });

  btnBackFromLearning?.addEventListener('click', () => {
    if (hintTimer) clearTimeout(hintTimer);
    showView('child-welcome');
  });

  // ═══════════════════════════════════════════════════════════
  // SESSION TRACKING FUNCTIONS
  // ═══════════════════════════════════════════════════════════

  let sessionStartTime = null;
  let totalHintsUsed = 0;
  let totalPauses = 0;

  // Save complete session to Firestore
  async function saveSessionToFirestore() {
    const isRequiz = !!window.requizSession;
    try {
      console.log('[SESSION SAVE] Starting session save...');

      const timeSpentSeconds = Math.round((Date.now() - sessionStartTime) / 1000);
      const accuracy = (score / sessionQuestions.length) * 100;

      // Calculate engagement score (0-1)
      const avgTimePerQuestion = timeSpentSeconds / sessionQuestions.length;
      const engagementScore = calculateEngagementScore(avgTimePerQuestion, totalHintsUsed, totalPauses);

      const sessionData = {
        // Who
        parentId: window.auth.currentUser.uid,
        childId: currentChild.id,
        childName: currentChild.name,
        childAge: currentChild.age,

        // What
        subject: selectedSubject,
        level: currentChild.subjects?.[selectedSubject] || 1,
        sessionType: isRequiz ? 'requiz' : 'regular',

        // When
        date: new Date().toISOString(),
        timestamp: Date.now(),

        // Performance
        score: score,
        totalQuestions: sessionQuestions.length,
        accuracy: Math.round(accuracy),

        // Engagement
        timeSpent: timeSpentSeconds,
        hintsUsed: totalHintsUsed,
        pauseCount: totalPauses,
        engagementScore: engagementScore,

        // Context
        ageGroup: currentChild.age <= 5 ? 'beginner' : currentChild.age <= 8 ? 'intermediate' : 'advanced',
        questionSource: window.sessionQuestionSource || 'bank',

        // Detailed questions
        questions: sessionQuestions.map((q, idx) => ({
          questionNumber: idx + 1,
          question: q.question,
          correctAnswer: q.correct,
          userAnswer: q.userAnswer || 'Not answered',
          isCorrect: q.userAnswer === q.correct,
          timeToAnswer: q.timeSpent || 0,
          hintShown: q.hintShown || false,
          generatedBy: q.generatedBy || 'bank'
        }))
      };

      // Save to Firestore
      const sessionRef = window.doc(window.collection(window.db, 'sessions'));
      await window.setDoc(sessionRef, sessionData);

      console.log('[SESSION SAVE] ✅ Session saved successfully!');
      console.log('[SESSION SAVE] Session ID:', sessionRef.id);
      console.log('[SESSION SAVE] Data:', sessionData);

      // Track mistakes
      await trackMistakes();

      // ─── Re-quiz: decay frequency of concepts the child got right ───
      if (isRequiz) {
        const correctlyAnswered = sessionQuestions.filter(q => q.userAnswer === q.correct);
        if (correctlyAnswered.length > 0) {
          await decayMistakeFrequencies(
            currentChild.id,
            selectedSubject,
            correctlyAnswered
          );
        }
      }

      // ─── Achievement badges: fire-and-forget so the end screen doesn't block ───
      // The badge check involves reading every session for this child + reading the
      // badges subcollection + potentially writing new badges. That's potentially
      // multiple round-trips of Firestore latency. We capture the promise so the
      // end screen can await it later and inject the unlock banner when ready.
      window._badgeCheckPromise = checkAndUnlockBadges(currentChild, {
        score: score,
        totalQuestions: sessionQuestions.length,
        hintsUsed: totalHintsUsed,
        subject: selectedSubject
      }, sessionRef.id).catch(err => {
        console.warn('[BADGES] background check rejected:', err);
        return [];
      });

    } catch (error) {
      console.error('[SESSION SAVE] ❌ Failed to save session:', error);
      console.error('[SESSION SAVE] Error details:', error.message);
    } finally {
      // Always clear the re-quiz flag at the end of session save so the next
      // session is a normal one unless explicitly launched as re-quiz again.
      window.requizSession = false;
    }
  }

  // Calculate engagement score (0 = low, 1 = high)
  function calculateEngagementScore(avgTime, hints, pauses) {
    let score = 1.0;
    
    // Penalty for slow answers (> 30 seconds per question)
    if (avgTime > 30) score -= 0.2;
    if (avgTime > 60) score -= 0.2;
    
    // Penalty for hint usage
    score -= (hints * 0.1);
    
    // Penalty for pauses
    score -= (pauses * 0.15);
    
    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, score));
  }

  // Track mistake patterns
  async function trackMistakes() {
    try {
      console.log('[MISTAKE TRACKING] Analyzing wrong answers...');

      // Collect all wrong-answer questions first
      const wrongAnswers = sessionQuestions.filter(q => q.userAnswer !== q.correct && q.userAnswer);

      if (wrongAnswers.length === 0) {
        console.log('[MISTAKE TRACKING] No wrong answers in this session.');
        return;
      }

      // Process all in parallel — each mistake is independent, no need to serialize.
      await Promise.all(wrongAnswers.map(async (q) => {
        const mistakeId = `${selectedSubject}_${q.id || Math.random().toString(36).substr(2, 9)}`;
        const mistakeRef = window.doc(window.db, `mistakes/${currentChild.id}/errors`, mistakeId);

        try {
          const existingDoc = await window.getDoc(mistakeRef);

          if (existingDoc.exists()) {
            // Update existing mistake
            const data = existingDoc.data();
            await window.updateDoc(mistakeRef, {
              wrongAnswers: [...(data.wrongAnswers || []), q.userAnswer],
              frequency: (data.frequency || 0) + 1,
              lastAttempt: new Date().toISOString()
            });
            console.log(`[MISTAKE TRACKING] Updated mistake: ${q.question.substring(0, 30)}... (frequency: ${data.frequency + 1})`);
          } else {
            // Create new mistake record
            await window.setDoc(mistakeRef, {
              childId: currentChild.id,
              subject: selectedSubject,
              level: currentChild.subjects?.[selectedSubject] || 1,
              question: q.question,
              correctAnswer: q.correct,
              wrongAnswers: [q.userAnswer],
              frequency: 1,
              firstAttempt: new Date().toISOString(),
              lastAttempt: new Date().toISOString(),
              conceptGap: identifyConceptGap(q.question, q.correct, q.userAnswer)
            });
            console.log(`[MISTAKE TRACKING] New mistake logged: ${q.question.substring(0, 30)}...`);
          }
        } catch (err) {
          console.error('[MISTAKE TRACKING] Error saving mistake:', err);
        }
      }));

      console.log('[MISTAKE TRACKING] ✅ Mistake tracking complete');
      
    } catch (error) {
      console.error('[MISTAKE TRACKING] ❌ Failed:', error);
    }
  }

  // Identify what concept the child is struggling with
  function identifyConceptGap(question, correct, wrong) {
    const qLower = question.toLowerCase();

    // ── MATHS patterns ──
    if (qLower.includes('×') || qLower.includes('multiply') || qLower.includes('times')) {
      const correctNum = parseInt(correct);
      const wrongNum = parseInt(wrong);
      if (!isNaN(correctNum) && !isNaN(wrongNum)) {
        if (wrongNum < correctNum && correctNum % wrongNum === 0) {
          return 'confusing_multiplication_with_division';
        }
        if (Math.abs(correctNum - wrongNum) < 10) {
          return 'confusing_multiplication_with_addition';
        }
      }
      return 'multiplication';
    }
    if (qLower.includes('+') || qLower.includes('add') || qLower.includes('plus') || qLower.includes('sum')) {
      return 'addition';
    }
    if (qLower.includes('-') || qLower.includes('subtract') || qLower.includes('minus') || qLower.includes('take away')) {
      return 'subtraction';
    }
    if (qLower.includes('÷') || qLower.includes('divide') || qLower.includes('shared between')) {
      return 'division';
    }
    if (qLower.includes('shape') || qLower.includes('triangle') || qLower.includes('circle') ||
        qLower.includes('square') || qLower.includes('rectangle')) {
      return 'shapes';
    }
    if (qLower.includes('bigger') || qLower.includes('smaller') || qLower.includes('biggest') ||
        qLower.includes('smallest') || qLower.includes('largest') || qLower.includes('compare')) {
      return 'comparison';
    }
    if (/\b(how many|count)\b/.test(qLower)) {
      return 'counting';
    }

    // ── ENGLISH patterns ──
    if (qLower.includes('opposite') || qLower.includes('antonym')) {
      return 'opposites';
    }
    if (qLower.includes('rhyme') || qLower.includes('sound like')) {
      return 'rhyming';
    }
    if (qLower.includes('past tense') || qLower.includes('present tense')) {
      return 'verb_tenses';
    }
    if (qLower.includes('plural') || qLower.includes('singular')) {
      return 'plurals';
    }
    if (qLower.includes('verb') || qLower.includes('noun') || qLower.includes('adjective')) {
      return 'parts_of_speech';
    }
    if (qLower.includes('spelling') || qLower.includes('spell') || qLower.includes('correctly spelled')) {
      return 'spelling';
    }
    if (qLower.includes('synonym') || qLower.includes('means the same')) {
      return 'synonyms';
    }

    // ── SCIENCE patterns ──
    if (qLower.includes('animal') || qLower.includes('mammal') || qLower.includes('reptile') ||
        qLower.includes('bird') || qLower.includes('fish')) {
      return 'animals';
    }
    if (qLower.includes('plant') || qLower.includes('tree') || qLower.includes('flower') ||
        qLower.includes('photosynthesis')) {
      return 'plants';
    }
    if (qLower.includes('weather') || qLower.includes('rain') || qLower.includes('snow') ||
        qLower.includes('sun') || qLower.includes('cloud')) {
      return 'weather';
    }
    if (qLower.includes('body') || qLower.includes('heart') || qLower.includes('lung') ||
        qLower.includes('brain') || qLower.includes('bone')) {
      return 'human_body';
    }
    if (qLower.includes('planet') || qLower.includes('space') || qLower.includes('star') ||
        qLower.includes('moon') || qLower.includes('solar')) {
      return 'space';
    }

    // ── GENERAL KNOWLEDGE patterns ──
    if (qLower.includes('color') || qLower.includes('colour')) {
      return 'colors';
    }
    if (qLower.includes('country') || qLower.includes('capital') || qLower.includes('continent')) {
      return 'geography';
    }
    if (qLower.includes('day') || qLower.includes('month') || qLower.includes('year') ||
        qLower.includes('time') || qLower.includes('clock')) {
      return 'time_and_calendar';
    }
    if (qLower.includes('transport') || qLower.includes('vehicle') || qLower.includes('car') ||
        qLower.includes('plane') || qLower.includes('train')) {
      return 'transport';
    }

    // ── COMPUTER & MODERN TECH patterns ──
    if (qLower.includes('computer') || qLower.includes('keyboard') || qLower.includes('mouse') ||
        qLower.includes('screen')) {
      return 'computer_basics';
    }
    if (qLower.includes('internet') || qLower.includes('website') || qLower.includes('browser')) {
      return 'internet';
    }
    if (qLower.includes('ai') || qLower.includes('artificial intelligence') ||
        qLower.includes('robot') || qLower.includes('machine learning')) {
      return 'ai_and_robots';
    }

    return 'general_error';
  }

  // ═══════════════════════════════════════════════════════════
  // ASSESSMENT AGENT - Analyzes child's performance
  // ═══════════════════════════════════════════════════════════

  /**
   * Get recent sessions for a child
   * @param {string} childId - Child's ID
   * @param {number} days - How many days back to look (default: 30)
   * @returns {Array} Array of session documents
   */
  async function getRecentSessions(childId, days = 30) {
    try {
      console.log(`[ASSESSMENT] Fetching last ${days} days of sessions for child:`, childId);
      console.log('[ASSESSMENT] Current auth user:', window.auth?.currentUser?.uid);
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffTimestamp = cutoffDate.getTime();
      
      console.log('[ASSESSMENT] Cutoff date:', cutoffDate.toISOString());
      console.log('[ASSESSMENT] Cutoff timestamp:', cutoffTimestamp);
      
      const sessionsRef = window.collection(window.db, 'sessions');
      const snapshot = await window.getDocs(sessionsRef);
      
      console.log('[ASSESSMENT] Total documents in sessions collection:', snapshot.size);
      
      // Filter sessions for this child within date range
      const sessions = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        console.log('[ASSESSMENT] Session doc:', doc.id, {
          childId: data.childId,
          targetChildId: childId,
          match: data.childId === childId,
          timestamp: data.timestamp,
          withinRange: data.timestamp >= cutoffTimestamp
        });
        
        if (data.childId === childId && data.timestamp >= cutoffTimestamp) {
          sessions.push({ id: doc.id, ...data });
        }
      });
      
      console.log(`[ASSESSMENT] Found ${sessions.length} sessions for child ${childId}`);
      return sessions.sort((a, b) => b.timestamp - a.timestamp); // Newest first
      
    } catch (error) {
      console.error('[ASSESSMENT] Error fetching sessions:', error);
      return [];
    }
  }

  /**
   * Analyze child's performance across all subjects
   * @param {string} childId - Child's ID
   * @returns {Object} Performance analysis
   */
  async function analyzePerformance(childId) {
    try {
      console.log('[ASSESSMENT] Starting performance analysis for child:', childId);
      
      const sessions = await getRecentSessions(childId, 30);
      
      if (sessions.length === 0) {
        console.log('[ASSESSMENT] No sessions found');
        return {
          totalSessions: 0,
          subjects: {},
          overall: { accuracy: 0, trend: 'no_data' },
          strengths: [],
          weaknesses: []
        };
      }
      
      // Group sessions by subject
      const subjectData = {};
      
      sessions.forEach(session => {
        const subject = session.subject;
        
        if (!subjectData[subject]) {
          subjectData[subject] = {
            sessions: [],
            totalQuestions: 0,
            correctAnswers: 0,
            totalTime: 0,
            totalHints: 0
          };
        }
        
        subjectData[subject].sessions.push(session);
        subjectData[subject].totalQuestions += session.totalQuestions || 0;
        subjectData[subject].correctAnswers += session.score || 0;
        subjectData[subject].totalTime += session.timeSpent || 0;
        subjectData[subject].totalHints += session.hintsUsed || 0;
      });
      
      // Calculate metrics for each subject
      const subjectAnalysis = {};
      const strengths = [];
      const weaknesses = [];
      
      for (const [subject, data] of Object.entries(subjectData)) {
        const accuracy = data.totalQuestions > 0 
          ? Math.round((data.correctAnswers / data.totalQuestions) * 100)
          : 0;
        
        const avgTime = data.sessions.length > 0
          ? Math.round(data.totalTime / data.sessions.length)
          : 0;
        
        // Determine trend (last 7 days vs previous 7 days)
        const trend = calculateTrend(data.sessions);
        
        // Determine status
        let status = 'average';
        if (accuracy >= 80) {
          status = 'strong';
          strengths.push(subject);
        } else if (accuracy < 60) {
          status = 'struggling';
          weaknesses.push(subject);
        }
        
        subjectAnalysis[subject] = {
          totalSessions: data.sessions.length,
          accuracy: accuracy,
          avgTimePerSession: avgTime,
          avgHintsUsed: Math.round(data.totalHints / data.sessions.length),
          status: status,
          trend: trend,
          lastPlayed: data.sessions[0]?.date || null
        };
      }
      
      // Overall metrics
      const totalCorrect = sessions.reduce((sum, s) => sum + (s.score || 0), 0);
      const totalQuestions = sessions.reduce((sum, s) => sum + (s.totalQuestions || 0), 0);
      const overallAccuracy = totalQuestions > 0 
        ? Math.round((totalCorrect / totalQuestions) * 100)
        : 0;
      
      const result = {
        totalSessions: sessions.length,
        subjects: subjectAnalysis,
        overall: {
          accuracy: overallAccuracy,
          trend: calculateTrend(sessions)
        },
        strengths: strengths,
        weaknesses: weaknesses,
        generatedAt: new Date().toISOString()
      };
      
      console.log('[ASSESSMENT] ✅ Analysis complete:', result);
      return result;
      
    } catch (error) {
      console.error('[ASSESSMENT] Error analyzing performance:', error);
      return {
        totalSessions: 0,
        subjects: {},
        overall: { accuracy: 0, trend: 'error' },
        strengths: [],
        weaknesses: [],
        error: error.message
      };
    }
  }

  /**
   * Calculate performance trend
   * @param {Array} sessions - Array of sessions (newest first)
   * @returns {string} 'improving', 'declining', or 'stable'
   */
  function calculateTrend(sessions) {
    if (sessions.length < 4) return 'insufficient_data';
    
    // Split into recent vs older sessions
    const midpoint = Math.floor(sessions.length / 2);
    const recentSessions = sessions.slice(0, midpoint);
    const olderSessions = sessions.slice(midpoint);
    
    // Calculate average accuracy for each period
    const recentAccuracy = recentSessions.reduce((sum, s) => 
      sum + (s.accuracy || 0), 0) / recentSessions.length;
    
    const olderAccuracy = olderSessions.reduce((sum, s) => 
      sum + (s.accuracy || 0), 0) / olderSessions.length;
    
    const difference = recentAccuracy - olderAccuracy;
    
    if (difference > 10) return 'improving';
    if (difference < -10) return 'declining';
    return 'stable';
  }

  /**
   * Get mistake patterns for a child
   * @param {string} childId - Child's ID
   * @param {string} subject - Optional subject filter
   * @returns {Array} Array of mistake patterns
   */
  async function getMistakePatterns(childId, subject = null) {
    try {
      console.log('[ASSESSMENT] Fetching mistake patterns for:', childId, subject || 'all subjects');
      
      const mistakesRef = window.collection(window.db, `mistakes/${childId}/errors`);
      const snapshot = await window.getDocs(mistakesRef);
      
      const mistakes = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        
        // Filter by subject if specified
        if (subject && data.subject !== subject) return;
        
        // Only include mistakes with frequency >= 2 (repeated errors)
        if (data.frequency >= 2) {
          mistakes.push({
            id: doc.id,
            question: data.question,
            correctAnswer: data.correctAnswer,
            wrongAnswers: data.wrongAnswers,
            frequency: data.frequency,
            subject: data.subject,
            conceptGap: data.conceptGap,
            lastAttempt: data.lastAttempt
          });
        }
      });
      
      // Sort by frequency (most frequent first)
      mistakes.sort((a, b) => b.frequency - a.frequency);
      
      console.log(`[ASSESSMENT] Found ${mistakes.length} repeated mistakes`);
      return mistakes;
      
    } catch (error) {
      console.error('[ASSESSMENT] Error fetching mistakes:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RE-QUIZ HELPERS — fetch unresolved mistakes, target weak concepts
  // ═══════════════════════════════════════════════════════════
  //
  // Re-quiz uses the same `mistakes/{childId}/errors/*` collection as
  // getMistakePatterns, but with frequency >= 1 (we want ALL unresolved
  // mistakes for practice, not only repeated ones).

  /**
   * Get all unresolved mistakes for a child (frequency >= 1).
   * Returns the full mistake documents.
   */
  async function getUnresolvedMistakes(childId, subject = null) {
    try {
      const mistakesRef = window.collection(window.db, `mistakes/${childId}/errors`);
      const snapshot = await window.getDocs(mistakesRef);
      const mistakes = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (subject && data.subject !== subject) return;
        if ((data.frequency || 0) >= 1) {
          mistakes.push({ id: doc.id, ...data });
        }
      });
      mistakes.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
      return mistakes;
    } catch (error) {
      console.error('[REQUIZ] Error fetching unresolved mistakes:', error);
      return [];
    }
  }

  /**
   * Returns { maths: 5, english: 2, ... } — how many unresolved mistakes
   * the child has in each subject. Empty subjects are omitted.
   */
  async function getMistakeCountsBySubject(childId) {
    const mistakes = await getUnresolvedMistakes(childId);
    const counts = {};
    mistakes.forEach(m => {
      if (!m.subject) return;
      counts[m.subject] = (counts[m.subject] || 0) + (m.frequency || 1);
    });
    return counts;
  }

  /**
   * Returns top N concept gaps for a subject, sorted by total frequency desc.
   * Format: [{ concept: 'subtraction', frequency: 5 }, ...]
   */
  async function getTopConceptGaps(childId, subject, limit = 3) {
    const mistakes = await getUnresolvedMistakes(childId, subject);
    // Group by conceptGap and sum frequencies
    const conceptTotals = {};
    mistakes.forEach(m => {
      const concept = m.conceptGap || 'general_error';
      conceptTotals[concept] = (conceptTotals[concept] || 0) + (m.frequency || 1);
    });
    // Convert to sorted array
    const sorted = Object.entries(conceptTotals)
      .map(([concept, frequency]) => ({ concept, frequency }))
      .sort((a, b) => b.frequency - a.frequency);
    return sorted.slice(0, limit);
  }

  /**
   * Decay (decrement) the frequency of mistakes whose conceptGap matches
   * concepts the child answered correctly in a re-quiz session.
   * Mistakes whose frequency drops to 0 are deleted entirely.
   *
   * This is the "soft decay" model — consistent right answers gradually
   * clear a concept from the weak list.
   */
  async function decayMistakeFrequencies(childId, subject, correctlyAnsweredQuestions) {
    if (!correctlyAnsweredQuestions || correctlyAnsweredQuestions.length === 0) return;

    try {
      // Compute the set of concepts the child got right in this session
      const correctConcepts = new Set();
      correctlyAnsweredQuestions.forEach(q => {
        // Try to use the stored conceptGap if the LLM tagged it, otherwise recompute
        const concept = q.conceptGap || identifyConceptGap(q.question, q.correct, q.userAnswer || '');
        if (concept) correctConcepts.add(concept);
      });

      if (correctConcepts.size === 0) return;
      console.log('[REQUIZ] Decaying mistakes for concepts:', Array.from(correctConcepts));

      // Fetch all mistakes for this subject (we'll filter client-side for matching concepts)
      const mistakesRef = window.collection(window.db, `mistakes/${childId}/errors`);
      const snapshot = await window.getDocs(mistakesRef);

      let decayed = 0;
      let deleted = 0;
      const updatePromises = [];

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.subject !== subject) return;
        if (!correctConcepts.has(data.conceptGap)) return;
        if ((data.frequency || 0) < 1) return;

        const newFreq = (data.frequency || 0) - 1;
        const docRef = window.doc(window.db, `mistakes/${childId}/errors/${docSnap.id}`);

        if (newFreq <= 0) {
          updatePromises.push(window.deleteDoc(docRef));
          deleted++;
        } else {
          updatePromises.push(window.updateDoc(docRef, { frequency: newFreq }));
          decayed++;
        }
      });

      await Promise.all(updatePromises);
      console.log(`[REQUIZ] ✅ Decayed ${decayed} mistakes, deleted ${deleted} mastered ones`);
    } catch (error) {
      console.error('[REQUIZ] Decay failed:', error);
    }
  }

  /**
   * Generate insights for parent dashboard
   * @param {string} childId - Child's ID
   * @returns {Object} Actionable insights
   */
  async function generateInsights(childId) {
    try {
      console.log('[ASSESSMENT] Generating insights for child:', childId);
      
      const performance = await analyzePerformance(childId);
      const mistakes = await getMistakePatterns(childId);
      
      const insights = {
        summary: generateSummary(performance),
        recommendations: generateRecommendations(performance, mistakes),
        topMistakes: mistakes.slice(0, 5), // Top 5 repeated errors
        performance: performance
      };
      
      console.log('[ASSESSMENT] ✅ Insights generated:', insights);
      return insights;
      
    } catch (error) {
      console.error('[ASSESSMENT] Error generating insights:', error);
      return {
        summary: 'Unable to generate insights',
        recommendations: [],
        topMistakes: [],
        performance: {},
        error: error.message
      };
    }
  }

  /**
   * Generate human-readable summary
   */
  function generateSummary(performance) {
    const { overall, strengths, weaknesses, totalSessions } = performance;
    
    if (totalSessions === 0) {
      return 'No learning sessions yet. Start playing to see progress!';
    }
    
    let summary = `Completed ${totalSessions} session${totalSessions > 1 ? 's' : ''} with ${overall.accuracy}% overall accuracy. `;
    
    if (overall.trend === 'improving') {
      summary += 'Great news - performance is improving! 📈 ';
    } else if (overall.trend === 'declining') {
      summary += 'Performance has dipped recently. More practice needed. 💪 ';
    }
    
    if (strengths.length > 0) {
      summary += `Strong in: ${strengths.join(', ')}. `;
    }
    
    if (weaknesses.length > 0) {
      summary += `Needs practice in: ${weaknesses.join(', ')}.`;
    }
    
    return summary;
  }

  /**
   * Generate actionable recommendations
   */
  function generateRecommendations(performance, mistakes) {
    const recommendations = [];
    
    // Recommendations based on weaknesses
    performance.weaknesses.forEach(subject => {
      const subjectData = performance.subjects[subject];
      recommendations.push({
        type: 'practice',
        priority: 'high',
        subject: subject,
        message: `Focus on ${subject} - current accuracy is ${subjectData.accuracy}%. Practice 10-15 minutes daily.`,
        icon: SUBJECT_META[subject]?.icon || '📚'
      });
    });
    
    // Recommendations based on mistakes
    if (mistakes.length > 0) {
      const topMistake = mistakes[0];
      recommendations.push({
        type: 'concept_review',
        priority: 'high',
        subject: topMistake.subject,
        message: `Review ${topMistake.conceptGap.replace(/_/g, ' ')} - struggling with: "${topMistake.question.substring(0, 40)}..."`,
        icon: '🎯'
      });
    }
    
    // Positive reinforcement for strengths
    performance.strengths.forEach(subject => {
      recommendations.push({
        type: 'encouragement',
        priority: 'low',
        subject: subject,
        message: `Excellent work in ${subject}! Keep up the great performance! 🌟`,
        icon: SUBJECT_META[subject]?.icon || '⭐'
      });
    });
    
    return recommendations.slice(0, 5); // Top 5 recommendations
  }

  // ═══════════════════════════════════════════════════════════
  // Q-LEARNING BEHAVIOR AGENT
  // ═══════════════════════════════════════════════════════════

  // Q-Learning hyperparameters
  const Q_LEARNING = {
    alpha: 0.1,        // Learning rate (how much to update Q-values)
    gamma: 0.9,        // Discount factor (how much to value future rewards)
    epsilon: 0.1,      // Exploration rate (% of time to try random actions)
    actions: ['maintain_level', 'level_up', 'make_easier', 'show_detailed_hint', 'suggest_break']
  };

  /**
   * Get current state of the child's learning
   */
  function getCurrentState(child, subject, recentSessions) {
    // Calculate recent accuracy (last 5 sessions)
    const recent = recentSessions.slice(0, 5);
    const recentAccuracy = recent.length > 0
      ? Math.round(recent.reduce((sum, s) => sum + (s.accuracy || 0), 0) / recent.length)
      : 50;

    // Calculate average time per question (use actual per-session question counts)
    const totalQuestionsAcrossSessions = recent.reduce((sum, s) => sum + (s.totalQuestions || 5), 0);
    const totalTimeAcrossSessions = recent.reduce((sum, s) => sum + (s.timeSpent || 0), 0);
    const avgTime = totalQuestionsAcrossSessions > 0
      ? Math.round(totalTimeAcrossSessions / totalQuestionsAcrossSessions)
      : 20;

    // Calculate hint usage rate (hints per question, across all recent sessions)
    const totalHints = recent.reduce((sum, s) => sum + (s.hintsUsed || 0), 0);
    const hintRate = totalQuestionsAcrossSessions > 0 ? (totalHints / totalQuestionsAcrossSessions) : 0;

    // Sessions since last level up
    const currentLevel = child.subjects?.[subject] || 1;
    let sessionsSinceLevelUp = 0;
    for (const session of recentSessions) {
      if (session.level < currentLevel) break;
      sessionsSinceLevelUp++;
    }

    const state = {
      level: currentLevel,
      accuracy: recentAccuracy,
      avgTime: avgTime,
      hintRate: parseFloat(hintRate.toFixed(2)),
      sessionsSinceLevelUp: sessionsSinceLevelUp
    };

    console.log('[Q-LEARNING] Current state:', state);
    return state;
  }

  /**
   * Convert state to string key for Q-table
   */
  function stateToKey(state) {
    // Discretize continuous values for Q-table
    const levelBucket = state.level;
    const accBucket = Math.floor(state.accuracy / 20) * 20; // 0, 20, 40, 60, 80, 100
    const timeBucket = state.avgTime < 15 ? 'fast' : state.avgTime < 30 ? 'normal' : 'slow';
    const hintBucket = state.hintRate < 0.2 ? 'low' : state.hintRate < 0.5 ? 'med' : 'high';
    
    return `L${levelBucket}_A${accBucket}_T${timeBucket}_H${hintBucket}`;
  }

  /**
   * Get Q-value for state-action pair
   */
  function getQValue(qTable, stateKey, action) {
    if (!qTable[stateKey]) {
      qTable[stateKey] = {};
      Q_LEARNING.actions.forEach(a => qTable[stateKey][a] = 0);
    }
    return qTable[stateKey][action] || 0;
  }

  /**
   * Select best action using epsilon-greedy policy
   */
  function selectAction(qTable, stateKey) {
    // Exploration: random action
    if (Math.random() < Q_LEARNING.epsilon) {
      const randomAction = Q_LEARNING.actions[Math.floor(Math.random() * Q_LEARNING.actions.length)];
      console.log('[Q-LEARNING] 🎲 Exploring - random action:', randomAction);
      return randomAction;
    }

    // Exploitation: best known action
    if (!qTable[stateKey]) {
      qTable[stateKey] = {};
      Q_LEARNING.actions.forEach(a => qTable[stateKey][a] = 0);
    }

    let bestAction = Q_LEARNING.actions[0];
    let bestValue = qTable[stateKey][bestAction] || 0;

    Q_LEARNING.actions.forEach(action => {
      const value = qTable[stateKey][action] || 0;
      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    });

    console.log('[Q-LEARNING] 🎯 Exploiting - best action:', bestAction, 'value:', bestValue.toFixed(2));
    return bestAction;
  }

  /**
   * Calculate reward based on session performance
   */
  function calculateReward(session, child, subject) {
    let reward = 0;

    const accuracy = session.accuracy || 0;
    const timePerQ = session.timeSpent / session.totalQuestions;
    const hintsUsed = session.hintsUsed || 0;
    const engagement = session.engagementScore || 0.5;

    // High accuracy rewards
    if (accuracy >= 80) reward += 1.0;
    else if (accuracy >= 60) reward += 0.5;
    else if (accuracy >= 40) reward += 0.2;
    else reward -= 0.3;

    // Speed bonus (efficient learning)
    if (timePerQ < 15) reward += 0.3;
    else if (timePerQ > 45) reward -= 0.2;

    // Hint penalty (want independent learning)
    reward -= (hintsUsed * 0.15);

    // Engagement bonus
    if (engagement > 0.7) reward += 0.4;
    else if (engagement < 0.3) reward -= 0.5;

    // Completion bonus
    if (session.score === session.totalQuestions) reward += 0.3;

    console.log('[Q-LEARNING] Calculated reward:', reward.toFixed(2), {
      accuracy: accuracy,
      timePerQ: timePerQ.toFixed(1),
      hints: hintsUsed,
      engagement: engagement.toFixed(2)
    });

    return reward;
  }

  /**
   * Update Q-table using Q-learning algorithm
   */
  function updateQTable(qTable, stateKey, action, reward, nextStateKey) {
    const currentQ = getQValue(qTable, stateKey, action);
    
    // Get max Q-value for next state
    let maxNextQ = 0;
    if (qTable[nextStateKey]) {
      maxNextQ = Math.max(...Q_LEARNING.actions.map(a => qTable[nextStateKey][a] || 0));
    }

    // Q-learning update rule:
    // Q(s,a) = Q(s,a) + α[r + γ·max(Q(s',a')) - Q(s,a)]
    const newQ = currentQ + Q_LEARNING.alpha * (reward + Q_LEARNING.gamma * maxNextQ - currentQ);

    if (!qTable[stateKey]) {
      qTable[stateKey] = {};
    }
    qTable[stateKey][action] = newQ;

    console.log('[Q-LEARNING] Updated Q-value:', {
      state: stateKey,
      action: action,
      oldQ: currentQ.toFixed(3),
      reward: reward.toFixed(2),
      newQ: newQ.toFixed(3)
    });

    return newQ;
  }

  /**
   * Execute the recommended action
   */
  async function executeQLearningAction(action, child, subject, currentLevel) {
    console.log('[Q-LEARNING] 🎬 Executing action:', action);

    let message = '';
    let levelAdjustment = 0;

    switch (action) {
      case 'level_up':
        if (currentLevel < 5) {
          levelAdjustment = 1;
          message = '🚀 Great progress! Moving to a harder level to challenge you!';
        } else {
          message = '⭐ You\'re at the top level - amazing work!';
        }
        break;

      case 'make_easier':
        if (currentLevel > 1) {
          levelAdjustment = -1;
          message = '💪 Let\'s practice a bit more at an easier level to build confidence!';
        } else {
          message = '😊 Keep practicing - you\'re doing great!';
        }
        break;

      case 'show_detailed_hint':
        message = '💡 Here are some helpful tips to improve...';
        // Could show extra learning resources here
        break;

      case 'suggest_break':
        message = '🌟 You\'ve worked hard! Maybe take a short break and come back refreshed?';
        break;

      case 'maintain_level':
      default:
        message = '👍 Perfect difficulty level - keep going!';
        break;
    }

    // Apply level adjustment if needed
    if (levelAdjustment !== 0) {
      const newLevel = Math.max(1, Math.min(5, currentLevel + levelAdjustment));
      try {
        const ref = window.doc(window.db, `users/${window.auth.currentUser.uid}/children`, child.id);
        await window.updateDoc(ref, { [`subjects.${subject}`]: newLevel });
        child.subjects[subject] = newLevel;
        console.log('[Q-LEARNING] ✅ Level adjusted:', currentLevel, '→', newLevel);
      } catch (error) {
        console.error('[Q-LEARNING] ❌ Failed to update level:', error);
      }
    }

    return { message, levelAdjustment };
  }

  /**
   * Main Q-Learning workflow after session ends
   */
  async function runQLearningCycle(child, subject, lastSession) {
    try {
      console.log('[Q-LEARNING] 🧠 Starting Q-Learning cycle...');

      // Load child's Q-table from Firestore
      let qTable = child.qLearningState?.qTable || {};

      // Get recent sessions for state calculation
      const recentSessions = await getRecentSessions(child.id, 30);

      // Get current state BEFORE this session
      const currentState = getCurrentState(child, subject, recentSessions.slice(1)); // Exclude last session
      const currentStateKey = stateToKey(currentState);

      // Select action
      const action = selectAction(qTable, currentStateKey);

      // Calculate reward from the session that just completed
      const reward = calculateReward(lastSession, child, subject);

      // Get new state AFTER this session
      const newState = getCurrentState(child, subject, recentSessions); // Include last session
      const newStateKey = stateToKey(newState);

      // Update Q-table
      updateQTable(qTable, currentStateKey, action, reward, newStateKey);

      // Save updated Q-table to Firestore
      const ref = window.doc(window.db, `users/${window.auth.currentUser.uid}/children`, child.id);
      await window.updateDoc(ref, {
        'qLearningState.qTable': qTable,
        'qLearningState.lastUpdate': new Date().toISOString()
      });

      console.log('[Q-LEARNING] ✅ Q-table saved to Firestore');

      // Execute the action (for next session)
      const currentLevel = child.subjects?.[subject] || 1;
      const result = await executeQLearningAction(action, child, subject, currentLevel);

      return {
        action: action,
        reward: reward,
        qValue: qTable[currentStateKey][action],
        message: result.message,
        levelAdjustment: result.levelAdjustment
      };

    } catch (error) {
      console.error('[Q-LEARNING] ❌ Error in Q-Learning cycle:', error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ELEVENLABS - Voice TTS Integration
  // ═══════════════════════════════════════════════════════════

  // The API key is NOT here — it lives only on the server (see /api/elevenlabs.js).
  // The browser calls our own /api/elevenlabs endpoint, which adds the key securely.
  const ELEVENLABS_PROXY_URL = '/api/elevenlabs';
  const ELEVENLABS_TTS_MODEL = 'eleven_turbo_v2_5';   // fast + cheap on free tier

  // Flip this to true once your team upgrades to ElevenLabs Starter ($5/mo).
  // Cloning UI is shown but locked while this is false.
  // NOTE: voice cloning requires an active ElevenLabs Instant Voice Cloning plan.
  // We flipped this on once the team subscribed (June 2026). The UI's locked
  // banner auto-hides when this is true via applyCloningVisibility().
  const VOICE_CLONING_ENABLED = true;

  /**
   * Fallback preset voices used only if the ElevenLabs /voices API call fails.
   * Bella is currently the only one confirmed working on the free tier (April 2026).
   * Note: ElevenLabs has announced Default voices expire Dec 31, 2026 — fetching
   * from /v1/voices at runtime keeps us future-proof.
   */
  const FALLBACK_PRESETS = [
    {
      id: 'preset_bella',
      name: '🌸 Aunty Sarah',
      description: 'Soft & young female',
      elevenLabsVoiceId: 'EXAVITQu4vr4xnSDxMaL',
      isPreset: true
    }
  ];

  // Voices the API returned 402 (Payment Required) for — kept in memory so we
  // don't keep showing them to the user this session.
  const lockedVoiceIds = new Set();

  // In-memory state
  let mediaRecorder = null;        // kept for cloning (premium feature, gated)
  let recordedChunks = [];
  let recordedBlob = null;
  let parentVoices = [];           // cloned voices loaded from Firestore (empty until premium unlocks)
  let presetVoices = [];           // dynamically populated from ElevenLabs /v1/voices
  let recordingTimer = null;
  let recordingStartTime = null;

  // Master toggle: turns ElevenLabs on/off entirely (saves quota)
  let elevenLabsEnabled = false;   // default OFF — opt-in to protect quota

  // All children of the current parent — used by the voice-assignment UI.
  // Shape: [{ id, name, selectedVoiceId }]
  let parentChildren = [];

  // Audio cache so we don't burn quota repeating the same line
  const ttsAudioCache = new Map(); // key: `${voiceId}|${text}` → Blob

  /**
   * Returns combined list of preset voices + cloned voices, excluding any
   * we've discovered are locked (402) this session.
   */
  function getAllAvailableVoices() {
    return [...presetVoices, ...parentVoices]
      .filter(v => !lockedVoiceIds.has(v.elevenLabsVoiceId));
  }

  /**
   * Find a voice (preset or cloned) by its app-side id.
   * Includes backwards-compat for legacy hardcoded preset IDs from earlier versions.
   */
  function findVoiceById(voiceId) {
    if (!voiceId) return null;
    const all = getAllAvailableVoices();
    // Direct match first
    let match = all.find(v => v.id === voiceId);
    if (match) return match;
    // Legacy mapping: old hardcoded ids → new ElevenLabs voice IDs (where the voice still works)
    const LEGACY_MAP = {
      'preset_bella': 'EXAVITQu4vr4xnSDxMaL'
      // Charlotte, Domi, Rachel intentionally NOT mapped — they 402 on free tier now.
      // Children using those will fall back to browser TTS.
    };
    const mappedElevenId = LEGACY_MAP[voiceId];
    if (mappedElevenId) {
      match = all.find(v => v.elevenLabsVoiceId === mappedElevenId);
      if (match) return match;
    }
    return null;
  }

  /**
   * Curate the ElevenLabs default voice list down to ~4 child-friendly options.
   * Each ElevenLabs voice has labels like {gender, age, accent, use_case, description}.
   * We prefer female + younger voices for kids, with friendly emojis as display names.
   */
  function curateChildFriendlyVoices(rawVoices) {
    // Score each voice by kid-friendliness
    const scored = rawVoices.map(v => {
      const labels = v.labels || {};
      const desc = (v.description || '').toLowerCase();
      let score = 0;

      // Prefer female
      if ((labels.gender || '').toLowerCase() === 'female') score += 3;
      // Prefer young / soft / calm
      if (/young|soft|calm|gentle|warm|sweet|friendly/.test(desc)) score += 2;
      if (/young/.test((labels.age || '').toLowerCase())) score += 2;
      // Prefer narration / conversational use cases
      const useCase = (labels.use_case || labels.usecase || '').toLowerCase();
      if (/narrat|conversat|character|children/.test(useCase)) score += 1;
      // English accents are most reliable
      if (/american|british/.test((labels.accent || '').toLowerCase())) score += 1;
      // De-prioritize anything labeled news/intense/dramatic
      if (/news|intense|dramatic|villain|deep/.test(desc)) score -= 2;

      return { voice: v, score };
    });

    // Sort high to low, take top N
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 4).map(s => s.voice);

    // Convert to our app's voice format with kid-friendly emojis
    const emojis = ['🌸', '💝', '🌟', '📖'];
    return top.map((v, i) => ({
      id: `preset_${v.voice_id}`,
      name: `${emojis[i] || '🎤'} ${v.name}`,
      description: v.description || (v.labels?.description || 'Friendly voice'),
      elevenLabsVoiceId: v.voice_id,
      isPreset: true
    }));
  }

  /**
   * Fetch the voices the current ElevenLabs account can access.
   * Falls back to a hardcoded list if the API is unreachable.
   */
  async function fetchAvailablePresetVoices() {
    try {
      const res = await fetch(`${ELEVENLABS_PROXY_URL}?action=voices`, {
        method: 'GET'
      });
      if (!res.ok) {
        console.warn('[VOICE] /v1/voices failed, using fallback. Status:', res.status);
        presetVoices = [...FALLBACK_PRESETS];
        return;
      }
      const data = await res.json();
      const raw = (data.voices || []).filter(v => v.category === 'premade' || !v.category);
      if (!raw.length) {
        console.warn('[VOICE] /v1/voices returned no voices — using fallback');
        presetVoices = [...FALLBACK_PRESETS];
        return;
      }
      presetVoices = curateChildFriendlyVoices(raw);
      console.log('[VOICE] Loaded', presetVoices.length, 'preset voices from ElevenLabs');
    } catch (e) {
      console.warn('[VOICE] Failed to fetch voices, using fallback:', e);
      presetVoices = [...FALLBACK_PRESETS];
    }
  }

  /**
   * Upload a recorded audio Blob to ElevenLabs to create a cloned voice.
   * Only used when VOICE_CLONING_ENABLED is true (premium).
   */
  async function uploadVoiceToElevenLabs(audioBlob, voiceName) {
    const formData = new FormData();
    formData.append('name', voiceName);
    formData.append('description', `LearnBuddy parent voice: ${voiceName}`);
    formData.append('files', audioBlob, `${voiceName}.webm`);

    const res = await fetch(`${ELEVENLABS_PROXY_URL}?action=add`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.text();
      // Log full provider error for debugging, but throw a user-neutral message.
      console.error('[VOICE] Voice upload provider error:', res.status, err);
      throw new Error(`Voice upload failed (${res.status}). Please try again.`);
    }
    const data = await res.json();
    return data.voice_id;
  }

  /**
   * Delete a cloned voice from ElevenLabs by voice_id.
   */
  async function deleteVoiceFromElevenLabs(elevenLabsVoiceId) {
    try {
      const res = await fetch(`${ELEVENLABS_PROXY_URL}?action=delete&voiceId=${elevenLabsVoiceId}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch (e) {
      console.warn('[VOICE] ElevenLabs delete failed:', e);
      return false;
    }
  }

  /**
   * Generate spoken audio from text using a voice (preset or cloned).
   * Returns an audio Blob (or null on failure so caller can fall back).
   * On 402 (paid voice), marks the voice as locked so we stop showing it.
   */
  async function generateSpeechElevenLabs(text, elevenLabsVoiceId) {
    const cacheKey = `${elevenLabsVoiceId}|${text}`;
    if (ttsAudioCache.has(cacheKey)) {
      return ttsAudioCache.get(cacheKey);
    }
    try {
      const res = await fetch(
        `${ELEVENLABS_PROXY_URL}?action=tts&voiceId=${elevenLabsVoiceId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          body: JSON.stringify({
            text,
            model_id: ELEVENLABS_TTS_MODEL,
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
          })
        }
      );
      if (!res.ok) {
        console.warn('[VOICE] TTS failed, status:', res.status);
        // 402 = this voice requires a paid plan. Hide it from the UI for this session.
        if (res.status === 402) {
          lockedVoiceIds.add(elevenLabsVoiceId);
          // Re-render so user sees the voice disappear
          renderVoicesList();
          refreshChildVoiceDropdown();
        }
        return null;
      }
      const blob = await res.blob();
      ttsAudioCache.set(cacheKey, blob);
      return blob;
    } catch (e) {
      console.warn('[VOICE] TTS network error:', e);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TODDLER MODE - Vocabulary, helpers, mode detection
  // ═══════════════════════════════════════════════════════════
  //
  // Toddler Mode is designed for children aged 2-5 who cannot read.
  // Questions are presented as a 2x2 grid of large emoji tiles.
  // The LLM is constrained to picking answer options from a curated
  // vocabulary of concrete nouns we have emoji for. This ensures every
  // option always has a working visual representation.

  const TODDLER_VOCAB = {
    animals: {
      cat: '🐱', dog: '🐶', cow: '🐄', horse: '🐴', pig: '🐷',
      sheep: '🐑', goat: '🐐', chicken: '🐔', duck: '🦆', rabbit: '🐰',
      mouse: '🐭', lion: '🦁', tiger: '🐯', elephant: '🐘', monkey: '🐵',
      bear: '🐻', zebra: '🦓', giraffe: '🦒', kangaroo: '🦘', panda: '🐼',
      fox: '🦊', wolf: '🐺', deer: '🦌', fish: '🐟', whale: '🐳',
      dolphin: '🐬', shark: '🦈', octopus: '🐙', frog: '🐸', snake: '🐍',
      turtle: '🐢', owl: '🦉', eagle: '🦅', parrot: '🦜', butterfly: '🦋',
      bee: '🐝', ant: '🐜', spider: '🕷️', snail: '🐌'
    },
    food: {
      apple: '🍎', banana: '🍌', orange: '🍊', grape: '🍇', strawberry: '🍓',
      watermelon: '🍉', pineapple: '🍍', lemon: '🍋', cherry: '🍒', peach: '🍑',
      carrot: '🥕', potato: '🥔', tomato: '🍅', corn: '🌽', broccoli: '🥦',
      bread: '🍞', cheese: '🧀', egg: '🥚', milk: '🥛', water: '💧',
      juice: '🧃', cake: '🍰', cookie: '🍪', pizza: '🍕', 'ice cream': '🍦',
      candy: '🍬'
    },
    colors: {
      red: '🔴', blue: '🔵', green: '🟢', yellow: '🟡', orange: '🟠',
      purple: '🟣', pink: '🌸', black: '⚫', white: '⚪', brown: '🟤'
    },
    shapes: {
      circle: '⭕', square: '🟦', triangle: '🔺', star: '⭐',
      heart: '❤️', diamond: '💎'
    },
    numbers: {
      one: '1️⃣', two: '2️⃣', three: '3️⃣', four: '4️⃣', five: '5️⃣',
      six: '6️⃣', seven: '7️⃣', eight: '8️⃣', nine: '9️⃣', ten: '🔟'
    },
    vehicles: {
      car: '🚗', bus: '🚌', truck: '🚚', train: '🚂', airplane: '✈️',
      helicopter: '🚁', boat: '⛵', ship: '🚢', bicycle: '🚲',
      motorcycle: '🏍️', rocket: '🚀', tractor: '🚜'
    },
    body: {
      eye: '👁️', ear: '👂', nose: '👃', mouth: '👄', hand: '✋',
      foot: '🦶', hair: '💇', tooth: '🦷', tongue: '👅', finger: '👆'
    },
    nature: {
      sun: '☀️', moon: '🌙', cloud: '☁️', rain: '🌧️', snow: '❄️',
      rainbow: '🌈', tree: '🌳', flower: '🌸', leaf: '🍃',
      mountain: '⛰️', fire: '🔥'
    },
    objects: {
      ball: '⚽', book: '📖', pencil: '✏️', scissors: '✂️', key: '🔑',
      clock: '🕐', phone: '📱', computer: '💻', chair: '🪑', bed: '🛏️',
      lamp: '💡', cup: '☕', plate: '🍽️', spoon: '🥄', umbrella: '☂️'
    },
    clothing: {
      shirt: '👕', pants: '👖', shoes: '👟', hat: '🎩', socks: '🧦',
      jacket: '🧥', dress: '👗', gloves: '🧤'
    },
    places: {
      house: '🏠', school: '🏫', hospital: '🏥', park: '🏞️',
      beach: '🏖️', farm: '🌾'
    }
  };

  // Build a flat word→emoji lookup for fast access
  const TODDLER_WORD_TO_EMOJI = (() => {
    const flat = {};
    Object.values(TODDLER_VOCAB).forEach(category => {
      Object.entries(category).forEach(([word, emoji]) => {
        flat[word.toLowerCase()] = emoji;
      });
    });
    return flat;
  })();

  // Return the emoji for a vocabulary word, or null if not found.
  // The LLM should only return words that are in this lookup, but we
  // defensively return null for unknown words so the UI can handle it.
  function getEmojiForWord(word) {
    if (!word) return null;
    return TODDLER_WORD_TO_EMOJI[String(word).toLowerCase().trim()] || null;
  }

  // Return all vocabulary words as a flat array (for the LLM prompt).
  function getAllToddlerWords() {
    return Object.keys(TODDLER_WORD_TO_EMOJI);
  }

  // ─── Mode detection ───
  // A child is in Toddler Mode if:
  //   (a) their age is 2-5 AND no override flag is set, OR
  //   (b) the parent has explicitly turned on the toddlerModeOverride flag
  // For now we use age-based default. The parent override toggle is built
  // into the child profile in a later step.
  function isToddlerMode(child) {
    if (!child) return false;
    // Explicit override wins if set
    if (child.toddlerModeOverride === true) return true;
    if (child.toddlerModeOverride === false) return false;
    // Default: age-based
    const age = Number(child.age) || 0;
    return age >= 2 && age <= 5;
  }

  // How many questions per session in toddler mode (vs. 5 for regular)
  const TODDLER_SESSION_LENGTH = 4;

  // Subjects available in Toddler Mode (Computer & Modern Tech excluded —
  // concepts are too abstract for 2-5 year olds)
  const TODDLER_SUBJECTS = ['maths', 'science', 'english', 'general_knowledge'];

  function isSubjectAvailableForToddler(subject) {
    return TODDLER_SUBJECTS.includes(subject);
  }

  // ─── Twemoji rendering helper ───
  // Twemoji replaces native emoji characters in a DOM element with
  // illustrated SVG <img> tags. Same look across all devices/browsers.
  // Safe to call even if Twemoji isn't loaded yet (just no-ops).
  function applyTwemoji(element) {
    if (!element) return;
    if (typeof window.twemoji === 'undefined') return;
    try {
      window.twemoji.parse(element, {
        folder: 'svg',
        ext: '.svg',
        className: 'twemoji'
      });
    } catch (e) {
      console.warn('[Twemoji] parse failed:', e);
    }
  }

  // Console test helper — paste in DevTools to verify vocab is loaded
  window.testToddlerVocab = function() {
    console.log('[TODDLER] Total vocabulary words:', getAllToddlerWords().length);
    console.log('[TODDLER] Categories:', Object.keys(TODDLER_VOCAB));
    console.log('[TODDLER] Sample lookups:');
    ['cow', 'apple', 'red', 'triangle', 'three', 'car'].forEach(w => {
      console.log(`  ${w} → ${getEmojiForWord(w)}`);
    });
    console.log('[TODDLER] Twemoji loaded?', typeof window.twemoji !== 'undefined');
  };

  // ═══════════════════════════════════════════════════════════
  // SPEECH-TO-TEXT — voice answers for Toddler Mode
  // ═══════════════════════════════════════════════════════════
  //
  // Wraps the browser's webkitSpeechRecognition API with the behavior we want:
  //   - Single-shot recognition (start → result → stop)
  //   - Short timeout so it doesn't listen forever
  //   - Fuzzy matching against the 4 option words
  //   - Graceful degradation when unsupported / permission denied
  //
  // Voice is ALWAYS optional — tap-to-answer continues to work no matter what.
  // After 2 consecutive failed attempts, we quietly stop offering voice for the
  // rest of the session (the mic button hides).

  // Detect browser support. Safari/Firefox lack webkitSpeechRecognition or are buggy.
  function isSpeechRecognitionSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  // The recognition instance. We keep one per session and recycle it.
  // Browser recognition objects can be flaky if reused across many starts, but
  // we destroy/recreate on the first error to recover.
  let _sttInstance = null;
  let _sttListening = false;
  let _sttSession = { failedAttempts: 0, disabled: false };

  /**
   * Reset the session-level state when a new quiz session starts.
   */
  function resetSpeechToTextSession() {
    _sttSession = { failedAttempts: 0, disabled: false };
    stopSpeechToText();
  }

  /**
   * Create (or recreate) the recognition instance.
   * Returns null if browser doesn't support it.
   */
  function createSpeechRecognition() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = 'en-US';      // English; could be configurable later
    rec.interimResults = false;
    rec.maxAlternatives = 3; // give us a few candidates so fuzzy match has options
    rec.continuous = false;
    return rec;
  }

  /**
   * Stop any in-flight recognition.
   * Safe to call even if nothing is listening.
   */
  function stopSpeechToText() {
    if (_sttInstance && _sttListening) {
      try { _sttInstance.stop(); } catch {}
    }
    _sttListening = false;
  }

  /**
   * Start a single recognition attempt.
   * Calls callbacks with a normalized result so the UI doesn't have to know
   * about the underlying browser API.
   *
   * @param {Object} handlers
   *   onListening()    — called when the mic starts listening
   *   onResult(text)   — called with the recognized text (lowercased, trimmed)
   *                       (includes ALL alternatives joined, so fuzzy match has more to work with)
   *   onError(reason)  — 'no-speech' | 'denied' | 'no-match' | 'unknown'
   *   onEnd()          — called whenever listening stops (success or fail)
   */
  function startSpeechToText(handlers) {
    if (!isSpeechRecognitionSupported()) {
      handlers?.onError?.('unsupported');
      handlers?.onEnd?.();
      return;
    }
    if (_sttListening) {
      // Already listening — treat as toggle-off
      stopSpeechToText();
      return;
    }

    const rec = createSpeechRecognition();
    if (!rec) {
      handlers?.onError?.('unsupported');
      handlers?.onEnd?.();
      return;
    }
    _sttInstance = rec;

    let gotResult = false;

    rec.onstart = () => {
      _sttListening = true;
      handlers?.onListening?.();
    };

    rec.onresult = (event) => {
      gotResult = true;
      // Collect all alternatives, lowercased and trimmed — fuzzy match later
      const alternatives = [];
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        for (let j = 0; j < res.length; j++) {
          const t = String(res[j].transcript || '').trim().toLowerCase();
          if (t) alternatives.push(t);
        }
      }
      console.log('[STT] Heard alternatives:', alternatives);
      handlers?.onResult?.(alternatives);
    };

    rec.onerror = (event) => {
      console.warn('[STT] Recognition error:', event.error);
      let reason = 'unknown';
      if (event.error === 'no-speech') reason = 'no-speech';
      else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') reason = 'denied';
      else if (event.error === 'aborted') reason = 'aborted';
      handlers?.onError?.(reason);
    };

    rec.onend = () => {
      _sttListening = false;
      // If we never got a result and didn't error → no-match (silent listener)
      if (!gotResult) handlers?.onError?.('no-match');
      handlers?.onEnd?.();
    };

    try {
      rec.start();
    } catch (e) {
      console.warn('[STT] Failed to start:', e);
      handlers?.onError?.('unknown');
      handlers?.onEnd?.();
    }
  }

  /**
   * Given a list of recognized phrases (lowercased) and the 4 option words,
   * return the best matching option, or null if no good match.
   *
   * Matching rules (in order of preference):
   *   1. Exact match of any alternative to an option
   *   2. Option appears as a whole word inside any alternative (handles "a cow", "the cow", "cows")
   *   3. Levenshtein distance ≤ 1 to any alternative (handles "cau" → "cow")
   *   4. Otherwise null
   */
  function matchSpokenToOption(spokenAlternatives, options) {
    if (!spokenAlternatives?.length || !options?.length) return null;
    const lowerOpts = options.map(o => String(o).toLowerCase().trim());

    // Pass 1: exact match
    for (const alt of spokenAlternatives) {
      const idx = lowerOpts.indexOf(alt);
      if (idx >= 0) return options[idx];
    }

    // Pass 2: option-as-word inside the alternative (boundary-aware regex)
    // e.g. spoken "the cow" → matches option "cow"
    // Also handles plural-by-trailing-s ("cows" → "cow") by stripping one trailing s
    for (const alt of spokenAlternatives) {
      for (let i = 0; i < lowerOpts.length; i++) {
        const opt = lowerOpts[i];
        // Try direct word boundary match
        const wordRx = new RegExp(`\\b${opt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (wordRx.test(alt)) return options[i];
        // Try plural: option "cow" matches spoken "cows"
        if (alt === opt + 's') return options[i];
        // Try "a/the X"
        if (alt === `a ${opt}` || alt === `the ${opt}` || alt === `an ${opt}`) return options[i];
      }
    }

    // Pass 3: Levenshtein distance ≤ 1 (catches recognition typos like "cau"→"cow")
    // Only for SHORT options (≤6 chars) to avoid false positives on longer words.
    for (const alt of spokenAlternatives) {
      for (let i = 0; i < lowerOpts.length; i++) {
        const opt = lowerOpts[i];
        if (opt.length > 6) continue;
        if (Math.abs(alt.length - opt.length) > 1) continue;
        if (levenshtein(alt, opt) <= 1) return options[i];
      }
    }

    return null;
  }

  // Tiny Levenshtein implementation — only used for short words (≤6 chars)
  // so the O(n*m) cost is negligible.
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const m = [];
    for (let i = 0; i <= b.length; i++) m[i] = [i];
    for (let j = 0; j <= a.length; j++) m[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          m[i][j] = m[i - 1][j - 1];
        } else {
          m[i][j] = Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
        }
      }
    }
    return m[b.length][a.length];
  }

  /**
   * Should this child be offered voice answers in Toddler Mode?
   * Requires: opted in by parent + browser support + not yet given up this session.
   */
  function shouldOfferVoiceAnswers(child) {
    if (!child) return false;
    if (!child.voiceAnswersEnabled) return false;
    if (!isToddlerMode(child)) return false;
    if (!isSpeechRecognitionSupported()) return false;
    if (_sttSession.disabled) return false;
    return true;
  }

  // Console test helper
  window.testSpeechToText = function() {
    console.log('[STT] Supported?', isSpeechRecognitionSupported());
    console.log('[STT] Current session state:', _sttSession);
    console.log('[STT] Try a match test: matchSpokenToOption(["cow"], ["cow","dog","cat","pig"]) →',
      matchSpokenToOption(['cow'], ['cow','dog','cat','pig']));
    console.log('[STT] Try a fuzzy test: matchSpokenToOption(["a cow"], ["cow","dog","cat","pig"]) →',
      matchSpokenToOption(['a cow'], ['cow','dog','cat','pig']));
    console.log('[STT] Try a fuzzy test: matchSpokenToOption(["cau"], ["cow","dog","cat","pig"]) →',
      matchSpokenToOption(['cau'], ['cow','dog','cat','pig']));
  };

  // ═══════════════════════════════════════════════════════════
  // ACHIEVEMENT BADGES — definitions, checking, persistence
  // ═══════════════════════════════════════════════════════════
  //
  // Each badge has:
  //   id          — canonical string ID (used as Firestore doc ID for dedup)
  //   icon        — emoji shown in the UI
  //   name        — display name shown to child + parent
  //   description — what the child did to earn it / what they need to do
  //   category    — engagement | performance | behavior (for grouping)
  //   check(s)    — function that returns true if the badge is earned, given the stats object `s`
  //
  // Badges are checked at session end (in checkAndUnlockBadges()).
  // Earned badges are stored in users/{parentUID}/children/{childID}/badges/{badgeID}.
  // Using badge ID as the Firestore document ID gives us idempotent writes — a badge
  // can be earned exactly once, and re-checking is a no-op.

  const BADGE_DEFINITIONS = [
    // ── Engagement (reward showing up) ──
    {
      id: 'first_step',
      icon: '🌟',
      name: 'First Step',
      description: 'Complete your very first session',
      category: 'engagement',
      check: (s) => s.totalSessions >= 1
    },
    {
      id: 'five_day_streak',
      icon: '🔥',
      name: '5-Day Streak',
      description: 'Play LearnBuddy 5 days in a row',
      category: 'engagement',
      check: (s) => s.currentStreak >= 5
    },
    {
      id: 'ten_sessions',
      icon: '💪',
      name: '10 Sessions',
      description: 'Complete 10 learning sessions',
      category: 'engagement',
      check: (s) => s.totalSessions >= 10
    },

    // ── Performance (reward doing well) ──
    {
      id: 'perfect_score',
      icon: '🎯',
      name: 'Perfect Score',
      description: 'Get every question right in a session',
      category: 'performance',
      check: (s) => s.perfectInThisSession === true
    },
    {
      id: 'level_up',
      icon: '🚀',
      name: 'Level Up',
      description: 'Reach Level 3 in any subject',
      category: 'performance',
      check: (s) => s.maxSubjectLevel >= 3
    },
    {
      id: 'master',
      icon: '⭐',
      name: 'Master',
      description: 'Reach Level 5 in any subject',
      category: 'performance',
      check: (s) => s.maxSubjectLevel >= 5
    },

    // ── Behavior (reward good habits) ──
    {
      id: 'independent_thinker',
      icon: '🤔',
      name: 'Independent Thinker',
      description: 'Get 80% or higher in a session without using any hints',
      category: 'behavior',
      // Toddler sessions are 4 questions; regular are 5. 0.8 works for both.
      check: (s) => s.hintsInThisSession === 0 && s.accuracyInThisSession >= 0.8
    },
    {
      id: 'comeback_kid',
      icon: '💪',
      name: 'Comeback Kid',
      description: 'Get a perfect score in a subject you struggled with before',
      category: 'behavior',
      check: (s) => s.perfectInThisSession === true && s.previouslyStruggledThisSubject === true
    }
  ];

  // Lookup by ID
  const BADGE_BY_ID = {};
  BADGE_DEFINITIONS.forEach(b => { BADGE_BY_ID[b.id] = b; });

  /**
   * Get the IDs of badges a child has already earned.
   * Returns a Set of badge IDs for fast lookup.
   */
  async function getEarnedBadgeIds(childId) {
    try {
      const parentUid = window.auth?.currentUser?.uid;
      if (!parentUid || !childId) return new Set();
      const badgesRef = window.collection(window.db, `users/${parentUid}/children/${childId}/badges`);
      const snapshot = await window.getDocs(badgesRef);
      const ids = new Set();
      snapshot.forEach(doc => ids.add(doc.id));
      return ids;
    } catch (e) {
      console.warn('[BADGES] Could not load earned badges:', e);
      return new Set();
    }
  }

  /**
   * Get full earned-badge data (with earnedAt timestamps).
   * Returns an array of { badgeId, earnedAt, ...definition } objects.
   */
  async function getEarnedBadges(childId) {
    try {
      const parentUid = window.auth?.currentUser?.uid;
      if (!parentUid || !childId) return [];
      const badgesRef = window.collection(window.db, `users/${parentUid}/children/${childId}/badges`);
      const snapshot = await window.getDocs(badgesRef);
      const earned = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const def = BADGE_BY_ID[doc.id];
        if (def) earned.push({ ...def, earnedAt: data.earnedAt, earnedInSession: data.earnedInSession });
      });
      // Sort by most recently earned first
      earned.sort((a, b) => new Date(b.earnedAt) - new Date(a.earnedAt));
      return earned;
    } catch (e) {
      console.warn('[BADGES] Could not load earned badges:', e);
      return [];
    }
  }

  /**
   * Persist a newly-earned badge to Firestore.
   * Returns true on success, false on failure (silent — badges are non-critical).
   */
  async function persistEarnedBadge(childId, badgeId, sessionRefId = null) {
    try {
      const parentUid = window.auth?.currentUser?.uid;
      if (!parentUid || !childId) return false;
      const badgeRef = window.doc(window.db, `users/${parentUid}/children/${childId}/badges/${badgeId}`);
      await window.setDoc(badgeRef, {
        badgeId,
        earnedAt: new Date().toISOString(),
        earnedInSession: sessionRefId || null
      });
      console.log(`[BADGES] 🏆 Persisted badge: ${badgeId}`);
      return true;
    } catch (e) {
      console.warn(`[BADGES] Failed to persist badge ${badgeId}:`, e);
      return false;
    }
  }

  /**
   * Compute the stats object that badge check() functions consume.
   *
   * `sessionContext` is data about the JUST-FINISHED session:
   *   { score, totalQuestions, hintsUsed, subject }
   *
   * Returns a stats object with everything badges need.
   */
  /**
   * Compute the stats object that badge check() functions consume.
   *
   * `sessionContext` is data about the JUST-FINISHED session:
   *   { score, totalQuestions, hintsUsed, subject }
   *
   * `allSessionsForChild` (optional) — pre-fetched array of this child's sessions.
   *   If not provided, we fetch them ourselves. Passing them in avoids a duplicate
   *   round-trip when the caller already has them.
   *
   * Returns a stats object with everything badges need.
   */
  async function computeBadgeStats(child, sessionContext, allSessionsForChild = null) {
    const childId = child.id || child.childId;
    const subjects = child.subjects || {};
    const subjectLevels = Object.values(subjects);
    const maxSubjectLevel = subjectLevels.length > 0 ? Math.max(...subjectLevels) : 1;

    // Fetch sessions only if the caller didn't pre-provide them
    let sessions = allSessionsForChild;
    if (!sessions) {
      try {
        const sessionsRef = window.collection(window.db, 'sessions');
        const snapshot = await window.getDocs(sessionsRef);
        sessions = [];
        snapshot.forEach(docSnap => {
          const s = docSnap.data();
          if (s.childId === childId) sessions.push(s);
        });
      } catch (e) {
        console.warn('[BADGES] Could not query sessions for stats:', e);
        sessions = [];
      }
    }

    // Total sessions for this child
    const totalSessions = sessions.length;

    // Comeback Kid: prior low-accuracy session in this subject
    const previouslyStruggledThisSubject = sessions.some(s =>
      s.subject === sessionContext.subject && (s.accuracy || 0) < 50
    );

    // Current streak — derived from the same sessions list (no separate fetch needed)
    const currentStreak = computeStreakFromSessions(sessions);

    const perfectInThisSession = sessionContext.score === sessionContext.totalQuestions;
    const accuracyInThisSession = sessionContext.totalQuestions > 0
      ? sessionContext.score / sessionContext.totalQuestions
      : 0;

    return {
      totalSessions,
      currentStreak,
      maxSubjectLevel,
      perfectInThisSession,
      accuracyInThisSession,
      hintsInThisSession: sessionContext.hintsUsed || 0,
      previouslyStruggledThisSubject
    };
  }

  /**
   * Pure helper: compute a streak from an in-memory sessions array.
   * Same logic as calculateStreak() but operates on already-fetched data.
   */
  function computeStreakFromSessions(sessions) {
    if (!sessions || sessions.length === 0) return 0;
    const sortedDates = [...new Set(
      sessions
        .map(s => s.date ? new Date(s.date).toDateString() : null)
        .filter(Boolean)
    )].sort((a, b) => new Date(b) - new Date(a));

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < sortedDates.length; i++) {
      const sessionDate = new Date(sortedDates[i]);
      sessionDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((today - sessionDate) / (1000 * 60 * 60 * 24));
      if (daysDiff === i) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  /**
   * Check all badge definitions against the current child stats.
   * Persists any newly-earned badges to Firestore.
   * Returns an array of newly-unlocked badge definitions (the ones to celebrate).
   *
   * Optimizations:
   *  - Earned IDs + sessions fetched in parallel (was sequential).
   *  - Badge writes happen in parallel (was awaited one at a time).
   *  - Timing logs so we can see where any slowdown comes from.
   */
  async function checkAndUnlockBadges(child, sessionContext, sessionRefId = null) {
    const t0 = performance.now();
    try {
      const childId = child.id || child.childId;
      const parentUid = window.auth?.currentUser?.uid;

      // Fetch earned badge IDs AND this child's sessions in parallel.
      // These are independent Firestore reads; doing them in parallel halves wall time.
      const tFetch = performance.now();
      const [earnedIds, allSessionsForChild] = await Promise.all([
        getEarnedBadgeIds(childId),
        (async () => {
          try {
            const sessionsRef = window.collection(window.db, 'sessions');
            const snapshot = await window.getDocs(sessionsRef);
            const list = [];
            snapshot.forEach(docSnap => {
              const s = docSnap.data();
              if (s.childId === childId) list.push(s);
            });
            return list;
          } catch (e) {
            console.warn('[BADGES] Sessions fetch failed:', e);
            return [];
          }
        })()
      ]);
      console.log(`[BADGES] Fetched (${earnedIds.size} earned, ${allSessionsForChild.length} sessions) in ${Math.round(performance.now() - tFetch)}ms`);

      // Compute stats from already-fetched sessions (no extra round trip)
      const stats = await computeBadgeStats(child, sessionContext, allSessionsForChild);
      console.log('[BADGES] Stats for check:', stats);

      // Figure out which badges newly unlock — pure synchronous logic
      const toUnlock = [];
      for (const def of BADGE_DEFINITIONS) {
        if (earnedIds.has(def.id)) continue;
        let earned = false;
        try { earned = !!def.check(stats); } catch (e) {
          console.warn(`[BADGES] Check failed for ${def.id}:`, e);
        }
        if (earned) toUnlock.push(def);
      }

      if (toUnlock.length === 0) {
        console.log(`[BADGES] No new badges (total time ${Math.round(performance.now() - t0)}ms)`);
        return [];
      }

      // Persist all newly-earned badges in parallel
      const tWrite = performance.now();
      const writeResults = await Promise.all(
        toUnlock.map(def => persistEarnedBadge(childId, def.id, sessionRefId))
      );
      console.log(`[BADGES] Wrote ${toUnlock.length} badges in ${Math.round(performance.now() - tWrite)}ms`);

      // Keep only the ones that successfully persisted
      const newlyUnlocked = toUnlock.filter((_, i) => writeResults[i]);

      console.log(`[BADGES] 🎉 Unlocked ${newlyUnlocked.length} badge(s) in total ${Math.round(performance.now() - t0)}ms:`, newlyUnlocked.map(b => b.name));
      return newlyUnlocked;
    } catch (e) {
      console.error('[BADGES] checkAndUnlockBadges failed:', e);
      return [];
    }
  }

  // Console test helper
  window.testBadges = async function() {
    if (!currentChild) return console.warn('No current child');
    const earned = await getEarnedBadges(currentChild.id);
    console.log('[BADGES] Currently earned:', earned.map(b => `${b.icon} ${b.name}`));
    console.log('[BADGES] Total defined:', BADGE_DEFINITIONS.length);
    console.log('[BADGES] Locked:', BADGE_DEFINITIONS.length - earned.length);
  };

  // ═══════════════════════════════════════════════════════════
  // LLM INTEGRATION - Groq Question Generation (FREE & FAST!)
  // ═══════════════════════════════════════════════════════════

  // The API key is NOT here — it lives only on the server (see /api/groq.js).
  // The browser calls our own /api/groq endpoint, which adds the key securely.
  const GROQ_PROXY_URL = '/api/groq';
  const GROQ_MODEL = 'llama-3.3-70b-versatile';  // Better instruction-following for strict subject hierarchy

  // TEST FUNCTION - Run this in console to test API
  window.testGroqAPI = async function() {
    console.log('[TEST] Testing Groq API via secure proxy...');
    console.log('[TEST] Online?', navigator.onLine);

    try {
      const response = await fetch(GROQ_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: 'Say hello' }],
          max_tokens: 50
        })
      });
      
      console.log('[TEST] Response status:', response.status);
      const data = await response.json();
      console.log('[TEST] Response data:', data);
      
      if (response.ok) {
        console.log('[TEST] ✅ API WORKS! Response:', data.choices[0].message.content);
      } else {
        console.error('[TEST] ❌ API ERROR:', data);
      }
    } catch (error) {
      console.error('[TEST] ❌ NETWORK ERROR:', error);
    }
  };

  /**
   * Generate a question using Groq
   * @param {Object} params - Question generation parameters
   * @returns {Promise<Object>} Generated question in JSON format
   */
  async function generateQuestionWithLLM(params) {
    const { subject, level, age, interests, weakTopics, parentGoals } = params;

    console.log('[LLM] Generating question with Groq:', params);

    const prompt = buildLLMPrompt(subject, level, age, interests, weakTopics, parentGoals);

    try {
      const response = await fetch(GROQ_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are an expert educational content creator for children aged 2-12. Generate age-appropriate quiz questions in JSON format. Return ONLY valid JSON, no markdown, no explanations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.8,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Groq API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content.trim();
      
      console.log('[LLM] Raw Groq response:', content);

      // Clean up response (remove markdown code blocks if present)
      let cleanContent = content;
      if (content.includes('```json')) {
        cleanContent = content.split('```json')[1].split('```')[0].trim();
      } else if (content.includes('```')) {
        cleanContent = content.split('```')[1].split('```')[0].trim();
      }

      const question = JSON.parse(cleanContent);

      console.log('[LLM] ✅ Generated question:', question);

      return question;

    } catch (error) {
      console.error('[LLM] ❌ Error generating question with Groq:', error);
      throw error;
    }
  }

  /**
   * Helper: parse retry-after time from a Groq 429 error.
   * Groq returns a message like "Please try again in 3.35s".
   * Returns milliseconds to wait, or 0 if not parseable.
   */
  function parseRetryAfterMs(errorBody, headerVal) {
    // Try Retry-After header first (in seconds)
    if (headerVal) {
      const num = parseFloat(headerVal);
      if (!isNaN(num)) return Math.ceil(num * 1000);
    }
    // Fall back to parsing the message
    try {
      const msg = typeof errorBody === 'string'
        ? errorBody
        : JSON.stringify(errorBody || {});
      const match = msg.match(/try again in ([\d.]+)s/i);
      if (match) return Math.ceil(parseFloat(match[1]) * 1000);
    } catch {}
    return 0;
  }

  /**
   * Generate ALL questions for a session in a single Groq call.
   * This cuts token usage by ~67% vs calling 5 times because the system
   * prompt is only sent once. Includes retry-on-429.
   *
   * Returns an array of question objects, or throws on hard failure.
   */
  async function generateBatchQuestionsWithLLM(params, count = 5) {
    const { subject, level, age, interests, weakTopics, parentGoals, avoidList, mode, weakConcepts } = params;
    const isToddler = mode === 'toddler';
    const isRequiz = !!(weakConcepts && weakConcepts.length > 0);
    console.log(`[LLM] Generating ${count} questions in one batch call (mode: ${isToddler ? 'toddler' : isRequiz ? 'requiz' : 'regular'}):`, params);

    // Pick the right prompt builder based on mode
    const prompt = isToddler
      ? buildToddlerBatchPrompt(subject, age, interests, count, avoidList)
      : buildBatchLLMPrompt(subject, level, age, interests, weakTopics, parentGoals, count, avoidList, weakConcepts);

    // System message tuned for the mode
    const systemMessage = isToddler
      ? 'You are an expert at creating picture-based quiz questions for toddlers aged 2-5 who cannot read. You strictly use only the vocabulary list given to you for answer options. Questions must be visually answerable from emoji alone. Return ONLY valid JSON.'
      : 'You are an expert educational content creator for children aged 2-12. You strictly follow the subject hierarchy given by the user: the SUBJECT is non-negotiable, INTERESTS are only theming. You verify every fact before including it — children should never learn wrong information from your questions. Every batch you produce should explore DIFFERENT topics, scenarios, and wording than previous batches. Return ONLY valid JSON.';

    // Try once, retry once on 429
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(GROQ_PROXY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
              { role: 'system', content: systemMessage },
              { role: 'user', content: prompt }
            ],
            // 0.85 is high enough to give real variety across sessions
            // but low enough that factual questions stay consistent.
            temperature: 0.85,
            // Discourage the model from reusing the same words/phrases.
            // These two together significantly reduce repetition.
            presence_penalty: 0.6,
            frequency_penalty: 0.4,
            top_p: 0.95,
            // Different seed every call → different generation path even with the same prompt.
            seed: Math.floor(Math.random() * 1000000),
            // 70B model produces slightly longer hints; allow some headroom
            max_tokens: 2000,
            // Ask Groq to enforce JSON output (when supported)
            response_format: { type: 'json_object' }
          })
        });

        if (response.status === 429 && attempt === 1) {
          const errBody = await response.json().catch(() => ({}));
          const retryHeader = response.headers.get('retry-after');
          const waitMs = Math.min(parseRetryAfterMs(errBody, retryHeader) || 4000, 8000);
          console.warn(`[LLM] Rate limited. Waiting ${waitMs}ms before retry...`);
          await new Promise(r => setTimeout(r, waitMs));
          continue;  // retry
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Groq API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content.trim();
        console.log('[LLM] Raw batch response:', content);

        // Strip markdown fences if present
        let cleanContent = content;
        if (content.includes('```json')) {
          cleanContent = content.split('```json')[1].split('```')[0].trim();
        } else if (content.includes('```')) {
          cleanContent = content.split('```')[1].split('```')[0].trim();
        }

        const parsed = JSON.parse(cleanContent);

        // The model might return either { questions: [...] } or just [...]
        let questions = Array.isArray(parsed) ? parsed : parsed.questions;
        if (!Array.isArray(questions)) {
          throw new Error('Batch response did not contain a questions array');
        }

        // Validate each question has the fields we need
        questions = questions.filter(q =>
          q && q.question && Array.isArray(q.options) && q.options.length === 4 && q.correct
        );

        // Extra validation for toddler mode: every option must be a real vocab word,
        // and the correct answer must be one of the 4 options.
        if (isToddler) {
          questions = questions.filter(q => {
            // Reject question text that depends on a visual that isn't there.
            // Examples: "How many balls?" with no balls shown; "What color is this?"
            // with no "this". These are LLM failures we catch as a safety net even
            // when the prompt forbids them.
            const qText = String(q.question || '').toLowerCase();
            const brokenPhrases = [
              /\bhow many\b/,
              /\bcount\b/,
              /\bthis\b/,
              /\bthese\b/,
              /\bthe picture\b/,
              /\bthe image\b/,
              /\bshown\b/
            ];
            const broken = brokenPhrases.find(rx => rx.test(qText));
            if (broken) {
              console.warn(`[LLM] Toddler: dropping broken question text (matched ${broken}):`, q.question);
              return false;
            }

            // All options must map to a known emoji
            const allInVocab = q.options.every(opt => getEmojiForWord(opt) !== null);
            if (!allInVocab) {
              const bad = q.options.filter(opt => getEmojiForWord(opt) === null);
              console.warn(`[LLM] Toddler: dropping question with non-vocab options:`, bad, q);
              return false;
            }
            // Correct answer must exactly match one of the options (case-insensitive)
            const correctLower = String(q.correct).toLowerCase().trim();
            const optionsLower = q.options.map(o => String(o).toLowerCase().trim());
            if (!optionsLower.includes(correctLower)) {
              console.warn(`[LLM] Toddler: dropping question where correct isn't in options:`, q);
              return false;
            }
            // Normalize the correct answer to match exactly
            q.correct = q.options[optionsLower.indexOf(correctLower)];
            // Normalize options to lowercase trimmed
            q.options = q.options.map(o => String(o).toLowerCase().trim());
            q.correct = String(q.correct).toLowerCase().trim();
            return true;
          });
        }

        if (!questions.length) {
          throw new Error('Batch response contained no valid questions');
        }

        console.log(`[LLM] ✅ Batch generated ${questions.length} valid questions`);
        return questions;

      } catch (error) {
        if (attempt === 2) {
          console.error('[LLM] ❌ Batch generation failed after retry:', error);
          throw error;
        }
        // First attempt threw something other than 429 → retry once
        console.warn('[LLM] First batch attempt failed, retrying once:', error.message);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    // Unreachable, but safety net
    throw new Error('Batch generation: max retries exceeded');
  }

  /**
   * Build the prompt for Gemini
   */
  function buildLLMPrompt(subject, level, age, interests, weakTopics, parentGoals) {
    const interestList = interests && interests.length > 0 ? interests.join(', ') : 'general topics';
    
    let prompt = `You are an expert educational content creator for children aged 2-12. Generate a multiple-choice quiz question.

CONTEXT:
- Child's age: ${age} years old
- Subject: ${subject}
- Difficulty: Level ${level} (1=easiest, 5=hardest for this age)
- Child's interests: ${interestList}`;

    if (weakTopics && weakTopics.length > 0) {
      prompt += `\n- Focus on weak areas: ${weakTopics.join(', ')}`;
    }

    if (parentGoals && parentGoals.length > 0) {
      prompt += `\n- Parent wants child to improve: ${parentGoals.join(', ')}`;
    }

    prompt += `\n\nREQUIREMENTS:
1. Question MUST relate to child's interests (${interestList})
2. Use age-appropriate vocabulary for ${age}-year-old
3. Make it engaging, fun, and educational
4. Provide exactly 4 options
5. Include a helpful hint that explains the concept
6. Return ONLY valid JSON (no markdown, no code blocks, no explanations)

JSON FORMAT (return EXACTLY this structure):
{
  "id": "llm_${subject}_${Date.now()}",
  "question": "The question text here",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct": "Exact match of one option",
  "hint": "Educational hint explaining the concept",
  "tags": ["${subject}", "llm_generated"]
}

EXAMPLES:
Age 5, interests: animals, subject: maths
{
  "id": "llm_ex_1",
  "question": "A bunny has 4 carrots. If it eats 2 carrots, how many are left?",
  "options": ["1", "2", "3", "4"],
  "correct": "2",
  "hint": "Count what's left: 4 - 2 = 2 carrots remaining!",
  "tags": ["maths", "subtraction"]
}

Age 8, interests: space, subject: science
{
  "id": "llm_ex_2",
  "question": "Which planet is known as the Red Planet?",
  "options": ["Venus", "Mars", "Jupiter", "Saturn"],
  "correct": "Mars",
  "hint": "Mars looks red because of rusty iron in its soil!",
  "tags": ["science", "planets"]
}

Age 10, interests: sports, subject: maths
{
  "id": "llm_ex_3",
  "question": "A basketball team scores 3 points per basket. How many points for 7 baskets?",
  "options": ["18", "21", "24", "27"],
  "correct": "21",
  "hint": "Multiply: 3 points × 7 baskets = 21 points total!",
  "tags": ["maths", "multiplication"]
}

Now generate ONE question following these rules. Return ONLY the JSON object, nothing else:`;

    return prompt;
  }

  /**
   * Build the prompt for batch generation (multiple questions in one call).
   *
   * Strategy for strict subject adherence:
   *   1. Rename ambiguous subject tokens (english → english_language_arts) to
   *      bypass the model's priors about "questions written in English."
   *   2. LEAD WITH EXAMPLES, not rules — small models follow patterns better
   *      than abstract instructions.
   *   3. Include FORBIDDEN examples — show the model exactly what NOT to do.
   *   4. End with a self-validation checklist the model must pass per question.
   */
  function buildBatchLLMPrompt(subject, level, age, interests, weakTopics, parentGoals, count, avoidList, weakConcepts) {
    const interestList = interests && interests.length > 0 ? interests.join(', ') : 'general topics';

    // Rename subject internally so the model doesn't fall back on lazy priors.
    // (e.g. "english" → "english_language_arts" forces it to think about the
    // skill domain, not "any question written in the English language").
    const SUBJECT_INFO = {
      english: {
        token: 'ENGLISH_LANGUAGE_ARTS',
        humanName: 'English (language arts)',
        scope: 'Vocabulary, grammar, spelling, reading comprehension, sentence structure, parts of speech, synonyms/antonyms, plurals, verb tenses, punctuation, and short reading passages with questions about meaning.',
        goodExamples: [
          { question: "What is the plural of 'mouse'?", options: ["mouses", "mice", "mouse", "meece"], correct: "mice", hint: "Some words have unusual plurals — 'mouse' becomes 'mice'!" },
          { question: "Choose the correct word: 'The dog ___ in the garden every morning.'", options: ["run", "runs", "running", "ran"], correct: "runs", hint: "We use 'runs' with 'the dog' because it's one animal (singular)." },
          { question: "Which word means the OPPOSITE of 'happy'?", options: ["joyful", "cheerful", "sad", "excited"], correct: "sad", hint: "Antonyms are words with opposite meanings — sad is the opposite of happy." },
          { question: "Read this: 'The cat sat on the warm mat.' Where did the cat sit?", options: ["on a chair", "on the mat", "on the floor", "on the bed"], correct: "on the mat", hint: "The sentence directly tells us the cat sat on the mat." }
        ],
        forbiddenExamples: [
          'What is photosynthesis? — that is SCIENCE, not English',
          'How many legs does a spider have? — that is SCIENCE / general knowledge',
          'What is 5 + 3? — that is MATHS',
          'Which is the capital of France? — that is GENERAL KNOWLEDGE'
        ]
      },
      maths: {
        token: 'MATHEMATICS',
        humanName: 'Maths',
        scope: 'Numerical reasoning: counting, addition, subtraction, multiplication, division, fractions, comparing numbers, shapes, patterns, simple word problems involving numbers.',
        goodExamples: [
          { question: "If a tiger has 4 cubs and 2 walk away, how many cubs are left?", options: ["1", "2", "3", "4"], correct: "2", hint: "Subtract: 4 - 2 = 2 cubs remaining." },
          { question: "Which number comes next: 2, 4, 6, ___?", options: ["7", "8", "9", "10"], correct: "8", hint: "The pattern adds 2 each time, so 6 + 2 = 8." },
          { question: "How many sides does a triangle have?", options: ["2", "3", "4", "5"], correct: "3", hint: "'Tri' means three — triangles have three sides." }
        ],
        forbiddenExamples: [
          'What is the past tense of "run"? — that is ENGLISH',
          'What do bees make? — that is SCIENCE',
          'Which planet is closest to the sun? — that is SCIENCE / general knowledge'
        ]
      },
      science: {
        token: 'NATURAL_SCIENCE',
        humanName: 'Science',
        scope: 'Biology (animals, plants, human body), physics (light, sound, forces, gravity), earth science (weather, oceans, space), basic chemistry, how things in nature work. EVERY FACT MUST BE TRUE.',
        goodExamples: [
          { question: "Which of these animals is a mammal?", options: ["Shark", "Eagle", "Dolphin", "Snake"], correct: "Dolphin", hint: "Dolphins breathe air and feed milk to their babies — that makes them mammals." },
          { question: "What do plants need to make their own food?", options: ["Only water", "Sunlight, water, and air", "Only soil", "Only fertilizer"], correct: "Sunlight, water, and air", hint: "Plants use sunlight, water, and air (carbon dioxide) to make food in a process called photosynthesis." },
          { question: "Which is the largest planet in our solar system?", options: ["Earth", "Mars", "Jupiter", "Saturn"], correct: "Jupiter", hint: "Jupiter is so big that all the other planets could fit inside it." }
        ],
        forbiddenExamples: [
          'What is the plural of "leaf"? — that is ENGLISH',
          'How many petals does this flower have if it has 3 + 2? — that is MATHS',
          'Calling a chameleon a bird — that is FACTUALLY WRONG (chameleons are reptiles)'
        ]
      },
      general_knowledge: {
        token: 'GENERAL_KNOWLEDGE',
        humanName: 'General Knowledge',
        scope: 'Real-world facts: countries, capitals, famous landmarks, common professions, holidays, foods, basic history. EVERY FACT MUST BE TRUE.',
        goodExamples: [
          { question: "Which is the capital of Pakistan?", options: ["Karachi", "Lahore", "Islamabad", "Faisalabad"], correct: "Islamabad", hint: "Islamabad has been Pakistan's capital since 1967." },
          { question: "What does a doctor do?", options: ["Builds houses", "Helps sick people get better", "Drives a bus", "Cooks food"], correct: "Helps sick people get better", hint: "Doctors are trained to treat illnesses and keep people healthy." },
          { question: "On which continent is Egypt located?", options: ["Asia", "Africa", "Europe", "Australia"], correct: "Africa", hint: "Egypt is in northern Africa, home to the famous pyramids." }
        ],
        forbiddenExamples: [
          'What rhymes with "cat"? — that is ENGLISH',
          'What is 7 × 6? — that is MATHS',
          'Why does ice float on water? — that is SCIENCE'
        ]
      },
      computer_modern_tech: {
        token: 'COMPUTERS_AND_TECHNOLOGY',
        humanName: 'Computers & Modern Tech',
        scope: 'Computer parts (mouse, keyboard, monitor, CPU), internet basics, common apps and devices (phones, tablets), basic coding concepts (if/loop/variable), online safety.',
        goodExamples: [
          { question: "Which device do you use to type letters into a computer?", options: ["Mouse", "Keyboard", "Monitor", "Speaker"], correct: "Keyboard", hint: "The keyboard has all the letter keys you press to type." },
          { question: "What does the internet allow you to do?", options: ["Only play offline games", "Talk to people far away and find information", "Only print papers", "Cook food"], correct: "Talk to people far away and find information", hint: "The internet connects computers worldwide so we can share information instantly." },
          { question: "What should you do if a stranger online asks for your home address?", options: ["Send it right away", "Tell a parent or trusted adult", "Post it publicly", "Give a fake address but keep chatting"], correct: "Tell a parent or trusted adult", hint: "Personal information should never be shared online — always tell a trusted adult." }
        ],
        forbiddenExamples: [
          'What is the past tense of "click"? — that is ENGLISH',
          'A file is 5 MB and another is 3 MB, total? — that is MATHS',
          'How does a battery work? — that is SCIENCE'
        ]
      }
    };

    const info = SUBJECT_INFO[subject] || SUBJECT_INFO.general_knowledge;

    // Pretty-print examples as JSON
    const goodExampleJson = JSON.stringify(info.goodExamples.slice(0, 3), null, 2);
    const forbiddenList = info.forbiddenExamples.map(s => `  ✗ ${s}`).join('\n');

    let prompt = `You will generate ${count} quiz questions. The subject is ${info.token}.

═══════════════════════════════════════════════════════
STEP 1 — STUDY THESE GOOD EXAMPLES OF ${info.token}
═══════════════════════════════════════════════════════
These are exactly the kind of questions you must produce. Notice they ALL test ${info.humanName} skills, and nothing else.

${goodExampleJson}

═══════════════════════════════════════════════════════
STEP 2 — FORBIDDEN: DO NOT GENERATE QUESTIONS LIKE THESE
═══════════════════════════════════════════════════════
These are NOT ${info.humanName} questions. If you generate anything like these, you have FAILED the task.

${forbiddenList}

═══════════════════════════════════════════════════════
STEP 3 — SUBJECT SCOPE FOR ${info.token}
═══════════════════════════════════════════════════════
${info.scope}

If a question idea doesn't clearly fit this scope, throw it away and pick a different one.

═══════════════════════════════════════════════════════
STEP 4 — CHILD CONTEXT (theming only, NEVER overrides subject)
═══════════════════════════════════════════════════════
- Age: ${age} years old (use vocabulary appropriate for this age)
- Difficulty: Level ${level}/5
- Child's interests: ${interestList}

The interests are ONLY for theming/setting. They tell you what to mention IN the questions, but the SKILL being tested is always ${info.humanName}.

Examples of correct theming:
- ${info.token} + interest "animals" → use animal words/scenarios within ${info.humanName} questions
- ${info.token} + interest "space" → use space words/scenarios within ${info.humanName} questions

Wrong: replacing the ${info.humanName} skill with an ${interestList}-fact question.`;

    if (weakTopics && weakTopics.length > 0) {
      prompt += `\n\n- Focus extra attention on these weak areas: ${weakTopics.join(', ')}`;
    }
    if (parentGoals && parentGoals.length > 0) {
      prompt += `\n- Parent goals to incorporate where natural: ${parentGoals.join(', ')}`;
    }

    // ─── STEP 4.6: Re-quiz mode — target specific weak concepts ───
    if (weakConcepts && weakConcepts.length > 0) {
      const conceptList = weakConcepts
        .map((c, i) => `  ${i + 1}. "${c.concept}" — got wrong ${c.frequency} time${c.frequency === 1 ? '' : 's'}`)
        .join('\n');
      prompt += `\n\n═══════════════════════════════════════════════════════
🎯 STEP 4.6 — TARGET THESE WEAK CONCEPTS (PRACTICE MODE)
═══════════════════════════════════════════════════════
This is a PRACTICE session. This child has struggled with the following concepts in past sessions:

${conceptList}

Generate questions that SPECIFICALLY practice these concepts:
  • Each question should target ONE of the concepts above.
  • Vary which concept you target across the batch — don't make all ${count} questions about the same concept.
  • Make these questions slightly EASIER than the child's current level. Aim for confidence-building, not new challenge.
  • Stay strictly within the ${info.humanName} subject scope from STEP 3.
  • Use clear, simple wording so the child can succeed.

The goal of this batch is to help the child master concepts they previously got wrong — through gentle repetition with fresh wording.`;
    }

    // ─── Anti-repetition: tell the LLM what NOT to repeat ───
    if (avoidList && avoidList.length > 0) {
      const numbered = avoidList.map((q, i) => `  ${i + 1}. "${q}"`).join('\n');
      prompt += `\n\n═══════════════════════════════════════════════════════
🚫 STEP 4.5 — DO NOT REPEAT THESE RECENTLY-SEEN QUESTIONS
═══════════════════════════════════════════════════════
The child has already seen these questions in past sessions. You MUST generate substantively DIFFERENT questions:

${numbered}

Rules for being "different":
  • Different topic / concept (not just different numbers in the same template)
  • Different wording and sentence structure
  • Different scenarios, characters, or contexts
  • Even if a question above is good, do not produce a near-duplicate

If your draft question is nearly identical to any of the above, throw it away and pick something else.`;
    }

    prompt += `\n\n═══════════════════════════════════════════════════════
STEP 5 — SELF-CHECK BEFORE INCLUDING EACH QUESTION
═══════════════════════════════════════════════════════
For every question you write, internally verify ALL of these are TRUE:

  ☐ This question tests ${info.humanName} skills (matches scope in STEP 3)
  ☐ This question is NOT one of the forbidden patterns from STEP 2
  ☐ This question is NOT a near-duplicate of any in STEP 4.5 (recently seen)
  ☐ Every fact mentioned (animals, places, science, history) is TRUE
  ☐ Vocabulary is appropriate for a ${age}-year-old
  ☐ There are exactly 4 options
  ☐ The "correct" field exactly matches one of the 4 options (character-for-character)
  ☐ This question is different in topic from the others in this batch

If any checkbox fails, generate a different question.

═══════════════════════════════════════════════════════
STEP 6 — OUTPUT FORMAT
═══════════════════════════════════════════════════════
Return ONLY valid JSON in this exact shape — no markdown fences, no commentary:

{
  "questions": [
    { "id": "llm_${subject}_1_${Date.now()}", "question": "...", "options": ["A","B","C","D"], "correct": "exact match of one option", "hint": "...", "tags": ["${subject}"] },
    { "id": "llm_${subject}_2_${Date.now()}", "question": "...", "options": ["A","B","C","D"], "correct": "exact match of one option", "hint": "...", "tags": ["${subject}"] }
    // ... ${count} total
  ]
}

Now generate ${count} ${info.token} questions. Verify each against STEP 5 before including. Return ONLY the JSON object:`;

    return prompt;
  }

  /**
   * Build a Toddler Mode batch prompt for the LLM.
   *
   * Differences from the regular batch prompt:
   *   - Restricts every answer option to the curated TODDLER_VOCAB
   *   - Questions must be answerable visually (the child cannot read)
   *   - Short, simple question text (under ~10 words)
   *   - Toddler-appropriate question patterns only
   *   - Returns vocabulary WORDS as options (we look up emoji client-side)
   */
  function buildToddlerBatchPrompt(subject, age, interests, count, avoidList) {
    const interestList = interests && interests.length > 0 ? interests.join(', ') : 'general topics';

    // Subject focus — what kinds of questions for each subject.
    // CRITICAL: every pattern must be answerable purely from the 4 emoji options.
    // We never rely on emoji embedded inside the question text — the LLM drops them.
    const SUBJECT_GUIDE = {
      maths: {
        label: 'Mathematics (shapes and number recognition)',
        patterns: [
          'SHAPE_IDENTIFY — Question: "Which one is a triangle?" → options: ["triangle", "circle", "square", "star"]',
          'NUMBER_IDENTIFY — Question: "Which one is the number five?" → options: ["five", "two", "eight", "one"]',
          'COMPARE_QUANTITY — Question: "Which number is bigger, six or two?" → options: ["six", "two", "one", "three"] (correct: six). Always phrase as a comparison of two specific numbers in the question text.'
        ],
        suggestedCategories: ['numbers', 'shapes']
      },
      science: {
        label: 'Science (animals, nature, body, weather)',
        patterns: [
          'IDENTIFY — Question: "Which one is a cow?" → options: ["cow", "dog", "cat", "pig"]',
          'SOUND_MATCH — Question: "Which animal says moo?" → options: ["cow", "duck", "cat", "dog"]. Other animals/sounds to use: woof→dog, meow→cat, quack→duck, oink→pig, neigh→horse, roar→lion, baa→sheep.',
          'CATEGORY — Question: "Which one lives in water?" → options: ["fish", "lion", "monkey", "horse"]. Other categories: "flies in the sky" → birds vs land, "lives in the jungle" → wild animals.',
          'NATURE — Question: "Which one is the sun?" → options: ["sun", "moon", "cloud", "rain"]',
          'BODY_PART — Question: "Which one is your nose?" → options: ["nose", "ear", "eye", "mouth"]'
        ],
        suggestedCategories: ['animals', 'nature', 'body']
      },
      english: {
        label: 'English (vocabulary, naming objects, categorization)',
        patterns: [
          'IDENTIFY — Question: "Which one is an apple?" → options: ["apple", "banana", "orange", "grape"]',
          'CATEGORY — Question: "Which one is a fruit?" → options: ["apple", "dog", "car", "sun"]',
          'DIFFERENT — Question: "Which one is different?" → options like 3 fruits + 1 vehicle, e.g. ["apple", "banana", "orange", "car"] (correct: car)',
          'COLOR — Question: "Which one is red?" → options: ["red", "blue", "green", "yellow"]',
          'OPPOSITE — Question: "What is the opposite of day?" → options: ["moon", "sun", "star", "cloud"] (correct: moon, since moon represents night)'
        ],
        suggestedCategories: ['food', 'colors', 'animals', 'objects']
      },
      general_knowledge: {
        label: 'General Knowledge (everyday objects, places, transport, size comparison)',
        patterns: [
          'IDENTIFY — Question: "Which one is a car?" → options: ["car", "bus", "boat", "airplane"]',
          'CATEGORY — Question: "Which one do you wear?" → options: ["shirt", "apple", "ball", "tree"]',
          'PLACE — Question: "Where do you go to learn?" → options: ["school", "beach", "hospital", "park"]. Other place questions: "Where do sick people go?" → hospital, "Where do you swim?" → beach, "Where do farm animals live?" → farm.',
          'OBJECT_USE — Question: "Which one do you use to read?" → options: ["book", "ball", "spoon", "clock"]. Other: "to eat soup" → spoon, "to unlock a door" → key, "to tell time" → clock.',
          'TRANSPORT — Question: "Which one flies?" → options: ["airplane", "car", "boat", "bicycle"]. Other: "Which one floats on water?" → boat, "Which one runs on tracks?" → train.',
          'COMPARE_SIZE — Question: "Which one is the biggest?" → options drawn from things kids can compare visually, e.g. ["elephant", "mouse", "ant", "bee"] (correct: elephant). Or "Which one is the smallest?" with the same option types. Use this to teach size and scale.'
        ],
        suggestedCategories: ['vehicles', 'objects', 'clothing', 'places', 'animals']
      }
    };

    const guide = SUBJECT_GUIDE[subject] || SUBJECT_GUIDE.general_knowledge;

    // Build the categorized vocabulary list for the prompt
    const vocabLines = Object.entries(TODDLER_VOCAB).map(([cat, words]) =>
      `  ${cat}: ${Object.keys(words).join(', ')}`
    ).join('\n');

    const patternsList = guide.patterns.map((p, i) => `  ${i + 1}. ${p}`).join('\n');

    let prompt = `You are generating quiz questions for a TODDLER (age ${age}) who CANNOT READ.
The child will see your questions as a 2x2 grid of large emoji pictures.
You must follow EVERY rule below or the child will be unable to answer.

═══════════════════════════════════════════════════════
STEP 1 — HARD RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════
• The child is ${age} years old and CANNOT READ.
• Voice will read your question text aloud. Keep it SHORT (under 10 words).
• Every answer option MUST be ONE word from the VOCABULARY in STEP 2.
• The correct answer must be 100% unambiguous when seen as a picture.
• Do not use words outside the vocabulary list, even if they would be more accurate.
• Use simple, spoken English a 3-year-old can understand when heard aloud.

🚨 CRITICAL — Question text must be SELF-CONTAINED 🚨
The child sees ONLY four emoji tiles. There is no other image. So:
  ✗ NEVER ask "How many balls?" — there are no balls shown anywhere. The child cannot count nothing.
  ✗ NEVER ask "What color is this?" — there is no "this".
  ✗ NEVER ask "How many?" — there is nothing to count.
  ✗ NEVER reference a picture or image — there isn't one separate from the 4 options.
  ✗ NEVER put emoji INSIDE the question text — they will not render correctly.
  ✓ Every question must be answerable purely by LOOKING AT THE 4 OPTIONS.
  ✓ Good: "Which one is a cow?" (child looks at the 4 emoji and picks the cow)
  ✓ Good: "Which is the biggest?" (child compares the 4 emoji sizes)
  ✓ Good: "Which animal says moo?" (child knows cows say moo and picks the cow)
  ✓ Good: "Which number is bigger, six or two?" (child picks the 6 emoji)

═══════════════════════════════════════════════════════
STEP 2 — ALLOWED VOCABULARY (options MUST be from this list)
═══════════════════════════════════════════════════════
${vocabLines}

If a question idea would require a word NOT in this list, throw it away and pick a different question.

═══════════════════════════════════════════════════════
STEP 3 — SUBJECT FOR THIS BATCH: ${guide.label}
═══════════════════════════════════════════════════════
Suggested vocabulary categories for this subject: ${guide.suggestedCategories.join(', ')}

QUESTION PATTERNS YOU MAY USE FOR THIS SUBJECT:
${patternsList}

Vary the patterns across the ${count} questions in this batch — don't use the same pattern for all of them.

═══════════════════════════════════════════════════════
STEP 4 — CHILD CONTEXT (theming hint only)
═══════════════════════════════════════════════════════
Child's interests: ${interestList}
(Use these as gentle theming where natural, but ${guide.label} is the priority.)`;

    if (avoidList && avoidList.length > 0) {
      const numbered = avoidList.map((q, i) => `  ${i + 1}. "${q}"`).join('\n');
      prompt += `\n\n═══════════════════════════════════════════════════════
🚫 STEP 4.5 — DO NOT REPEAT THESE RECENTLY-SEEN QUESTIONS
═══════════════════════════════════════════════════════
The child has already seen these questions. Generate something DIFFERENT:

${numbered}

Make sure your new questions are NOT near-duplicates of any above.`;
    }

    prompt += `\n\n═══════════════════════════════════════════════════════
STEP 5 — SELF-CHECK BEFORE INCLUDING EACH QUESTION
═══════════════════════════════════════════════════════
For every question you write, verify ALL of these are TRUE:

  ☐ All 4 options are words from STEP 2's vocabulary (lowercase, exact spelling)
  ☐ Exactly ONE option is unambiguously correct
  ☐ The question makes sense when spoken aloud to a ${age}-year-old
  ☐ The correct answer is visually distinct (the child can pick it from emoji alone)
  ☐ The question text is under 10 words
  ☐ The "correct" field exactly matches one of the 4 options (character-for-character)
  ☐ This question is different in concept from the others in this batch
  ☐ The question does NOT say "how many" of anything (there are no items to count)
  ☐ The question does NOT reference "this", "these", a picture, or an image
  ☐ The question does NOT contain any emoji characters
  ☐ A child looking ONLY at the 4 emoji options could pick the correct answer

If any checkbox fails, generate a different question.

═══════════════════════════════════════════════════════
STEP 6 — OUTPUT FORMAT
═══════════════════════════════════════════════════════
Return ONLY valid JSON in this exact shape — no markdown fences, no commentary:

{
  "questions": [
    {
      "id": "tod_${subject}_1_${Date.now()}",
      "question": "Which one is a cow?",
      "options": ["cow", "dog", "cat", "pig"],
      "correct": "cow",
      "hint": "Cows live on farms and say moo!",
      "pattern": "identify",
      "tags": ["${subject}", "toddler"]
    }
    // ... ${count} total
  ]
}

Now generate ${count} TODDLER ${guide.label} questions. Verify each against STEP 5 before including. Return ONLY the JSON object:`;

    return prompt;
  }

  // ─── ANTI-REPETITION: Track recently-seen questions per child + subject ───
  // Stores question texts in localStorage so the LLM can be told what to avoid.
  // Persists across reloads so the child doesn't see the same questions on day 2.
  const SEEN_QUESTIONS_LIMIT = 50;          // remember the last 50 per (child, subject)
  const SEEN_QUESTIONS_AVOID_IN_PROMPT = 15; // show last 15 to the LLM (keeps prompt short)

  function getSeenKey(childId, subject) {
    return `lb_seen_${childId}_${subject}`;
  }

  function getSeenQuestions(childId, subject) {
    try {
      const raw = localStorage.getItem(getSeenKey(childId, subject));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function addSeenQuestions(childId, subject, questionTexts) {
    if (!questionTexts || !questionTexts.length) return;
    const existing = getSeenQuestions(childId, subject);
    // Append new ones, skipping any that are already in the list
    const combined = [...existing];
    questionTexts.forEach(t => {
      if (t && !combined.includes(t)) combined.push(t);
    });
    // Keep only the most recent SEEN_QUESTIONS_LIMIT entries
    const trimmed = combined.slice(-SEEN_QUESTIONS_LIMIT);
    try {
      localStorage.setItem(getSeenKey(childId, subject), JSON.stringify(trimmed));
    } catch {}
  }

  /**
   * Get session questions - HYBRID version (LLM + JSON bank)
   * Branches to Toddler Mode for children aged 2-5 (4 emoji-based questions)
   * or regular mode for ages 6+ (5 text-based questions).
   */
  async function getSessionQuestions(child, subject) {
    try {
      const group = child.age <= 5 ? 'beginner' : child.age <= 8 ? 'intermediate' : 'advanced';
      const levelNum = child.subjects?.[subject] || 1;
      const toddler = isToddlerMode(child);
      // Re-quiz is signaled by a window-level flag set just before startSession() is called.
      // Toddler mode never enters re-quiz mode (deferred to Stage 5 polish).
      const isRequiz = !!(window.requizSession && !toddler);
      const questionCount = toddler ? TODDLER_SESSION_LENGTH : 5;
      const childId = child.id || child.childId || 'unknown';

      console.log('[SESSION] Subject:', subject);
      console.log('[SESSION] Using level:', levelNum);
      console.log('[SESSION] All child subjects:', child.subjects);
      console.log('[SESSION] Mode:', toddler ? 'TODDLER' : isRequiz ? 'RE-QUIZ' : 'regular', '|', questionCount, 'questions');

      // ─── Anti-repetition: load recently-seen questions for this child + subject ───
      const seenSoFar = getSeenQuestions(childId, subject);
      const recentToAvoid = seenSoFar.slice(-SEEN_QUESTIONS_AVOID_IN_PROMPT);
      if (recentToAvoid.length > 0) {
        console.log(`[SESSION] Avoiding ${recentToAvoid.length} recently-seen questions`);
      }

      // ─── Re-quiz: fetch top concept gaps for this subject ───
      let weakConcepts = [];
      if (isRequiz) {
        weakConcepts = await getTopConceptGaps(childId, subject, 3);
        console.log('[SESSION] 🎯 Re-quiz targeting concepts:', weakConcepts);
        if (weakConcepts.length === 0) {
          console.warn('[SESSION] Re-quiz requested but no weak concepts found. Running a normal session instead.');
        }
      }

      // Try LLM generation first (the server proxy holds the key; just need to be online)
      if (navigator.onLine) {
        try {
          console.log('[SESSION] 🤖 Attempting Groq LLM batch generation...');

          // ONE call generates all questions in the batch.
          const batch = await generateBatchQuestionsWithLLM({
            subject: subject,
            level: levelNum,
            age: child.age,
            interests: child.interests || ['general learning'],
            weakTopics: [],   // TODO: Get from Assessment Agent
            parentGoals: [],  // TODO: Get from parent goals
            avoidList: recentToAvoid,
            mode: toddler ? 'toddler' : 'regular',
            // Only pass weak concepts when we actually have them — otherwise the
            // prompt's STEP 4.6 is skipped and we run a normal session.
            weakConcepts: weakConcepts.length > 0 ? weakConcepts : null
          }, questionCount);

          // Take up to questionCount questions
          const llmQuestions = batch.slice(0, questionCount).map(q => ({
            ...q,
            generatedBy: 'llm',
            llmModel: 'groq-llama-3.3-70b-versatile',
            mode: toddler ? 'toddler' : 'regular',
            sessionType: isRequiz ? 'requiz' : 'regular'
          }));

          // Need at least 3 valid questions to consider it a success
          if (llmQuestions.length < 3) {
            throw new Error(`Only ${llmQuestions.length} valid questions returned`);
          }

          console.log('[SESSION] ✅ Generated', llmQuestions.length, 'questions via Groq LLM (batch)');

          // Persist these questions so future sessions don't repeat them
          addSeenQuestions(childId, subject, llmQuestions.map(q => q.question));

          // Mark session as using LLM
          window.sessionQuestionSource = 'llm';

          return llmQuestions;

        } catch (llmError) {
          console.warn('[SESSION] ⚠️ Groq generation failed, falling back to JSON bank:', llmError.message);
          // Fall through to JSON bank
        }
      } else {
        console.log('[SESSION] 📚 Using JSON question bank (offline or API key not set)');
      }

      // Fallback: Load from JSON bank
      // NOTE: The JSON bank doesn't have toddler-mode emoji questions yet.
      // For now, toddler users falling back to the bank get the regular bank
      // questions (which they can't read well). This is a known limitation —
      // when the LLM works, toddler mode works. When it fails, the experience
      // degrades to regular bank questions with voice narration.
      const data = await loadQuestions(group, subject);
      const levelKey = `level${levelNum}`;
      const pool = data[levelKey] || data.level1 || [];

      console.log('[SESSION] Loading questions from:', levelKey);
      console.log('[SESSION] Questions available:', pool.length);

      if (!pool.length) return [];

      // Prefer questions the child hasn't seen recently.
      const recentSet = new Set(recentToAvoid);
      const unseen = pool.filter(q => !recentSet.has(q.question));
      const sourcePool = unseen.length >= questionCount ? unseen : pool;
      if (unseen.length < questionCount) {
        console.log('[SESSION] Bank pool exhausted of unseen — using full pool');
      }

      const bankQuestions = [...sourcePool].sort(() => Math.random() - 0.5).slice(0, questionCount);

      // Mark questions from bank
      bankQuestions.forEach(q => {
        q.generatedBy = 'bank';
        q.mode = toddler ? 'toddler' : 'regular';
        q.sessionType = isRequiz ? 'requiz' : 'regular';
      });

      // Persist seen so repeated bank rounds also rotate
      addSeenQuestions(childId, subject, bankQuestions.map(q => q.question));

      // Mark session as using bank
      window.sessionQuestionSource = 'bank';

      return bankQuestions;

    } catch (error) {
      console.error('[SESSION] Error loading questions:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PARENT DASHBOARD
  // ═══════════════════════════════════════════════════════════

  let currentDashboardChild = null;
  let currentDashboardDays = 7;
  let dashboardCharts = {
    subjects: null,
    progress: null,
    timeDistribution: null
  };

  // Open parent dashboard for a specific child
  async function openParentDashboard(childId, childName, childAge, childSubjects) {
    try {
      console.log('[DASHBOARD] Opening dashboard for child:', childId, childName);
      
      currentDashboardChild = { id: childId, name: childName, age: childAge, subjects: childSubjects };
      
      // Show dashboard view
      showView('parent-dashboard');
      
      // Update header
      $('dashboard-child-name').textContent = `${childName}'s Progress`;
      
      // Load voice settings: master toggle + cloned voices (if any)
      await loadElevenLabsToggle();
      await fetchAvailablePresetVoices();
      await loadParentVoices();
      await loadAllChildren();
      applyCloningVisibility();
      renderVoicesList();
      refreshChildVoiceDropdown();

      // Load dashboard data
      await refreshDashboard();
      
    } catch (error) {
      console.error('[DASHBOARD] Error opening dashboard:', error);
    }
  }

  // Refresh dashboard with current filters
  async function refreshDashboard() {
    if (!currentDashboardChild) return;
    
    console.log('[DASHBOARD] Refreshing with', currentDashboardDays, 'days filter');
    
    // Show loading
    $('dashboard-insights').innerHTML = '<p class="text-gray-600">Loading insights...</p>';
    
    // Fetch data
    const sessions = await getRecentSessions(currentDashboardChild.id, currentDashboardDays === 'all' ? 365 : currentDashboardDays);
    const insights = await generateInsights(currentDashboardChild.id);
    
    // Update stats cards
    updateStatsCards(sessions, insights);
    
    // Update charts
    updateCharts(sessions, insights);
    
    // Update insights
    updateInsights(insights);
    
    // Update recent sessions list
    updateRecentSessions(sessions.slice(0, 10));
    
    // Load parent goals
    await loadGoals(currentDashboardChild.id);
  }

  // Update stats cards
  function updateStatsCards(sessions, insights) {
    const totalSessions = sessions.length;
    const avgScore = insights.performance.overall.accuracy || 0;
    
    // Calculate total time
    const totalTime = sessions.reduce((sum, s) => sum + (s.timeSpent || 0), 0);
    const timeInMinutes = Math.round(totalTime / 60);
    
    // Calculate streak (simplified - days with at least 1 session)
    const uniqueDays = new Set(sessions.map(s => new Date(s.date).toDateString())).size;
    
    $('stat-total-sessions').textContent = totalSessions;
    $('stat-avg-score').textContent = `${avgScore}%`;
    $('stat-streak').textContent = `${uniqueDays} day${uniqueDays !== 1 ? 's' : ''}`;
    $('stat-time-spent').textContent = `${timeInMinutes} min`;
  }

  // Update all charts
  function updateCharts(sessions, insights) {
    updateSubjectsChart(insights.performance.subjects);
    updateProgressChart(sessions);
    updateTimeDistributionChart(sessions);
  }

  // Bar chart: Performance by subject
  function updateSubjectsChart(subjects) {
    const ctx = document.getElementById('chart-subjects');
    if (!ctx) return;
    
    // Destroy existing chart
    if (dashboardCharts.subjects) {
      dashboardCharts.subjects.destroy();
    }
    
    const subjectNames = [];
    const accuracyData = [];
    const colors = [];
    
    for (const [subject, data] of Object.entries(subjects)) {
      subjectNames.push(SUBJECT_META[subject]?.label || subject);
      accuracyData.push(data.accuracy);
      
      // Color based on status
      if (data.status === 'strong') colors.push('rgba(34, 197, 94, 0.7)');
      else if (data.status === 'struggling') colors.push('rgba(239, 68, 68, 0.7)');
      else colors.push('rgba(59, 130, 246, 0.7)');
    }
    
    dashboardCharts.subjects = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: subjectNames,
        datasets: [{
          label: 'Accuracy (%)',
          data: accuracyData,
          backgroundColor: colors,
          borderColor: colors.map(c => c.replace('0.7', '1')),
          borderWidth: 2,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `Accuracy: ${context.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value) => value + '%'
            }
          }
        }
      }
    });
  }

  // Line chart: Progress over time
  function updateProgressChart(sessions) {
    const ctx = document.getElementById('chart-progress');
    if (!ctx) return;
    
    if (dashboardCharts.progress) {
      dashboardCharts.progress.destroy();
    }
    
    // Group by date and calculate avg score
    const dateScores = {};
    sessions.forEach(session => {
      const date = new Date(session.date).toLocaleDateString();
      if (!dateScores[date]) {
        dateScores[date] = { total: 0, count: 0 };
      }
      dateScores[date].total += session.accuracy || 0;
      dateScores[date].count += 1;
    });
    
    const dates = Object.keys(dateScores).sort((a, b) => new Date(a) - new Date(b));
    const avgScores = dates.map(date => Math.round(dateScores[date].total / dateScores[date].count));
    
    dashboardCharts.progress = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          label: 'Average Score',
          data: avgScores,
          borderColor: 'rgba(139, 92, 246, 1)',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `Score: ${context.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value) => value + '%'
            }
          }
        }
      }
    });
  }

  // Pie chart: Time distribution by subject
  function updateTimeDistributionChart(sessions) {
    const ctx = document.getElementById('chart-time-distribution');
    if (!ctx) return;
    
    if (dashboardCharts.timeDistribution) {
      dashboardCharts.timeDistribution.destroy();
    }
    
    // Calculate time per subject
    const timeBySubject = {};
    sessions.forEach(session => {
      const subject = session.subject;
      timeBySubject[subject] = (timeBySubject[subject] || 0) + (session.timeSpent || 0);
    });
    
    const subjects = Object.keys(timeBySubject);
    const times = Object.values(timeBySubject).map(t => Math.round(t / 60)); // Convert to minutes
    const colors = subjects.map((_, i) => {
      const hue = (i * 360 / subjects.length);
      return `hsla(${hue}, 70%, 60%, 0.8)`;
    });
    
    dashboardCharts.timeDistribution = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: subjects.map(s => SUBJECT_META[s]?.label || s),
        datasets: [{
          data: times,
          backgroundColor: colors,
          borderColor: '#fff',
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1.5,
        plugins: {
          legend: {
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ${context.parsed} min`
            }
          }
        }
      }
    });
  }

  // Update insights section
  function updateInsights(insights) {
    const container = $('dashboard-insights');
    
    let html = '';
    
    // Summary
    html += `<div class="p-3 bg-white rounded-xl border border-yellow-200 mb-3">
      <p class="text-sm text-gray-700">${insights.summary}</p>
    </div>`;
    
    // Recommendations
    if (insights.recommendations.length > 0) {
      html += '<div class="space-y-2">';
      insights.recommendations.slice(0, 3).forEach(rec => {
        const bgColor = rec.priority === 'high' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200';
        html += `
          <div class="p-2 ${bgColor} rounded-lg border flex items-start gap-2">
            <span class="text-lg flex-shrink-0">${rec.icon}</span>
            <p class="text-xs text-gray-700">${rec.message}</p>
          </div>
        `;
      });
      html += '</div>';
    }
    
    container.innerHTML = html;
  }

  // Update recent sessions list
  function updateRecentSessions(sessions) {
    const container = $('recent-sessions-list');
    
    if (sessions.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-4">No sessions yet</p>';
      return;
    }
    
    let html = '';
    sessions.forEach(session => {
      const date = new Date(session.date).toLocaleDateString();
      const time = new Date(session.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const subjectIcon = SUBJECT_META[session.subject]?.icon || '📚';
      const accuracy = session.accuracy || 0;
      const accuracyColor = accuracy >= 80 ? 'text-green-600' : accuracy >= 60 ? 'text-blue-600' : 'text-red-600';
      
      html += `
        <div class="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border-2 border-gray-200 hover:border-purple-300 hover:shadow-md transition">
          <div class="flex items-center gap-4">
            <span class="text-3xl">${subjectIcon}</span>
            <div>
              <p class="font-bold text-base text-gray-800">${SUBJECT_META[session.subject]?.label || session.subject}</p>
              <p class="text-xs text-gray-500 font-semibold">${date} at ${time}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-2xl font-black ${accuracyColor}">${accuracy}%</p>
            <p class="text-xs text-gray-500 font-bold">${session.score}/${session.totalQuestions} correct</p>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  }

  // Date filter buttons
  document.querySelectorAll('.dashboard-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      document.querySelectorAll('.dashboard-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update filter
      const days = btn.dataset.days;
      currentDashboardDays = days === 'all' ? 'all' : parseInt(days);
      
      // Refresh dashboard
      refreshDashboard();
    });
  });

  // Back to children button
  $('btn-back-to-children')?.addEventListener('click', () => {
    showView('child-section');
    currentDashboardChild = null;
  });

  // ═══════════════════════════════════════════════════════════
  // PARENT GOALS MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════
  // VOICE SETTINGS - Master Toggle, Presets, Cloning (gated)
  // ═══════════════════════════════════════════════════════════

  /**
   * Load the master toggle setting from the parent's user document.
   */
  async function loadElevenLabsToggle() {
    const uid = window.auth.currentUser?.uid;
    if (!uid) return;
    try {
      const snap = await window.getDoc(window.doc(window.db, 'users', uid));
      const data = snap.exists() ? snap.data() : {};
      elevenLabsEnabled = !!data.elevenLabsEnabled;
      const toggleEl = $('toggle-elevenlabs');
      if (toggleEl) toggleEl.checked = elevenLabsEnabled;
    } catch (e) {
      console.warn('[VOICE] Could not load toggle state:', e);
      elevenLabsEnabled = false;
    }
  }

  /**
   * Save the master toggle to Firestore so it persists across sessions.
   */
  async function saveElevenLabsToggle(value) {
    const uid = window.auth.currentUser?.uid;
    if (!uid) return;
    elevenLabsEnabled = value;
    try {
      await window.setDoc(
        window.doc(window.db, 'users', uid),
        { elevenLabsEnabled: value },
        { merge: true }
      );
    } catch (e) {
      console.error('[VOICE] Could not save toggle:', e);
    }
  }

  /**
   * Load cloned voices from Firestore. Only meaningful when premium is unlocked.
   */
  async function loadParentVoices() {
    const uid = window.auth.currentUser?.uid;
    if (!uid) return [];
    try {
      const snap = await window.getDocs(window.collection(window.db, `users/${uid}/voices`));
      parentVoices = [];
      snap.forEach(d => {
        parentVoices.push({ id: d.id, isPreset: false, ...d.data() });
      });
      return parentVoices;
    } catch (e) {
      console.error('[VOICE] Failed to load voices:', e);
      parentVoices = [];
      return [];
    }
  }

  /**
   * Load every child belonging to the current parent into `parentChildren`.
   * Used by the voice-assignment dropdown so parents can pick who hears what.
   */
  async function loadAllChildren() {
    const uid = window.auth.currentUser?.uid;
    if (!uid) return [];
    try {
      const snap = await window.getDocs(window.collection(window.db, `users/${uid}/children`));
      parentChildren = [];
      snap.forEach(d => {
        const data = d.data();
        parentChildren.push({
          id: d.id,
          name: data.name,
          selectedVoiceId: data.selectedVoiceId || null
        });
      });
      return parentChildren;
    } catch (e) {
      console.error('[VOICE] Failed to load children list:', e);
      parentChildren = [];
      return [];
    }
  }

  /**
   * Assign (or unassign) a voice to a specific child.
   * Pass null/empty as voiceId to clear the assignment.
   */
  async function assignVoiceToChild(childId, voiceId) {
    const uid = window.auth.currentUser?.uid;
    if (!uid || !childId) return;
    try {
      await window.updateDoc(
        window.doc(window.db, `users/${uid}/children`, childId),
        { selectedVoiceId: voiceId || null }
      );
      // Update local cache
      const child = parentChildren.find(c => c.id === childId);
      if (child) child.selectedVoiceId = voiceId || null;
      // If this is the child currently logged in, update their live state too
      if (currentChild?.id === childId) {
        currentChild.selectedVoiceId = voiceId || null;
      }
      // Re-render the voices list so the "Used by" labels update
      renderVoicesList();
    } catch (e) {
      console.error('[VOICE] Failed to assign voice:', e);
      alert('Could not save the voice assignment. Please try again.');
    }
  }

  /**
   * Render the unified voices list (presets + cloned voices) in the dashboard.
   */
  function renderVoicesList() {
    const listEl = $('voices-list');
    if (!listEl) return;

    const all = getAllAvailableVoices();
    if (!all.length) {
      listEl.innerHTML = '<p class="text-gray-600 text-sm">No voices available right now. Try toggling AI Voice on, or check back later.</p>';
      return;
    }

    listEl.innerHTML = all.map(v => {
      const badge = v.isPreset
        ? '<span class="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">PRESET</span>'
        : '<span class="bg-purple-100 text-purple-800 text-xs font-bold px-2 py-1 rounded-full">CLONED</span>';
      const subtitle = v.isPreset
        ? `<p class="text-xs text-gray-500">${escapeHtml(v.description || '')}</p>`
        : `<p class="text-xs text-gray-500">Added ${formatVoiceDate(v.createdAt)}</p>`;
      const deleteBtn = v.isPreset ? '' : `
        <button data-action="delete-voice" data-voice-id="${v.id}"
          class="bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded-full text-sm font-bold transition">
          🗑️ Delete
        </button>`;

      // Children currently using this voice
      const usedBy = parentChildren.filter(c => c.selectedVoiceId === v.id);
      const usedByLabel = usedBy.length
        ? `<p class="text-xs text-green-700 font-semibold mt-1">👶 Used by: ${usedBy.map(c => escapeHtml(c.name)).join(', ')}</p>`
        : '';

      // Assignment row: a checkbox per child
      const assignmentRow = parentChildren.length
        ? `
          <div class="mt-3 pt-3 border-t border-gray-200">
            <p class="text-xs font-bold text-gray-700 mb-2">🎯 Assign to children:</p>
            <div class="flex flex-wrap gap-2">
              ${parentChildren.map(c => {
                const isAssigned = c.selectedVoiceId === v.id;
                return `
                  <button data-action="toggle-assign"
                          data-voice-id="${v.id}"
                          data-child-id="${c.id}"
                          class="${isAssigned
                            ? 'bg-green-500 text-white border-green-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                          } border-2 px-3 py-1 rounded-full text-xs font-bold transition">
                    ${isAssigned ? '✓ ' : ''}${escapeHtml(c.name)}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `
        : `<p class="text-xs text-gray-500 italic mt-3">Add a child first to assign voices.</p>`;

      return `
        <div class="bg-white border-2 border-blue-200 rounded-xl p-4">
          <div class="flex items-start justify-between flex-wrap gap-3 mb-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="font-bold text-blue-900">${escapeHtml(v.name)}</p>
                ${badge}
              </div>
              ${subtitle}
              ${usedByLabel}
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button data-action="test-voice" data-voice-id="${v.id}"
                class="bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1 rounded-full text-sm font-bold transition">
                🔊 Test
              </button>
              ${deleteBtn}
            </div>
          </div>
          ${assignmentRow}
        </div>
      `;
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  function formatVoiceDate(ts) {
    if (!ts) return 'recently';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleDateString();
    } catch { return 'recently'; }
  }

  /**
   * Refresh the voice dropdown in the Add Child form so it shows all voices.
   */
  function refreshChildVoiceDropdown() {
    const dropdown = $('child-voice');
    if (!dropdown) return;
    const prevValue = dropdown.value;
    const all = getAllAvailableVoices();
    dropdown.innerHTML = '<option value="">Default Voice (Browser)</option>' +
      all.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');
    if (prevValue && all.some(v => v.id === prevValue)) {
      dropdown.value = prevValue;
    }
  }

  /**
   * Toggle visibility of cloning UI based on the premium feature flag.
   */
  function applyCloningVisibility() {
    const lockedBanner = $('cloning-locked-banner');
    const unlockedPanel = $('cloning-unlocked');
    if (!lockedBanner || !unlockedPanel) return;
    if (VOICE_CLONING_ENABLED) {
      lockedBanner.classList.add('hidden');
      unlockedPanel.classList.remove('hidden');
    } else {
      lockedBanner.classList.remove('hidden');
      unlockedPanel.classList.add('hidden');
    }
  }

  // ── Recording functions (only run when VOICE_CLONING_ENABLED=true) ──
  async function startRecording() {
    const statusEl = $('recording-status');
    const startBtn = $('btn-start-recording');
    const stopBtn  = $('btn-stop-recording');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      recordedBlob = null;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        recordedBlob = new Blob(recordedChunks, { type: mimeType });
        const url = URL.createObjectURL(recordedBlob);
        $('audio-preview').src = url;
        $('audio-preview-wrapper').classList.remove('hidden');
        $('btn-save-voice').classList.remove('hidden');
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordingTimer);
        statusEl.textContent = '✅ Recording done — preview it before saving.';
        statusEl.className = 'text-sm font-semibold text-green-700';
      };
      mediaRecorder.start();
      recordingStartTime = Date.now();
      startBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      statusEl.className = 'text-sm font-semibold text-red-600';
      recordingTimer = setInterval(() => {
        const secs = Math.floor((Date.now() - recordingStartTime) / 1000);
        statusEl.textContent = `🔴 Recording... ${secs}s (aim for 30+ seconds)`;
      }, 500);
    } catch (e) {
      console.error('[VOICE] Mic error:', e);
      statusEl.textContent = '❌ Could not access microphone. Please allow mic permission.';
      statusEl.className = 'text-sm font-semibold text-red-600';
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    $('btn-start-recording').classList.remove('hidden');
    $('btn-stop-recording').classList.add('hidden');
  }

  async function saveRecordedVoice() {
    const msgEl  = $('voice-save-message');
    const nameEl = $('voice-name-input');
    const name   = (nameEl?.value || '').trim();
    if (!recordedBlob) {
      msgEl.textContent = '⚠️ No recording yet. Please record first.';
      msgEl.className = 'mt-3 text-sm font-semibold text-red-600';
      return;
    }
    if (!name) {
      msgEl.textContent = '⚠️ Please enter a name for this voice (e.g., "Mommy").';
      msgEl.className = 'mt-3 text-sm font-semibold text-red-600';
      return;
    }
    if (recordedBlob.size < 30000) {
      msgEl.textContent = '⚠️ Recording is too short. Please record at least 30 seconds.';
      msgEl.className = 'mt-3 text-sm font-semibold text-red-600';
      return;
    }
    msgEl.textContent = '⏳ Uploading voice to AI... this can take 10–20 seconds.';
    msgEl.className = 'mt-3 text-sm font-semibold text-blue-700';
    $('btn-save-voice').disabled = true;
    try {
      const elevenLabsVoiceId = await uploadVoiceToElevenLabs(recordedBlob, name);
      const uid = window.auth.currentUser.uid;
      const ref = window.doc(window.collection(window.db, `users/${uid}/voices`));
      await window.setDoc(ref, {
        name,
        elevenLabsVoiceId,
        createdAt: new Date().toISOString(),
        createdBy: uid
      });
      msgEl.textContent = '✅ Voice saved successfully!';
      msgEl.className = 'mt-3 text-sm font-semibold text-green-700';
      await loadParentVoices();
      renderVoicesList();
      refreshChildVoiceDropdown();
      setTimeout(() => closeVoiceRecorderPanel(), 1500);
    } catch (e) {
      console.error('[VOICE] Save failed:', e);
      msgEl.textContent = `❌ Save failed: ${e.message}`;
      msgEl.className = 'mt-3 text-sm font-semibold text-red-600';
    } finally {
      $('btn-save-voice').disabled = false;
    }
  }

  /**
   * Test-play any voice (preset or cloned) with a friendly sample line.
   */
  async function testVoice(voiceId) {
    const voice = findVoiceById(voiceId);
    if (!voice) return;
    if (!elevenLabsEnabled) {
      alert('⚠️ Turn on "Use AI Voice" to test AI voices.');
      return;
    }
    const sampleText = `Hi! I'm ${voice.name.replace(/[^\w\s]/g, '').trim()}. Let's learn something fun together!`;
    const audioBlob = await generateSpeechElevenLabs(sampleText, voice.elevenLabsVoiceId);
    if (!audioBlob) {
      alert('Could not test voice — check console for details.');
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    audio.play();
  }

  /**
   * Delete a cloned voice (presets cannot be deleted).
   */
  async function deleteParentVoice(voiceDocId) {
    const voice = parentVoices.find(v => v.id === voiceDocId);
    if (!voice) return;
    if (!confirm(`Delete voice "${voice.name}"? Children using this voice will switch to default browser voice.`)) {
      return;
    }
    const uid = window.auth.currentUser.uid;
    await deleteVoiceFromElevenLabs(voice.elevenLabsVoiceId);
    try {
      await window.deleteDoc(window.doc(window.db, `users/${uid}/voices`, voiceDocId));
    } catch (e) {
      console.error('[VOICE] Firestore delete failed:', e);
    }
    try {
      const childrenSnap = await window.getDocs(window.collection(window.db, `users/${uid}/children`));
      const updates = [];
      childrenSnap.forEach(c => {
        if (c.data().selectedVoiceId === voiceDocId) {
          updates.push(window.updateDoc(
            window.doc(window.db, `users/${uid}/children`, c.id),
            { selectedVoiceId: null }
          ));
        }
      });
      await Promise.all(updates);
    } catch (e) {
      console.warn('[VOICE] Failed to clear voice from children:', e);
    }
    await loadParentVoices();
    renderVoicesList();
    refreshChildVoiceDropdown();
  }

  function closeVoiceRecorderPanel() {
    const panel = $('voice-recorder-panel');
    if (!panel) return;
    panel.classList.add('hidden');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop(); } catch {}
    }
    if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null; }
    recordedChunks = [];
    recordedBlob = null;
    if ($('voice-name-input')) $('voice-name-input').value = '';
    if ($('audio-preview')) $('audio-preview').src = '';
    if ($('audio-preview-wrapper')) $('audio-preview-wrapper').classList.add('hidden');
    if ($('btn-save-voice')) $('btn-save-voice').classList.add('hidden');
    if ($('btn-start-recording')) $('btn-start-recording').classList.remove('hidden');
    if ($('btn-stop-recording')) $('btn-stop-recording').classList.add('hidden');
    if ($('recording-status')) $('recording-status').textContent = '';
    if ($('voice-save-message')) $('voice-save-message').textContent = '';
  }

  // ── Voice Settings event listeners ──────────────────────────

  // Master toggle: turn ElevenLabs on/off entirely
  $('toggle-elevenlabs')?.addEventListener('change', async (e) => {
    const newValue = e.target.checked;
    await saveElevenLabsToggle(newValue);
    console.log('[VOICE] ElevenLabs toggle:', newValue ? 'ON' : 'OFF');
  });

  // Cloning UI buttons (only active when premium is unlocked)
  $('btn-add-voice')?.addEventListener('click', () => {
    closeVoiceRecorderPanel();
    $('voice-recorder-panel').classList.remove('hidden');
    $('voice-name-input').focus();
  });
  $('btn-cancel-voice')?.addEventListener('click', closeVoiceRecorderPanel);
  $('btn-start-recording')?.addEventListener('click', startRecording);
  $('btn-stop-recording')?.addEventListener('click', stopRecording);
  $('btn-save-voice')?.addEventListener('click', saveRecordedVoice);

  // Delegated listener for Test/Delete/Assign buttons in voices list
  $('voices-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const voiceId = btn.dataset.voiceId;
    const childId = btn.dataset.childId;
    if (btn.dataset.action === 'test-voice')   testVoice(voiceId);
    if (btn.dataset.action === 'delete-voice') deleteParentVoice(voiceId);
    if (btn.dataset.action === 'toggle-assign') {
      const child = parentChildren.find(c => c.id === childId);
      if (!child) return;
      // If this child already has this voice → unassign. Otherwise → assign.
      const newVoiceId = child.selectedVoiceId === voiceId ? null : voiceId;
      assignVoiceToChild(childId, newVoiceId);
    }
  });

  // Show/hide add goal form
  $('btn-add-goal')?.addEventListener('click', () => {
    const form = $('add-goal-form');
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
      // Set default subject to current child's weakest subject
      if (currentDashboardChild) {
        const goalSubject = $('goal-subject');
        // Could be enhanced to auto-select weakest subject
      }
    }
  });

  $('btn-cancel-goal')?.addEventListener('click', () => {
    $('add-goal-form').classList.add('hidden');
  });

  // Save new goal
  $('btn-save-goal')?.addEventListener('click', async () => {
    if (!currentDashboardChild) return;

    const subject = $('goal-subject').value;
    const targetLevel = parseInt($('goal-target-level').value);
    const deadline = $('goal-deadline').value;
    const priority = $('goal-priority').value;

    try {
      const goalRef = window.doc(window.collection(window.db, `users/${window.auth.currentUser.uid}/goals`));
      
      await window.setDoc(goalRef, {
        childId: currentDashboardChild.id,
        childName: currentDashboardChild.name,
        subject: subject,
        currentLevel: currentDashboardChild.subjects?.[subject] || 1,
        targetLevel: targetLevel,
        deadline: deadline || null,
        priority: priority,
        createdAt: new Date().toISOString(),
        completed: false
      });

      console.log('[GOALS] Goal saved successfully');
      
      // Hide form and refresh goals list
      $('add-goal-form').classList.add('hidden');
      
      // Reset form
      $('goal-target-level').value = 5;
      $('goal-deadline').value = '';
      $('goal-priority').value = 'high';
      
      // Reload goals
      await loadGoals(currentDashboardChild.id);
      
      window.showBadge?.('🎯 Goal set successfully!');
      
    } catch (error) {
      console.error('[GOALS] Error saving goal:', error);
      alert('Failed to save goal. Please try again.');
    }
  });

  // Load goals for current child
  async function loadGoals(childId) {
    try {
      const goalsRef = window.collection(window.db, `users/${window.auth.currentUser.uid}/goals`);
      const snapshot = await window.getDocs(goalsRef);
      
      const goals = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.childId === childId && !data.completed) {
          goals.push({ id: doc.id, ...data });
        }
      });

      displayGoals(goals);
      
    } catch (error) {
      console.error('[GOALS] Error loading goals:', error);
    }
  }

  // Display goals in UI
  function displayGoals(goals) {
    const container = $('goals-list');
    
    if (goals.length === 0) {
      container.innerHTML = '<p class="text-gray-600 text-sm">No goals set yet. Click "+ Set New Goal" to add one!</p>';
      return;
    }

    let html = '';
    goals.forEach(goal => {
      const subjectMeta = SUBJECT_META[goal.subject];
      const currentLevel = currentDashboardChild.subjects?.[goal.subject] || 1;
      const progress = ((currentLevel - 1) / (goal.targetLevel - 1)) * 100;
      const progressClamped = Math.min(100, Math.max(0, progress));
      
      const priorityColor = goal.priority === 'high' ? 'bg-red-100 border-red-300 text-red-700' :
                           goal.priority === 'medium' ? 'bg-yellow-100 border-yellow-300 text-yellow-700' :
                           'bg-green-100 border-green-300 text-green-700';
      
      const priorityIcon = goal.priority === 'high' ? '🔴' :
                          goal.priority === 'medium' ? '🟡' : '🟢';

      const deadlineText = goal.deadline ? new Date(goal.deadline).toLocaleDateString() : 'No deadline';

      html += `
        <div class="p-4 bg-white rounded-xl border-2 ${priorityColor.split(' ')[1]} ${priorityColor.split(' ')[2]}">
          <div class="flex items-start justify-between mb-2">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-2xl">${subjectMeta.icon}</span>
                <h4 class="font-bold text-gray-800">${subjectMeta.label}</h4>
                <span class="text-xs px-2 py-1 rounded-full ${priorityColor}">${priorityIcon} ${goal.priority}</span>
              </div>
              <p class="text-sm text-gray-600">Target: Level ${goal.targetLevel} • Deadline: ${deadlineText}</p>
            </div>
            <button class="delete-goal-btn text-gray-400 hover:text-red-500 transition text-xl" data-goal-id="${goal.id}">
              🗑️
            </button>
          </div>
          
          <!-- Progress Bar -->
          <div class="mt-3">
            <div class="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>Level ${currentLevel}</span>
              <span>${progressClamped.toFixed(0)}% complete</span>
              <span>Level ${goal.targetLevel}</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div class="bg-gradient-to-r from-purple-400 to-pink-500 h-full rounded-full transition-all duration-500"
                   style="width: ${progressClamped}%"></div>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Add delete handlers
    document.querySelectorAll('.delete-goal-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const goalId = e.target.closest('.delete-goal-btn').dataset.goalId;
        if (confirm('Delete this goal?')) {
          try {
            await window.deleteDoc(window.doc(window.db, `users/${window.auth.currentUser.uid}/goals`, goalId));
            await loadGoals(currentDashboardChild.id);
            window.showBadge?.('Goal deleted');
          } catch (error) {
            console.error('[GOALS] Error deleting goal:', error);
          }
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SESSION END SCREEN
  // ═══════════════════════════════════════════════════════════

  // ── Session End ───────────────────────────────────────────────
  async function showSessionEnd() {
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
    btnNextQuestion.classList.add('hidden');
    btnFinishSession.classList.add('hidden');
    hintArea.classList.add('hidden');

    // Progress to 100%
    progressFill.style.width = '100%';

    console.log('[SESSION END] Score:', score, '/', sessionQuestions.length);
    console.log('[SESSION END] Current child subjects:', currentChild.subjects);
    console.log('[SESSION END] Selected subject:', selectedSubject);

    // Level progression
    const currentLevel = currentChild.subjects?.[selectedSubject] || 1;  // Default to 1
    let newLevel = currentLevel;
    let levelMsg = '';

    console.log('[SESSION END] Current level for', selectedSubject, ':', currentLevel);

    if (score >= 4) {
      newLevel = Math.min(5, currentLevel + 1);
      console.log('[SESSION END] Score >= 4, new level:', newLevel);
      
      if (newLevel > currentLevel) {
        levelMsg = `🎉 Level Up! You're now Level ${newLevel}!`;
        console.log('[SESSION END] ✅ LEVEL UP FROM', currentLevel, '→', newLevel);
      } else {
        levelMsg = `🌟 You're at the top level — incredible!`;
        console.log('[SESSION END] Already at max level (5)');
      }
    } else if (score >= 3) {
      levelMsg = `😊 Good work! Keep practising Level ${currentLevel}!`;
      console.log('[SESSION END] Score 3 - staying at level', currentLevel);
    } else {
      levelMsg = `💪 Great effort! Let's try Level ${currentLevel} again!`;
      console.log('[SESSION END] Score < 3 - staying at level', currentLevel);
    }

    // Save to Firestore
    if (newLevel !== currentLevel) {
      try {
        console.log('[FIRESTORE] Saving level update...');
        console.log('[FIRESTORE] Parent UID:', window.auth.currentUser.uid);
        console.log('[FIRESTORE] Child ID:', currentChild.id);
        console.log('[FIRESTORE] Update path:', `users/${window.auth.currentUser.uid}/children/${currentChild.id}`);
        console.log('[FIRESTORE] Field:', `subjects.${selectedSubject}`);
        console.log('[FIRESTORE] New value:', newLevel);
        
        const ref = window.doc(window.db, `users/${window.auth.currentUser.uid}/children`, currentChild.id);
        await window.updateDoc(ref, { [`subjects.${selectedSubject}`]: newLevel });
        
        // Update local state
        currentChild.subjects[selectedSubject] = newLevel;
        
        console.log('[FIRESTORE] ✅ Level saved successfully!');
        console.log('[FIRESTORE] Updated child.subjects:', currentChild.subjects);
        
        window.showBadge?.(`${SUBJECT_META[selectedSubject].icon} Level ${newLevel} unlocked!`);
      } catch (e) {
        console.error('[FIRESTORE] ❌ Level update FAILED:', e);
        console.error('[FIRESTORE] Error code:', e.code);
        console.error('[FIRESTORE] Error message:', e.message);
      }
    } else {
      console.log('[FIRESTORE] No level change - not saving');
    }

    // ═══════════════════════════════════════════════════════════
    // SESSION TRACKING - Save detailed session data
    // ═══════════════════════════════════════════════════════════
    await saveSessionToFirestore();

    // ═══════════════════════════════════════════════════════════
    // Q-LEARNING - Adaptive learning based on performance
    // ═══════════════════════════════════════════════════════════
    const lastSessionData = {
      accuracy: Math.round((score / sessionQuestions.length) * 100),
      score: score,
      totalQuestions: sessionQuestions.length,
      timeSpent: Math.round((Date.now() - sessionStartTime) / 1000),
      hintsUsed: totalHintsUsed,
      engagementScore: calculateEngagementScore(
        Math.round((Date.now() - sessionStartTime) / 1000) / sessionQuestions.length,
        totalHintsUsed,
        totalPauses
      ),
      level: currentChild.subjects?.[selectedSubject] || 1
    };

    const qLearningResult = await runQLearningCycle(currentChild, selectedSubject, lastSessionData);
    
    if (qLearningResult) {
      console.log('[Q-LEARNING] Result:', qLearningResult);
      // Show Q-Learning recommendation if significant
      if (qLearningResult.levelAdjustment !== 0 || qLearningResult.action === 'suggest_break') {
        setTimeout(() => {
          window.showBadge?.(qLearningResult.message);
        }, 2000);
      }
    }

    // Encouragement voice (uses session length, not hardcoded 5)
    const totalQsForEnc = sessionQuestions.length;
    const enc = score === totalQsForEnc ? `Amazing! You got all ${totalQsForEnc}! You are a superstar!`
              : score / totalQsForEnc >= 0.6 ? 'Well done! You are getting better every time!'
              : 'Good try! Let\'s practise again soon!';
    speak(enc);

    // Build end screen
    let endScreen = $('session-end-screen');
    if (endScreen) endScreen.remove();
    endScreen = document.createElement('div');
    endScreen.id = 'session-end-screen';
    endScreen.className = 'section-slide-in';
    learningSession.appendChild(endScreen);

    const totalQs = sessionQuestions.length;
    const isPerfect = score === totalQs;
    const accuracyPct = totalQs > 0 ? (score / totalQs) : 0;

    // Stars row — one per question, lit for each correct answer
    const starsHTML = Array.from({ length: totalQs }, (_, i) => i + 1).map(i =>
      `<span class="score-star${i <= score ? ' lit' : ''}" style="animation-delay:${(i-1)*0.15 + 0.3}s">⭐</span>`
    ).join('');

    // Color the score by percentage so it works for both 4-q (toddler) and 5-q (regular) sessions
    const scoreColor = accuracyPct >= 0.8 ? 'text-green-600' : accuracyPct >= 0.6 ? 'text-yellow-600' : 'text-red-500';

    // Question summary
    const summaryHTML = sessionQuestions.map((q, i) => {
      const ua = q.userAnswer || "Didn't answer";
      const ok = ua === q.correct;
      return `
        <div class="p-4 rounded-2xl border-2 ${ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
          <p class="font-bold text-gray-700 mb-1">${i + 1}. ${q.question}</p>
          <p class="text-sm text-gray-500">Correct: <strong>${q.correct}</strong></p>
          <p class="text-sm font-bold ${ok ? 'text-green-700' : 'text-red-600'}">
            Your answer: ${ua} ${ok ? '✅' : '❌'}
          </p>
        </div>`;
    }).join('');

    // ─── Badge unlocks — async slot ───
    // The badge check runs in the background (kicked off in saveSessionToFirestore).
    // We render an empty slot here, then fill it once the promise resolves.
    // This means the end screen appears immediately and the celebration banner
    // pops in a moment later if any badges unlocked.

    endScreen.innerHTML = `
      <div class="text-center py-6 px-2">

        <!-- Score stars -->
        <div class="flex justify-center gap-2 mb-4">${starsHTML}</div>

        <h2 class="text-3xl text-purple-700 mb-2" style="font-family:'Fredoka One',cursive;">
          ${isPerfect ? 'Amazing! 🎊' : accuracyPct >= 0.6 ? 'Well done! 😊' : 'Keep going! 💪'}
        </h2>
        <p class="text-xl font-bold mb-1">
          <span class="${scoreColor}">${score} out of ${totalQs}</span> correct!
        </p>
        <p class="text-gray-500 font-semibold mb-5">${enc}</p>

        <!-- Slot for the badge unlock banner (filled async by the badge check) -->
        <div id="badge-unlock-slot"></div>

        <!-- Level message -->
        <div class="bg-purple-50 border-2 border-purple-200 rounded-2xl px-5 py-4 mb-6">
          <p class="font-bold text-purple-700 text-lg">${levelMsg}</p>
        </div>

        <!-- Summary accordion -->
        <details class="text-left mb-6">
          <summary class="font-bold text-purple-600 cursor-pointer hover:text-purple-800 mb-3 text-base">
            📋 See all answers
          </summary>
          <div class="space-y-3 mt-3">${summaryHTML}</div>
        </details>

        <!-- Action buttons -->
        <div class="space-y-3">
          <button id="btn-restart-session" class="btn-primary">
            🔄 Play Again!
          </button>
          <button id="btn-change-subject" class="btn-outline">
            🎮 Choose Another Subject
          </button>
        </div>
      </div>
    `;

    // Animate stars in
    setTimeout(() => {
      endScreen.querySelectorAll('.score-star.lit').forEach(s => {
        s.style.filter = 'none';
      });
    }, 100);

    // ─── Fill the badge slot once the background check resolves ───
    // If badges unlocked, render the banner inside #badge-unlock-slot and
    // speak the narration. If no badges or it errors, the slot stays empty.
    const badgePromise = window._badgeCheckPromise;
    window._badgeCheckPromise = null; // consume so a re-render doesn't await again
    if (badgePromise) {
      badgePromise.then(unlocked => {
        if (!unlocked || unlocked.length === 0) return;
        const slot = document.getElementById('badge-unlock-slot');
        if (!slot) return; // user already navigated away

        const badgeCards = unlocked.map(b => `
          <div class="badge-unlock-card">
            <div class="badge-unlock-icon">${b.icon}</div>
            <div class="badge-unlock-name">${b.name}</div>
            <div class="badge-unlock-desc">${b.description}</div>
          </div>
        `).join('');
        slot.innerHTML = `
          <div class="badge-unlock-banner">
            <p class="badge-unlock-header">🎉 New Badge${unlocked.length > 1 ? 's' : ''} Unlocked!</p>
            <div class="badge-unlock-grid">${badgeCards}</div>
          </div>
        `;

        // ─── Confetti bursts! ───
        // Trigger one burst per unlocked badge, centered on each badge card.
        // Slight stagger so they don't all fire at once (feels more dynamic).
        // Wait one frame so the cards have positions we can measure.
        requestAnimationFrame(() => {
          const cardEls = slot.querySelectorAll('.badge-unlock-card');
          cardEls.forEach((cardEl, i) => {
            setTimeout(() => {
              const rect = cardEl.getBoundingClientRect();
              const cx = rect.left + rect.width / 2;
              const cy = rect.top + rect.height / 2;
              window.burstConfetti?.(cx, cy);
            }, 200 + i * 250); // first burst at 200ms, then every 250ms
          });
          // One extra big burst centered on the whole banner for emphasis
          const bannerEl = slot.querySelector('.badge-unlock-banner');
          if (bannerEl) {
            setTimeout(() => {
              const rect = bannerEl.getBoundingClientRect();
              window.burstConfetti?.(rect.left + rect.width / 2, rect.top + 30);
            }, 100);
          }
        });

        // Voice narration (delayed so it doesn't overlap with the encouragement voice)
        const badgeNarration = unlocked.length === 1
          ? `You unlocked a new badge! ${unlocked[0].name}!`
          : `You unlocked ${unlocked.length} new badges! ${unlocked.map(b => b.name).join(', and ')}!`;
        setTimeout(() => speak(badgeNarration), 1800);
      }).catch(err => {
        console.warn('[BADGES] end-screen fill failed:', err);
      });
    }

    // Button handlers (via event delegation on parent)
  }

  // ── Event delegation for dynamic end-screen buttons ──────────
  document.addEventListener('click', async e => {
    if (e.target.id === 'btn-restart-session' || e.target.closest('#btn-restart-session')) {
      currentQuestionIndex = 0;
      score = 0;
      $('session-end-screen')?.remove();
      resetSessionUI();
      speak('Let\'s try again!');
      showQuestion(0);
    }
    if (e.target.id === 'btn-change-subject' || e.target.closest('#btn-change-subject')) {
      $('session-end-screen')?.remove();
      showView('child-welcome');
    }
  });

});
