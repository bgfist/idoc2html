import * as _ from 'lodash';
import { Node, TextStyle } from './page';
import {
    R,
    SizeSpec,
    VNode,
    getTextContent,
    isMultiLineText,
    isSingleLineText,
    makeMultiLineTextClamp,
    makeSingleLineTextEllipsis,
    newVNode
} from '../vnode';
import { getNormalColor } from './color';
import { float2Int, isInBrowser, numLt, numLte } from '../utils';

export function stylishText(node: Node, vnode: VNode) {
    // TODO: 如何处理其他样式
    // TODO: 字体大小/行高可以复用

    // 文本节点的特殊处理
    // 1. 单行文本高度固定，要不要指定高度为lineHeight则看其下面是否有相邻节点
    // 2. 多行文本高度不固定，如果文本框高度大于其子文本中任意一个文本，则为多行文本
    // 3. 如果文本节点是父节点中唯一的一个节点，且父节点不是切图，则父节点宽度不固定，适用于按钮。除非两个相邻按钮宽度一致

    const textNodes = _.map(node.text.styles, text => stylishTextSpan(text, vnode));
    if (textNodes.length === 1) {
        _.assign(vnode, textNodes[0], {
            tagName: 'div'
        });
    } else {
        vnode.textContent = textNodes;
        // 防止span之间有空格
        vnode.classList.push('text-0');
    }

    const isMultiLine = numLt(
        +_.max(_.map(node.text.styles, n => n.space.lineHeight))! * 1.5,
        node.bounds.height
    );
    if (isMultiLine) {
        vnode.widthSpec = SizeSpec.Auto;
        vnode.heightSpec = SizeSpec.Auto;
        vnode.textMultiLine = true;
        // 单词超长需换行, 这个得视情况加
        // vnode.classList.push('break-words');

        const textAlign = node.text.styles[0].align;
        if (textAlign !== 'left') {
            vnode.classList.push(`text-${textAlign}`);
        }
    } else {
        if (_.isString(vnode.textContent)) {
            // 有的文本框跟文字本身宽度并不一致，会多出一些空间
            // 先只考虑单行文本，去除其多余宽度
            // 先暂时保留其text-align，后面扩充宽度时可能有用
            const contentWidth =
                isInBrowser() ?
                    calculateCharacterWidth2(node.text.styles[0].value, node.text.styles[0])
                :   float2Int(
                        calculateCharacterWidth(node.text.styles[0].value) * +node.text.styles[0].font.size
                    );

            if (numLte(contentWidth, node.bounds.width)) {
                console.warn('有文本框宽度多余，调整宽度', vnode.textContent);
                if (node.text.styles[0].align === 'left') {
                    vnode.bounds.width = contentWidth;
                    vnode.bounds.right = vnode.bounds.left + contentWidth;
                } else if (node.text.styles[0].align === 'center') {
                    vnode.bounds.left =
                        vnode.bounds.left + Math.floor((vnode.bounds.width - contentWidth) / 2);
                    vnode.bounds.width = contentWidth;
                    vnode.bounds.right = vnode.bounds.left + contentWidth;
                } else if (node.text.styles[0].align === 'right') {
                    vnode.bounds.width = contentWidth;
                    vnode.bounds.left = vnode.bounds.right - contentWidth;
                } else if (node.text.styles[0].align === 'justify') {
                    console.warn('TODO');
                }
            }
        }

        vnode.widthSpec = SizeSpec.Auto;
        vnode.heightSpec = SizeSpec.Fixed;
    }

    // TODO: 行高和bounds不契合，看是对齐行高还是改变bounds

    setTextClampIfDetectedEllipis(vnode);
}

function stylishTextSpan(text: TextStyle, vnode: VNode) {
    const textNode = newVNode({
        tagName: 'span',
        bounds: {
            ...vnode.bounds
        }
    });
    textNode.textContent = text.value
        // 换行符用<br/>代替
        .replace(/\n/g, '<br/>')
        // 空格用nbsp;代替
        .replace(/ /g, '&nbsp;');
    if (text.font.color.type === 'normal') {
        textNode.classList.push(`text-${getNormalColor(text.font.color.value)}`);
    } else if (text.font.color.type === 'linearGradient') {
        console.warn('text节点不支持线性渐变,用第一个渐变色代替');
        textNode.classList.push(`text-${getNormalColor(text.font.color.value.colorStops[0].color)}`);
    }
    textNode.classList.push(`text-${float2Int(+text.font.size)}/${float2Int(+text.space.lineHeight)}`);
    if (text.space.letterSpacing) {
        textNode.classList.push(R`tracking-${float2Int(text.space.letterSpacing)}`);
    }
    const isBoldFont =
        text.font.family.indexOf('AlibabaPuHuiTiM') !== -1 ||
        (text.font.family.indexOf('PingFangSC') !== -1 && text.font.weight === 'Medium');
    if (text.fontStyles.bold || isBoldFont) {
        textNode.classList.push('font-bold');
    }
    if (text.fontStyles.italic) {
        textNode.classList.push('italic');
    }
    if (text.fontStyles.underLine) {
        textNode.classList.push('underline');
    }
    if (text.fontStyles.lineThrough) {
        textNode.classList.push('line-through');
    }
    // if (text.align !== 'left') {
    //     textNode.classList.push(`text-${text.align}`);
    // }
    return textNode;
}

/** 计算文本的宽度 */
function calculateCharacterWidth(str: string) {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code >= 0x00 && code <= 0xff) {
            // 半角字符
            if (code >= 65 && code <= 90) {
                // 大写字母
                width += 0.75;
            } else if (code >= 97 && code <= 122) {
                // 小写字母
                width += 0.5;
            } else if (code >= 48 && code <= 57) {
                // 数字1窄一些
                if (code === 49) {
                    width += 0.4;
                } else {
                    width += 0.6154;
                }
            } else if (code === 32) {
                // 空格
                width += 0.375;
            } else if (code === 46) {
                // 小数点
                width += 0.2;
            } else {
                width += 0.5;
            }
        } else {
            width += 1;
        }
    }
    return width;
}

/** 计算文本的宽度 */
function calculateCharacterWidth2(str: string, text: TextStyle) {
    const textNode = window.document.createElement('span');
    textNode.style.fontSize = `${text.font.size}px`;
    textNode.style.fontFamily = 'Microsoft YaHei';
    textNode.style.letterSpacing = `${text.space.letterSpacing}px`;
    textNode.style.position = 'fixed';
    textNode.style.whiteSpace = 'nowrap';
    textNode.style.visibility = 'hidden';
    textNode.innerText = str;
    document.body.appendChild(textNode);
    const width = textNode.offsetWidth;
    document.body.removeChild(textNode);
    return width;
}

function setTextClampIfDetectedEllipis(textNode: VNode) {
    const EllipsisList = ['…', '...'];

    function isEllpsisContent(content: string) {
        return (
            _.some(EllipsisList, Ellipsis => content.endsWith(Ellipsis)) &&
            _.every(EllipsisList, Ellipsis => !content.startsWith(Ellipsis))
        );
    }

    if (isSingleLineText(textNode)) {
        const textContent = getTextContent(textNode);
        if (isEllpsisContent(textContent)) {
            console.debug('检测到单行文本省略号');
            makeSingleLineTextEllipsis(textNode);
        }
    } else if (isMultiLineText(textNode)) {
        const textContent = getTextContent(textNode);
        if (isEllpsisContent(textContent)) {
            console.debug('检测到多行文本省略号');
            makeMultiLineTextClamp(textNode);
        }
    }
}
