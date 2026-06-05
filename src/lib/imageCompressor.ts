/**
 * imageCompressor.ts
 * Client-side utility to proportionally scale and compress image files
 * using HTML5 Canvas. This prevents database and file storage bloat.
 */

export async function compressImage(
  file: File,
  maxDimension: number = 1200,
  quality: number = 0.75
): Promise<File> {
  // If the file is not an image (e.g. it is a PDF), return it unchanged
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale proportionally if either dimension exceeds the maximum threshold
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file); // Fallback: Return original file if canvas context is unavailable
          return;
        }

        // Draw the image onto the canvas at new scaled dimensions
        ctx.drawImage(img, 0, 0, width, height);

        // Convert canvas contents to compressed JPEG blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Create a new File from the blob, replacing extension with .jpg
              const cleanName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
              const compressedFile = new File([blob], cleanName, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              
              console.log(
                `Image Compression: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB) -> ` +
                `${cleanName} (${(compressedFile.size / 1024).toFixed(1)} KB) - Saved ${(
                  (1 - compressedFile.size / file.size) * 100
                ).toFixed(1)}% space`
              );
              
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => {
        console.warn("Failed to load image for compression, using original file");
        resolve(file);
      };
      
      img.src = event.target?.result as string;
    };
    
    reader.onerror = () => {
      console.warn("Failed to read image file, using original file");
      resolve(file);
    };
    
    reader.readAsDataURL(file);
  });
}
