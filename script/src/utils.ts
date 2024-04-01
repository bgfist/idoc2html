/** 模拟toast */
export function makeToast(
    message: string,
    { fontSize = '16px', time = 1500, border = false as 'success' | 'error' | false } = {}
) {
    return new Promise(resolve => {
        if (document.getElementById('myToast')) {
            document.body.removeChild(document.getElementById('myToast')!);
        }

        const div: HTMLDivElement = document.createElement('div');
        div.innerText = message;

        div.setAttribute('id', 'myToast');

        div.style.position = 'fixed';
        div.style.left = '50%';
        div.style.top = '30%';
        div.style.transform = 'translate(-50%, -50%)';
        div.style.webkitTransform = 'translate(-50%, -50%)';
        div.style.background = 'rgba(0, 0, 0, 0.7)';
        div.style.zIndex = '9999';
        div.style.padding = '10px 20px';
        div.style.borderRadius = '6px';
        div.style.textAlign = 'center';
        div.style.color = '#ffffff';
        div.style.whiteSpace = 'nowrap';
        div.style.fontSize = fontSize;
        div.style.lineHeight = '1.5';
        if (border === 'error') {
            div.style.border = '2px solid #ff296d';
        } else if (border === 'success') {
            div.style.border = '2px solid white';
        }

        document.body.appendChild(div);
        setTimeout(function () {
            div.remove();
            resolve('');
        }, time);
    });
}
