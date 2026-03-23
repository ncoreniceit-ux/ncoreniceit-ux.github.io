const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    setAlarm: (alarmConfig) => ipcRenderer.send('set-alarm', alarmConfig),
    testNotification: () => ipcRenderer.send('test-notification'),
    runInBackground: () => ipcRenderer.send('run-in-background'),
    getGeminiApiKey: () => ipcRenderer.invoke('get-gemini-key')
});
