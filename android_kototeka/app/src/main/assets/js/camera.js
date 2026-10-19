/**
 * Camera, Photo processing, EXIF Metadata & Geolocation extraction for Kototeka
 * Resizes, optimizes images, extracts capture timestamps & GPS tags, and creates thumbnails
 */

class ExifReader {
  /**
   * Extract creation timestamp and GPS coordinates from photo EXIF tags or file metadata
   * @param {File} file 
   * @returns {Promise<{ date: Date | null, dateSource: 'exif' | 'file' | null, gps: { lat: number, lng: number, altitude: number | null } | null }>}
   */
  static async extractMetadata(file) {
    if (!file) return { date: null, dateSource: null, gps: null };

    let exifDate = null;
    let exifGps = null;

    // 1. Try reading EXIF from JPEG
    try {
      // 256KB slice is guaranteed to contain full APP1 Exif segment
      const slice = file.slice(0, 262144);
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
              const result = ExifReader.parseTiff(view, tiffOffset);
              if (result) {
                if (result.dateStr) {
                  const parsedDate = ExifReader.parseExifDateString(result.dateStr);
                  if (parsedDate && !isNaN(parsedDate.getTime())) {
                    exifDate = parsedDate;
                  }
                }
                if (result.gps) {
                  exifGps = result.gps;
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

    // 2. Date fallback to file.lastModified if EXIF date was not found
    let finalDate = exifDate;
    let finalDateSource = exifDate ? 'exif' : null;

    if (!finalDate && file.lastModified && file.lastModified > 946684800000) {
      const modDate = new Date(file.lastModified);
      if (!isNaN(modDate.getTime())) {
        finalDate = modDate;
        finalDateSource = 'file';
      }
    }

    return {
      date: finalDate,
      dateSource: finalDateSource,
      gps: exifGps
    };
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

    return ExifReader.scanIfd(view, tiffOffset, tiffOffset + ifdOffset, littleEndian);
  }

  static scanIfd(view, tiffOffset, dirOffset, littleEndian) {
    if (dirOffset + 2 > view.byteLength) return null;
    const numEntries = view.getUint16(dirOffset, littleEndian);

    let exifSubIfdOffset = null;
    let gpsIfdOffset = null;
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
      else if (tag === 0x8769) {
        exifSubIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
      }
      // 0x8825 = GPS Info IFD Pointer
      else if (tag === 0x8825) {
        gpsIfdOffset = view.getUint32(entryOffset + 8, littleEndian);
      }
    }

    // 1. Search Exif SubIFD for DateTimeOriginal (0x9003) or DateTimeDigitized (0x9004)
    let dateStr = dateTimeTagVal;
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
            if (strVal) {
              dateStr = strVal;
              break;
            }
          }
        }
      }
    }

    // 2. Parse GPS Info IFD
    let gps = null;
    if (gpsIfdOffset != null) {
      const gpsOffset = tiffOffset + gpsIfdOffset;
      gps = ExifReader.parseGpsIfd(view, tiffOffset, gpsOffset, littleEndian);
    }

    return { dateStr, gps };
  }

  static parseGpsIfd(view, tiffOffset, gpsOffset, littleEndian) {
    if (gpsOffset + 2 > view.byteLength) return null;
    const numEntries = view.getUint16(gpsOffset, littleEndian);

    let latRef = 'N';
    let lngRef = 'E';
    let latParts = null;
    let lngParts = null;
    let altitude = null;

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = gpsOffset + 2 + i * 12;
      if (entryOffset + 12 > view.byteLength) break;

      const tag = view.getUint16(entryOffset, littleEndian);

      if (tag === 0x0001) {
        // GPSLatitudeRef ('N' or 'S')
        latRef = String.fromCharCode(view.getUint8(entryOffset + 8)).toUpperCase();
      } else if (tag === 0x0002) {
        // GPSLatitude (3 rationals)
        latParts = ExifReader.getRationals(view, tiffOffset, entryOffset, 3, littleEndian);
      } else if (tag === 0x0003) {
        // GPSLongitudeRef ('E' or 'W')
        lngRef = String.fromCharCode(view.getUint8(entryOffset + 8)).toUpperCase();
      } else if (tag === 0x0004) {
        // GPSLongitude (3 rationals)
        lngParts = ExifReader.getRationals(view, tiffOffset, entryOffset, 3, littleEndian);
      } else if (tag === 0x0006) {
        // GPSAltitude (1 rational)
        const altParts = ExifReader.getRationals(view, tiffOffset, entryOffset, 1, littleEndian);
        if (altParts && altParts.length > 0) altitude = altParts[0];
      }
    }

    if (latParts && lngParts && latParts.length === 3 && lngParts.length === 3) {
      let lat = latParts[0] + (latParts[1] / 60.0) + (latParts[2] / 3600.0);
      let lng = lngParts[0] + (lngParts[1] / 60.0) + (lngParts[2] / 3600.0);

      if (latRef === 'S') lat = -lat;
      if (lngRef === 'W') lng = -lng;

      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0)) {
        return {
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          altitude: altitude != null ? Math.round(altitude) : null
        };
      }
    }

    return null;
  }

  static getRationals(view, tiffOffset, entryOffset, count, littleEndian) {
    const byteCount = count * 8;
    let valOffset;
    if (byteCount <= 4) {
      valOffset = entryOffset + 8;
    } else {
      valOffset = tiffOffset + view.getUint32(entryOffset + 8, littleEndian);
    }

    if (valOffset + byteCount > view.byteLength) return null;

    const result = [];
    for (let i = 0; i < count; i++) {
      const num = view.getUint32(valOffset + i * 8, littleEndian);
      const den = view.getUint32(valOffset + i * 8 + 4, littleEndian);
      result.push(den === 0 ? 0 : num / den);
    }
    return result;
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
  /**
   * Process and optimize uploaded image
   * Keeps high-definition 2560px original and generates a crisp 640px retina thumbnail
   */
  static async processFile(file, maxWidth = 2560, maxHeight = 2560, quality = 0.92) {
    // Extract metadata date and GPS coordinates
    const detectedMeta = await ExifReader.extractMetadata(file);

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
            // 1. Calculate resized dimensions for main high-res photo
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
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            const fullPhotoDataUrl = canvas.toDataURL('image/jpeg', quality);

            // 2. Generate crisp 640x640 square thumbnail for retina displays (2x / 3x)
            const thumbSize = 640;
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = thumbSize;
            thumbCanvas.height = thumbSize;
            const thumbCtx = thumbCanvas.getContext('2d');
            thumbCtx.imageSmoothingEnabled = true;
            thumbCtx.imageSmoothingQuality = 'high';

            const minDim = Math.min(img.width, img.height);
            const sx = (img.width - minDim) / 2;
            const sy = (img.height - minDim) / 2;

            thumbCtx.drawImage(img, sx, sy, minDim, minDim, 0, 0, thumbSize, thumbSize);
            const thumbDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.88);

            resolve({
              photo: fullPhotoDataUrl,
              thumb: thumbDataUrl,
              originalWidth: img.width,
              originalHeight: img.height,
              detectedDate: detectedMeta ? detectedMeta.date : null,
              detectedDateSource: detectedMeta ? detectedMeta.dateSource : null,
              detectedGps: detectedMeta ? detectedMeta.gps : null
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
