// Initialize Supabase Client
const _supabase = (typeof supabase !== 'undefined')
  ? supabase.createClient(APP_CONFIG.supabase.url, APP_CONFIG.supabase.key)
  : null;

// Global variable untuk keys (deprecated but kept for compatibility)
let VALID_KEYS = [];

// ==============================================
// 1. LOAD KEYS DARI FILE keys.json
// ==============================================
// Deprecated: Keys are now handled by Supabase
async function loadKeys() {
  console.log('ℹ️ Local keys disabled. Using Supabase for authentication.');
}

// ==============================================
// 1.1 HWID GENERATION (Device Lock)
// ==============================================
function getHWID() {
  let hwid = localStorage.getItem('hwid');
  if (!hwid) {
    // Generate complex unique ID based on browser/time
    const platform = navigator.platform || 'unknown';
    const random = Math.random().toString(36).substr(2, 9).toUpperCase();
    hwid = `GOD-${platform}-${random}-${Date.now()}`;
    localStorage.setItem('hwid', hwid);
  }
  return hwid;
}

// ==============================================
// 2. CHECK LOGIN FUNCTION (FIXED)
// ==============================================
async function checkLogin() {
  const keyInput = document.getElementById('loginKey');
  const keyStatus = document.getElementById('keyStatus');

  if (!keyInput) return;

  const key = keyInput.value.trim().toUpperCase();

  if (!key) {
    showNotification('Masukkan lisensi Anda');
    keyInput.focus();
    return;
  }

  if (!_supabase) {
    showNotification('System error: Supabase not ready');
    return;
  }

  // UI Loading
  showNotification('Memverifikasi lisensi...');
  if (keyStatus) keyStatus.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:#ff0000"></i>';

  try {
    // Query ke tabel licenses_ios
    const { data, error } = await _supabase
      .from(APP_CONFIG.supabase.tableName)
      .select('*')
      .eq('license', key)
      .single();

    if (error) {
      console.error('Supabase Error:', error);
      if (error.code === 'PGRST116') {
        throw new Error('Lisensi tidak ditemukan atau salah');
      } else {
        throw new Error('Database Error: ' + error.message);
      }
    }

    if (!data) {
      throw new Error('Lisensi tidak ditemukan');
    }

    // CHECK STATUS
    if (data.status === 'paused') {
      showScreen('pausedScreen');
      return;
    }

    // HWID LOCK SYSTEM
    const currentHWID = getHWID();
    if (data.hwid && data.hwid !== currentHWID) {
      throw new Error('LICENSE ERROR: Terikat di HP/Browser lain. Silakan RESET HWID di Admin!');
    }

    // Link HWID if empty
    if (!data.hwid) {
      const { error: updateError } = await _supabase
        .from(APP_CONFIG.supabase.tableName)
        .update({ hwid: currentHWID, is_online: true, last_seen: new Date().toISOString() })
        .eq('license', key);

      if (updateError) {
        console.error('Update Error:', updateError);
        throw new Error('Gagal menyimpan HWID: ' + updateError.message);
      }
    } else {
      // Mark as online
      await _supabase
        .from(APP_CONFIG.supabase.tableName)
        .update({ is_online: true, last_seen: new Date().toISOString() })
        .eq('license', key);
    }

    // ✅ LOGIN SUCCESS
    console.log('✅ ACCESS GRANTED for key:', key);
    if (keyStatus) keyStatus.innerHTML = '<i class="fas fa-check" style="color:#00ff88"></i>';
    showNotification(`Login Berhasil!`);

    // Save session
    localStorage.setItem('saiSession', 'active_forever');
    localStorage.setItem('loginKey', key);
    localStorage.setItem('loginTime', new Date().toISOString());

    // Start Heartbeat
    startHeartbeat(key);

    // Redirect to swipe home
    setTimeout(() => {
      // Hide login screen first
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      showSwiper();
      navTo(0, false);
    }, 800);

  } catch (err) {
    console.error('❌ Login error:', err.message);
    if (keyStatus) keyStatus.innerHTML = '<i class="fas fa-times" style="color:#ff0000"></i>';

    // Tampilkan detail error kepada pengguna langsung
    showNotification(err.message);

    // Animasi shake
    keyInput.style.animation = 'shake 0.5s';
    setTimeout(() => {
      keyInput.style.animation = '';
      keyInput.focus();
    }, 500);
  }
}

let heartbeatTimer = null;



// ==============================================
// 3. BASIC APP FUNCTIONS
// ==============================================

// ===== SWIPE NAVIGATION SYSTEM =====
const SWIPE_SCREENS = ['mainScreen', 'freefireScreen', 'statusScreen', 'creditsScreen'];
let currentTab = 0;
let swipeStartX = 0;
let swipeStartY = 0;
let isSwiping = false;
let isDragging = false;
let dragOffset = 0;

// Navigate to a tab index (0-3) with smooth swipe
function navTo(index, animate = true) {
  if (index < 0 || index >= SWIPE_SCREENS.length) return;

  // Ensure we are in swipe mode if coming from a full screen overlay
  const container = document.getElementById('swipeContainer');
  if (container && container.style.display === 'none') {
    showSwiper();
  }

  currentTab = index;

  const track = document.getElementById('swipeTrack');
  if (!track) return;

  // Translate the track
  track.style.transition = animate ? 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)' : 'none';
  track.style.transform = `translateX(-${index * 100}%)`;

  // Update navbar active states
  document.querySelectorAll('.nav-pill-item').forEach((item, i) => {
    item.classList.toggle('active', i === index);
  });

  // Animate the sliding pill indicator
  updateSliderPill(index);
}

// Helper function to update Profile data
function updateProfileData() {
  const licenseKey = localStorage.getItem('loginKey') || 'Not Active';
  const profileKeyEl = document.getElementById('profileLicenseKey');
  const iosVerEl = document.getElementById('userIosVersion');
  const expiryEl = document.getElementById('licenseExpiry');

  if (profileKeyEl) profileKeyEl.textContent = licenseKey;

  if (iosVerEl) {
    const ua = navigator.userAgent;

    // Primary: Match iOS/iPadOS version from UA string
    const iosMatch = ua.match(/(?:iPhone|iPad|iPod).*?OS (\d+)[_\.](\d+)(?:[_\.](\d+))?/);

    if (iosMatch) {
      const major = iosMatch[1];
      const minor = iosMatch[2];
      const patch = iosMatch[3] ? `.${iosMatch[3]}` : '';
      iosVerEl.textContent = `iOS ${major}.${minor}${patch}`;
    } else if (/Macintosh/i.test(ua) && navigator.maxTouchPoints >= 2) {
      // iPad Desktop Mode detection
      const verMatch = ua.match(/Version\/(\d+)\.(\d+)(?:\.(\d+))?/);
      if (verMatch) {
         iosVerEl.textContent = `iPadOS ${verMatch[1]}.${verMatch[2]}${verMatch[3] ? '.' + verMatch[3] : ''}`;
      } else {
         iosVerEl.textContent = 'iPadOS 17.5.1';
      }
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      iosVerEl.textContent = 'iOS 17.5.1';
    } else {
      iosVerEl.textContent = 'iOS 18.0 (Dev)';
    }
  }

  // Set default expiry if not found in specific DB logic
  if (expiryEl) expiryEl.textContent = 'OB53 - OB54';
}

// Moves the red sliding pill background to the active nav item
function updateSliderPill(index) {
  const pill = document.getElementById('navSliderPill');
  const navItems = document.querySelectorAll('.nav-pill-item');
  if (!pill || !navItems[index]) return;

  // Update profile data if moving to profile tab
  if (index === 3) updateProfileData();

  const navbar = document.getElementById('globalNavbar');
  const navRect = navbar.getBoundingClientRect();
  const itemRect = navItems[index].getBoundingClientRect();

  const relativeLeft = itemRect.left - navRect.left;
  const itemWidth = itemRect.width;

  // Fox Jump Animation
  pill.classList.remove('moving');
  void pill.offsetWidth; // Force reflow
  pill.classList.add('moving');

  pill.style.left = `${relativeLeft + 4}px`;
  pill.style.width = `${itemWidth - 8}px`;
}

// Called from old-style screens (settings, saii) to go BACK to swipe mode
function exitFullScreen() {
  showSwiper();
  navTo(currentTab, false);
}

// Show the swipe container and navbar
function showSwiper() {
  const container = document.getElementById('swipeContainer');
  const navbar = document.getElementById('globalNavbar');
  if (container) container.style.display = 'block';
  if (navbar) navbar.style.display = 'flex';

  // Refresh layout after appearing
  setTimeout(() => {
    navTo(currentTab || 0, false);
    updateProfileData();
  }, 50);

  // Hide all .screen overlays
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  // Re-init slider pill position
  setTimeout(() => updateSliderPill(currentTab), 30);
}

// Show a full-screen overlay (settings, saii, etc.) hiding swiper
function showScreen(screenId) {
  console.log('🔄 Switching to screen:', screenId);

  const isSwipeTab = SWIPE_SCREENS.includes(screenId);

  if (isSwipeTab) {
    // It's a swipe tab — use navTo instead
    const idx = SWIPE_SCREENS.indexOf(screenId);
    showSwiper();
    navTo(idx);
    return;
  }

  // Full-screen overlay — hide swipeContainer + navbar
  const container = document.getElementById('swipeContainer');
  const navbar = document.getElementById('globalNavbar');
  if (container) container.style.display = 'none';
  if (navbar) navbar.style.display = 'none';

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    // Scroll to top
    target.scrollTop = 0;
    window.scrollTo(0, 0);
  } else {
    console.error('❌ Screen not found:', screenId);
  }
}

// Legacy — kept for heartbeat/pause compatibility
function updateNavbarState(screenId) {
  const idx = SWIPE_SCREENS.indexOf(screenId);
  if (idx !== -1) navTo(idx);
}

// ===== TOUCH SWIPE HANDLER =====
function initSwipeGestures() {
  const container = document.getElementById('swipeContainer');
  if (!container) return;

  container.addEventListener('touchstart', (e) => {
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    isSwiping = false;
    isDragging = false;
    dragOffset = 0;
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - swipeStartX;
    const dy = e.touches[0].clientY - swipeStartY;

    if (!isSwiping && !isDragging) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        isDragging = true;
      } else if (Math.abs(dy) > 10) {
        isSwiping = true; // vertical scroll — don't intercept
      }
    }

    if (isDragging) {
      e.preventDefault(); // Prevent page scroll while horizontal dragging
      dragOffset = dx;
      const base = currentTab * 100;
      const pct = (dragOffset / window.innerWidth) * 100;
      const track = document.getElementById('swipeTrack');
      if (track) {
        track.style.transition = 'none';
        track.style.transform = `translateX(calc(-${base}% + ${dragOffset}px))`;
      }
    }
  }, { passive: false });

  container.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    const threshold = window.innerWidth * 0.2;

    if (dragOffset < -threshold && currentTab < SWIPE_SCREENS.length - 1) {
      navTo(currentTab + 1); // swipe left → next
    } else if (dragOffset > threshold && currentTab > 0) {
      navTo(currentTab - 1); // swipe right → prev
    } else {
      navTo(currentTab); // snap back
    }
    isSwiping = false;
    isDragging = false;
    dragOffset = 0;
  });
}



// Deteksi Aplikasi berdasarkan riwayat launch (tersimpan di localStorage)
function detectGames() {
  const ffStatus = document.getElementById('ff-status-ui');
  const ffMaxStatus = document.getElementById('ffmax-status-ui');
  const indFF = document.getElementById('indicator-ff');
  const indFFMax = document.getElementById('indicator-ffmax');

  // Baca status dari localStorage (diupdate saat user launch game)
  const hasFF = localStorage.getItem('ff_installed') === 'true';
  const hasFFMax = localStorage.getItem('ffmax_installed') === 'true';

  // Update indicator FF
  if (indFF) indFF.className = hasFF ? 'game-status-indicator online' : 'game-status-indicator offline';
  if (ffStatus) {
    ffStatus.textContent = hasFF ? 'DETECTED' : 'NOT INSTALLED';
    ffStatus.className = hasFF ? 'status-btn installed' : 'status-btn not-installed';
  }

  // Update indicator FF MAX
  if (indFFMax) indFFMax.className = hasFFMax ? 'game-status-indicator online' : 'game-status-indicator offline';
  if (ffMaxStatus) {
    ffMaxStatus.textContent = hasFFMax ? 'DETECTED' : 'NOT INSTALLED';
    ffMaxStatus.className = hasFFMax ? 'status-btn installed' : 'status-btn not-installed';
  }
}

// Tampilkan notifikasi
function showNotification(message) {
  // Use Dynamic Island for high-priority messages
  if (message.toLowerCase().includes('berhasil') || message.toLowerCase().includes('success') || message.toLowerCase().includes('launching') || message.toLowerCase().includes('error')) {
    updateDynamicIsland(message, message.toLowerCase().includes('error') ? 'error' : 'success');
  }

  const notification = document.getElementById('notification');
  const notificationText = document.getElementById('notificationText');

  if (!notification || !notificationText) {
    console.log('📢 Notification:', message);
    return;
  }

  notificationText.textContent = message;
  notification.classList.add('show');

  // Auto hide setelah 3 detik
  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// iOS Style Dynamic Island Controller
function updateDynamicIsland(text, type = 'success', duration = 3000) {
  const island = document.getElementById('dynamicStatus');
  const islandText = island?.querySelector('.island-text');
  const islandIcon = island?.querySelector('.island-icon i');

  if (!island || !islandText) return;

  // Set Content
  islandText.textContent = text.toUpperCase();

  // Set Icon based on type
  if (type === 'error') {
    islandIcon.className = 'fas fa-exclamation-triangle';
    island.classList.add('active-process');
  } else if (type === 'loading') {
    islandIcon.className = 'fas fa-spinner fa-spin';
    island.classList.remove('active-process');
  } else {
    islandIcon.className = 'fas fa-shield-alt';
    island.classList.remove('active-process');
  }

  // Show and Expand
  island.classList.add('show');
  island.classList.add('expanded');

  if (duration > 0) {
    setTimeout(() => {
      island.classList.remove('expanded');
      setTimeout(() => {
        island.classList.remove('show');
      }, 300);
    }, duration);
  }
}


// Check session
function checkSession() {
  const session = localStorage.getItem('saiSession');
  const savedKey = localStorage.getItem('loginKey');

  if (session === 'active_forever' && savedKey) {
    showScreen('mainScreen');
    startHeartbeat(savedKey); // Monitoring status real-time
    return true;
  }

  showScreen('loginScreen');
  return false;
}

// 2.1 HEARTBEAT SYSTEM (Monitoring Status & HWID)
let heartbeatInterval;
function startHeartbeat(licenseKey) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  heartbeatInterval = setInterval(async () => {
    if (!licenseKey) return;

    try {
      const { data, error } = await _supabase
        .from(APP_CONFIG.supabase.tableName)
        .select('status, hwid')
        .eq('license', licenseKey)
        .single();

      if (error) {
        // HANYA jika lisensi benar-benar tidak ditemukan di database (PGRST116)
        if (error.code === 'PGRST116') {
          console.log('License deleted, logging out...');
          clearInterval(heartbeatInterval);
          clearSession();
        }
        return; // Jika error koneksi internet, biarkan saja (jangan logout)
      }

      // Check Real-time Status Switching
      const activeScreen = document.querySelector('.screen.active');
      const isSwipeMode = document.getElementById('swipeContainer').style.display === 'block';

      if (data.status === 'paused') {
        if ((isSwipeMode) || (activeScreen && activeScreen.id !== 'pausedScreen')) {
          // Jika sedang di swipe mode, sembunyikan swiper dulu
          if (isSwipeMode) {
            document.getElementById('swipeContainer').style.display = 'none';
            if (document.getElementById('globalNavbar')) document.getElementById('globalNavbar').style.display = 'none';
          }
          showScreen('pausedScreen');
        }
      } else if (data.status === 'active') {
        if (activeScreen && activeScreen.id === 'pausedScreen') {
          // Jika kembali aktif, kembalikan ke swiper jika sebelumnya di sana
          if (localStorage.getItem('saiSession')) {
            showSwiper();
          } else {
            showScreen('mainScreen');
          }
        }
      }

      // Check HWID Security (Only if HWID is already linked)
      const currentHWID = getHWID();
      if (data.hwid && data.hwid !== currentHWID) {
        clearInterval(heartbeatInterval);
        clearSession();
        showNotification('Keamanan: Lisensi digunakan di HP lain');
      }

      // Update Heartbeat / Last Seen
      await _supabase
        .from(APP_CONFIG.supabase.tableName)
        .update({ is_online: true, last_seen: new Date().toISOString() })
        .eq('license', licenseKey);

    } catch (err) {
      console.error('Heartbeat check failed:', err);
    }
  }, 7000); // Check setiap 7 detik
}

// Clear session (logout)
function clearSession() {
  console.log('Clearing session...');
  if (heartbeatInterval) clearInterval(heartbeatInterval);

  const savedKey = localStorage.getItem('loginKey');
  localStorage.clear();

  // Hide swiper + navbar, show login
  const container = document.getElementById('swipeContainer');
  const navbar = document.getElementById('globalNavbar');
  if (container) container.style.display = 'none';
  if (navbar) navbar.style.display = 'none';

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.classList.add('active');

  showNotification(`Logged out. Previous key: ${savedKey || 'None'}`);
}

// Logout dengan konfirmasi
function logoutUser() {
  if (confirm('Are you sure you want to logout from GODDATAX?')) {
    clearSession();
  }
}

// ==============================================
// 4. SAII PROCESS FUNCTIONS (COMPLETELY FIXED)
// ==============================================
function runTerminalAnimation() {
  if (!checkSession()) {
    showNotification('Please login first');
    return;
  }

  showScreen('saiiScreen');

  const progressBar = document.getElementById('progressBar');
  const progressPercent = document.querySelector('.progress-percent');
  const progressLabel = document.querySelector('.progress-label span');

  // Reset progress
  if (progressBar) progressBar.style.width = '0%';
  if (progressPercent) progressPercent.textContent = '0%';
  if (progressLabel) progressLabel.textContent = 'Initializing...';

  const termTarget = document.getElementById('terminal-target');
  if (termTarget) termTarget.textContent = selectedAppToLaunch === 'ff' ? 'freefire' : 'freefiremax';

  const appLabel = selectedAppToLaunch === 'ff' ? 'Free Fire' : 'Free Fire MAX';

  // Clear semua text elements terlebih dahulu
  document.getElementById('text2').textContent = '';
  document.getElementById('text3').textContent = '';
  document.getElementById('text4').textContent = '';
  document.getElementById('text5').textContent = '';

  // Reset semua line elements
  const line2 = document.getElementById('line2');
  const line3 = document.getElementById('line3');
  const line4 = document.getElementById('line4');
  const line5 = document.getElementById('line5');

  if (line2) {
    line2.classList.remove('active');
    line2.style.filter = 'blur(5px)';
    line2.style.opacity = '0.8';
  }
  if (line3) {
    line3.classList.remove('active');
    line3.style.filter = 'blur(5px)';
    line3.style.opacity = '0.8';
  }
  if (line4) {
    line4.classList.remove('active');
    line4.style.filter = 'blur(5px)';
    line4.style.opacity = '0.8';
  }
  if (line5) {
    line5.classList.remove('active');
    line5.style.filter = 'blur(5px)';
    line5.style.opacity = '0.8';
  }

  // Step 1: Checking system integrity...
  setTimeout(() => {
    if (line2) {
      line2.classList.add('active');
      line2.style.filter = 'blur(0)';
      line2.style.opacity = '1';
    }

    const text2 = document.getElementById('text2');
    if (text2) {
      text2.textContent = 'Checking system integrity...';
    }

    updateDynamicIsland('System integrity check...', 'loading', 2000);

    if (progressBar) progressBar.style.width = '20%';
    if (progressPercent) progressPercent.textContent = '20%';
    if (progressLabel) progressLabel.textContent = 'System check...';
  }, 500);

  // Step 2: Preparing Free Fire environment...
  setTimeout(() => {
    if (line3) {
      line3.classList.add('active');
      line3.style.filter = 'blur(0)';
      line3.style.opacity = '1';
    }

    const text3 = document.getElementById('text3');
    if (text3) {
      text3.textContent = `Preparing ${appLabel} environment...`;
    }

    updateDynamicIsland(`Preparing ${appLabel}...`, 'loading', 2000);

    if (progressBar) progressBar.style.width = '50%';
    if (progressPercent) progressPercent.textContent = '50%';
    if (progressLabel) progressLabel.textContent = 'Preparing...';
  }, 1500);

  // Step 3: Bypassing security protocols...
  setTimeout(() => {
    if (line4) {
      line4.classList.add('active');
      line4.style.filter = 'blur(0)';
      line4.style.opacity = '1';
    }

    const text4 = document.getElementById('text4');
    if (text4) {
      text4.textContent = 'Bypassing security protocols...';
    }

    updateDynamicIsland('Bypassing protocols...', 'loading', 2000);

    if (progressBar) progressBar.style.width = '75%';
    if (progressPercent) progressPercent.textContent = '75%';
    if (progressLabel) progressLabel.textContent = 'Security bypass...';
  }, 2500);

  // Step 4: Launching Free Fire with optimizations...
  setTimeout(() => {
    if (line5) {
      line5.classList.add('active');
      line5.style.filter = 'blur(0)';
      line5.style.opacity = '1';
    }

    const text5 = document.getElementById('text5');
    if (text5) {
      text5.textContent = `Launching ${appLabel} with optimizations...`;
    }

    updateDynamicIsland('Finalizing Launch...', 'success', 4000);

    if (progressBar) progressBar.style.width = '100%';
    if (progressPercent) progressPercent.textContent = '100%';
    if (progressLabel) progressLabel.textContent = 'Launching...';

    // Launch Free Fire
    setTimeout(() => launchFreeFire(), 800);
  }, 3500);
}

// Execute Launch Called from Bottom Sheet
function executeLaunch() {
  closeBottomSheet(null);

  // Ambil nilai dari bottom sheet
  const modeChecked = document.querySelector('input[name="perfMode"]:checked')?.value || 'balanced';

  showNotification(`Launch initialized: ${modeChecked.toUpperCase()} mode.`);

  // Masukkan opsi ini ke localStorage agar `launchFreeFire` bisa ngambilnya nanti
  const additionalSettings = {
    mode: modeChecked
  };
  localStorage.setItem('ffLaunchV2', JSON.stringify(additionalSettings));

  // Trigger terminal animation AFTER bottom sheet closes
  setTimeout(() => {
    runTerminalAnimation();
  }, 100);
}

// REAL LAUNCH APP
function launchFreeFire() {
  // Ambil base settings dari DOM
  const aimAssist = document.getElementById('aim')?.checked || false;
  const antiBan = document.getElementById('antiban')?.checked || false;
  const headshot = document.getElementById('headshot')?.checked || false;
  const recoilControl = document.getElementById('recoilcontrol')?.checked || false;

  // Combine with sheet settings
  let modeChecked = 'balanced';
  const savedV2 = localStorage.getItem('ffLaunchV2');
  if (savedV2) {
    const v2 = JSON.parse(savedV2);
    modeChecked = v2.mode;
  }

  const enabledFeatures = [
    aimAssist ? 'Aim Assist' : null,
    antiBan ? 'Anti-Ban' : null,
    headshot ? 'Headshot Opt' : null,
    recoilControl ? 'Recoil Control' : null
  ].filter(Boolean);

  if (modeChecked === 'competitive') enabledFeatures.push('Competitive Mode');

  if (enabledFeatures.length > 0) {
    showNotification(`Launching Free Fire with ${enabledFeatures.length} features enabled`);
  } else {
    showNotification('Launching Free Fire...');
  }

  // Simpan settings (HAPUS headshotCrosshair)
  const settings = {
    aimAssist: aimAssist,
    antiBan: antiBan,
    headshot: headshot,
    recoilControl: recoilControl,
    timestamp: Date.now()
  };
  localStorage.setItem('ffSettings', JSON.stringify(settings));

  // ✅ REAL LAUNCH CODE - Mencoba berbagai skema URL untuk membuka Free Fire
  const appLabel = selectedAppToLaunch === 'ff' ? 'Free Fire' : 'Free Fire MAX';
  const targetScheme = selectedAppToLaunch === 'ff' ? 'freefire://' : 'freefiremax://';

  // Combine all schemes, putting target scheme first
  const allSchemes = [
    targetScheme,
    'freefire://',
    'freefiremax://',
    'com.dts.freefireth://',
    'com.dts.freefiremax://'
  ];

  // Add universal fallbacks
  allSchemes.push(
    'https://freefiremobile.com/',
    selectedAppToLaunch === 'ff'
      ? 'https://apps.apple.com/app/free-fire/id1300096749'
      : 'https://apps.apple.com/app/free-fire-max/id1543443745'
  );

  console.log(`🎮 Attempting to launch ${appLabel}...`);

  let launchSuccess = false;

  // Coba setiap skema sampai berhasil
  for (const scheme of allSchemes) {
    try {
      console.log(`Trying scheme: ${scheme}`);

      if (scheme.startsWith('http')) {
        window.open(scheme, '_blank');
        launchSuccess = true;
        break;
      } else {
        // Simpan status instalasi ke localStorage saat berhasil launch
        if (selectedAppToLaunch === 'ff') {
          localStorage.setItem('ff_installed', 'true');
        } else {
          localStorage.setItem('ffmax_installed', 'true');
        }
        window.location.href = scheme;
        launchSuccess = true;
        break;
      }
    } catch (error) {
      console.log(`Failed with scheme ${scheme}:`, error);
      continue;
    }
  }

  // Fallback jika semua skema gagal
  setTimeout(() => {
    if (!launchSuccess) {
      console.log('❌ All direct schemes failed, showing fallback message');
      showNotification('Free Fire app not found! Please install Free Fire from your app store.');

      // Tampilkan instruksi untuk pengguna iOS
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
        showNotification('For iOS: Open App Store and install Free Fire');
      } else {
        showNotification('For Android: Open Google Play Store and install Free Fire');
      }
    } else {
      console.log('✅ Free Fire launch initiated');
    }

    // Kembali ke main screen setelah beberapa detik
    setTimeout(() => {
      showScreen('mainScreen');
      showNotification('Free Fire launch process completed');
    }, 2000);
  }, 1500);
}

// ==============================================
// 4.5 BOTTOM SHEET MODAL LOGIC
// ==============================================
let selectedAppToLaunch = 'ff';

function openLaunchSheet(appType) {
  selectedAppToLaunch = appType;

  const overlay = document.getElementById('launchBottomSheet');
  const icon = document.getElementById('sheetAppIcon');
  const name = document.getElementById('sheetAppName');
  const pkg = document.getElementById('sheetAppPackage');

  if (appType === 'ff') {
    icon.src = 'ff_logo.jpg';
    name.textContent = 'Free Fire';
    pkg.textContent = 'com.dts.freefireth';
  } else {
    icon.src = 'ff_max_logo.jpg';
    name.textContent = 'Free Fire MAX';
    pkg.textContent = 'com.dts.freefiremax';
  }

  const btnText = document.getElementById('sheetBtnText');
  if (btnText) btnText.textContent = appType === 'ff' ? 'LOGIN FREE FIRE' : 'LOGIN FREE FIRE MAX';

  overlay.style.display = 'flex';

  // Minta browser render ulang display:flex sebelum nambahin class active (animasi slide up)
  setTimeout(() => {
    overlay.classList.add('active');
  }, 10);
}

function closeBottomSheet(e) {
  if (e && e.target.closest('.bottom-sheet')) return; // Jangan tutup kalau yg di-klik adalah isi modal

  const overlay = document.getElementById('launchBottomSheet');
  if (!overlay) return;
  overlay.classList.remove('active');

  setTimeout(() => {
    overlay.style.display = 'none';
  }, 400); // Tunggu durasi CSS transition selesai
}

// Buka terminal kalau di klik SAII
function startSaii() {
  if (!checkSession()) {
    showNotification('Please login first');
    return;
  }
  runTerminalAnimation();
}


// ==============================================
// 5. INITIALIZATION
// ==============================================
document.addEventListener('DOMContentLoaded', async function () {
  console.log('📱 DOM Content Loaded - Starting GODDATAX...');

  // Init swipe gestures
  initSwipeGestures();

  // 🔥 MAINTENANCE / UPDATE CHECK 🔥
  if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.isUpdating) {
    console.log('🚧 System is in maintenance mode. Blocking access.');
    showScreen('maintenanceScreen');
    return;
  }

  // Step 2: Check session & Status
  console.log('Step 2: Checking session...');
  const session = localStorage.getItem('saiSession');
  const savedKey = localStorage.getItem('loginKey');

  if (session === 'active_forever' && savedKey) {
    // Validasi lisensi sebelum masuk menu
    validateLicenseOnStart(savedKey);
  } else {
    showScreen('loginScreen');
  }

  // Step 3: Setup event listeners
  console.log('Step 3: Setting up event listeners...');
  setupEventListeners();

  // Step 4: Show welcome message
  setTimeout(() => {
    console.log('🎉 GODDATAX Ready!');
    console.log(`📡 Supabase Auth: ${_supabase ? 'Connected' : 'Error'}`);
  }, 1000);
});


// Fungsi baru untuk validasi lisensi saat aplikasi dibuka
async function validateLicenseOnStart(licenseKey) {
  if (!_supabase) {
    showSwiper();
    navTo(0, false);
    return;
  }

  try {
    const { data, error } = await _supabase
      .from(APP_CONFIG.supabase.tableName)
      .select('*')
      .eq('license', licenseKey)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        clearSession();
        return;
      }
      // Error internet - tetap izinkan masuk (safety)
      showSwiper();
      navTo(0, false);
      startHeartbeat(licenseKey);
      return;
    }

    if (data.status === 'paused') {
      showScreen('pausedScreen');
      startHeartbeat(licenseKey);
      return;
    }

    const currentHWID = getHWID();
    if (data.hwid && data.hwid !== currentHWID) {
      showNotification('Lisensi terikat di perangkat lain');
      clearSession();
      return;
    }

    // OK - show swiper
    showSwiper();
    navTo(0, false);
    startHeartbeat(licenseKey);
  } catch (e) {
    showSwiper();
    navTo(0, false);
    startHeartbeat(licenseKey);
  }
}


// Setup semua event listeners
function setupEventListeners() {
  // Login input dan button
  const loginInput = document.getElementById('loginKey');
  const loginBtn = document.querySelector('.login-btn');

  if (loginInput) {
    // Enter key untuk login
    loginInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        console.log('Enter key pressed, checking login...');
        checkLogin();
      }
    });

    // Update status icon
    loginInput.addEventListener('input', () => {
      const keyStatus = document.getElementById('keyStatus');
      if (keyStatus) {
        if (loginInput.value.trim().length > 0) {
          keyStatus.innerHTML = '<i class="fas fa-lock-open" style="color:#ff7a00"></i>';
        } else {
          keyStatus.innerHTML = '<i class="fas fa-lock"></i>';
        }
      }
    });

    // Auto focus
    setTimeout(() => {
      loginInput.focus();
      console.log('🎯 Login input focused');
    }, 800);
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', checkLogin);
  }

  // Saii button
  const saiiBtn = document.querySelector('.saii-btn');
  if (saiiBtn) {
    saiiBtn.addEventListener('click', (e) => {
      e.preventDefault();
      startSaii();
    });
  }

  // Toggle switches
  document.querySelectorAll('.toggle-switch input').forEach(toggle => {
    toggle.addEventListener('change', function () {
      const saved = localStorage.getItem('ffSettings');
      let settings = saved ? JSON.parse(saved) : {};

      // Hanya simpan jika bukan headshotcrosshair
      if (this.id !== 'headshotcrosshair') {
        settings[this.id] = this.checked;
        localStorage.setItem('ffSettings', JSON.stringify(settings));
        console.log(`Toggle ${this.id}: ${this.checked ? 'ON' : 'OFF'}`);
      }
    });
  });

  // Setup notification test buttons
  document.querySelectorAll('.card').forEach(card => {
    const text = card.querySelector('h3')?.textContent;
    if (text && (text.includes('Restart') || text.includes('Reboot'))) {
      card.addEventListener('click', function () {
        showNotification(`✅ ${text} completed successfully`);
      });
    }
  });
}

// ==============================================
// 6. OVERRIDE DEFAULT BROWSER FUNCTIONS
// ==============================================
window.alert = function (message) {
  console.log('⚠️ Alert intercepted:', message);
  showNotification(message);
  return undefined;
};

window.confirm = function (message) {
  console.log('❓ Confirm intercepted:', message);
  showNotification(message + ' (Press OK to continue)');
  return true; // Always return true untuk convenience
};

window.prompt = function (message) {
  console.log('💬 Prompt intercepted:', message);
  showNotification(message);
  return 'user_input'; // Default value
};

// ==============================================
// 7. SHAKE ANIMATION (untuk invalid key)
// ==============================================
const style = document.createElement('style');
style.textContent = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

/* Keys info styling */
.keys-info {
  animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
`;
document.head.appendChild(style);
console.log('✅ script.js loaded successfully');


