import { LinearColor, RGBA } from './page';
import { assert } from '../utils';
import { VNode } from '../vnode';
import { float2Fixed } from './helpers';

export const Transparent = 'transparent';

export function getNormalColor(rgba: RGBA): string {
    if (!rgba.a) {
        return Transparent;
    }

    let r = rgba.r / 255;
    let g = rgba.g / 255;
    let b = rgba.b / 255;
    let a = float2Fixed(rgba.a);
    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);
    let l = (max + min) / 2;
    let s = l === 0 || l === 1 ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (max === min) {
        h = 0; // achromatic
    } else {
        switch (max) {
            case r:
                h = ((g - b) / (max - min)) % 6;
                break;
            case g:
                h = (b - r) / (max - min) + 2;
                break;
            case b:
                h = (r - g) / (max - min) + 4;
                break;
        }
        h = Math.round(h * 60);
        if (h < 0) {
            h += 360;
        }
    }
    s = Math.round(s * 100);
    l = Math.round(l * 100);
    return `[hsla(${h},${s}%,${l}%,${a})]`;
}

export function getLinearColor(vnode: VNode, color: LinearColor) {
    const { fromX, fromY, toX, toY, colorStops } = color.value;

    assert(colorStops.length >= 2, 'linear-gradient必须包含两个颜色节点');

    let angle = Math.round(Math.atan2(toY - fromY, toX - fromX) * (180 / Math.PI));
    angle = 90 - angle;
    if (angle < 0) {
        angle = 360 + angle;
    }
    const angleMap: { [key: number]: string } = {
        0: 'to-t',
        45: 'to-tr',
        90: 'to-r',
        135: 'to-br',
        180: 'to-b',
        225: 'to-bl',
        270: 'to-l',
        315: 'to-tl'
    };

    if (!angleMap[angle]) {
        console.warn('暂不支持任意渐变角度,用近似角度代替', angle);
        angle = Math.round(angle / 45) * 45;
    }

    vnode.classList.push(`bg-gradient-${angleMap[angle]}`);

    const getPercent = (position: number) => {
        const percent = Math.round(position * 100);
        if (percent % 5 !== 0) {
            return `[${percent}%]`;
        } else {
            return `${percent}%`;
        }
    };

    // 起点和终点的颜色
    const [start, ...stops] = colorStops;
    const end = stops.pop()!;
    // 起点颜色和位置
    vnode.classList.push(`from-${getNormalColor(start.color)}`);
    if (start.position !== 0) {
        vnode.classList.push(`from-${getPercent(start.position)}`);
    }
    // 如果有多个停止点，添加 via 类
    stops.forEach(stop => {
        vnode.classList.push(`via-${getNormalColor(stop.color)}`);
        if (stop.position !== 0.5) {
            vnode.classList.push(`via-${getPercent(stop.position)}`);
        }
    });
    // 终点颜色和位置
    vnode.classList.push(`to-${getNormalColor(end.color)}`);
    if (end.position !== 1) {
        vnode.classList.push(`to-${getPercent(end.position)}`);
    }
}
