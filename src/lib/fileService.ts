import { supabase } from './supabaseClient';
import { isOnline } from './database';
import { compressImage } from './imageCompressor';

export async function saveUploadedFile(file: File, customerName: string): Promise<string> {
  let finalFile = file;
  
  // Failsafe compression and size enforcement for storage optimization
  if (file.type.startsWith('image/')) {
    try {
      finalFile = await compressImage(file, 800, 0.6);
    } catch (err) {
      console.warn('Failsafe image compression failed, using original:', err);
    }
  } else if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) {
    if (file.size > 1 * 1024 * 1024) {
      throw new Error("File size exceeds 1MB limit for PDFs.");
    }
  } else {
    // General fallback size check for any other file type
    if (file.size > 1 * 1024 * 1024) {
      throw new Error("File size exceeds 1MB limit.");
    }
  }

  // Try cloud upload via Supabase Storage if online
  try {
    const online = await isOnline();
    if (online) {
      const fileExt = finalFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const bucketFilePath = `${customerName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}/${fileName}`;
      
      const { data, error } = await supabase.storage
        .from('uploads')
        .upload(bucketFilePath, finalFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(bucketFilePath);
        
      console.log('File uploaded to Supabase Storage:', publicUrlData.publicUrl);
      return publicUrlData.publicUrl;
    }
  } catch (err) {
    console.error('Supabase Storage upload failed, falling back to local storage:', err);
  }

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

        const fileName = `${Date.now()}-${finalFile.name.replace(/[^a-z0-9.]/gi, '_')}`;
        const filePath = path.join(uploadsDir, fileName);

        const arrayBuffer = await finalFile.arrayBuffer();
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
    reader.readAsDataURL(finalFile);
  });
}

export function getFileUrl(filePath: string): string {
  if (!filePath) return '';
  if (filePath.startsWith('data:') || filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  if (filePath.startsWith('file://')) {
    return encodeURI(filePath);
  }

  let resolvedPath = filePath;
  const isElectron = typeof window !== 'undefined' && (window as any).process && (window as any).require;

  if (isElectron) {
    try {
      const fs = (window as any).require('fs');
      const path = (window as any).require('path');
      
      const uploadsIndex = filePath.toLowerCase().indexOf('uploads');
      if (uploadsIndex !== -1) {
        const relativePath = filePath.substring(uploadsIndex).replace(/\\/g, path.sep);
        const appData = (window as any).process.env.APPDATA || 
                        ((window as any).process.platform === 'darwin' 
                          ? path.join((window as any).process.env.HOME, 'Library', 'Application Support') 
                          : path.join((window as any).process.env.HOME, '.config'));
        
        const possibleAppNames = ['gold-loan-management-app', 'Gold Loan Manager'];
        for (const appName of possibleAppNames) {
          const targetPath = path.join(appData, appName, relativePath);
          if (fs.existsSync(targetPath)) {
            resolvedPath = targetPath;
            break;
          }
        }
      }
    } catch (err) {
      console.warn('Error resolving local file path dynamically:', err);
    }
  }

  // Replace backslashes with forward slashes for URL formatting
  const formatted = resolvedPath.replace(/\\/g, '/');
  // If it's a Windows drive path (e.g. C:/path/to/file)
  if (formatted.match(/^[a-zA-Z]:/)) {
    return encodeURI(`file:///${formatted}`);
  }
  // If it's an absolute POSIX path (e.g. /path/to/file)
  if (formatted.startsWith('/')) {
    return encodeURI(`file://${formatted}`);
  }
  return resolvedPath;
}

export function openLocalFile(filePath: string): void {
  const isElectron = typeof window !== 'undefined' && (window as any).process && (window as any).require;

  let resolvedPath = filePath;
  if (isElectron) {
    try {
      const fs = (window as any).require('fs');
      const path = (window as any).require('path');
      
      const uploadsIndex = filePath.toLowerCase().indexOf('uploads');
      if (uploadsIndex !== -1) {
        const relativePath = filePath.substring(uploadsIndex).replace(/\\/g, path.sep);
        const appData = (window as any).process.env.APPDATA || 
                        ((window as any).process.platform === 'darwin' 
                          ? path.join((window as any).process.env.HOME, 'Library', 'Application Support') 
                          : path.join((window as any).process.env.HOME, '.config'));
        
        const possibleAppNames = ['gold-loan-management-app', 'Gold Loan Manager'];
        for (const appName of possibleAppNames) {
          const targetPath = path.join(appData, appName, relativePath);
          if (fs.existsSync(targetPath)) {
            resolvedPath = targetPath;
            break;
          }
        }
      }
    } catch (err) {
      console.warn('Error resolving path in openLocalFile:', err);
    }
  }

  const isLocalPath = resolvedPath.startsWith('C:') || 
                      resolvedPath.startsWith('/') || 
                      resolvedPath.includes('\\') || 
                      resolvedPath.includes(':/') || 
                      resolvedPath.includes(':\\');

  if (isElectron && isLocalPath) {
    try {
      const electron = (window as any).require('electron');
      const shell = electron.shell;
      shell.openPath(resolvedPath).then((errorMsg: string) => {
        if (errorMsg) {
          console.error('shell.openPath failed, trying fallback:', errorMsg);
          const url = getFileUrl(resolvedPath);
          window.open(url, '_blank');
        }
      }).catch((err: any) => {
        console.error('shell.openPath promise rejected:', err);
        const url = getFileUrl(resolvedPath);
        window.open(url, '_blank');
      });
    } catch (err) {
      console.error('Failed to open local file via shell:', err);
      const url = getFileUrl(resolvedPath);
      window.open(url, '_blank');
    }
  } else {
    // If it's a data URL or web link
    if (resolvedPath.startsWith('data:') || resolvedPath.startsWith('http:') || resolvedPath.startsWith('https:')) {
      const win = window.open();
      if (win) {
        if (resolvedPath.startsWith('data:image/')) {
          win.document.write(`<html><body style="margin:0;display:flex;justify-content:center;align-items:center;background:#0e0e0e;"><img src="${resolvedPath}" style="max-width:100%;max-height:100vh;" /></body></html>`);
        } else {
          win.document.write(`<iframe src="${resolvedPath}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
        }
      }
    } else {
      console.warn('Cannot open local file path in a browser environment due to security restrictions:', resolvedPath);
      alert(`Security restriction: Cannot open local file path in browser. Please run the application as a desktop (Electron) app to view local files.\n\nFile Path: ${resolvedPath}`);
    }
  }
}

export async function savePdfToCustomerFolder(pdfBuffer: ArrayBuffer, filename: string, customerName: string): Promise<string | null> {
  // Try cloud upload via Supabase Storage if online
  try {
    const online = await isOnline();
    if (online) {
      const bucketFilePath = `${customerName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}/${filename}`;
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      
      const { data, error } = await supabase.storage
        .from('uploads')
        .upload(bucketFilePath, blob, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(bucketFilePath);
        
      console.log('PDF receipt uploaded to Supabase Storage:', publicUrlData.publicUrl);
      return publicUrlData.publicUrl;
    }
  } catch (err) {
    console.error('Failed to upload PDF receipt to Supabase Storage, falling back to local:', err);
  }

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

export function openExternalLink(url: string): void {
  const isElectron = typeof window !== 'undefined' && 
                    (window as any).process && 
                    (window as any).require;

  if (isElectron) {
    try {
      const electron = (window as any).require('electron');
      const shell = electron.shell;
      if (shell && shell.openExternal) {
        shell.openExternal(url);
        return;
      }
    } catch (err) {
      console.error('Failed to open external link in Electron:', err);
    }
  }
  
  // Web fallback
  window.open(url, '_blank');
}

