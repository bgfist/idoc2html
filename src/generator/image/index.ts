import { tinypng } from './compress';
import { downloadImage } from './download';
import { resizeImage, ImageResize } from './resize';
export { ImageResize };

export async function getProcessedImageUrl(params: {
    originalUrl: string;
    imageName: string;
    imageResize: ImageResize;
    useTinypngCompress: boolean;
    uploadImage2Remote: boolean;
    tinypngApiKey: string;
}) {
    const { originalUrl, imageName, imageResize, useTinypngCompress, uploadImage2Remote } = params;

    let image = await resizeImage(originalUrl, imageResize);

    if (useTinypngCompress) {
        const file = new File([image], imageName);
        image = await tinypng('', file);
    }

    if (uploadImage2Remote) {
    } else {
        downloadImage(image, imageName);
    }
}
