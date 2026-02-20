export async function detectHighEdgeDensity(file: File, options?: { maxSize?: number }) {
  const maxSize = options?.maxSize ?? 512;

  return new Promise<{ isLikelyDefect: boolean; edgeRatio: number; avgMagnitude: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // scale to maxSize for performance
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height / width) * maxSize);
          width = maxSize;
        } else {
          width = Math.round((width / height) * maxSize);
          height = maxSize;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not available'));
      ctx.drawImage(img, 0, 0, width, height);

      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      // convert to grayscale
      const gray = new Float32Array(width * height);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        gray[p] = 0.299 * r + 0.587 * g + 0.114 * b;
      }

      // Sobel kernels
      const w = width;
      const h = height;
      let edgeCount = 0;
      let magSum = 0;
      const EDGE_THRESHOLD = 120; // magnitude threshold to count as an edge

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;

          const gx = (
            -1 * gray[i - w - 1] + 1 * gray[i - w + 1] +
            -2 * gray[i - 1]     + 2 * gray[i + 1]   +
            -1 * gray[i + w - 1] + 1 * gray[i + w + 1]
          );

          const gy = (
            -1 * gray[i - w - 1] + -2 * gray[i - w] + -1 * gray[i - w + 1] +
             1 * gray[i + w - 1] +  2 * gray[i + w] +  1 * gray[i + w + 1]
          );

          const mag = Math.sqrt(gx * gx + gy * gy);
          magSum += mag;
          if (mag > EDGE_THRESHOLD) edgeCount++;
        }
      }

      const total = (w - 2) * (h - 2);
      const edgeRatio = edgeCount / total;
      const avgMagnitude = magSum / total;

      // Heuristic: cracked/glass-shatter images show high edge density + high avg magnitude
      const isLikelyDefect = edgeRatio > 0.003 || avgMagnitude > 30; // tuned thresholds

      resolve({ isLikelyDefect, edgeRatio, avgMagnitude });
    };

    img.onerror = () => reject(new Error('Failed to load image for heuristic'));
    img.src = URL.createObjectURL(file);
  });
}
