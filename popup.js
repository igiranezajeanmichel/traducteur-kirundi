// popup.js - Interface utilisateur de l'extension

(function() {
  'use strict';

  // DOM
  const els = {
    jsonFile: document.getElementById('jsonFile'),
    btnSelectFile: document.getElementById('btnSelectFile'),
    fileInfo: document.getElementById('fileInfo'),
    btnStart: document.getElementById('btnStart'),
    btnPause: document.getElementById('btnPause'),
    btnResume: document.getElementById('btnResume'),
    btnReset: document.getElementById('btnReset'),
    batchSize: document.getElementById('batchSize'),
    delay: document.getElementById('delay'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    progressPercent: document.getElementById('progressPercent'),
    statBatches: document.getElementById('statBatches'),
    statTime: document.getElementById('statTime'),
    statStatus: document.getElementById('statStatus'),
    logContainer: document.getElementById('logContainer'),
    btnExport: document.getElementById('btnExport'),
    btnExportPartial: document.getElementById('btnExportPartial'),
  };

  // État
  let state = {
    phrases: [],
    translations: [],
    isRunning: false,
    isPaused: false,
    currentIndex: 0,
    batchSize: 90,
    delaySeconds: 3.5,
    tabId: null,
  };

  // Logs
  function log(message, type = 'info') {
    const time = new Date().toLocaleTimeString('fr-FR');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${time}]</span><span class="log-${type}">${escapeHtml(message)}</span>`;
    els.logContainer.appendChild(entry);
    els.logContainer.scrollTop = els.logContainer.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Upload du fichier
  els.btnSelectFile.addEventListener('click', () => els.jsonFile.click());

  els.jsonFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        let phrases = [];

        if (Array.isArray(data)) {
          phrases = data;
        } else if (data.phrases && Array.isArray(data.phrases)) {
          phrases = data.phrases;
        } else if (data.fr && Array.isArray(data.fr)) {
          phrases = data.fr;
        } else {
          for (const key of Object.keys(data)) {
            if (Array.isArray(data[key])) {
              phrases = data[key];
              break;
            }
          }
        }

        if (phrases.length === 0) {
          log('Aucune phrase trouvée dans le JSON', 'error');
          return;
        }

        state.phrases = phrases.filter(p => p && String(p).trim().length > 0);
        log(`${state.phrases.length} phrases chargées depuis ${file.name}`, 'success');

        els.fileInfo.innerHTML = `
          <strong>${file.name}</strong><br>
          ${state.phrases.length} phrases | ${(file.size / 1024).toFixed(1)} KB
        `;
        els.fileInfo.classList.remove('hidden');

        updateUI();
        saveState();
      } catch (err) {
        log('Erreur de parsing JSON : ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  });

  // Contrôles
  els.btnStart.addEventListener('click', startTranslation);
  els.btnPause.addEventListener('click', pauseTranslation);
  els.btnResume.addEventListener('click', resumeTranslation);
  els.btnReset.addEventListener('click', resetTranslation);
  els.btnExport.addEventListener('click', () => exportJSON(false));
  els.btnExportPartial.addEventListener('click', () => exportJSON(true));

  els.batchSize.addEventListener('change', (e) => {
    state.batchSize = parseInt(e.target.value) || 90;
    updateStats();
  });

  els.delay.addEventListener('change', (e) => {
    state.delaySeconds = parseFloat(e.target.value) || 3.5;
  });

  async function startTranslation() {
    if (state.phrases.length === 0) {
      log('Aucune phrase chargée', 'warning');
      return;
    }

    const saved = await chrome.storage.local.get(['translations', 'currentIndex']);
    if (saved.translations && saved.translations.length > 0) {
      state.translations = saved.translations;
      state.currentIndex = saved.currentIndex || 0;
      log(`Reprise à l'index ${state.currentIndex} (${state.translations.length} phrases déjà traduites)`, 'info');
    }

    const translateUrl = 'https://translate.google.com/?sl=fr&tl=rn&op=translate';
    let tab;

    try {
      const tabs = await chrome.tabs.query({ url: 'https://translate.google.com/*' });
      if (tabs.length > 0) {
        tab = tabs[0];
        await chrome.tabs.update(tab.id, { active: true });
        log('Onglet Google Translate trouvé', 'success');
      } else {
        tab = await chrome.tabs.create({ url: translateUrl, active: false });
        log('Nouvel onglet Google Translate ouvert', 'info');
      }
    } catch (err) {
      log('Erreur d\'ouverture de l\'onglet : ' + err.message, 'error');
      return;
    }

    state.tabId = tab.id;
    state.isRunning = true;
    state.isPaused = false;

    updateUI();
    saveState();

    sendCommand('START', {
      phrases: state.phrases,
      startIndex: state.currentIndex,
      batchSize: state.batchSize,
      delaySeconds: state.delaySeconds,
      existingTranslations: state.translations,
    });

    log('Traduction démarrée', 'success');
  }

  function pauseTranslation() {
    state.isPaused = true;
    updateUI();
    sendCommand('PAUSE', {});
    log('Traduction mise en pause', 'warning');
  }

  function resumeTranslation() {
    state.isPaused = false;
    state.isRunning = true;
    updateUI();
    sendCommand('RESUME', {
      phrases: state.phrases,
      startIndex: state.currentIndex,
      batchSize: state.batchSize,
      delaySeconds: state.delaySeconds,
      existingTranslations: state.translations,
    });
    log('Traduction reprise', 'success');
  }

  function resetTranslation() {
    if (!confirm('Réinitialiser toute la progression ? Les traductions seront perdues.')) return;

    state.translations = [];
    state.currentIndex = 0;
    state.isRunning = false;
    state.isPaused = false;

    chrome.storage.local.remove(['translations', 'currentIndex', 'state']);
    updateUI();
    log('Progression réinitialisée', 'warning');
  }

  function sendCommand(action, data) {
    chrome.runtime.sendMessage({ action, ...data });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PROGRESS') {
      state.currentIndex = message.currentIndex;
      state.translations = message.translations;
      updateUI();
      saveState();
    } else if (message.type === 'LOG') {
      log(message.message, message.level || 'info');
    } else if (message.type === 'COMPLETE') {
      state.isRunning = false;
      state.isPaused = false;
      state.translations = message.translations;
      updateUI();
      saveState();
      log('Traduction terminée !', 'success');
    } else if (message.type === 'PAUSED') {
      state.isPaused = true;
      state.isRunning = false;
      updateUI();
      log('En pause', 'warning');
    } else if (message.type === 'ERROR') {
      log(message.message, 'error');
      state.isRunning = false;
      updateUI();
    }
  });

  function updateUI() {
    const total = state.phrases.length;
    const current = state.currentIndex;
    const translated = state.translations.length;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;

    els.progressFill.style.width = percent + '%';
    els.progressText.textContent = `${current} / ${total} phrases`;
    els.progressPercent.textContent = percent + '%';

    els.btnStart.disabled = total === 0 || state.isRunning;
    els.btnPause.disabled = !state.isRunning || state.isPaused;
    els.btnResume.classList.toggle('hidden', !state.isPaused);
    els.btnExport.disabled = translated === 0;
    els.btnExportPartial.disabled = translated === 0;

    const totalBatches = total > 0 ? Math.ceil(total / state.batchSize) : 0;
    const currentBatch = total > 0 ? Math.ceil(current / state.batchSize) : 0;
    els.statBatches.textContent = `${currentBatch} / ${totalBatches}`;

    const remainingBatches = totalBatches - currentBatch;
    const estSeconds = remainingBatches * (state.delaySeconds + 5);
    const estMinutes = Math.ceil(estSeconds / 60);
    els.statTime.textContent = state.isRunning ? `~${estMinutes} min` : '--';

    if (state.isPaused) {
      els.statStatus.textContent = 'En pause';
      els.statStatus.style.color = '#ed8936';
    } else if (state.isRunning) {
      els.statStatus.textContent = 'En cours';
      els.statStatus.style.color = '#4299e1';
    } else if (current >= total && total > 0) {
      els.statStatus.textContent = 'Terminé';
      els.statStatus.style.color = '#48bb78';
    } else {
      els.statStatus.textContent = 'En attente';
      els.statStatus.style.color = '#718096';
    }
  }

  function updateStats() {
    const total = state.phrases.length;
    const totalBatches = total > 0 ? Math.ceil(total / state.batchSize) : 0;
    const current = state.currentIndex;
    const currentBatch = total > 0 ? Math.ceil(current / state.batchSize) : 0;
    els.statBatches.textContent = `${currentBatch} / ${totalBatches}`;
  }

  function exportJSON(partial = false) {
    const result = [];
    const limit = partial ? state.currentIndex : state.translations.length;

    for (let i = 0; i < limit; i++) {
      result.push({
        id: i + 1,
        fr: state.phrases[i] || '',
        rn: state.translations[i] || '',
      });
    }

    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traduction_kirundi_${new Date().toISOString().slice(0,10)}_${result.length}phrases.json`;
    a.click();
    URL.revokeObjectURL(url);

    log(`${result.length} phrases exportées`, 'success');
  }

  async function saveState() {
    await chrome.storage.local.set({
      translations: state.translations,
      currentIndex: state.currentIndex,
      state: {
        isRunning: state.isRunning,
        isPaused: state.isPaused,
      }
    });
  }

  async function loadState() {
    const data = await chrome.storage.local.get(['translations', 'currentIndex', 'state', 'phrases']);
    if (data.phrases) {
      state.phrases = data.phrases;
    }
    if (data.translations) {
      state.translations = data.translations;
      state.currentIndex = data.currentIndex || 0;
      log(`${state.translations.length} traductions chargées depuis la sauvegarde`, 'info');
    }
    if (data.state) {
      state.isRunning = data.state.isRunning;
      state.isPaused = data.state.isPaused;
    }
    updateUI();
  }

  loadState();
  log('Extension Traducteur Kirundi prête', 'success');

})();