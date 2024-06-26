import * as _ from 'lodash';
import { Node } from './page';
import { float2Int, numEq } from '../utils';
import { R, VNode } from '../vnode';
import { Transparent, getLinearColor, getNormalColor } from './color';

export function stylishBox(node: Node, vnode: VNode) {
    stylishBackground(node, vnode);
    stylishBorderRadius(node, vnode);
    stylishBorder(node, vnode);
    stylishShadow(node, vnode);
    stylishBlur(node, vnode);
}

function stylishBackground(node: Node, vnode: VNode) {
    if (node.fill && node.fill.colors && node.fill.colors.length) {
        // 只支持一个颜色
        const color = node.fill.colors[0];
        if (color.type === 'normal') {
            const c = getNormalColor(color.value);
            if (c === Transparent) {
                return;
            }
            vnode.classList.push(`bg-${c}`);
        } else if (color.type === 'linearGradient') {
            getLinearColor(vnode, color);
        }
    }
}

function stylishBorderRadius(node: Node, vnode: VNode) {
    if (node.stroke && node.stroke.radius) {
        const [tl, tr, br, bl] = node.stroke.radius;
        const r1 = {
            tl,
            tr,
            br,
            bl
        };
        const t = tl === tr && ['tl', 'tr'];
        const r = tr === br && ['tr', 'br'];
        const b = br === bl && ['br', 'bl'];
        const l = bl === tl && ['bl', 'tl'];
        const addClasses = (key: string, value: number, exclude?: string[]) => {
            const calcV = (v: number) =>
                v >= Math.min(node.bounds.width, node.bounds.height) ? 'full' : float2Int(v);
            vnode.classList.push(R`rounded-${key}${calcV(value)}`);
            if (exclude) {
                _.each(_.omit(r1, exclude), (v, k) => {
                    vnode.classList.push(R`rounded-${k}-${calcV(v!)}`);
                });
            }
        };
        if (t && r && b && l) {
            addClasses('', tl);
        } else if (t && b) {
            addClasses('t-', tl);
            addClasses('b-', br);
        } else if (l && r) {
            addClasses('l-', tl);
            addClasses('r-', tr);
        } else if (t) {
            addClasses('t-', tl, t);
        } else if (r) {
            addClasses('r-', tr, r);
        } else if (b) {
            addClasses('b-', br, b);
        } else if (l) {
            addClasses('l-', bl, l);
        } else {
            addClasses('', 0, []);
        }
    }
}

function stylishBorder(node: Node, vnode: VNode) {
    if (node.stroke && node.stroke.borders && node.stroke.borders.length) {
        // TODO: 暂时只支持一个border
        const border = node.stroke.borders[0];

        if (border.color.type === 'normal') {
            const color = getNormalColor(border.color.value);
            if (color === Transparent) {
                return;
            }
            vnode.classList.push(`border-${color}`);
        } else if (border.color.type === 'linearGradient') {
            console.warn('border不支持线性渐变,用第一个渐变色代替');
            const color = getNormalColor(border.color.value.colorStops[0].color);
            if (color === Transparent) {
                return;
            }
            vnode.classList.push(`border-${color}`);
        }
        const borderWidth = Math.max(float2Int(border.strokeWidth), 1);
        const borderWidthSuffix = borderWidth === 1 ? '' : `-${borderWidth}`;

        if (numEq(borderWidth, node.bounds.width)) {
            vnode.classList.push(`border-l${borderWidthSuffix}`);
        } else if (numEq(borderWidth, node.bounds.height)) {
            vnode.classList.push(`border-t${borderWidthSuffix}`);
        } else {
            vnode.classList.push(R`border${borderWidthSuffix}`);

            // box-sizing默认包含宽度？需要根据borderType调整bounds
            if (border.type === 'outside') {
                vnode.bounds.left -= borderWidth;
                vnode.bounds.top -= borderWidth;
                vnode.bounds.width += borderWidth * 2;
                vnode.bounds.height += borderWidth * 2;
                vnode.bounds.right += borderWidth;
                vnode.bounds.bottom += borderWidth;
            } else if (border.type === 'center') {
                const borderWidthHalf = Math.floor(borderWidth / 2);
                vnode.bounds.left -= borderWidthHalf;
                vnode.bounds.top -= borderWidthHalf;
                vnode.bounds.width += borderWidth;
                vnode.bounds.height += borderWidth;
                vnode.bounds.right = vnode.bounds.left + vnode.bounds.width;
                vnode.bounds.bottom = vnode.bounds.top + vnode.bounds.height;
            }
        }

        if (node.stroke.dash && node.stroke.dash[0]) {
            vnode.classList.push('border-dashed');
        } else {
            vnode.classList.push('border-solid');
        }
    }
}

function stylishShadow(node: Node, vnode: VNode) {
    if (node.effect && node.effect.shadows && node.effect.shadows.length) {
        const styles = _.map(node.effect.shadows, shadow => {
            let color = '';
            if (shadow.color.type === 'linearGradient') {
                console.warn('shadow不支持线性渐变,用第一个渐变色代替');
                color = getNormalColor(shadow.color.value.colorStops[0].color);
                if (color === Transparent) {
                    return '';
                }
            } else if (shadow.color.type === 'normal') {
                color = getNormalColor(shadow.color.value);
                if (color === Transparent) {
                    return '';
                }
            }
            color = color.slice(1, -1);
            return `${shadow.type === 'inside' ? 'inset ' : ''}${float2Int(shadow.offsetX)}px ${float2Int(shadow.offsetY)}px ${float2Int(shadow.blur)}px ${float2Int(shadow.spread)}px ${color}`;
        }).filter(Boolean);
        if (styles.length) {
            vnode.style['box-shadow'] = styles.join(',');
        }
    }
}

function stylishBlur(node: Node, vnode: VNode) {
    if (node.effect && node.effect.blur && node.effect.blur.enabled) {
        // Gaussian模糊在CSS中直接使用blur函数
        vnode.style['filter'] = `blur(${float2Int(node.effect.blur.radius)}px);`;
    }
}
