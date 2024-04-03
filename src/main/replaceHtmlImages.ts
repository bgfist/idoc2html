import _ from 'lodash';
import { getProcessedImageUrl } from '../generator';
import { md5 } from '../utils-md5';

const cacheImageMap = new Set<string>();

export async function replaceHtmlImages(params: {
    html: string;
    prefix: string;
    imageResize: 1 | 2 | 4;
    uploadImage2Remote: boolean;
    useTinypngCompress: boolean;
    tinypngApiKey: string;
}) {
    const { prefix, imageResize, uploadImage2Remote, useTinypngCompress, tinypngApiKey } = params;
    let { html } = params;

    const grapImageUrls = html.matchAll(/bg-\[url\((https:\/\/idoc\.mucang\.cn\/.+?\/(.+?\.png))\)]/g);
    const imageMap: Record<
        string,
        {
            fullPath: string;
            imageName: string;
            cacheKey: string;
        }
    > = {};
    const hashSet = new Set<string>();
    for (const match of grapImageUrls) {
        if (imageMap[match[0]]) {
            console.warn('有重复图片', match[0]);
        } else {
            const fullPath = match[1];
            const cacheKey =
                fullPath + JSON.stringify({ imageResize, uploadImage2Remote, useTinypngCompress });

            const hash = md5(cacheKey);
            let hashLen = 6;
            let imageHash = hash.slice(0, hashLen);

            while (hashSet.has(imageHash)) {
                console.warn('hash冲突');
                hashLen++;
                imageHash = hash.slice(0, hashLen);
            }

            hashSet.add(imageHash);
            imageMap[match[0]] = {
                fullPath: match[1],
                // imageName: match[2]
                imageName: imageHash + '.png',
                cacheKey
            };
        }
    }

    if (_.isEmpty(imageMap)) {
        return {
            code: html,
            noImages: true
        };
    }

    let processedBefore = false;

    for (const originalClassName in imageMap) {
        const { fullPath, imageName, cacheKey } = imageMap[originalClassName];

        if (!cacheImageMap.has(cacheKey)) {
            await getProcessedImageUrl({
                originalUrl: fullPath,
                imageName,
                imageResize,
                uploadImage2Remote,
                tinypngApiKey,
                useTinypngCompress
            });
            cacheImageMap.add(cacheKey);
        } else {
            processedBefore = true;
        }

        html = html.replace(originalClassName, `bg-[url(${prefix}${imageName})]`);
    }

    return {
        code: html,
        noImages: processedBefore ? ('processedBefore' as const) : false
    };
}
