import { tinypng } from './compress';
import { downloadImage } from './download';
import { resizeImage } from './resize';

export async function getProcessedImageUrl(originalUrl: string, imageName: string, divideBy: 1 | 2 | 4) {
    const resizedImage = await resizeImage(originalUrl, divideBy);
    const file = new File([resizedImage], imageName);
    const compressedImage = await tinypng('', file);
    downloadImage(compressedImage!, imageName);
}
