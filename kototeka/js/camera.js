/**
 * Camera and Photo processing for Kototeka
 * Resizes, optimizes and creates thumbnails for snappy offline storage
 */

class PhotoProcessor {
  static async processFile(file, maxWidth = 1280, maxHeight = 1280, quality = 0.85) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        reject(new Error('Пожалуйста, выберите файл изображения'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            // 1. Calculate resized dimensions for main photo
            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
              if (width / height > maxWidth / maxHeight) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              } else {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const fullPhotoDataUrl = canvas.toDataURL('image/jpeg', quality);

            // 2. Generate square thumbnail (160x160)
            const thumbSize = 160;
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = thumbSize;
            thumbCanvas.height = thumbSize;
            const thumbCtx = thumbCanvas.getContext('2d');

            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;

            thumbCtx.drawImage(img, sx, sy, minDim, minDim, 0, 0, thumbSize, thumbSize);
            const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);

            resolve({
              photo: fullPhotoDataUrl,
              thumb: thumbDataUrl,
              originalWidth: img.width,
              originalHeight: img.height
            });
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Ошибка чтения файла'));
      reader.readAsDataURL(file);
    });
  }
}

window.PhotoProcessor = PhotoProcessor;
