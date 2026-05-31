/**
 * fileService.ts
 * Utility for handling file uploads/downloads in Electron (and web fallback).
 */

export async function saveUploadedFile(file: File, customerName: string): Promise<string> {
  const isElectron = typeof window !== 'undefined' && 
                    window.process && 
                    (window.process as any).type === 'renderer' &&
                    (window as any).require;

  if (isElectron) {
    try {
      const fs = (window as any).require('fs');
      const path = (window as any).require('path');
      const electron = (window as any).require('electron');
      
      if (electron && electron.ipcRenderer) {
        // Get userData path via IPC from main process
        const userDataPath = await electron.ipcRenderer.invoke('get-user-data-path');
        const uploadsDir = path.join(userDataPath, 'uploads', customerName.replace(/[^a-z0-9]/gi, '_').toLowerCase());

        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const fileName = `${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
        const filePath = path.join(uploadsDir, fileName);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        fs.writeFileSync(filePath, buffer);

        console.log('File saved to disk:', filePath);
        return filePath;
      }
    } catch (err) {
      console.error('Electron file save failed, falling back to memory/base64:', err);
    }
  }

  // Web fallback (or Electron failure fallback): Convert to Base64 (Data URL)
  // This ensures the file is still "uploaded" (available in memory) even if local storage fails
  console.log('Using web fallback for file storage');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => {
      console.error('FileReader error:', e);
      reject(e);
    };
    reader.readAsDataURL(file);
  });
}

export function openLocalFile(filePath: string): void {
  const isElectron = typeof window !== 'undefined' && (window as any).process && (window as any).require;

  if (isElectron && filePath.startsWith('C:') || filePath.startsWith('/') || filePath.includes('\\')) {
    try {
      const electron = (window as any).require('electron');
      const shell = electron.shell;
      shell.openPath(filePath);
    } catch (err) {
      console.error('Failed to open local file:', err);
      // Fallback: try opening in a new window
      window.open(`file://${filePath}`, '_blank');
    }
  } else {
    // If it's a data URL or web link
    const win = window.open();
    if (win) {
      if (filePath.startsWith('data:image/')) {
        win.document.write(`<html><body style="margin:0;display:flex;justify-content:center;align-items:center;background:#0e0e0e;"><img src="${filePath}" style="max-width:100%;max-height:100vh;" /></body></html>`);
      } else {
        win.document.write(`<iframe src="${filePath}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
      }
    }
  }
}

export async function savePdfToCustomerFolder(pdfBuffer: ArrayBuffer, filename: string, customerName: string): Promise<string | null> {
  const isElectron = typeof window !== 'undefined' && 
                    window.process && 
                    (window.process as any).type === 'renderer' &&
                    (window as any).require;

  if (isElectron) {
    try {
      const fs = (window as any).require('fs');
      const path = (window as any).require('path');
      const electron = (window as any).require('electron');
      
      if (electron && electron.ipcRenderer) {
        const userDataPath = await electron.ipcRenderer.invoke('get-user-data-path');
        const uploadsDir = path.join(userDataPath, 'uploads', customerName.replace(/[^a-z0-9]/gi, '_').toLowerCase());

        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const filePath = path.join(uploadsDir, filename);
        const buffer = Buffer.from(pdfBuffer);
        fs.writeFileSync(filePath, buffer);
        console.log('PDF receipt archived in customer folder:', filePath);
        return filePath;
      }
    } catch (err) {
      console.error('Failed to save PDF to customer folder:', err);
    }
  }
  return null;
}
