// content.js - Script injecté dans translate.google.com
// Automatise la traduction par lots via l'interface Google Translate

(function() {
  'use strict';

  const SOURCE_SELECTOR = 'textarea[jsname="BJE2fc"]';
  const TRANSLATION_SELECTOR = 'span[jsname="W297wb"]';
  const TRANSLATION_CONTAINER_SELECTOR = '[jsname="WsjYwc"]';
  const MAX_WAIT_TIME = 20000;
  const STABILITY_THRESHOLD = 8;
  const RETRY_MAX = 3;

  let isRunning = false;
  let isPaused = false;
  let phrases = [];
  let translations = [];
  let currentIndex = 0;
  let batchSize = 90;
  let delaySeconds = 3.5;
  let retryCount = 0;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function log(message, level = 'info') {
    console.log(`[TraducteurKirundi] ${message}`);
    chrome.runtime.sendMessage({ type: 'LOG', message, level });
  }

  function getSourceTextarea() {
    return document.querySelector(SOURCE_SELECTOR);
  }

  function getTranslationSpans() {
    return document.querySelectorAll(TRANSLATION_SELECTOR);
  }

  function getTranslationContainer() {
    return document.querySelector(TRANSLATION_CONTAINER_SELECTOR);
  }

  async function pasteSourceText(text) {
    const textarea = getSourceTextarea();
    if (!textarea) {
      throw new Error('Textarea source introuvable sur Google Translate');
    }

    textarea.focus();
    textarea.click();
    await sleep(300);

    textarea.select();
    document.execCommand('delete');
    await sleep(200);

    const success = document.execCommand('insertText', false, text);
    if (!success) {
      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));

    await sleep(500);
  }

  function getTranslatedText() {
    const spans = getTranslationSpans();
    if (spans.length === 0) return '';

    const lines = [];
    spans.forEach(span => {
      const text = span.textContent || '';
      if (text.trim()) {
        lines.push(text);
      }
    });

    if (lines.length > 1) {
      return lines.join('\n');
    }

    if (lines.length === 1) {
      const text = lines[0];
      const splitByPeriod = text.split(/\.\s+/).filter(s => s.trim());
      if (splitByPeriod.length > 1) {
        return splitByPeriod.map(s => s.trim() + '.').join('\n');
      }
      return text;
    }

    return '';
  }

  function observeTranslationChanges() {
    return new Promise((resolve) => {
      const container = getTranslationContainer();
      if (!container) {
        resolve(null);
        return;
      }

      let stableCount = 0;
      let lastText = '';
      let timeoutId = null;

      const observer = new MutationObserver(() => {
        const currentText = getTranslatedText();
        if (currentText === lastText && currentText.length > 0) {
          stableCount++;
          if (stableCount >= STABILITY_THRESHOLD) {
            observer.disconnect();
            if (timeoutId) clearTimeout(timeoutId);
            resolve(currentText);
          }
        } else {
          stableCount = 0;
          lastText = currentText;
        }
      });

      observer.observe(container, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(getTranslatedText());
      }, MAX_WAIT_TIME);
    });
  }

  async function waitForTranslation() {
    try {
      const result = await Promise.race([
        observeTranslationChanges(),
        sleep(MAX_WAIT_TIME).then(() => getTranslatedText()),
      ]);
      if (result) return result;
    } catch (e) {
      // ignore
    }

    let stableCount = 0;
    let lastText = '';
    let elapsed = 0;
    const checkInterval = 400;

    return new Promise((resolve, reject) => {
      const check = () => {
        if (!isRunning || isPaused) {
          reject(new Error('PAUSED'));
          return;
        }

        const currentText = getTranslatedText();
        elapsed += checkInterval;

        if (elapsed > MAX_WAIT_TIME) {
          log(`Timeout atteint, retour de "${currentText.substring(0, 100)}..."`, 'warning');
          resolve(currentText);
          return;
        }

        if (currentText === lastText && currentText.length > 0) {
          stableCount++;
          if (stableCount >= STABILITY_THRESHOLD) {
            resolve(currentText);
            return;
          }
        } else {
          stableCount = 0;
          lastText = currentText;
        }

        setTimeout(check, checkInterval);
      };

      check();
    });
  }

  function parseTranslatedText(translatedText, expectedCount) {
    if (!translatedText) return new Array(expectedCount).fill('');

    let lines = translatedText.split('\n').filter(l => l.trim());

    if (lines.length < expectedCount) {
      const flatText = lines.join(' ');
      const splitResult = flatText.split(/(?:\.\s+|\;\s+)/).filter(s => s.trim());
      if (splitResult.length >= expectedCount) {
        lines = splitResult.map(s => s.trim() + '.');
      }
    }

    if (lines.length > expectedCount * 2) {
      const grouped = [];
      for (let i = 0; i < lines.length; i += 2) {
        grouped.push((lines[i] || '') + ' ' + (lines[i + 1] || ''));
      }
      lines = grouped.filter(l => l.trim());
    }

    const result = [];
    for (let i = 0; i < expectedCount; i++) {
      result.push(lines[i] || '');
    }
    return result;
  }

  async function processBatch(batchPhrases, batchIndex, totalBatches) {
    const expectedCount = batchPhrases.length;
    log(`Lot ${batchIndex + 1}/${totalBatches} : envoi de ${expectedCount} phrases...`);

    const batchText = batchPhrases.join('\n');
    await pasteSourceText(batchText);

    log('Attente de la traduction Google...');
    const translatedText = await waitForTranslation();
    const result = parseTranslatedText(translatedText, expectedCount);

    log(`Lot ${batchIndex + 1}/${totalBatches} : ${result.filter(r => r).length}/${expectedCount} phrases traduites`);
    return result;
  }

  async function runTranslation() {
    const totalBatches = Math.ceil((phrases.length - currentIndex) / batchSize);
    retryCount = 0;

    log(`Démarrage : ${phrases.length} phrases, ${totalBatches} lots de ${batchSize}`);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      if (!isRunning) {
        log('Traduction arrêtée', 'warning');
        break;
      }

      if (isPaused) {
        log('Traduction en pause...', 'warning');
        chrome.runtime.sendMessage({ type: 'PAUSED' });
        return;
      }

      const start = currentIndex;
      const end = Math.min(start + batchSize, phrases.length);
      const batchPhrases = phrases.slice(start, end);

      try {
        const translatedBatch = await processBatch(batchPhrases, batchIndex, totalBatches);

        const emptyCount = translatedBatch.filter(t => !t).length;
        if (emptyCount > translatedBatch.length / 2 && retryCount < RETRY_MAX) {
          retryCount++;
          log(`Trop de traductions vides, retry ${retryCount}/${RETRY_MAX}...`, 'warning');
          await sleep(3000);
          batchIndex--;
          continue;
        }
        retryCount = 0;

        for (let i = 0; i < translatedBatch.length; i++) {
          translations[start + i] = translatedBatch[i];
        }

        currentIndex = end;

        chrome.runtime.sendMessage({
          type: 'PROGRESS',
          currentIndex,
          translations,
        });

        await chrome.storage.local.set({ translations, currentIndex });

        if (batchIndex < totalBatches - 1) {
          const delayMs = delaySeconds * 1000;
          log(`Attente de ${delaySeconds}s avant le prochain lot...`);
          await sleep(delayMs);
        }

      } catch (err) {
        if (err.message === 'PAUSED') {
          log('Mise en pause demandée', 'warning');
          chrome.runtime.sendMessage({ type: 'PAUSED' });
          return;
        }
        log(`Erreur lot ${batchIndex + 1} : ${err.message}`, 'error');
        await sleep(5000);
        batchIndex--;
      }
    }

    isRunning = false;
    log('Tous les lots sont traduits !', 'success');
    chrome.runtime.sendMessage({ type: 'COMPLETE', translations });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const action = message.action;

    if (action === 'START') {
      phrases = message.phrases || [];
      currentIndex = message.startIndex || 0;
      batchSize = message.batchSize || 90;
      delaySeconds = message.delaySeconds || 3.5;
      translations = message.existingTranslations || [];
      isRunning = true;
      isPaused = false;

      ensureCorrectLanguage().then(() => {
        setTimeout(() => {
          runTranslation();
        }, 2000);
      });

      sendResponse({ status: 'STARTED' });
      return true;
    }

    if (action === 'PAUSE') {
      isPaused = true;
      isRunning = false;
      sendResponse({ status: 'PAUSED' });
      return true;
    }

    if (action === 'RESUME') {
      phrases = message.phrases || phrases;
      currentIndex = message.startIndex || currentIndex;
      batchSize = message.batchSize || batchSize;
      delaySeconds = message.delaySeconds || delaySeconds;
      translations = message.existingTranslations || translations;
      isPaused = false;
      isRunning = true;

      runTranslation();
      sendResponse({ status: 'RESUMED' });
      return true;
    }

    if (action === 'GET_STATUS') {
      sendResponse({
        isRunning,
        isPaused,
        currentIndex,
        totalPhrases: phrases.length,
        translatedCount: translations.length,
      });
      return true;
    }
  });

  async function ensureCorrectLanguage() {
    const currentUrl = window.location.href;
    const targetUrlPattern = /translate\.google\.com.*[?&]sl=fr.*[?&]tl=rn/;

    if (!targetUrlPattern.test(currentUrl)) {
      log('Redirection vers fr -> rn...');
      window.location.href = 'https://translate.google.com/?sl=fr&tl=rn&op=translate';
      await sleep(4000);
    }
  }

  function waitForPageReady() {
    return new Promise((resolve) => {
      const check = () => {
        if (getSourceTextarea()) {
          log('Page Google Translate prête');
          resolve(true);
          return;
        }
        setTimeout(check, 500);
      };
      check();
    });
  }

  waitForPageReady().then(() => {
    log('Content script prêt et connecté à Google Translate');
  });

})();