const { app, BrowserWindow, ipcMain, Notification, dialog } = require('electron');
const path = require('path');

let alarmInterval = null;

function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  function showMacNotification(title, body) {
    new Notification({ title, body }).show();
  }

  ipcMain.on('set-alarm', (event, { time, isEnabled }) => {
    if (alarmInterval) clearInterval(alarmInterval);
    app.lastNotifiedDate = null; 
    
    if (isEnabled && time) {
      console.log(`Alarm scheduled for ${time}`);
      alarmInterval = setInterval(() => {
        const now = new Date();
        const currentHours = String(now.getHours()).padStart(2, '0');
        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
        const currentDate = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
        const currentTime = `${currentHours}:${currentMinutes}`;
        
        if (currentTime === time && app.lastNotifiedDate !== currentDate) {
            app.lastNotifiedDate = currentDate;
            showMacNotification("📚 Đã đến giờ đọc sách!", "ZenRead đang chờ bạn tiếp tục hành trình tri thức của mình.");
        }
      }, 10000); 
    }
  });

  ipcMain.on('test-notification', () => {
    console.log('Testing notification...');
    showMacNotification("🔔 Đã gửi thông báo thử", "Nhắc nhở qua ứng dụng thiết bị thành công!");
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
