import * as _ from 'lodash';
import { Node, RGBA } from '../page';
import { numEq } from '../utils';
import { R, VNode, getClassName } from '../vnode';
import { getLinearColor, getNormalColor } from './color';
import { float2Fixed, float2Int } from './helpers';

export function stylishBox(node: Node, vnode: VNode) {
    if (node.fill && node.fill.colors && node.fill.colors.length) {
        if (getClassName(vnode).indexOf('bg-[url(') !== -1) {
            console.warn('节点已有图片背景，不能再指定颜色背景了');
            return;
        }

        // 只支持一个颜色
        const color = node.fill.colors[0];
        if (color.type === 'normal') {
            vnode.classList.push(`bg-${getNormalColor(color.value)}`);
        } else if (color.type === 'linearGradient') {
            getLinearColor(vnode, color);
        }
    }
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
    if (node.stroke && node.stroke.borders && node.stroke.borders.length) {
        // TODO: 暂时只支持一个border
        const border = node.stroke.borders[0];
        if (numEq(border.strokeWidth, 1)) {
            vnode.classList.push('border');
        } else {
            vnode.classList.push(R`border-${float2Int(border.strokeWidth)}`);
        }
        if (border.color.type === 'normal') {
            vnode.classList.push(`border-${getNormalColor(border.color.value)}`);
        } else if (border.color.type === 'linearGradient') {
            console.warn('border不支持线性渐变,用第一个渐变色代替');
            vnode.classList.push(`border-${getNormalColor(border.color.value.colorStops[0].color)}`);
        }
    }
    if (node.effect && node.effect.shadows && node.effect.shadows.length) {
        const styles = _.map(node.effect.shadows, shadow => {
            let color!: RGBA;
            if (shadow.color.type === 'linearGradient') {
                console.warn('shadow不支持线性渐变,用第一个渐变色代替');
                color = shadow.color.value.colorStops[0].color;
            } else if (shadow.color.type === 'normal') {
                color = shadow.color.value;
            }
            const shadowColor = `rgba(${color.r},${color.g},${color.b},${float2Fixed(color.a)})`;
            return `${shadow.type === 'inside' ? 'inset ' : ''}${float2Int(shadow.offsetX)}px ${float2Int(shadow.offsetY)}px ${float2Int(shadow.blur)}px ${float2Int(shadow.spread)}px ${shadowColor}`;
        });
        vnode.style['box-shadow'] = styles.join(',');
    }
}
