import * as _ from 'lodash';
import { Node } from '../page';
import { R, SizeSpec, VNode, newVNode } from '../vnode';
import { getNormalColor } from './color';
import { float2Int } from './helpers';
import { numLt } from '../utils';

export function stylishText(node: Node, vnode: VNode) {
    // TODO: 如何处理其他样式
    // TODO: 字体大小/行高可以复用

    // 文本节点的特殊处理
    // 1. 单行文本高度固定，要不要指定高度为lineHeight则看其下面是否有相邻节点
    // 2. 多行文本高度不固定，如果文本框高度大于其子文本中任意一个文本，则为多行文本
    // 3. 如果文本节点是父节点中唯一的一个节点，且父节点不是切图，则父节点宽度不固定，适用于按钮。除非两个相邻按钮宽度一致

    const textNodes = _.map(node.text.styles, text => {
        const textNode = newVNode({
            tagName: 'span',
            bounds: {
                ...vnode.bounds
            }
        });
        textNode.textContent = text.value.replace(/\n/g, '<br/>'); // 换行符用<br/>代替
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
    });
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
        const textAlign = node.text.styles[0].align;
        if (textAlign !== 'left') {
            vnode.classList.push(`text-${textAlign}`);
        }
        // 单词超长需换行
        vnode.classList.push('break-words');
    } else {
        // 有的文本框跟文字本身宽度并不一致，会多出一些空间，这时候应该视作Fixed尺寸，简单判断下，数字和字母为半个字宽
        if (
            _.isString(vnode.textContent) &&
            vnode.bounds.width / Number(node.text.styles![0].font.size) -
                calculateCharacterWidth(vnode.textContent) >
                1
        ) {
            console.warn('有文本框宽度多余，设为固定宽度', vnode.textContent);
            vnode.widthSpec = SizeSpec.Fixed;
            // makeSingleLineTextNoWrap(vnode);
            const textAlign = node.text.styles[0].align;
            if (textAlign !== 'left') {
                vnode.classList.push(`text-${textAlign}`);
            }
        } else {
            vnode.widthSpec = SizeSpec.Auto;
        }

        vnode.heightSpec = SizeSpec.Fixed;
    }
}

/** 计算文本的宽度 */
function calculateCharacterWidth(str: string) {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        if (char >= 0x00 && char <= 0x7f) {
            // 半角字符
            width += 0.5;
        } else {
            width += 1;
        }
    }
    return width;
}
