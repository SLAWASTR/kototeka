/**
 * Camera, Photo processing, and EXIF Metadata extraction for Kototeka
 * Resizes, optimizes images, extracts capture timestamps, and creates thumbnails
 */

class ExifReader {
  /**
   * Extract creation timestamp from photo EXIF tags or file metadata
   * @param {File} file 
   * @returns {Promise<{ date: Date, source: 'exif' | 'file' } | null>}
   */
  static async extractDate(file) {
    if (!file) return null;

    // 1. Try reading EXIF DateTimeOriginal / DateTime from JPEG
    try {
      const slice = file.slice(0, 131072); // First 128KB is plenty for EXIF
      const buffer = await slice.arrayBuffer();
      const view = new DataView(buffer);

      if (view.byteLength > 4 && view.getUint16(0) === 0xFFD8) {
        let offset = 2;
        while (offset < view.byteLength - 4) {
          const marker = view.getUint16(offset);
          offset += 2;

          if (marker === 0xFFE1) {
            // APP1 Marker
            const exifLen = view.getUint16(offset);
            offset += 2;

            // Check "Exif\0\0" header (0x457869660000)
            if (offset + 6 <= view.byteLength &&
                view.getUint32(offset) === 0x45786966 &&
                view.getUint16(offset + 4) === 0x0000) {
              const tiffOffset = offset + 6;
              const dateStr = ExifReader.parseTiff(view, tiffOffset);
              if (dateStr) {
                const parsedDate = ExifReader.parseExifDateString(dateStr);
                if (parsedDate && !isNaN(parsedDate.getTime())) {
                  return { date: parsedDate, source: 'exif' };
                }
              }
            }
            break;
          } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFD8 && marker !== 0xFFD9) {
            const segLength = view.getUint16(offset);
            offset += segLength;
          } else {
            break;
          }
        }
      }
    } catch (e) {
      console.log('EXIF parse note:', e);
    }

    // 2. Fallback to file.lastModified if available and realistic (after year 2000)
    if (file.lastModified && file.lastModified > 946684800000) {
      const modDate = new Date(file.lastModified);
      if (!isNaN(modDate.getTime())) {
        return { date: modDate, source: 'file' };
      }
    }

    return null;
  }

  static parseTiff(view, tiffOffset) {
    if (tiffOffset + 8 > view.byteLength) return null;

    // Endianness: "II" (0x4949) = Little Endian, "MM" (0x4D4D) = Big Endian
    const byteOrder = view.getUint16(tiffOffset);
    const littleEndian = byteOrder === 0x4949;

    // Verify 42 (0x002A)
    if (view.getUint16(tiffOffset + 2, littleEndian) !== 0x002A) return null;

    const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian);
    if (ifdOffset < 8 || tiffOffset + ifdOffset >= view.byteLength) return null;

    return ExifReader.scanIfdForDate(view, tiffOffset, tiffOffset + ifdOffset, littleEndian);
  }

  static scanIfdForDate(view, tiffOffset, dirOffset, littleEndian) {
    if (dirOffset + 2 > view.byteLength) return null;
    const numEntries = view.getUint16(dirOffset, littleEndian);
    let exifSubIfdOffset = null;
    let dateTimeTagVal = null;

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = dirOffset + 2 + i * 12;
      if (entryOffset + 12 > view.byteLength) break;

      const tag = view.getUint16(entryOffset, littleEndian);

      // 0x0132 = DateTime
      if (tag === 0x0132) {
        dateTimeTagVal = ExifReader.getStringValue(view, tiffOffset, entryOffset, littleEndian);
      }
      // 0x8769 = Exif IFD Pointer
      if (tag === 0x8769) {
        exifSubIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
      }
    }

    // Search Exif SubIFD for 0x9003 (DateTimeOriginal) or 0x9004 (DateTimeDigitized)
    if (exifSubIfdOffset != null) {
      const subOffset = tiffOffset + exifSubIfdOffset;
      if (subOffset + 2 <= view.byteLength) {
        const subEntries = view.getUint16(subOffset, littleEndian);
        for (let j = 0; j < subEntries; j++) {
          const entryOffset = subOffset + 2 + j * 12;
          if (entryOffset + 12 > view.byteLength) break;

          const tag = view.getUint16(entryOffset, littleEndian);
          if (tag === 0x9003 || tag === 0x9004) {
            const strVal = ExifReader.getStringValue(view, tiffOffset, entryOffset, littleEndian);
            if (strVal) return strVal;
          }
        }
      }
    }

    return dateTimeTagVal;
  }

  static getStringValue(view, tiffOffset, entryOffset, littleEndian) {
    const count = view.getUint32(entryOffset + 4, littleEndian);
    let valOffset;
    if (count <= 4) {
      valOffset = entryOffset + 8;
    } else {
      valOffset = tiffOffset + view.getUint32(entryOffset + 8, littleEndian);
    }
    if (valOffset + count > view.byteLength) return null;

    let str = '';
    for (let i = 0; i < count; i++) {
      const charCode = view.getUint8(valOffset + i);
      if (charCode === 0) break;
      str += String.fromCharCode(charCode);
    }
    return str.trim();
  }

  static parseExifDateString(str) {
    // Format: "YYYY:MM:DD HH:MM:SS"
    if (!str || str.length < 19) return null;
    const parts = str.split(' ');
    if (parts.length !== 2) return null;

    const dateParts = parts[0].split(':');
    const timeParts = parts[1].split(':');
    if (dateParts.length !== 3 || timeParts.length !== 3) return null;

    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1; // 0-based month
    const day = parseInt(dateParts[2], 10);
    const hour = parseInt(timeParts[0], 10);
    const min = parseInt(timeParts[1], 10);
    const sec = parseInt(timeParts[2], 10);

    return new Date(year, month, day, hour, min, sec);
  }
}

class PhotoProcessor {
  static async processFile(file, maxWidth = 1280, maxHeight = 1280, quality = 0.85) {
    // Extract metadata date first
    const detectedMeta = await ExifReader.extractDate(file);

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
              originalHeight: img.height,
              detectedDate: detectedMeta ? detectedMeta.date : null,
              detectedDateSource: detectedMeta ? detectedMeta.source : null
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

window.ExifReader = ExifReader;
window.PhotoProcessor = PhotoProcessor;
