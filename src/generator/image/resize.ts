export function resizeImage(url: string, divideBy: 1 | 2 | 4) {
    return new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width / divideBy;
            canvas.height = img.height / divideBy;
            const ctx = canvas.getContext('2d')!;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => resolve(blob!), 'image/png');
        };
        img.onerror = reject;
        img.src = url;
    });
}
