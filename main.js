const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let alarmInterval = null;
let tray = null;
let mainWindow = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // If a user tries to open a second instance, wake up the original background instance!
    restoreApp();
  });

  function createWindow () {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    mainWindow.loadFile('index.html');
    
    if (!tray) {
      // Use a guaranteed 16x16 Base64 PNG instead of an SVG
      // SVGs often silently fail to render in macOS Menu Bars in unpackaged electron apps!
      const iconBase64 = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAEnQAABJ0Ad5mH3gAAABdSURBVDhPpc1RCoAgFIbh1b9u4Ea1iS6jd/eQhBCbNqEHD8TDOzjI51zQpEQNqsz1QkSKMcbS0RijTyl14rruoP24AczDOUA/wE2YB2jQoQv24wawEMcAt0ED3mBfWvgAHlXo14j3R8cAAAAASUVORK5CYII=";
      let icon = nativeImage.createFromBuffer(Buffer.from(iconBase64, 'base64'));
      
      tray = new Tray(icon);
      tray.setToolTip('ZenRead - Đang chạy ngầm');
      
      tray.on('click', () => {
        restoreApp();
      });
      
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Mở lại ZenRead', click: () => restoreApp() },
        { type: 'separator' },
        { label: 'Thoát hoàn toàn', click: () => app.quit() }
      ]);
      tray.setContextMenu(contextMenu);
    }
  }

  function restoreApp() {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      createWindow();
    } else {
      windows[0].show();
    }
    if (app.dock) app.dock.show();
  }

  app.whenReady().then(() => {
    createWindow();

    function showMacNotification(title, body) {
      const notif = new Notification({ title, body });
      notif.on('click', () => {
        restoreApp();
      });
      notif.show();
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

    ipcMain.on('run-in-background', () => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].hide();
      }
      if (app.dock) {
        app.dock.hide(); // Completely hides it from the dock
      }
    });

    app.on('activate', () => {
      restoreApp();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
