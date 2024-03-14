const fs = require('fs');
const path = require('path');
const { createOpenAILanguageModel } = require('../dist/chat/gptai');

const model = createOpenAILanguageModel(
    'sk-sL9K7bLmRMOyQCpx8654563b318e410dB6B0435d4267AdE4',
    // 'gpt-4-0125-preview'
    'gpt-4',
    // 'https://m.gptapi.us/v1/chat/completions',
    "https://openai.tuzhihao.com/v1/chat/completions"
);

const prompt = fs.readFileSync(path.join(__dirname, 'prompt'), 'utf-8');

// 简单的 fetch 方法实现
global.fetch = function simpleFetch(input, options = {}) {
    const http = require('http');
    const https = require('https');
    const url = require('url');

    return new Promise((resolve, reject) => {
        const parsedUrl = new url.URL(input);
        const isHttps = parsedUrl.protocol === 'https:';
        const lib = isHttps ? https : http;
        const requestOptions = {
            method: options.method || 'GET',
            headers: options.headers || {},
        };
        if (options.body) {
            if (typeof options.body === 'object') {
                requestOptions.headers['Content-Type'] = 'application/json';
                requestOptions.body = JSON.stringify(options.body);
            } else {
                requestOptions.body = options.body;
            }
            requestOptions.headers['Content-Length'] = Buffer.byteLength(requestOptions.body);
        }
        const request = lib.request(input, requestOptions, (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                let contentType = response.headers['content-type'];
                if (contentType && contentType.includes('application/json')) {
                    try {
                        data = JSON.parse(data);
                    } catch (e) {
                        return reject(new Error('JSON parsing error'));
                    }
                }
                resolve({
                    ok: true,
                    status: response.statusCode,
                    statusText: response.statusMessage,
                    headers: response.headers,
                    body: data,
                    json() {
                        return this.body;
                    }
                });
            });
        });
        request.on('error', (error) => {
            reject(error);
        });
        if (requestOptions.body) {
            request.write(requestOptions.body);
        }
        request.end();
    });
};

model.complete(prompt).then(res => {
    if (res.success) {
        fs.writeFileSync(path.join(__dirname, '../dist/result'), res.data);
    } else {
        console.error(res.message);
    }
});
