// background.js - Service worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('[TraducteurKirundi] Extension installée');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message.action;

  if (action === 'START' || action === 'PAUSE' || action === 'RESUME') {
    chrome.tabs.query({ url: 'https://translate.google.com/*' }, (tabs) => {
      if (tabs.length > 0) {
        const tab = tabs[0];
        chrome.tabs.sendMessage(tab.id, message, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error forwarding message:', chrome.runtime.lastError);
            sendResponse({ status: 'ERROR', error: chrome.runtime.lastError.message });
          } else {
            sendResponse(response || { status: 'OK' });
          }
        });
      } else {
        sendResponse({ status: 'ERROR', error: 'No Google Translate tab found' });
      }
    });
    return true;
  }

  if (action === 'SAVE_STATE') {
    chrome.storage.local.set({
      translations: message.translations,
      currentIndex: message.currentIndex,
      phrases: message.phrases,
    }, () => {
      sendResponse({ status: 'SAVED' });
    });
    return true;
  }

  if (action === 'LOAD_STATE') {
    chrome.storage.local.get(['translations', 'currentIndex', 'phrases', 'state'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (action === 'CLEAR_STATE') {
    chrome.storage.local.remove(['translations', 'currentIndex', 'phrases', 'state'], () => {
      sendResponse({ status: 'CLEARED' });
    });
    return true;
  }

  sendResponse({ status: 'UNKNOWN_ACTION' });
  return false;
});