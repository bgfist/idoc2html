export function tinypng(apiKey: string, file: File) {
    const authString = 'Basic ' + btoa(apiKey);
    const formData = new FormData();
    formData.append('file', file); // 将文件添加到 FormData 对象中

    return fetch('https://api.tinify.com/shrink', {
        method: 'POST',
        body: formData,
        headers: {
            Authorization: authString
        }
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(body => {
            if (body.output && body.output.size < body.input.size) {
                console.log(
                    'Panda just saved you ' + (body.input.size - body.output.size) + ' for ' + file.name
                );

                // 如果需要调整大小，可以在这里添加代码
                // ...

                // 保存压缩后的文件
                return fetch(body.output.url, {
                    headers: {
                        Authorization: authString
                    }
                })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Failed to fetch compressed image');
                        }
                        return response.blob();
                    })
                    .catch(error => {
                        console.error('Error saving file:', error);
                    });
            } else {
                console.log('Couldn’t compress ' + file.name + ' any further');
            }
        })
        .catch(error => {
            console.error('Error during fetch:', error);
        });
}

// const pica = require('pica')();

// // 假设 `inputImage` 是一个HTMLImageElement，`outputCanvas` 是一个HTMLCanvasElement
// pica.resize(inputImage, outputCanvas, {
//   // 这里可以设置插值算法，例如 'lanczos3'
//   // 如果不设置，pica会默认使用一个高质量的算法
//   interpolation: 'lanczos3'
// })
// .then(() => {
//   console.log('Image resized successfully.');
// })
// .catch((err) => {
//   console.error('Error resizing image:', err);
// });
