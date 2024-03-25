function resizeImage(url: string, divideBy: 1 | 2 | 4) {
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

export function tinypng(apiKey: string, file: File) {
    const authString = 'Basic ' + btoa(apiKey);
    const formData = new FormData();
    formData.append('file', file); // 将文件添加到 FormData 对象中

    fetch('https://api.tinify.com/shrink', {
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
                fetch(body.output.url, {
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
                    .then(blob => {
                        // 创建一个下载链接并触发下载
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = file.name; // 你可以根据需要修改文件名
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
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
